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
  if (isApiMart(baseUrl)) url.searchParams.set("language", "zh");
  return url.href;
}

function apiError(payload) {
  const error = payload?.error;
  if (!error) return "";
  return String(error.message || error.detail || error.code || error).slice(0, 500);
}

function networkErrorMessage(label, url, error) {
  const details = [
    error?.cause?.code,
    error?.cause?.message,
    error?.code,
    error?.message,
  ].filter(Boolean).join(" ");
  const matched = details.match(/\b(?:net::)?(ERR_[A-Z0-9_]+|UND_ERR_[A-Z0-9_]+|E[A-Z0-9_]+)\b/i);
  const code = matched?.[1]?.toUpperCase() || "";
  const hostname = new URL(url).hostname;
  let hint = `请检查网络、系统代理和防火墙是否允许访问 ${hostname}`;
  if (["ENOTFOUND", "EAI_AGAIN", "ERR_NAME_NOT_RESOLVED"].includes(code))
    hint = `DNS 无法解析 ${hostname}`;
  else if (["ECONNREFUSED", "ERR_CONNECTION_REFUSED"].includes(code))
    hint = `${hostname} 拒绝连接`;
  else if (["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "ERR_TIMED_OUT"].includes(code))
    hint = `连接 ${hostname} 超时`;
  else if (code.includes("CERT") || code.includes("SSL"))
    hint = `${hostname} 的 HTTPS 证书校验失败`;
  else if (code.includes("PROXY") || code.includes("TUNNEL"))
    hint = "系统代理连接失败，请检查 Windows 代理设置";
  return `${label}连接失败${code ? `（${code}）` : ""}：${hint}`;
}

async function fetchOrThrow(fetchImpl, url, options, label) {
  try {
    return await fetchImpl(url, options);
  } catch (error) {
    const wrapped = new Error(networkErrorMessage(label, url, error), { cause: error });
    wrapped.kind = "network";
    throw wrapped;
  }
}

function firstHttpUrl(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.find((item) => typeof item === "string" && /^https?:\/\//i.test(item)) || "";
}

function imageItem(payload) {
  const nested = payload?.data && !Array.isArray(payload.data) ? payload.data : null;
  const candidates = [
    payload?.data?.[0],
    payload?.result?.images?.[0],
    nested?.result?.images?.[0],
    payload?.output?.images?.[0],
  ];
  const value = candidates.find(Boolean);
  if (typeof value === "string") return { url: value };
  const url = firstHttpUrl(value?.url) || firstHttpUrl(value?.image_url);
  if (url) return { ...value, url };
  if (value?.b64_json || value?.b64)
    return { ...value, b64_json: value.b64_json || value.b64 };
  return null;
}

function submittedTask(payload) {
  const record = Array.isArray(payload?.data) ? payload.data[0] : payload?.data || payload;
  const status = String(record?.status || payload?.status || "").toLowerCase();
  const id = record?.task_id || payload?.task_id;
  return id && ["submitted", "queued", "pending", "processing", "running"].includes(status)
    ? { id: String(id), status }
    : null;
}

async function postImageGeneration({
  config,
  prompt,
  apiKey,
  references = [],
  fetchImpl = fetch,
}) {
  if (!config?.baseUrl || !config?.model || !prompt?.trim())
    throw new Error("生图配置或提示词不完整");
  if (!apiKey?.trim()) throw new Error("请先保存 API Key");
  if (!Array.isArray(references) || references.length > 15)
    throw new Error("参考图数量必须在 0–15 张之间");
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
  if (references.length) {
    if (!apiMart) throw new Error("当前参考图上传仅支持 APIMart Images 接口");
    body.image_urls = references;
  }
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  const endpoint = endpointFor(config.baseUrl);
  const response = await fetchOrThrow(fetchImpl, endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }, "生图接口");
  if (!response.ok) {
    const text = (await response.text())
      .slice(0, 500)
      .replace(/sk-[A-Za-z0-9_-]+/g, "[已隐藏密钥]");
    const error = new Error(
      `生图接口返回 ${response.status}${text ? `：${text}` : ""}`,
    );
    error.statusCode = response.status;
    error.kind = response.status >= 500 ? "uncertain" : "rejected";
    throw error;
  }
  const payload = await response.json();
  const initialError = apiError(payload);
  if (initialError) {
    const error = new Error(`生图接口错误：${initialError}`);
    error.kind = "rejected";
    throw error;
  }
  return { payload, task: submittedTask(payload) };
}

async function fetchImageTask({ config, apiKey, taskId, fetchImpl = fetch }) {
  const pollUrl = taskEndpoint(config.baseUrl, taskId);
  const polled = await fetchOrThrow(fetchImpl, pollUrl, {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}` },
  }, "生图任务查询");
  if (!polled.ok) {
    const error = new Error(`生图任务查询失败：${polled.status}`);
    error.statusCode = polled.status;
    error.kind = polled.status >= 500 ? "retry" : "rejected";
    throw error;
  }
  const payload = await polled.json();
  const taskError = apiError(payload);
  if (taskError) {
    const error = new Error(`生图任务失败：${taskError}`);
    error.kind = "rejected";
    throw error;
  }
  const status = String(payload?.status || payload?.data?.status || "").toLowerCase();
  if (["failed", "error", "cancelled", "canceled"].includes(status)) {
    const error = new Error(`生图任务失败：${status}`);
    error.kind = "rejected";
    throw error;
  }
  return { payload, image: imageItem(payload), status };
}

async function generateImage({
  config,
  prompt,
  apiKey,
  references = [],
  projectId,
  assetId,
  outputRoot,
  fetchImpl = fetch,
  pollIntervalMs = 3000,
  maxPollAttempts = 200,
}) {
  if (
    !/^[a-z0-9_-]{1,80}$/i.test(projectId) ||
    !/^[a-z0-9_-]{1,80}$/i.test(assetId)
  )
    throw new Error("项目或资产 ID 不正确");
  const posted = await postImageGeneration({ config, prompt, apiKey, references, fetchImpl });
  let payload = posted.payload;
  if (posted.task) {
    let completed = false;
    for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
      if (pollIntervalMs) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const polled = await fetchImageTask({ config, apiKey, taskId: posted.task.id, fetchImpl });
      payload = polled.payload;
      if (polled.image) {
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
    const downloaded = await fetchOrThrow(fetchImpl, remote.href, { redirect: "follow" }, "图片下载");
    if (!downloaded.ok) throw new Error(`图片下载失败：${downloaded.status}`);
    const contentType = downloaded.headers.get("content-type") || "";
    const fromName = path.extname(new URL(remote.href).pathname).toLowerCase();
    const named = [".png", ".jpg", ".jpeg", ".webp"].includes(fromName);
    if (!contentType.startsWith("image/") && !named)
      throw new Error("模型返回的文件不是图片");
    extension = contentType.includes("jpeg")
      ? "jpg"
      : contentType.includes("webp")
        ? "webp"
        : contentType.includes("png")
          ? "png"
          : fromName === ".jpg" || fromName === ".jpeg"
            ? "jpg"
            : fromName === ".webp"
              ? "webp"
              : "png";
    bytes = Buffer.from(await downloaded.arrayBuffer());
  } else {
    const shape = payload && typeof payload === "object"
      ? Object.keys(payload).slice(0, 8).join(", ")
      : typeof payload;
    throw new Error(`生图接口没有返回图片数据（响应字段：${shape || "空"}）`);
  }
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
  postImageGeneration,
  fetchImageTask,
  generateImage,
};
