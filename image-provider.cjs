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

function isApiMart(baseUrl) {
  const hostname = new URL(baseUrl).hostname.toLowerCase();
  return hostname === "apimart.ai" || hostname.endsWith(".apimart.ai");
}

function resolutionForApiMart(value) {
  const resolution = String(value || "1k").toLowerCase();
  if (!["1k", "2k", "4k"].includes(resolution))
    throw new Error("APIMart GPT-Image-2 分辨率只支持 1k、2k 或 4k");
  return resolution;
}

function taskEndpoint(baseUrl, taskId) {
  const url = new URL(endpointFor(baseUrl));
  url.pathname = url.pathname.replace(
    /\/images\/generations\/?$/,
    `/tasks/${encodeURIComponent(taskId)}`,
  );
  return url.href;
}

function apiError(payload) {
  const error = payload?.error;
  if (!error) return "";
  return String(error.message || error.detail || error.code || error).slice(0, 500);
}

function imageItem(payload) {
  const candidates = [
    payload?.data?.[0],
    payload?.result?.images?.[0],
    payload?.data?.result?.images?.[0],
    payload?.output?.images?.[0],
  ];
  const value = candidates.find(Boolean);
  if (typeof value === "string") return { url: value };
  if (value?.image_url && !value.url) return { ...value, url: value.image_url };
  if (value?.b64 && !value.b64_json) return { ...value, b64_json: value.b64 };
  return value;
}

function submittedTask(payload) {
  const status = String(payload?.status || payload?.data?.status || "").toLowerCase();
  const id = payload?.task_id || payload?.data?.task_id;
  return id && ["submitted", "queued", "pending", "processing", "running"].includes(status)
    ? { id: String(id), status }
    : null;
}

async function generateImage({
  config,
  prompt,
  apiKey,
  projectId,
  assetId,
  outputRoot,
  fetchImpl = fetch,
  pollIntervalMs = 3000,
  maxPollAttempts = 200,
}) {
  if (!config?.baseUrl || !config?.model || !prompt?.trim())
    throw new Error("生图配置或提示词不完整");
  if (!apiKey?.trim()) throw new Error("请先保存 API Key");
  if (
    !/^[a-z0-9_-]{1,80}$/i.test(projectId) ||
    !/^[a-z0-9_-]{1,80}$/i.test(assetId)
  )
    throw new Error("项目或资产 ID 不正确");
  const apiMart = isApiMart(config.baseUrl);
  const body = apiMart
    ? {
        model: config.model,
        prompt: prompt.trim(),
        size: config.ratio || "1:1",
        resolution: resolutionForApiMart(config.resolution),
        n: 1,
      }
    : {
        model: config.model,
        prompt: prompt.trim(),
        size: sizeForRatio(config.ratio),
        n: 1,
      };
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  const response = await fetchImpl(endpointFor(config.baseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = (await response.text())
      .slice(0, 500)
      .replace(/sk-[A-Za-z0-9_-]+/g, "[已隐藏密钥]");
    throw new Error(
      `生图接口返回 ${response.status}${text ? `：${text}` : ""}`,
    );
  }
  let payload = await response.json();
  const initialError = apiError(payload);
  if (initialError) throw new Error(`生图接口错误：${initialError}`);
  const task = submittedTask(payload);
  if (task) {
    let completed = false;
    for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
      if (pollIntervalMs) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const polled = await fetchImpl(taskEndpoint(config.baseUrl, task.id), {
        method: "GET",
        headers: { authorization: headers.authorization },
      });
      if (!polled.ok) throw new Error(`生图任务查询失败：${polled.status}`);
      payload = await polled.json();
      const taskError = apiError(payload);
      if (taskError) throw new Error(`生图任务失败：${taskError}`);
      const status = String(payload?.status || payload?.data?.status || "").toLowerCase();
      if (["failed", "error", "cancelled", "canceled"].includes(status))
        throw new Error(`生图任务失败：${status}`);
      if (imageItem(payload)) {
        completed = true;
        break;
      }
    }
    if (!completed) throw new Error("生图任务等待超时，可稍后重试");
  }
  const item = imageItem(payload);
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

module.exports = {
  endpointFor,
  sizeForRatio,
  isApiMart,
  resolutionForApiMart,
  taskEndpoint,
  imageItem,
  generateImage,
};
