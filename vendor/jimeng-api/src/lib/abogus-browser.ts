/**
 * 可选的 a_bogus 浏览器签名通道（默认关闭）。
 *
 * 背景：上游 issue #156/#157 反馈 Seedance 2.0 的 /mweb/v1/aigc_draft/generate 新增了 a_bogus 校验
 * （ret=1019 "shark not pass" 或 fail_code 4013）。本模块用 headless Chromium 打开官网页面，
 * 在页面内用 fetch 发请求，由官网自带的 bdms SDK 自动注入 a_bogus。
 *
 * 开启：ABOGUS_BROWSER_ENABLED=1，并安装可选依赖：npm i playwright-core && npx playwright-core install chromium
 * 其他变量：ABOGUS_BROWSER_REGIONS(默认 us,hk,jp,sg,cn) ABOGUS_PAGE_URL ABOGUS_BROWSER_EXECUTABLE ABOGUS_HEADLESS(默认1)
 * 仅用于 Seedance 2.0 提交请求；国际版是否需要 a_bogus 未确认，须真实联调验证。
 */
import logger from "@/lib/logger.ts";
import type { RegionInfo } from "@/api/controllers/core.ts";
import { regionKey } from "@/lib/intl-config.ts";

export interface BrowserRequest {
  method: string;
  url: string; // 完整 URL（含 query）
  headers: Record<string, any>;
  data: any;
  regionInfo: RegionInfo;
  sessionToken: string; // 去掉区域前缀后的 sessionid，只用于写入浏览器 cookie，不打印
}

export interface BrowserResponse {
  status: number;
  statusText: string;
  data: any;
}

/** 可替换的实现（单元测试注入 mock） */
export type BrowserRequester = (req: BrowserRequest) => Promise<BrowserResponse>;

let overrideRequester: BrowserRequester | null = null;
export function setBrowserRequester(fn: BrowserRequester | null) { overrideRequester = fn; }

const sessions = new Map<string, { browser: any; context: any; page: any; lastUsed: number }>();
const IDLE_MS = 10 * 60 * 1000;

function defaultPageUrl(ri: RegionInfo) {
  if (process.env.ABOGUS_PAGE_URL) return process.env.ABOGUS_PAGE_URL;
  return ri.isCN ? "https://jimeng.jianying.com/ai-tool/generate?type=video" : "https://dreamina.capcut.com/ai-tool/generate?type=video";
}

function cookieDomains(ri: RegionInfo) {
  return ri.isCN ? [".jianying.com"] : [".capcut.com", ".capcutapi.com", ".capcut.us"];
}

