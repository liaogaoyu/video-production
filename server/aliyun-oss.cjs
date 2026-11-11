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
    const ossHeaders = Object.entries(headers)
      .map(([name, value]) => [name.toLowerCase(), String(value).trim()])
      .filter(([name]) => name.startsWith("x-oss-"))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => `${name}:${value}\n`).join("");
    const canonical = [method, contentMd5, contentType, date, ossHeaders + resource].join("\n");
    const signature = crypto.createHmac("sha1", accessKeySecret).update(canonical).digest("base64");
    headers.Authorization = `OSS ${accessKeyId}:${signature}`;
    return headers;
  }

  function request(method, key, { headers = {}, body, length, queries = "", signal } = {}) {
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
            ...(body ? { "Content-Length": length ?? Buffer.byteLength(body) } : {}),
          },
        },
        (res) => {
          if (headers.Range && res.statusCode === 200) {
            res.destroy();
            reject(new Error("OSS ignored the requested range"));
            return;
          }
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
      if (length !== undefined && body) {
        body.once("error", error => req.destroy(error));
        req.once("close", () => body.destroy());
        body.pipe(req);
      } else {
        req.end(body);
      }
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

  async function putFile(storageKey, file, mime, { signal } = {}) {
    if (!enabled) throw new Error("OSS 未启用");
    const stat = await fs.promises.stat(file);
    await request("PUT", objectKey(storageKey), {
      headers: { "Content-Type": mime },
      body: fs.createReadStream(file),
      length: stat.size,
      signal,
    });
    return ossUri(storageKey);
  }

  async function hasSignedObject(storageKey, { signal } = {}) {
    if (!enabled) return false;
    try {
      await request("HEAD", objectKey(storageKey), { signal });
      return true;
    } catch (error) {
      if (error.statusCode === 404) return false;
      throw error;
    }
  }

  function uploadForm(storageKey, { bytes, mime, expiresAt }) {
    const key = objectKey(storageKey);
    const policy = Buffer.from(JSON.stringify({
      expiration: expiresAt,
      conditions: [
        { bucket },
        ["eq", "$key", key],
        ["eq", "$content-type", mime],
        ["content-length-range", bytes, bytes],
      ],
    })).toString("base64");
    return {
      url: `https://${bucket}.${endpoint.replace("-internal", "")}/`,
      fields: {
        key,
        "Content-Type": mime,
        OSSAccessKeyId: accessKeyId,
        policy,
        Signature: crypto.createHmac("sha1", accessKeySecret).update(policy).digest("base64"),
      },
    };
  }

  async function statObject(storageKey, signal) {
    const { headers } = await request("HEAD", objectKey(storageKey), { signal });
    return { bytes: Number(headers["content-length"]), etag: headers.etag };
  }

  async function readRange(storageKey, offset, length, etag, signal) {
    const { body, statusCode } = await request("GET", objectKey(storageKey), {
      headers: { Range: `bytes=${offset}-${offset + length - 1}`, "If-Match": etag },
      signal,
    });
    if (statusCode !== 206 || body.length !== length) throw new Error("Invalid OSS range");
    return body;
  }

  async function copyObject(source, destination, etag, signal) {
    await request("PUT", objectKey(destination), {
      headers: {
        "x-oss-copy-source": `/${bucket}/${encodeKey(objectKey(source))}`,
        "x-oss-copy-source-if-match": etag,
      },
      signal,
    });
  }

  async function deleteObject(storageKey, signal) {
    await request("DELETE", objectKey(storageKey), { signal });
  }

  function publicStatus(method, key, { signal } = {}) {
    const url = new URL(`https://${bucket}.${endpoint.replace("-internal", "")}/${encodeKey(key)}`);
    return new Promise((resolve) => {
      const req = https.request(
        { hostname: url.hostname, path: url.pathname, method, headers: { Host: url.host } },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode || 0));
        },
      );
      const fail = () => resolve(0);
      req.on("error", fail);
      if (signal) {
        const abort = () => req.destroy();
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      }
      req.end();
    });
  }

  async function isPublic(storageKey, options) {
    if (!enabled) return false;
    return (await publicStatus("HEAD", objectKey(storageKey), options)) === 200;
  }

  function publicUrl(storageKey) {
    if (!enabled) throw new Error("OSS 未启用");
    return `https://${bucket}.${endpoint.replace("-internal", "")}/${encodeKey(objectKey(storageKey))}`;
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

  function signedUrl(storageKey, expiresSec = 3600, { method = "GET", disposition } = {}) {
    if (!enabled) throw new Error("OSS 未启用");
    const key = objectKey(storageKey);
    const expires = Math.floor(Date.now() / 1000) + expiresSec;
    const response = new URLSearchParams();
    if (method === "GET" && disposition) response.set("response-content-disposition", disposition);
    const subresources = [...response].map(([name, value]) => `${name}=${value}`).join("&");
    const resource = `/${bucket}/${key}${subresources ? "?" + subresources : ""}`;
    const stringToSign = `${method}\n\n\n${expires}\n${resource}`;
    const signature = crypto.createHmac("sha1", accessKeySecret).update(stringToSign).digest("base64");
    const query = `OSSAccessKeyId=${encodeURIComponent(accessKeyId)}&Expires=${expires}&Signature=${encodeURIComponent(signature)}`;
    return `https://${bucket}.${endpoint.replace("-internal", "")}/${encodeKey(key)}?${query}${subresources ? "&" + response : ""}`;
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
    putFile,
    get,
    hasSignedObject,
    uploadForm,
    statObject,
    readRange,
    copyObject,
    deleteObject,
    isPublic,
    publicUrl,
    exists,
    ensureLocal,
    signedUrl,
  };
}

module.exports = { createOssStore };
