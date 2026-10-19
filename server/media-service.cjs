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

function createMediaService({ root }) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const resolvedRoot = fs.realpathSync(root);

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

  async function writeAtomic(storageKey, bytes) {
    const file = locate(storageKey);
    await fs.promises.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const partial = `${file}.partial`;
    await fs.promises.writeFile(partial, bytes, { mode: 0o600 });
    await fs.promises.rename(partial, file);
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

  return { root: resolvedRoot, locate, writeAtomic, inspect, parseRange, sniff };
}

module.exports = { createMediaService, sniff };