async function getSession(req: BrowserRequest) {
  const key = `${regionKey(req.regionInfo)}:${req.sessionToken}`;
  const existing = sessions.get(key);
  if (existing) { existing.lastUsed = Date.now(); return existing; }

  let pw: any;
  try {
    // 可选依赖：用变量名避免被 tsup 打包进 dist
    const modName = process.env.ABOGUS_PLAYWRIGHT_MODULE || "playwright-core";
    pw = await import(modName);
  } catch {
    throw new Error("已开启 ABOGUS_BROWSER_ENABLED，但未安装 playwright-core。请执行: npm i playwright-core && npx playwright-core install chromium");
  }
  const chromium = pw.chromium || pw.default?.chromium;
  const browser = await chromium.launch({
    headless: process.env.ABOGUS_HEADLESS !== "0",
    executablePath: process.env.ABOGUS_BROWSER_EXECUTABLE || undefined,
    ...(process.env.INTL_PROXY_URL ? { proxy: { server: process.env.INTL_PROXY_URL } } : {}),
  });
  // 使用常规桌面 Chrome UA，避免 HeadlessChrome 标识
  const context = await browser.newContext({
    locale: req.regionInfo.isCN ? "zh-CN" : "en-US",
    userAgent: process.env.ABOGUS_USER_AGENT || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  });
  await context.addCookies(cookieDomains(req.regionInfo).flatMap((domain) =>
    ["sessionid", "sessionid_ss", "sid_tt"].map((name) => ({ name, value: req.sessionToken, domain, path: "/", secure: true, httpOnly: true, sameSite: "None" as const }))));
  const page = await context.newPage();
  if (process.env.ABOGUS_DRY_RUN === "1") {
    // 演练模式：生成请求在浏览器内被拦截丢弃，不会发到服务器（用于离线检查签名是否附加）
    await page.route("**/aigc_draft/generate**", (route: any) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ret: "0", data: { aigc_data: { history_record_id: "" } }, dry_run: true }) }));
    logger.warn("[abogus] ABOGUS_DRY_RUN=1：生成请求不会发往服务器");
  }
  const pageUrl = defaultPageUrl(req.regionInfo);
  logger.info(`[abogus] 启动浏览器会话 region=${regionKey(req.regionInfo)} page=${pageUrl}`);
  await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  // 等待风控 SDK 完成对 fetch/XHR 的接管（离线观察：window.__ac_intercepted_fetch / byted_acrawler）
  try {
    await page.waitForFunction(() => !!((window as any).__ac_intercepted_fetch || (window as any).byted_acrawler), null, { timeout: 30000 });
    logger.info("[abogus] 检测到风控 SDK 已加载");
  } catch {
    logger.warn("[abogus] 30s 内未检测到风控 SDK，请求可能不会被签名");
  }
  await page.waitForTimeout(Number(process.env.ABOGUS_WARMUP_MS || 8000));
  const s = { browser, context, page, lastUsed: Date.now() };
  sessions.set(key, s);
  return s;
}

setInterval(async () => {
  const now = Date.now();
  for (const [k, s] of sessions) {
    if (now - s.lastUsed > IDLE_MS) {
      sessions.delete(k);
      try { await s.browser.close(); } catch { /* ignore */ }
    }
  }
}, 60000).unref?.();

// 只透传与官网前端一致的业务头；appid/did/store-country-code、msToken/X-Bogus/X-Gnarly 由页面内 SDK 自动附加
// （离线观察结论：国际站 byted_acrawler 拦截 fetch/XHR，为 query 追加 msToken,X-Bogus,X-Gnarly）
const PASS_HEADERS = /^(pf|appvr|lan|sign|sign-ver|device-time|app-sdk-version|accept)$/i;

export async function browserRequest(req: BrowserRequest): Promise<BrowserResponse> {
  if (overrideRequester) return overrideRequester(req);
  const s = await getSession(req);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers || {})) if (PASS_HEADERS.test(k) && v != null) headers[k] = String(v);
  headers["Content-Type"] = "application/json";
  logger.info(`[abogus] 通过浏览器发送: ${req.method.toUpperCase()} ${req.url.split("?")[0]} headers=${Object.keys(headers).join(",")}`);
  // 记录 SDK 实际附加的签名参数（仅打印参数名和长度）
  const onReq = (r: any) => {
    if (!r.url().startsWith(req.url.split("?")[0])) return;
    const u = new URL(r.url());
    logger.info(`[abogus] 实际发出: ${u.origin}${u.pathname} 签名参数: ${["msToken", "X-Bogus", "X-Gnarly", "a_bogus"].map((k) => `${k}=${(u.searchParams.get(k) || "").length}`).join(" ")} 头: ${Object.keys(r.headers()).join(",")}`);
  };
  s.page.on("request", onReq);
  try {
  return await s.page.evaluate(async ({ url, method, headers, body }: any) => {
    const r = await fetch(url, { method, headers, body, credentials: "include", signal: AbortSignal.timeout(90000) });
    const text = await r.text();
    let data: any = text;
    try { data = JSON.parse(text); } catch { /* keep text */ }
    return { status: r.status, statusText: r.statusText, data };
  }, { url: req.url, method: req.method.toUpperCase(), headers, body: req.data == null ? undefined : JSON.stringify(req.data) });
  } finally { s.page.off("request", onReq); }
}

export async function closeAllBrowserSessions() {
  for (const [k, s] of sessions) { sessions.delete(k); try { await s.browser.close(); } catch { /* ignore */ } }
}
