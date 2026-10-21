const pending = new Map<string, Promise<any>>();
export function api<T = any>(
  url: string,
  method = "GET",
  body?: unknown,
  key?: string,
): Promise<T> {
  const path = "/api/v1/" + url;
  if (method === "GET" && pending.has(path)) return pending.get(path)!;
  const run = (async () => {
    const controller = new AbortController(),
      timer = setTimeout(
        () => controller.abort(),
        method === "GET" ? 20000 : 180000,
      );
    try {
      const form = body instanceof FormData;
      const r = await fetch(path, {
        method,
        credentials: "same-origin",
        signal: controller.signal,
        headers: {
          ...(!form && body ? { "Content-Type": "application/json" } : {}),
          ...(key ? { "idempotency-key": key } : {}),
        },
        body: body ? (form ? body : JSON.stringify(body)) : undefined,
      });
      const text = await r.text();
      let data: any;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw Error("服务响应异常，请稍后重试");
      }
      if (!r.ok) {
        if (r.status === 401 && !url.startsWith("auth/"))
          window.dispatchEvent(new Event("session-expired"));
        throw Error(data.error?.message || "请求失败");
      }
      return data;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError")
        throw Error("请求超时，请稍后重试");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  })();
  if (method === "GET") {
    pending.set(path, run);
    run.finally(() => pending.delete(path)).catch(() => {});
  }
  return run;
}
export const id = () => {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (n) => n.toString(16).padStart(2, "0")).join("");
};
export async function upload(url: string, file: File) {
  const f = new FormData();
  f.append("file", file);
  return api(url, "POST", f);
}
export async function copy(text: string) {
  const previous = document.activeElement as HTMLElement | null;
  const field = document.createElement("textarea");
  field.value = text;
  field.style.cssText = "position:fixed;left:-9999px;opacity:0";
  document.body.append(field);
  let copied = false;
  try {
    field.focus();
    field.select();
    copied = document.execCommand("copy");
  } finally {
    field.remove();
    previous?.focus({ preventScroll: true });
  }
  if (copied) return;
  if (!navigator.clipboard) throw Error("浏览器未允许复制");
  await Promise.race([
    navigator.clipboard.writeText(text),
    new Promise((_, reject) =>
      setTimeout(() => reject(Error("复制超时，请检查剪贴板权限")), 2000),
    ),
  ]);
}
export const time = (value?: string) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      })
    : "—";
export const labels: Record<string, string> = {
  queued: "等待提交",
  preparing: "准备中",
  submitting: "提交中",
  remote_running: "排队 / 生成中",
  downloading: "下载中",
  done: "已完成",
  failed: "生成失败",
  submit_unknown: "提交待确认",
  auth_expired: "授权失效",
  download_failed: "下载失败",
};
export const terminal = (s: string) =>
  [
    "done",
    "failed",
    "submit_unknown",
    "auth_expired",
    "download_failed",
  ].includes(s);
