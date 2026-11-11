const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { ApiError } = require("./errors.cjs");

const IMAGE_LIMIT = 50 * 1024 * 1024;
const VIDEO_LIMIT = 500 * 1024 * 1024;

function sniff(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { ext: ".png", mime: "image/png", kind: "image" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: ".jpg", mime: "image/jpeg", kind: "image" };
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return { ext: ".webp", mime: "image/webp", kind: "image" };
  }
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    return { ext: ".mp4", mime: "video/mp4", kind: "video" };
  }
  return null;
}

function createMediaService({ root, oss = null }) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const resolvedRoot = fs.realpathSync(root);
  const availability = new Map();
  const mirroring = new Map();

  function locate(storageKey) {
    if (!storageKey || storageKey.includes("..") || path.isAbsolute(storageKey)) {
      throw new ApiError(404, "media_not_found", "媒体不存在");
    }
    const file = path.resolve(resolvedRoot, storageKey);
    const relative = path.relative(resolvedRoot, file);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new ApiError(404, "media_not_found", "媒体不存在");
    }
    return file;
  }

  async function ensureLocal(storageKey) {
    const file = locate(storageKey);
    if (fs.existsSync(file)) return file;
    if (!oss?.enabled) throw new ApiError(404, "media_not_found", "媒体不存在");
    await oss.ensureLocal(storageKey, file);
    return file;
  }

  async function ensureOnOss(storageKey, mime = "application/octet-stream") {
    if (!oss?.enabled) return null;
    if (await oss.exists(storageKey)) return oss.ossUri(storageKey);
    const file = locate(storageKey);
    if (!fs.existsSync(file)) throw new ApiError(404, "media_not_found", "媒体不存在");
    return oss.putFile(storageKey, file, mime);
  }

  function rememberAvailability(storageKey, result, ttl) {
    if (availability.size >= 2048) availability.delete(availability.keys().next().value);
    availability.set(storageKey, { result, expires: Date.now() + ttl });
  }

  function mirrorLocalFile(storageKey, mime) {
    if (!oss?.enabled) return Promise.resolve(false);
    if (mirroring.has(storageKey)) return mirroring.get(storageKey);
    const sync = oss.putFile(storageKey, locate(storageKey), mime, { signal: AbortSignal.timeout(60000) })
      .then(() => {
        rememberAvailability(storageKey, Promise.resolve(true), 60000);
        return true;
      }, () => false)
      .finally(() => mirroring.delete(storageKey));
    mirroring.set(storageKey, sync);
    return sync;
  }

  async function deliveryUrl(storageKey, options = {}) {
    if (!oss?.enabled || options.disposition) return null;
    let entry = availability.get(storageKey);
    if (!entry || entry.expires <= Date.now()) {
      const result = (typeof oss.isPublic === "function"
        ? oss.isPublic(storageKey, { signal: AbortSignal.timeout(2500) })
        : Promise.resolve(false)
      ).catch(() => null);
      rememberAvailability(storageKey, result, 10000);
      entry = availability.get(storageKey);
    }
    const available = await entry.result;
    if (available && typeof oss.publicUrl === "function") return oss.publicUrl(storageKey);
    if (available === false && mirroring.size < 2 && fs.existsSync(locate(storageKey))) {
      void mirrorLocalFile(storageKey, options.mime);
    }
    return null;
  }

  async function writeAtomic(storageKey, bytes, mime, { onOssError } = {}) {
    const file = locate(storageKey);
    await fs.promises.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const partial = `${file}.${crypto.randomUUID()}.partial`;
    try {
      await fs.promises.writeFile(partial, bytes, { mode: 0o600, flag: "wx" });
      await fs.promises.rename(partial, file);
    } finally {
      await fs.promises.rm(partial, { force: true });
    }
    if (oss?.enabled) {
      const options = onOssError ? { signal: AbortSignal.timeout(12000) } : undefined;
      try {
        await oss.put(storageKey, bytes, mime || "application/octet-stream", options);
      } catch (error) {
        if (!onOssError) throw error;
        onOssError(error);
      }
    }
    return file;
  }

  function inspect(bytes, { video = false } = {}) {
    if (!bytes?.length) throw new ApiError(400, "empty_file", "文件是空的");
    const limit = video ? VIDEO_LIMIT : IMAGE_LIMIT;
    if (bytes.length > limit) throw new ApiError(413, "file_too_large", video ? "视频超过 500MB" : "图片超过 50MB");
    const kind = sniff(bytes);
    if (!kind) throw new ApiError(400, "unsupported_media", "只接受 PNG、JPEG、WebP 图片或 MP4 视频");
    if (video && kind.kind !== "video") throw new ApiError(400, "unsupported_media", "文件不是 MP4 视频");
    if (!video && kind.kind !== "image") throw new ApiError(400, "unsupported_media", "只接受 PNG、JPEG 或 WebP 图片");
    return {
      ...kind,
      bytes: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    };
  }

  function parseRange(header, size) {
    if (!header) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match) return { unsatisfiable: true, size };
    let start = match[1] === "" ? null : Number(match[1]);
    let end = match[2] === "" ? null : Number(match[2]);
    if (start === null && end === null) return { unsatisfiable: true, size };
    if (start === null) {
      if (!end) return { unsatisfiable: true, size };
      start = Math.max(0, size - end);
      end = size - 1;
    } else if (end === null || end >= size) end = size - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) {
      return { unsatisfiable: true, size };
    }
    return { start, end, size };
  }

  return { root: resolvedRoot, locate, ensureLocal, ensureOnOss, mirrorLocalFile, deliveryUrl, writeAtomic, inspect, parseRange, sniff, oss };
}

module.exports = { createMediaService, sniff };
