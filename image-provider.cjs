const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function endpointFor(baseUrl) {
  const url = new URL(baseUrl);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "::1"].includes(url.hostname)
    )
  )
    throw new Error("仅支持 HTTPS 或本机 HTTP 图像接口");
  if (url.username || url.password) throw new Error("接口地址不能包含账号密码");
  if (!url.pathname.endsWith("/images/generations"))
    url.pathname = url.pathname.replace(/\/$/, "") + "/images/generations";
  return url.href;
}

function sizeForRatio(ratio) {
  return ratio === "16:9"
    ? "1536x1024"
    : ratio === "9:16"
      ? "1024x1536"
      : "1024x1024";
}

async function generateImage({
  config,
  prompt,
  apiKey,
  projectId,
  assetId,
  outputRoot,
  fetchImpl = fetch,
}) {
  if (!config?.baseUrl || !config?.model || !prompt?.trim())
    throw new Error("生图配置或提示词不完整");
  if (!apiKey?.trim()) throw new Error("请先保存 API Key");
  if (
    !/^[a-z0-9_-]{1,80}$/i.test(projectId) ||
    !/^[a-z0-9_-]{1,80}$/i.test(assetId)
  )
    throw new Error("项目或资产 ID 不正确");
  const response = await fetchImpl(endpointFor(config.baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      prompt: prompt.trim(),
      size: sizeForRatio(config.ratio),
      n: 1,
    }),
  });
  if (!response.ok) {
    const text = (await response.text())
      .slice(0, 500)
      .replace(/sk-[A-Za-z0-9_-]+/g, "[已隐藏密钥]");
    throw new Error(
      `生图接口返回 ${response.status}${text ? `：${text}` : ""}`,
    );
  }
  const payload = await response.json();
  const item = payload?.data?.[0];
  let bytes;
  let extension = "png";
  if (item?.b64_json) bytes = Buffer.from(item.b64_json, "base64");
  else if (item?.url) {
    const remote = new URL(item.url);
    if (
      remote.protocol !== "https:" &&
      !(
        remote.protocol === "http:" &&
        ["127.0.0.1", "localhost", "::1"].includes(remote.hostname)
      )
    )
      throw new Error("图片结果地址不安全");
    const downloaded = await fetchImpl(remote.href, { redirect: "follow" });
    if (!downloaded.ok) throw new Error(`图片下载失败：${downloaded.status}`);
    const contentType = downloaded.headers.get("content-type") || "";
    if (!contentType.startsWith("image/"))
      throw new Error("模型返回的文件不是图片");
    extension = contentType.includes("jpeg")
      ? "jpg"
      : contentType.includes("webp")
        ? "webp"
        : "png";
    bytes = Buffer.from(await downloaded.arrayBuffer());
  } else throw new Error("生图接口没有返回图片数据");
  if (!bytes.length || bytes.length > 50 * 1024 * 1024)
    throw new Error("图片文件为空或超过 50MB");
  const directory = path.join(outputRoot, projectId, "assets", assetId);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = `${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
  const target = path.join(directory, filename);
  const temporary = `${target}.partial`;
  await fs.writeFile(temporary, bytes, { mode: 0o600 });
  await fs.rename(temporary, target);
  return { path: target, url: pathToFileURL(target).href, bytes: bytes.length };
}

module.exports = { endpointFor, sizeForRatio, generateImage };
