const { ApiError } = require("./errors.cjs");
function settingsService(s) {
  const get = () => {
    const r = s.db
      .prepare("SELECT * FROM commercial_settings WHERE id=1")
      .get();
    return { ...JSON.parse(r.value), revision: r.revision };
  };
  function publicSettings() {
    const c = get();
    delete c.smtpSecret;
    return {
      ...c,
      pointsUnitLocked: !!s.db
        .prepare("SELECT id FROM wallet_ledger LIMIT 1")
        .get(),
      smtpConfigured: !!get().smtpSecret,
      officialQuotesSupported: { jimeng: false, dreamina_web_api: true },
      billingBasis:
        "人民币预扣，按官方任务实际积分多退少补；未取得实际消耗不结算",
    };
  }
  function save(b) {
    const old = get();
    if (b.revision !== old.revision)
      throw new ApiError(409, "revision_conflict", "配置已变化，请刷新");
    const c = { ...old };
    delete c.revision;
    for (const k of ["enabled", "registrationEnabled"])
      if (b[k] !== undefined) {
        if (typeof b[k] !== "boolean")
          throw new ApiError(400, "invalid_setting", "开关不正确");
        c[k] = b[k];
      }
    for (const [k, max] of [
      ["wechat", 100],
      ["rechargeNote", 1000],
      ["qrDataUrl", 2000000],
    ])
      if (b[k] !== undefined) {
        if (typeof b[k] !== "string" || b[k].length > max)
          throw new ApiError(400, "invalid_setting", "充值信息过长");
        c[k] = b[k];
      }
    if (
      c.qrDataUrl &&
      !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(c.qrDataUrl)
    )
      throw new ApiError(400, "invalid_qr", "二维码只支持PNG、JPEG、WebP图片");
    if (b.pointsPerYuan !== undefined && b.pointsPerYuan !== 100)
      throw new ApiError(
        409,
        "rate_locked",
        "人民币金额以分存储，不能修改面值",
      );
    if (b.pointsPerYuan !== undefined) {
      if (
        !Number.isInteger(b.pointsPerYuan) ||
        b.pointsPerYuan < 1 ||
        b.pointsPerYuan > 100000
      )
        throw new ApiError(400, "invalid_rate", "每元积分数无效");
      if (
        b.pointsPerYuan !== old.pointsPerYuan &&
        s.db.prepare("SELECT id FROM wallet_ledger LIMIT 1").get()
      )
        throw new ApiError(
          409,
          "rate_locked",
          "已有积分流水，不能改变积分面值",
        );
      c.pointsPerYuan = b.pointsPerYuan;
    }
    if (b.rates) {
      c.rates = {};
      for (const group of ["domestic", "international", "image"]) {
        const r = b.rates[group];
        if (
          !r ||
          !Number.isInteger(r.markupPercent) ||
          r.markupPercent < 0 ||
          r.markupPercent > 10000
        )
          throw new ApiError(400, "invalid_rate", "加价比例需为0至10000的整数");
        if (group === "image") {
          if (
            !Number.isInteger(r.costFen) ||
            r.costFen < 1 ||
            r.costFen > 100000
          )
            throw new ApiError(400, "invalid_rate", "每张成本分数无效");
          c.rates[group] = {
            costFen: r.costFen,
            markupPercent: r.markupPercent,
            estimateCreditsPerSecond: r.estimateCreditsPerSecond ?? null,
          };
          if (
            r.estimateCreditsPerSecond !== undefined &&
            r.estimateCreditsPerSecond !== null
          ) {
            if (
              typeof r.estimateCreditsPerSecond !== "number" ||
              !Number.isFinite(r.estimateCreditsPerSecond) ||
              r.estimateCreditsPerSecond < 0 ||
              r.estimateCreditsPerSecond > 100000 ||
              !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(
                String(r.estimateCreditsPerSecond),
              )
            )
              throw new ApiError(
                400,
                "invalid_rate",
                "预估每秒积分最多三位小数",
              );
          }
        } else {
          if (
            !Number.isInteger(r.purchaseFen) ||
            r.purchaseFen < 1 ||
            r.purchaseFen > 1e8 ||
            !Number.isInteger(r.purchaseCredits) ||
            r.purchaseCredits < 1 ||
            r.purchaseCredits > 1e8
          )
            throw new ApiError(400, "invalid_rate", "采购金额或积分数无效");
          c.rates[group] = {
            purchaseFen: r.purchaseFen,
            purchaseCredits: r.purchaseCredits,
            markupPercent: r.markupPercent,
            estimateCreditsPerSecond: r.estimateCreditsPerSecond ?? null,
          };
          if (
            r.estimateCreditsPerSecond !== undefined &&
            r.estimateCreditsPerSecond !== null
          ) {
            if (
              typeof r.estimateCreditsPerSecond !== "number" ||
              !Number.isFinite(r.estimateCreditsPerSecond) ||
              r.estimateCreditsPerSecond < 0 ||
              r.estimateCreditsPerSecond > 100000 ||
              !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(
                String(r.estimateCreditsPerSecond),
              )
            )
              throw new ApiError(
                400,
                "invalid_rate",
                "预估每秒积分最多三位小数",
              );
          }
        }
      }
    }
    if (
      b.smtp &&
      Object.values(b.smtp).some(
        (v) => v !== undefined && v !== null && v !== "",
      )
    ) {
      const m = b.smtp;
      if (
        !m.host ||
        typeof m.host !== "string" ||
        /[\s/:]/.test(m.host) ||
        ![465, 587].includes(m.port) ||
        !/^\S+@\S+\.\S+$/.test(m.from || "") ||
        typeof m.user !== "string" ||
        m.user.length > 200
      )
        throw new ApiError(
          400,
          "invalid_smtp",
          "请填写SMTP地址、465/587端口、账号和发信邮箱",
        );
      c.smtp = { host: m.host, port: m.port, user: m.user, from: m.from };
      if (m.password) {
        if (typeof m.password !== "string" || m.password.length > 1000)
          throw new ApiError(400, "invalid_smtp", "SMTP授权码无效");
        c.smtpSecret = s.secrets.seal(m.password, {
          accountId: "",
          purpose: "smtp-password",
        });
      }
      if (!c.smtpSecret)
        throw new ApiError(400, "invalid_smtp", "请填写SMTP授权码");
    }
    if (c.registrationEnabled && !c.smtpSecret && !s.mailer)
      throw new ApiError(400, "smtp_required", "先配置邮件服务，再开放注册");
    const changed = s.db
      .prepare(
        "UPDATE commercial_settings SET value=?,revision=revision+1 WHERE id=1 AND revision=?",
      )
      .run(JSON.stringify(c), old.revision);
    if (!changed.changes)
      throw new ApiError(409, "revision_conflict", "配置已变化");
    s.repos.record("admin.settings.updated", {
      operatorId: require("./tenant.cjs").current()?.id,
      revision: old.revision + 1,
    });
    return publicSettings();
  }
  async function mail(to, subject, text) {
    if (s.mailer) return s.mailer({ to, subject, text });
    const c = get();
    if (!c.smtpSecret)
      throw new ApiError(400, "smtp_required", "邮件服务尚未配置");
    const password = s.secrets.open(c.smtpSecret, {
      accountId: "",
      purpose: "smtp-password",
    });
    const transport = require("nodemailer").createTransport({
      host: c.smtp.host,
      port: c.smtp.port,
      secure: c.smtp.port === 465,
      requireTLS: true,
      auth: { user: c.smtp.user, pass: password },
      connectionTimeout: 10000,
      socketTimeout: 20000,
    });
    try {
      await transport.sendMail({ from: c.smtp.from, to, subject, text });
    } catch {
      throw new ApiError(
        502,
        "mail_failed",
        "邮件发送失败，请稍后重试或联系管理员",
      );
    } finally {
      transport.close();
    }
  }
  return { get, publicSettings, save, mail };
}
module.exports = { settingsService };
