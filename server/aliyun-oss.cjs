const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");

function encodeKey(key) {
  return String(key)
    .split("/")
    .map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

function createOssStore(config = {}) {
  const accessKeyId = String(config.accessKeyId || process.env.STORYDOCK_OSS_ACCESS_KEY_ID || process.env.ALIYUN_ACCESS_KEY_ID || "");
  const accessKeySecret = String(config.accessKeySecret || process.env.STORYDOCK_OSS_ACCESS_KEY_SECRET || process.env.ALIYUN_ACCESS_KEY_SECRET || "");
  const bucket = String(config.bucket || process.env.STORYDOCK_OSS_BUCKET || "");
  const region = String(config.region || process.env.STORYDOCK_OSS_REGION || "cn-hangzhou").replace(/^oss-/, "");
  const endpoint = String(config.endpoint || process.env.STORYDOCK_OSS_ENDPOINT || `oss-${region}.aliyuncs.com`)
    .replace(/^https?:\/\//, "")
    .replace(/^oss-oss-/, "oss-");
  const prefix = String(config.prefix || process.env.STORYDOCK_OSS_PREFIX || "storydock/media/").replace(/^\/+/, "").replace(/\/?$/, "/");
  const enabled = Boolean(config.enabled ?? process.env.STORYDOCK_OSS_ENABLED === "1") && Boolean(accessKeyId && accessKeySecret && bucket);

  function objectKey(storageKey) {
    return `${prefix}${String(storageKey || "").replace(/^\/+/, "")}`;
  }

  function ossUri(storageKey) {
    return `oss://${bucket}/${objectKey(storageKey)}`;
  }

  function sign(method, key, headers = {}, queries = "") {
    const date = headers.Date || new Date().toUTCString();
    headers.Date = date;
    const contentType = headers["Content-Type"] || "";
    const contentMd5 = headers["Content-MD5"] || "";
    const resource = `/${bucket}/${key}${queries}`;
    const canonical = [method, contentMd5, contentType, date, resource].join("\n");
    const signature = crypto.createHmac("sha1", accessKeySecret).update(canonical).digest("base64");
    headers.Authorization = `OSS ${accessKeyId}:${signature}`;
    return headers;
  }

  function request(method, key, { headers = {}, body, queries = "", signal } = {}) {
    const encoded = encodeKey(key);
    const hdrs = sign(method, key, { ...headers }, queries);
    const url = new URL(`https://${bucket}.${endpoint}/${encoded}${queries}`);
    const lib = url.protocol === "http:" ? http : https;
    return new Promise((resolve, reject) => {
      const req = lib.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || undefined,
          path: url.pathname + url.search,
          method,
          signal,
          headers: {
            ...hdrs,
            Host: url.host,
            ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const buffer = Buffer.concat(chunks);
            if (res.statusCode >= 300) {
              const err = new Error(`OSS ${method} ${key} failed: ${res.statusCode} ${buffer.toString("utf8").slice(0, 300)}`);
              err.statusCode = res.statusCode;
              err.body = buffer;
              reject(err);
              return;
            }
            resolve({ statusCode: res.statusCode, headers: res.headers, body: buffer });
          });
        },
      );
      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });
  }

  async function put(storageKey, bytes, mime = "application/octet-stream", { signal } = {}) {
    if (!enabled) throw new Error("OSS 未启用");
    const key = objectKey(storageKey);
    await request("PUT", key, {
      headers: { "Content-Type": mime },
      body: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes),
      signal,
    });
    return ossUri(storageKey);
  }

  async function get(storageKey) {
    if (!enabled) throw new Error("OSS 未启用");
    const result = await request("GET", objectKey(storageKey));
    return result.body;
  }

  async function exists(storageKey) {
    if (!enabled) return false;
    try {
      await request("HEAD", objectKey(storageKey));
      return true;
    } catch (error) {
      if (error.statusCode === 404) return false;
      throw error;
    }
  }

  async function ensureLocal(storageKey, localPath) {
    if (fs.existsSync(localPath)) return localPath;
    const bytes = await get(storageKey);
    await fs.promises.mkdir(path.dirname(localPath), { recursive: true, mode: 0o700 });
    const partial = `${localPath}.partial`;
    await fs.promises.writeFile(partial, bytes, { mode: 0o600 });
    await fs.promises.rename(partial, localPath);
    return localPath;
  }

  function signedUrl(storageKey, expiresSec = 3600) {
    if (!enabled) throw new Error("OSS 未启用");
    const key = objectKey(storageKey);
    const expires = Math.floor(Date.now() / 1000) + expiresSec;
    const resource = `/${bucket}/${key}`;
    const stringToSign = `GET\n\n\n${expires}\n${resource}`;
    const signature = crypto.createHmac("sha1", accessKeySecret).update(stringToSign).digest("base64");
    const query = `OSSAccessKeyId=${encodeURIComponent(accessKeyId)}&Expires=${expires}&Signature=${encodeURIComponent(signature)}`;
    return `https://${bucket}.${endpoint.replace("-internal", "")}/${encodeKey(key)}?${query}`;
  }

  return {
    enabled,
    bucket,
    region,
    endpoint,
    prefix,
    objectKey,
    ossUri,
    put,
    get,
    exists,
    ensureLocal,
    signedUrl,
  };
}

module.exports = { createOssStore };
