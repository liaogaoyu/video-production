const dns = require("node:dns").promises;
const net = require("node:net");

function isPrivateAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIP(address) === 6) {
    const value = address.toLowerCase();
    return value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80");
  }
  return false;
}

async function assertPublicUrl(href, { allowedHosts = [] } = {}) {
  let url;
  try { url = new URL(href); }
  catch { throw new Error("结果地址不正确"); }
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("结果地址协议不受支持");
  const allowed = allowedHosts.includes(url.hostname);
  if (!allowed && url.protocol !== "https:") throw new Error("结果地址必须是 HTTPS");
  if (!allowed && ["localhost", "metadata.google.internal"].includes(url.hostname)) throw new Error("结果地址指向内网，已拒绝下载");
  if (net.isIP(url.hostname) && !allowed && isPrivateAddress(url.hostname)) throw new Error("结果地址指向内网，已拒绝下载");
  if (!allowed && !net.isIP(url.hostname)) {
    const records = await dns.lookup(url.hostname, { all: true });
    if (records.some((record) => isPrivateAddress(record.address))) throw new Error("结果地址解析到内网，已拒绝下载");
  }
  return url;
}

async function downloadLimited(href, { fetchImpl = fetch, allowedHosts = [], maxBytes = 500 * 1024 * 1024, hops = 3 } = {}) {
  let current = href;
  for (let hop = 0; hop <= hops; hop += 1) {
    const url = await assertPublicUrl(current, { allowedHosts });
    const response = await fetchImpl(url.href, { redirect: "manual" });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || hop === hops) throw new Error("结果地址重定向次数过多");
      current = new URL(location, url).href;
      continue;
    }
    if (!response.ok) throw new Error(`下载失败：${response.status}`);
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > maxBytes) throw new Error("下载内容超过大小限制");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > maxBytes) throw new Error("下载内容为空或超过大小限制");
    return { bytes, contentType: response.headers.get("content-type") || "", finalUrl: url.href };
  }
  throw new Error("结果地址重定向次数过多");
}

module.exports = { isPrivateAddress, assertPublicUrl, downloadLimited };
