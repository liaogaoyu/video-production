const { execFile } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");
const { ApiError } = require("../../server/errors.cjs");
function createGlobalRunner({
  binary = process.env.STORYDOCK_GLOBAL_CLI ||
    path.join(
      os.homedir(),
      ".local/bin",
      process.platform === "win32" ? "dreamina-canvas.exe" : "dreamina-canvas",
    ),
  stateDirectory,
  exec = execFile,
  proxy = process.env.STORYDOCK_GLOBAL_PROXY || "",
} = {}) {
  if (proxy) {
    const url = new URL(proxy);
    if (!["http:", "https:"].includes(url.protocol))
      throw Error("国际版代理必须为 HTTP/HTTPS 地址");
  }
  async function call(profile, command, timeout = 60000) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(profile))
      throw new ApiError(400, "invalid_profile", "CLI profile 格式不正确");
    const env = {
      ...process.env,
      ...(stateDirectory ? { DREAMINA_CANVAS_STATE_DIR: stateDirectory } : {}),
      ...(proxy ? { HTTPS_PROXY: proxy, HTTP_PROXY: proxy } : {}),
    };
    return new Promise((resolve, reject) =>
      exec(
        binary,
        [
          "--format",
          "json",
          "--non-interactive",
          "--profile",
          profile,
          ...command,
        ],
        { env, timeout, maxBuffer: 8 * 1024 * 1024, shell: false },
        (error, stdout = "", stderr = "") => {
          const envelopes = [];
          for (const stream of [stdout, stderr]) {
            try {
              const value = JSON.parse(
                String(stream)
                  .trim()
                  .replace(/("userId"\s*:\s*)(\d{16,})(?=\s*[,}])/g, '$1"$2"'),
              );
              if (typeof value.ok === "boolean") envelopes.push(value);
            } catch {}
          }
          const result = envelopes.find((e) => !e.ok) || envelopes[0];
          if (!result) {
            const e = new ApiError(
              503,
              error?.code === "ENOENT"
                ? "global_cli_missing"
                : "global_cli_transport",
              error?.code === "ENOENT"
                ? "未找到 Dreamina Canvas CLI，请在服务端安装或设置 STORYDOCK_GLOBAL_CLI"
                : "国际 CLI 响应未确认，请检查网络或代理",
            );
            e.uncertain = true;
            return reject(e);
          }
          if (!result.ok || error) {
            const failure = result.error || {};
            const e = new ApiError(
              400,
              failure.code || "global_cli_failed",
              failure.message || "国际 CLI 执行失败",
            );
            e.action = failure.requiredAction;
            e.requestId = result.meta?.requestId;
            e.class = failure.class;
            e.reason = failure.reason;
            e.partialData = result.partialData;
            e.uncertain =
              Boolean(error?.killed) ||
              failure.requiredAction === "resume" ||
              failure.class === "retryable_failure";
            return reject(e);
          }
          resolve({ data: result.data, requestId: result.meta?.requestId });
        },
      ),
    );
  }
  return { call, binary, proxyConfigured: Boolean(proxy) };
}
module.exports = { createGlobalRunner };
