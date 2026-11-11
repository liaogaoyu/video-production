const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { ApiError } = require("./errors.cjs");
const { transaction } = require("./db.cjs");
const { own } = require("./tenant.cjs");
const { inspectMp4, inspectMp4File } = require("./video-export.cjs");

const MAX_VIDEO_BYTES = 500_000_000;
const QUICKTIME_ATOMS = new Set(["moov", "mdat", "wide", "free", "skip"]);

async function inspectOssVideo(oss, key, { bytes, etag }, signal) {
  for (let offset = 0, count = 0; offset + 8 <= bytes && count < 128; count++) {
    const header = await oss.readRange(key, offset, Math.min(16, bytes - offset), etag, signal);
    let size = header.readUInt32BE(0);
    const minimum = size === 1 ? 16 : 8;
    if (size === 1 && header.length >= 16) size = Number(header.readBigUInt64BE(8));
    if (size === 0) size = bytes - offset;
    if (!Number.isSafeInteger(size) || size < minimum || offset + size > bytes) break;
    if (header.toString("ascii", 4, 8) === "moov" && size <= 32 * 1024 * 1024) {
      return inspectMp4(await oss.readRange(key, offset, size, etag, signal));
    }
    offset += size;
  }
  throw new ApiError(422, "invalid_video", "无法读取视频，请检查文件是否完整");
}

