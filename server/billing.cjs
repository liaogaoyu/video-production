const crypto = require("node:crypto"),
  { ApiError } = require("./errors.cjs"),
  { transaction } = require("./db.cjs");
const hash = (v) =>
    crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex"),
  now = () => new Date().toISOString();
function integer(v, label, min = 0, max = 1e9) {
  if (!Number.isSafeInteger(v) || v < min || v > max)
    throw new ApiError(400, "invalid_amount", label + "无效");
  return v;
}
function milli(v) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(String(v)))
    throw new ApiError(400, "invalid_credits", "官方积分最多三位小数");
  const [a, b = ""] = String(v).split(".");
  const n = Number(a) * 1000 + Number(b.padEnd(3, "0"));
  return integer(n, "官方积分", 0, 1e9);
}
function price(unitsMilli, rate, points, kind) {
  const n =
    kind === "image"
      ? BigInt(unitsMilli) *
        BigInt(rate.costFen) *
        BigInt(points) *
        BigInt(100 + rate.markupPercent)
      : BigInt(unitsMilli) *
        BigInt(rate.purchaseFen) *
        BigInt(points) *
        BigInt(100 + rate.markupPercent);
  const d =
    kind === "image" ? 10000000n : BigInt(rate.purchaseCredits) * 10000000n;
  return integer(Number((n + d - 1n) / d), "报价", 0, 1e9);
}
function wallet(db, userId) {
  db.prepare("INSERT OR IGNORE INTO wallets(user_id) VALUES(?)").run(userId);
  return {
    ...db.prepare("SELECT * FROM wallets WHERE user_id=?").get(userId),
    due: due(db, userId),
    currency: "CNY",
  };
}
function movement(
  db,
  {
    userId,
    key,
    action,
    available,
    frozen,
    amount,
    jobId = null,
    operatorId = null,
    note = "",
  },
) {
  const old = db
    .prepare("SELECT * FROM wallet_ledger WHERE business_key=?")
    .get(key);
  if (old) return old;
  wallet(db, userId);
  const r = db
    .prepare(
      "UPDATE wallets SET available=available+?,frozen=frozen+? WHERE user_id=? AND available+?>=0 AND frozen+?>=0",
    )
    .run(available, frozen, userId, available, frozen);
  if (!r.changes)
    throw new ApiError(409, "insufficient_points", "可用余额不足");
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO wallet_ledger VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(
    id,
    userId,
    key,
    action,
    available,
    frozen,
    amount,
    jobId,
    operatorId,
    note,
    now(),
  );
  return db.prepare("SELECT * FROM wallet_ledger WHERE id=?").get(id);
}
function due(db, userId) {
  return db
    .prepare("SELECT COALESCE(SUM(due),0) n FROM job_billing WHERE user_id=?")
    .get(userId).n;
}
function collectDue(db, userId) {
  return transaction(db, () => {
    for (const b of db
      .prepare(
        "SELECT * FROM job_billing WHERE user_id=? AND status='due' ORDER BY created_at,job_id",
      )
      .all(userId)) {
      const paid = Math.min(b.due, wallet(db, userId).available);
      if (!paid) break;
      movement(db, {
        userId,
        key: `supplement:${b.job_id}:${b.charged}`,
        action: "supplement",
        available: -paid,
        frozen: 0,
        amount: paid,
        jobId: b.job_id,
        note: "实际消耗补扣",
      });
      db.prepare(
        "UPDATE job_billing SET charged=charged+?,due=due-?,status=?,updated_at=? WHERE job_id=?",
      ).run(paid, paid, paid === b.due ? "settled" : "due", now(), b.job_id);
    }
  });
}
function reconcileJob(db, id) {
  return transaction(db, () => {
    const b = db
      .prepare("SELECT * FROM job_billing WHERE job_id=? AND status='frozen'")
      .get(id);
    if (!b) return;
    const job = db.prepare("SELECT * FROM jobs WHERE id=?").get(id);
    if (
      !job ||
      !["succeeded", "failed", "auth_expired", "cancelled"].includes(job.status)
    )
      return;
    const snap = JSON.parse(b.snapshot);
    let final = 0,
      usage = null;
    if (job.status === "succeeded") {
      if (snap.kind === "image") {
        // A job delivers one saved image. Charge the delivered count, never an image request estimate.
        if (!job.media_id) return;
        final = price(1000, snap.rate, 100, "image");
        usage = { source: "delivered_image", count: 1, mediaId: job.media_id };
      } else {
        let result;
        try {
          result = JSON.parse(job.result_json || "{}");
        } catch {
          result = {};
        }
        const u = result.officialUsage;
        if (
          !u ||
          u.source !== "official_actual" ||
          !job.remote_task_id ||
          u.taskId !== job.remote_task_id ||
          u.credits === undefined
        )
          return;
        try {
          final = price(milli(u.credits), snap.rate, 100, snap.kind);
        } catch {
          return;
        }
        usage = { ...u };
      }
    }
    const extra = Math.max(0, final - b.reserved),
      paidExtra = Math.min(extra, wallet(db, b.user_id).available);
    const remaining = extra - paidExtra,
      paid = final - remaining;
    movement(db, {
      userId: b.user_id,
      key: "settle:" + id,
      action: job.status === "succeeded" ? "settle" : "refund",
      available: Math.max(0, b.reserved - final) - paidExtra,
      frozen: -b.reserved,
      amount: paid,
      jobId: id,
      note:
        job.status === "succeeded"
          ? "按实际消耗结算，多退少补"
          : "生成失败，退回预扣金额",
    });
    db.prepare(
      "UPDATE job_billing SET status=?,charged=?,actual_amount=?,due=?,usage_json=?,updated_at=? WHERE job_id=? AND status='frozen'",
    ).run(
      job.status === "succeeded" ? (remaining ? "due" : "settled") : "refunded",
      paid,
      final,
      remaining,
      JSON.stringify(usage || { source: "failed_refund" }),
      now(),
      id,
    );
  });
}
function createBilling(s) {
  const db = s.db,
    cfg = require("./commercial-settings.cjs").settingsService(s);
  const offers = () =>
    db.prepare("SELECT * FROM public_model_offers ORDER BY kind,id").all();
  function fingerprint(projectId, sourceIds) {
    const graph = s.repos.content.graph(projectId);
    return hash({
      project: graph.project,
      assets: graph.assets,
      versions: graph.versions,
      references: graph.references,
      projectReferences: graph.projectReferences,
      shots: graph.shots,
      shotRefs: graph.shotRefs,
      sources: sourceIds,
      connection: db
        .prepare(
          "SELECT revision,model FROM model_connections WHERE id='image'",
        )
        .get(),
    });
  }
  function listOffers(admin = false) {
    const conn = s.repos.accounts.imageConnection();
    return offers()
      .filter((o) => admin || o.enabled)
      .map((o) =>
        admin
          ? { ...o, pricing: JSON.parse(o.pricing_json) }
          : {
              id: o.id,
              name:
                o.kind === "image" && o.name === "资产生图"
                  ? conn?.model || o.name
                  : o.name,
              kind: o.kind,
              minDuration: 4,
              maxDuration: 15,
              resolutions: ["720p"],
              priceReady:
                o.kind === "image" ||
                cfg.get().rates[o.group_key]?.estimateCreditsPerSecond !=
                  null ||
                (JSON.parse(o.pricing_json).perSecondCredits !== undefined &&
                  JSON.parse(o.pricing_json).perSecondCredits !== null) ||
                !!JSON.parse(o.pricing_json).rateCards?.length,
            },
      );
  }
  function updateOffer(id, b) {
    const o = db
      .prepare("SELECT * FROM public_model_offers WHERE id=?")
      .get(id);
    if (!o) throw new ApiError(404, "not_found", "模型不存在");
    const name = b.name ?? o.name;
    if (typeof name !== "string" || !name.trim() || name.length > 100)
      throw new ApiError(400, "invalid_model", "模型名称无效");
    const p = b.pricing ?? JSON.parse(o.pricing_json);
    if (p.perSecondCredits !== undefined && p.perSecondCredits !== null)
      milli(p.perSecondCredits);
    if (p.rateCards !== undefined) {
      if (!Array.isArray(p.rateCards) || p.rateCards.length > 200)
        throw new ApiError(400, "invalid_price", "价格表无效");
      for (const r of p.rateCards) {
        integer(r.duration, "时长", 4, 15);
        if (
          r.resolution !== "720p" ||
          !["text", "reference", "any"].includes(r.referenceMode)
        )
          throw new ApiError(400, "invalid_price", "价格表参数无效");
        milli(r.credits);
      }
    }
    db.prepare(
      "UPDATE public_model_offers SET name=?,enabled=?,pricing_json=? WHERE id=?",
    ).run(
      name.trim(),
      b.enabled === undefined ? o.enabled : b.enabled ? 1 : 0,
      JSON.stringify(p),
      id,
    );
    s.repos.record("admin.offer.updated", {
      offerId: id,
      operatorId: require("./tenant.cjs").current()?.id,
    });
    return listOffers(true);
  }
  function quote(user, projectId, b) {
    require("./tenant.cjs").own(db, projectId, user);
    const settings = cfg.get();
    if (!settings.enabled && user.role !== "admin")
      throw new ApiError(403, "billing_closed", "生成服务暂未开放");
    const offer = db
      .prepare("SELECT * FROM public_model_offers WHERE id=? AND enabled=1")
      .get(b.offerId);
    if (!offer) throw new ApiError(400, "offer_unavailable", "模型未上架");
    if (
      !Array.isArray(b.sourceIds) ||
      !b.sourceIds.length ||
      b.sourceIds.length > 100
    )
      throw new ApiError(400, "invalid_sources", "请选择1至100项");
    const ids = [...new Set(b.sourceIds)];
    if (ids.some((x) => typeof x !== "string"))
      throw new ApiError(400, "invalid_sources", "任务来源不正确");
    let retry = null;
    if (b.retryJobId) {
      retry = db
        .prepare("SELECT * FROM jobs WHERE id=? AND project_id=?")
        .get(b.retryJobId, projectId);
      if (
        !retry ||
        !["failed", "auth_expired"].includes(retry.status) ||
        ids.length !== 1 ||
        ids[0] !== retry.source_id
      )
        throw new ApiError(
          409,
          "invalid_retry",
          "仅可对已确认失败的原任务重新报价",
        );
      if (JSON.parse(retry.result_json || "{}").resubmittedJobId)
        throw new ApiError(
          409,
          "already_resubmitted",
          "原任务已重新提交，请查看最新尝试",
        );
    }
    const project = s.repos.content.mustProject(projectId),
      resolution = "720p",
      ratio = b.ratio || project.ratio;
    if (!["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"].includes(ratio))
      throw new ApiError(400, "invalid_ratio", "画幅无效");
    const rules = JSON.parse(offer.pricing_json),
      rate = settings.rates[offer.group_key];
    const items = ids.map((id) => {
      const row = db
        .prepare(
          `SELECT * FROM ${offer.kind === "image" ? "assets" : "shots"} WHERE id=? AND project_id=? AND deleted_at IS NULL`,
        )
        .get(id, projectId);
      if (!row) throw new ApiError(404, "source_missing", "资产或分镜不存在");
      let units = 1000;
      if (offer.kind === "video") {
        integer(row.duration, "时长", 4, 15);
        const refs = db
          .prepare("SELECT COUNT(*) n FROM shot_references WHERE shot_id=?")
          .get(id).n;
        const mode = refs ? "reference" : "text";
        const entry =
          (rules.rateCards || []).find(
            (r) =>
              r.duration === row.duration &&
              r.resolution === resolution &&
              r.referenceMode === mode,
          ) ||
          (rules.rateCards || []).find(
            (r) =>
              r.duration === row.duration &&
              r.resolution === resolution &&
              r.referenceMode === "any",
          );
        if (rate.estimateCreditsPerSecond != null)
          units = milli(rate.estimateCreditsPerSecond) * row.duration;
        else if (entry) units = milli(entry.credits);
        else if (
          rules.perSecondCredits !== undefined &&
          rules.perSecondCredits !== null
        )
          units = milli(rules.perSecondCredits) * row.duration;
        else
          throw new ApiError(
            400,
            "price_not_configured",
            "该模型的预测消耗尚未配置，请联系管理员",
          );
      }
      return {
        sourceId: id,
        title: row.title || row.name,
        promptPreview:
          offer.kind === "image"
            ? require("./asset-prompt.cjs").buildAssetImagePrompt(
                row.prompt,
                row.type,
                project.asset_common_prompt,
              )
            : null,
        duration: row.duration || null,
        unitsMilli: units,
        officialCredits: offer.kind === "video" ? units / 1000 : null,
        amount: price(units, rate, settings.pointsPerYuan, offer.kind),
        source: "configured",
      };
    });
    const amount = integer(
      items.reduce((n, i) => n + i.amount, 0),
      "总报价",
    );
    const snapshot = {
      offer,
      retryJobId: retry?.id || null,
      referenceImageFormat:
        retry &&
        /18005|ParamImageResourceUnavailable/i.test(retry.error_message || "")
          ? "jpeg"
          : null,
      kind: offer.kind,
      body: {
        kind: offer.kind,
        sourceIds: ids,
        model: offer.model,
        resolution,
        ratio,
        accountId: "auto",
      },
      items,
      rate,
      pointsPerYuan: 100,
      currency: "CNY",
      pricingRevision: settings.revision,
    };
    const id = crypto.randomUUID(),
      expiresAt = Date.now() + 300000;
    db.prepare(
      "INSERT INTO generation_quotes(id,user_id,project_id,offer_id,input_hash,snapshot,amount,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      user.id,
      projectId,
      offer.id,
      fingerprint(projectId, ids),
      JSON.stringify(snapshot),
      amount,
      expiresAt,
      now(),
    );
    return {
      id,
      modelName: offer.name,
      amount,
      ceiling: amount,
      items,
      expiresAt,
      basis:
        "配置预估仅用于预扣；成功后按官方实际消耗多退少补，缺少实际记录时待结算",
      wallet: wallet(db, user.id),
    };
  }
  function confirm(user, id) {
    return transaction(db, () => {
      const q = db
        .prepare("SELECT * FROM generation_quotes WHERE id=? AND user_id=?")
        .get(id, user.id);
      if (!q) throw new ApiError(404, "quote_missing", "报价不存在");
      require("./tenant.cjs").own(db, q.project_id, user);
      if (q.status === "confirmed") return JSON.parse(q.result_json);
      if (q.status !== "open" || q.expires_at < Date.now())
        throw new ApiError(409, "quote_expired", "报价已过期，请重新报价");
      if (!cfg.get().enabled && user.role !== "admin")
        throw new ApiError(403, "billing_closed", "生成服务暂未开放");
      const snap = JSON.parse(q.snapshot),
        offer = db
          .prepare("SELECT * FROM public_model_offers WHERE id=? AND enabled=1")
          .get(q.offer_id);
      if (
        !offer ||
        hash(offer) !== hash(snap.offer) ||
        fingerprint(q.project_id, snap.body.sourceIds) !== q.input_hash
      )
        throw new ApiError(
          409,
          "quote_changed",
          "模型或生成内容已变化，请重新报价",
        );
      collectDue(db, user.id);
      if (due(db, user.id))
        throw new ApiError(409, "unpaid_balance", "有待补扣费用，请先充值补齐");
      if (wallet(db, user.id).available < q.amount)
        throw new ApiError(
          409,
          "insufficient_points",
          "可用余额不足，请添加微信充值",
        );
      if (
        offer.provider === "jimeng" &&
        !db
          .prepare(
            "SELECT id FROM jimeng_accounts WHERE enabled=1 AND authorized=1 AND permission='allowed' AND removed_at IS NULL LIMIT 1",
          )
          .get()
      )
        throw new ApiError(
          409,
          "no_account",
          "快速模型暂时无可用账号，请稍后重试",
        );
      if (snap.retryJobId) {
        const original = db
          .prepare("SELECT * FROM jobs WHERE id=?")
          .get(snap.retryJobId);
        if (
          !original ||
          !["failed", "auth_expired"].includes(original.status) ||
          JSON.parse(original.result_json || "{}").resubmittedJobId
        )
          throw new ApiError(
            409,
            "already_resubmitted",
            "原任务已重新提交，请查看最新尝试",
          );
      }
      const result =
        offer.provider === "dreamina_web_api"
          ? s.web.batch(q.project_id, snap.body, "quote-" + id)
          : s.repos.jobs.createBatch({
              projectId: q.project_id,
              body: snap.body,
              idempotencyKey: "quote-" + id,
            });
      if (snap.retryJobId) {
        const original = db
          .prepare("SELECT result_json FROM jobs WHERE id=?")
          .get(snap.retryJobId);
        db.prepare(
          "UPDATE jobs SET result_json=?,version=version+1 WHERE id=?",
        ).run(
          JSON.stringify({
            ...JSON.parse(original.result_json || "{}"),
            resubmittedJobId: result.jobIds[0],
          }),
          snap.retryJobId,
        );
        s.repos.record("job.resubmitted", {
          jobId: snap.retryJobId,
          newJobId: result.jobIds[0],
          projectId: q.project_id,
        });
      }
      result.jobIds.forEach((jobId, i) => {
        if (snap.referenceImageFormat && offer.provider === "jimeng") {
          const row = db
            .prepare("SELECT input_snapshot FROM jobs WHERE id=?")
            .get(jobId);
          db.prepare("UPDATE jobs SET input_snapshot=? WHERE id=?").run(
            JSON.stringify({
              ...JSON.parse(row.input_snapshot),
              referenceImageFormat: snap.referenceImageFormat,
            }),
            jobId,
          );
        }
        const item = snap.items[i],
          billingSnapshot = {
            ...item,
            rate: snap.rate,
            pointsPerYuan: snap.pointsPerYuan,
            kind: snap.kind,
            modelName: offer.name,
            pricingRevision: snap.pricingRevision,
          };
        movement(db, {
          userId: user.id,
          key: "freeze:" + jobId,
          action: "freeze",
          available: -item.amount,
          frozen: item.amount,
          amount: item.amount,
          jobId,
          note: "生成前预扣，按实际消耗多退少补",
        });
        db.prepare(
          "INSERT INTO job_billing(job_id,user_id,quote_id,reserved,snapshot,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        ).run(
          jobId,
          user.id,
          id,
          item.amount,
          JSON.stringify(billingSnapshot),
          now(),
          now(),
        );
      });
      db.prepare(
        "UPDATE generation_quotes SET status='confirmed',result_json=? WHERE id=?",
      ).run(JSON.stringify(result), id);
      return result;
    });
  }
  function topup(actor, id, b, key) {
    integer(b.amountFen, "充值金额", 1, 1e8);
    b = { ...b, giftPoints: b.giftFen ?? b.giftPoints ?? 0 };
    integer(b.giftPoints, "赠送金额（分）", 0, 1e8);
    if (
      typeof key !== "string" ||
      key.length < 8 ||
      key.length > 150 ||
      typeof b.note !== "string" ||
      !b.note.trim() ||
      b.note.length > 500
    )
      throw new ApiError(400, "invalid_topup", "请填写收款备注和唯一充值标识");
    return transaction(db, () => {
      if (!db.prepare("SELECT id FROM app_users WHERE id=?").get(id))
        throw new ApiError(404, "user_missing", "用户不存在");
      const old = db
        .prepare("SELECT * FROM manual_topups WHERE request_key=?")
        .get(key);
      if (old) {
        if (
          old.user_id !== id ||
          old.amount_fen !== b.amountFen ||
          old.gift_points !== (b.giftPoints || 0) ||
          old.note !== b.note
        )
          throw new ApiError(409, "key_conflict", "这个充值标识已用于其他内容");
        return { topupId: old.id, wallet: wallet(db, id) };
      }
      const points = integer(b.amountFen, "充值金额（分）", 1),
        gift = b.giftPoints || 0,
        topupId = crypto.randomUUID();
      db.prepare("INSERT INTO manual_topups VALUES(?,?,?,?,?,?,?,?,?)").run(
        topupId,
        id,
        actor.id,
        b.amountFen,
        points,
        gift,
        key,
        b.note,
        now(),
      );
      movement(db, {
        userId: id,
        key: "topup:" + key,
        action: "topup",
        available: points + gift,
        frozen: 0,
        amount: points + gift,
        operatorId: actor.id,
        note: b.note,
      });
      collectDue(db, id);
      return { topupId, wallet: wallet(db, id) };
    });
  }
  function reconcile() {
    for (const r of db
      .prepare(
        "SELECT b.job_id FROM job_billing b JOIN jobs j ON j.id=b.job_id WHERE b.status='frozen' AND j.status IN ('succeeded','failed','auth_expired','cancelled') LIMIT 200",
      )
      .all())
      reconcileJob(db, r.job_id);
  }
  return {
    quote,
    confirm,
    listOffers,
    updateOffer,
    topup,
    reconcile,
    collectDue: (id) => collectDue(db, id),
    wallet: (id) => wallet(db, id),
    ledger: (id) =>
      db
        .prepare(
          "SELECT * FROM wallet_ledger WHERE user_id=? ORDER BY created_at DESC,id LIMIT 500",
        )
        .all(id),
    pricing: cfg,
  };
}
module.exports = {
  createBilling,
  reconcileJob,
  price,
  milli,
  movement,
  wallet,
};
