const zlib = require("node:zlib");
const { ApiError } = require("./errors.cjs");

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[index] = value >>> 0;
}
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name.replaceAll("\\", "/"), "utf8");
    const data = file.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6); // UTF-8 filenames on Windows/macOS unzip tools.
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(Buffer.concat([local, name, data]));
    centrals.push(Buffer.concat([central, name]));
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function safeName(name) {
  const value = String(name || "").replaceAll("\\", "/");
  if (!value || value.startsWith("/") || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new ApiError(400, "unsafe_archive", "项目包包含不安全的路径");
  }
  return value;
}

function unzip(buffer, { maxEntries = 2000, maxBytes = 512 * 1024 * 1024 } = {}) {
  let position = buffer.length - 22;
  while (position >= 0 && buffer.readUInt32LE(position) !== 0x06054b50) position -= 1;
  if (position < 0) throw new ApiError(400, "invalid_archive", "不是有效的 ZIP 文件");
  const count = buffer.readUInt16LE(position + 10);
  const directoryOffset = buffer.readUInt32LE(position + 16);
  if (count > maxEntries) throw new ApiError(400, "archive_too_large", "项目包文件数量过多");
  const files = [];
  let cursor = directoryOffset;
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new ApiError(400, "invalid_archive", "项目包目录损坏");
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const external = buffer.readUInt32LE(cursor + 38);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = safeName(buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"));
    const madeBy = buffer.readUInt16LE(cursor + 4) >>> 8;
    if (madeBy === 3 && ((external >>> 16) & 0o170000) === 0o120000) {
      throw new ApiError(400, "unsafe_archive", "项目包不能包含符号链接");
    }
    if (name.endsWith("/")) {
      cursor += 46 + nameLength + extraLength + commentLength;
      continue;
    }
    total += uncompressedSize;
    if (total > maxBytes || uncompressedSize > maxBytes) throw new ApiError(400, "archive_too_large", "项目包解压后超过大小限制");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0 ? Buffer.from(compressed) : method === 8 ? zlib.inflateRawSync(compressed) : null;
    if (!data || data.length !== uncompressedSize) throw new ApiError(400, "invalid_archive", "项目包压缩方式不受支持");
    files.push({ name, data });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

module.exports = { zipStore, unzip, crc32 };