function registerEpisodeVideo(app, { db, media }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS episode_final_videos (
      episode_id TEXT PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
      media_id TEXT NOT NULL REFERENCES media(id),
      filename TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS episode_final_video_uploads (
      id TEXT PRIMARY KEY,
      episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      extension TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      expires_at TEXT NOT NULL
    )
  `);
  const route = "/api/v1/projects/:id/episodes/:episodeId/final-video";

  function requireEpisode(request) {
    const { id, episodeId } = request.params;
    own(db, id, request.appUser);
    if (!db.prepare("SELECT 1 FROM episodes WHERE id=? AND project_id=?").get(episodeId, id)) {
      throw new ApiError(404, "episode_not_found", "分集不存在");
    }
  }

  app.get(route, async (request) => {
    requireEpisode(request);
    const video = db.prepare(`
      SELECT m.id, m.bytes, v.filename, v.uploaded_at AS uploadedAt
      FROM episode_final_videos v JOIN media m ON m.id=v.media_id
      WHERE v.episode_id=?
    `).get(request.params.episodeId);
    return { video: video ? { ...video, url: "/api/v1/media/" + video.id } : null };
  });

  app.post(route + "/upload", async (request) => {
    requireEpisode(request);
    const oss = media.oss;
    if (!oss?.enabled) return { direct: false };
    const filename = path.basename(String(request.body?.filename || ""));
    const extension = path.extname(filename).toLowerCase();
    const bytes = request.body?.bytes;
    if (![".mp4", ".mov", ".m4v"].includes(extension) || filename.length > 200) {
      throw new ApiError(400, "unsupported_media", "请选择文件名不超过 200 字的 MP4、MOV 或 M4V 视频");
    }
    if (!Number.isSafeInteger(bytes) || bytes < 12 || bytes > MAX_VIDEO_BYTES) {
      throw new ApiError(413, "invalid_video_size", "视频大小无效或超过 500 MB");
    }
    const { id: projectId, episodeId } = request.params;
    const uploadId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const key = `pending-episode-videos/${projectId}/${episodeId}/${uploadId}`;
    const mime = extension === ".mov" ? "video/quicktime" : "video/mp4";
    db.prepare("INSERT INTO episode_final_video_uploads VALUES(?,?,?,?,?,?)")
      .run(uploadId, episodeId, filename, extension, bytes, expiresAt);
    return { direct: true, uploadId, ...oss.uploadForm(key, { bytes, mime, expiresAt }) };
  });

  app.post(route + "/complete", async (request, reply) => {
    requireEpisode(request);
    const { id: projectId, episodeId } = request.params;
    const uploadId = String(request.body?.uploadId || "");
    const pending = db.prepare("SELECT * FROM episode_final_video_uploads WHERE id=? AND episode_id=?")
      .get(uploadId, episodeId);
    if (!pending) throw new ApiError(404, "upload_not_found", "上传记录不存在");
    const result = (row) => ({ video: {
      id: uploadId, url: "/api/v1/media/" + uploadId, filename: pending.filename,
      bytes: pending.bytes, uploadedAt: row.created_at,
    } });
    const findSaved = () => db.prepare("SELECT created_at FROM media WHERE id=? AND project_id=?")
      .get(uploadId, projectId);
    const saved = findSaved();
    if (saved) return result(saved);
    if (pending.expires_at <= new Date().toISOString()) {
      throw new ApiError(410, "upload_expired", "上传已过期，请重新选择视频");
    }
    const oss = media.oss;
    if (!oss?.enabled) throw new ApiError(503, "oss_unavailable", "OSS 上传服务暂不可用");
    const source = `pending-episode-videos/${projectId}/${episodeId}/${uploadId}`;
    const destination = `${projectId}/episode-videos/${episodeId}/${crypto.randomUUID()}${pending.extension}`;
    const signal = AbortSignal.timeout(120_000);
    let object;
    try {
      object = await oss.statObject(source, signal);
      if (object.bytes !== pending.bytes || !object.etag) {
        throw new ApiError(422, "invalid_video_size", "OSS 上的文件大小与原文件不一致，请重新上传");
      }
      await inspectOssVideo(oss, source, object, signal);
      await oss.copyObject(source, destination, object.etag, signal);
    } catch (error) {
      const concurrent = findSaved();
      if (concurrent) return result(concurrent);
      if (error instanceof ApiError) throw error;
      if (error.statusCode === 404) throw new ApiError(409, "upload_incomplete", "OSS 尚未收到完整视频，请重新上传");
      request.log.warn({ statusCode: error.statusCode }, "OSS episode upload verification failed");
      throw new ApiError(502, "oss_verify_failed", "OSS 文件校验暂时失败，请重试确认");
    }
    const row = transaction(db, () => {
      requireEpisode(request);
      const concurrent = findSaved();
      if (concurrent) return { ...concurrent, alreadySaved: true };
      const uploadedAt = new Date().toISOString();
      const mime = pending.extension === ".mov" ? "video/quicktime" : "video/mp4";
      db.prepare(`
        INSERT INTO media(id,project_id,storage_key,mime,bytes,sha256,source,created_at)
        VALUES(?,?,?,?,?,'','episode-final',?)
      `).run(uploadId, projectId, destination, mime, pending.bytes, uploadedAt);
      db.prepare(`
        INSERT INTO episode_final_videos(episode_id,media_id,filename,uploaded_at) VALUES(?,?,?,?)
        ON CONFLICT(episode_id) DO UPDATE SET media_id=excluded.media_id,
          filename=excluded.filename, uploaded_at=excluded.uploaded_at
      `).run(episodeId, uploadId, pending.filename, uploadedAt);
      return { created_at: uploadedAt };
    });
    if (row.alreadySaved) await oss.deleteObject(destination, AbortSignal.timeout(3000)).catch(() => {});
    await oss.deleteObject(source, AbortSignal.timeout(3000)).catch(() => {});
    reply.code(201);
    return result(row);
  });

  app.post(route, async (request, reply) => {
    requireEpisode(request);
    if (media.oss?.enabled) throw new ApiError(409, "direct_upload_required", "请刷新页面后使用 OSS 直传");
    const file = await request.file({ limits: { fileSize: MAX_VIDEO_BYTES, files: 1 } });
    if (!file) throw new ApiError(400, "file_required", "请选择要上传的成片");

    const { id: projectId, episodeId } = request.params;
    const mediaId = crypto.randomUUID();
    const mediaKey = `${projectId}/episode-videos/${episodeId}/${mediaId}`;
    const staging = media.locate(mediaKey + ".partial");
    const requestedExtension = path.extname(file.filename || "").toLowerCase();
    const hash = crypto.createHash("sha256");
    let bytes = 0;
    let publishedPath;
    let saved = false;

    try {
      await fs.promises.mkdir(path.dirname(staging), { recursive: true, mode: 0o700 });
      await pipeline(file.file, new Transform({
        transform(chunk, encoding, callback) {
          hash.update(chunk);
          bytes += chunk.length;
          callback(null, chunk);
        },
      }), fs.createWriteStream(staging, { flags: "wx", mode: 0o600 }));
      if (file.file.truncated) throw new ApiError(413, "file_too_large", "视频超过 500MB");

      const header = Buffer.alloc(12);
      const handle = await fs.promises.open(staging, "r");
      try {
        await handle.read(header, 0, header.length, 0);
      } finally {
        await handle.close();
      }
      const atom = header.toString("ascii", 4, 8);
      const isIsoVideo = media.sniff(header)?.kind === "video";
      const isQuickTime = isIsoVideo
        ? header.toString("ascii", 8, 12) === "qt  " || requestedExtension === ".mov"
        : requestedExtension === ".mov" && QUICKTIME_ATOMS.has(atom);
      if (bytes < header.length || (!isIsoVideo && !isQuickTime)) {
        throw new ApiError(400, "unsupported_media", "请选择 MP4、MOV 或 M4V 视频");
      }
      try {
        inspectMp4File(staging);
      } catch {
        throw new ApiError(422, "invalid_video", "无法读取视频，请检查文件是否完整");
      }

      const extension = isQuickTime ? ".mov" : requestedExtension === ".m4v" ? ".m4v" : ".mp4";
      const mime = isQuickTime ? "video/quicktime" : "video/mp4";
      const storageKey = mediaKey + extension;
      const destination = media.locate(storageKey);
      const filename = path.basename(file.filename || "成片" + extension).slice(0, 200);
      const uploadedAt = new Date().toISOString();
      const sha256 = hash.digest("hex");
      transaction(db, () => {
        requireEpisode(request);
        fs.renameSync(staging, destination);
        publishedPath = destination;
        db.prepare(`
          INSERT INTO media(id,project_id,storage_key,mime,bytes,sha256,source,created_at)
          VALUES(?,?,?,?,?,?,'episode-final',?)
        `).run(mediaId, projectId, storageKey, mime, bytes, sha256, uploadedAt);
        db.prepare(`
          INSERT INTO episode_final_videos(episode_id,media_id,filename,uploaded_at) VALUES(?,?,?,?)
          ON CONFLICT(episode_id) DO UPDATE SET media_id=excluded.media_id,
            filename=excluded.filename, uploaded_at=excluded.uploaded_at
        `).run(episodeId, mediaId, filename, uploadedAt);
      });
      saved = true;
      reply.code(201);
      return { video: { id: mediaId, url: "/api/v1/media/" + mediaId, filename, bytes, uploadedAt } };
    } finally {
      await fs.promises.rm(staging, { force: true });
      if (publishedPath && !saved) await fs.promises.rm(publishedPath, { force: true });
    }
  });
}

module.exports = { registerEpisodeVideo };
