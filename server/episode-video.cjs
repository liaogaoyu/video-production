const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { ApiError } = require("./errors.cjs");
const { transaction } = require("./db.cjs");
const { own } = require("./tenant.cjs");
const { inspectMp4File } = require("./video-export.cjs");

const MAX_VIDEO_BYTES = 500_000_000;
const QUICKTIME_ATOMS = new Set(["moov", "mdat", "wide", "free", "skip"]);

function registerEpisodeVideo(app, { db, media }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS episode_final_videos (
      episode_id TEXT PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
      media_id TEXT NOT NULL REFERENCES media(id),
      filename TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
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

  app.post(route, async (request, reply) => {
    requireEpisode(request);
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
