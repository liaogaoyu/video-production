const { validCredits } = require("./actual-usage.cjs");
function selectBenefit(config, model, resolution) {
  const rows =
    config?.model_list?.filter((x) => x.model_req_key === model) || [];
  if (rows.length !== 1) throw Error("官网尚未提供该模型的预估规则");
  const commercial = rows[0].commercial_config;
  const prices = commercial?.resolution_price_configs;
  const variants =
    prices?.filter(
      (x) => x.resolution?.toLowerCase() === resolution.toLowerCase(),
    ) || [];
  if (Array.isArray(prices) && variants.length !== 1)
    throw Error("官网尚未提供该分辨率的预估规则");
  const benefit =
    variants[0]?.no_input_video_price ||
    variants[0]?.price ||
    commercial?.default;
  if (
    benefit?.resource_sub_type !== "aigc" ||
    benefit.resource_id !== "generate_video" ||
    typeof benefit.benefit_type !== "string" ||
    !benefit.benefit_type
  )
    throw Error("官网预估规则格式不正确");
  // Image references do not add input video duration. Unsupported additive charges must not be silently omitted.
  if (
    commercial?.additional_conf &&
    Object.keys(commercial.additional_conf).length
  )
    throw Error("该模型含额外计价规则，暂不能自动预估");
  return benefit.benefit_type;
}
function calculateEstimate(meta, benefitType, duration) {
  if (!Number.isInteger(duration) || duration < 4 || duration > 15)
    throw Error("视频时长无效");
  const rows = (meta?.metadata_list || [])
    .filter(
      (x) => x.resource_type === "aigc" && x.resource_id === "generate_video",
    )
    .flatMap((x) => x.benefits_pay_strategy || [])
    .filter((x) => x.benefit_type === benefitType && x.credit_strategy);
  if (rows.length !== 1 || rows[0].unit !== "second")
    throw Error("官网积分预估计费单位不支持");
  const p = rows[0].credit_strategy.credit_pricing_info;
  if (
    !p ||
    !validCredits(p.credit_unit_price) ||
    !validCredits(p.min_charge_cnt) ||
    Number(p.min_charge_cnt) <= 0
  )
    throw Error("官网积分预估单价无效");
  const credits = Math.max(
    0,
    Math.ceil(
      ((duration * Number(p.credit_unit_price)) / Number(p.min_charge_cnt)) *
        1000 -
        1e-8,
    ) / 1000,
  );
  if (!validCredits(credits)) throw Error("官网预估积分无效");
  return {
    credits,
    unitPrice: Number(p.credit_unit_price),
    billingUnit: Number(p.min_charge_cnt),
    benefitType,
    source: "official_web_reference",
    checkedAt: new Date().toISOString(),
  };
}
module.exports = { selectBenefit, calculateEstimate };
