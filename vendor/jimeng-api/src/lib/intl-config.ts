/**
 * 国际版（Dreamina，us/hk/jp/sg）可配置项。
 * 所有国际区域共用同一套 Seedance 2.0 / 2.0-fast 逻辑，只保留域名等已知差异，
 * 且均可用环境变量覆盖，方便真实联调时按抓包结果调整，无需改代码。
 */
import type { RegionInfo } from "@/api/controllers/core.ts";

const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

export function regionKey(ri: RegionInfo): "us" | "hk" | "jp" | "sg" | "cn" {
  if (ri.isUS) return "us";
  if (ri.isHK) return "hk";
  if (ri.isJP) return "jp";
  if (ri.isSG) return "sg";
  return "cn";
}

/** 视频上传 VOD 域名 */
export const DEFAULT_VOD_HOST_CN = "https://vod.bytedanceapi.com";
// 来源：上游 issue #162，JP 账号实测可用。US 未验证，暂与亚洲区一致，可用 INTL_VOD_HOST_US 覆盖。
export const DEFAULT_VOD_HOST_INTL = "https://vod-normal-sg.capcutapi.com";

export function getVodHost(ri: RegionInfo): string {
  const rk = regionKey(ri);
  if (rk === "cn") return env("CN_VOD_HOST") || DEFAULT_VOD_HOST_CN;
  return env(`INTL_VOD_HOST_${rk.toUpperCase()}`) || env("INTL_VOD_HOST") || DEFAULT_VOD_HOST_INTL;
}

/** Seedance 2.0 在国际版启用的区域（默认全部） */
export function isSeedance2EnabledFor(ri: RegionInfo): boolean {
  const rk = regionKey(ri);
  if (rk === "cn") return true;
  const list = (env("INTL_SEEDANCE2_REGIONS") || "us,hk,jp,sg").toLowerCase().split(/[,\s]+/);
  return list.includes(rk);
}

/** 模型 req_key 覆盖：INTL_VIDEO_MODEL_OVERRIDES='{"jimeng-video-seedance-2.0":"xxx"}' */
export function getModelOverrides(ri: RegionInfo): Record<string, string> {
  const rk = regionKey(ri);
  const raw = rk === "cn" ? env("CN_VIDEO_MODEL_OVERRIDES") : (env(`INTL_VIDEO_MODEL_OVERRIDES_${rk.toUpperCase()}`) || env("INTL_VIDEO_MODEL_OVERRIDES"));
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch {
    throw new Error(`模型覆盖环境变量不是合法 JSON: ${raw}`);
  }
}

export interface IntlVideoProfile {
  benefitSeedance20Pro: string;
  benefitSeedance20Fast: string;
  omniBenefitPro: string;
  omniBenefitFast: string;
  draftVersion: string;
  draftVersionOmni: string;
  webVersion: string;
  videoReferer: string;
}

/** 积分类型/草稿版本/Referer 等差异，国际版默认与国内一致（未经抓包确认），均可覆盖 */
export function getVideoProfile(ri: RegionInfo, defaults: Omit<IntlVideoProfile, "videoReferer">): IntlVideoProfile {
  if (ri.isCN) {
    return { ...defaults, videoReferer: "https://jimeng.jianying.com/ai-tool/generate?type=video" };
  }
  return {
    benefitSeedance20Pro: env("INTL_BENEFIT_SEEDANCE20_PRO") || defaults.benefitSeedance20Pro,
    benefitSeedance20Fast: env("INTL_BENEFIT_SEEDANCE20_FAST") || defaults.benefitSeedance20Fast,
    omniBenefitPro: env("INTL_OMNI_BENEFIT_PRO") || defaults.omniBenefitPro,
    omniBenefitFast: env("INTL_OMNI_BENEFIT_FAST") || defaults.omniBenefitFast,
    draftVersion: env("INTL_DRAFT_VERSION") || defaults.draftVersion,
    draftVersionOmni: env("INTL_DRAFT_VERSION_OMNI") || defaults.draftVersionOmni,
    webVersion: env("INTL_WEB_VERSION") || defaults.webVersion,
    videoReferer: env("INTL_VIDEO_REFERER") || "https://dreamina.capcut.com/ai-tool/generate?type=video",
  };
}

/** 视频调试日志：JIMENG_VIDEO_DEBUG=1 */
export const isVideoDebug = () => env("JIMENG_VIDEO_DEBUG") === "1" || env("JIMENG_VIDEO_DEBUG") === "true";

/** a_bogus 浏览器签名通道开关（默认关闭） */
export function isAbogusEnabledFor(ri: RegionInfo): boolean {
  if (!(env("ABOGUS_BROWSER_ENABLED") === "1" || env("ABOGUS_BROWSER_ENABLED") === "true")) return false;
  const list = (env("ABOGUS_BROWSER_REGIONS") || "us,hk,jp,sg,cn").toLowerCase().split(/[,\s]+/);
  return list.includes(regionKey(ri));
}

/** 脱敏：sessionid/密钥类只保留前4后2 */
export function mask(s: any): string {
  const str = String(s ?? "");
  if (str.length <= 8) return "***";
  return `${str.slice(0, 4)}***${str.slice(-2)}`;
}

const SENSITIVE_KEYS = /^(sessionid|sessionid_ss|sid_tt|sid_guard|access_key_id|secret_access_key|session_token|authorization|cookie|token|x-amz-security-token|auth)$/i;

/** 递归脱敏对象，用于日志 */
export function redact(obj: any, depth = 0): any {
  if (depth > 8 || obj == null) return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));
  if (typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) out[k] = SENSITIVE_KEYS.test(k) ? mask(v) : redact(v, depth + 1);
    return out;
  }
  return obj;
}
