const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { ApiError, publicMessage } = require("./errors.cjs");
const { transaction } = require("./db.cjs");
const { createGlobalRunner } = require("../worker/dreamina-global/runner.cjs");
const PROVIDER = "dreamina_global_canvas";
const { withVideoReferenceGuidance } = require("../video-reference-guidance.cjs");
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const hash = (value) =>
  crypto
    .createHash("sha256")
    .update(
      typeof value === "string" || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(value),
    )
    .digest("hex");
function nodeId() {
  const chars = "0123456789abcdefghjkmnpqrstvwxyz";
  return (
    "node_" + Array.from(crypto.randomBytes(10), (v) => chars[v % 32]).join("")
  );
}
function bindReferences(prompt, refs) {
  let output = "",
    i = 0;
  const names = refs
    .filter((r) => r.name)
    .slice()
    .sort((a, b) => b.name.length - a.name.length);
  while (i < prompt.length) {
    const ref =
      prompt[i] === "@" &&
      names.find((r) => prompt.startsWith("@" + r.name, i));
    if (ref) {
      output += "{{res:" + ref.resourceId + "}}";
      i += ref.name.length + 1;
    } else output += prompt[i++];
  }
  return output;
}
function validateGeneration(g, catalog) {
  const model = catalog.find((item) => item.model === g.model);
  const mode = model?.modes?.find(
    (mode) =>
      mode.name === g.mode &&
      (!mode.references || g.references.length >= (mode.references.min || 0)) &&
      (!mode.references || g.references.length <= mode.references.max),
  );
  if (!mode)
    throw new ApiError(
      400,
      "unsupported_global_model",
      "当前模型不支持此生成方式或参考图数量",
    );
  for (const [key, flag] of [
    ["prompt", "--prompt"],
    ["ratio", "--ratio"],
    ["resolution", "--resolution"],
    ["duration", "--duration"],
    ["count", "--count"],
  ]) {
    const rule = mode.flags.find((f) => f.flag === flag);
    const value = g[key];
    if (!rule) {
      if (value !== undefined && !(key === "count" && value === 1))
        throw new ApiError(
          400,
          "unsupported_global_field",
          `模型不支持 ${key}`,
        );
      continue;
    }
    if (rule.required && (value === undefined || value === ""))
      throw new ApiError(400, "invalid_global_field", `缺少 ${key}`);
    if (value === undefined) continue;
    if (
      (rule.values && !rule.values.includes(value)) ||
      (typeof value === "number" &&
        (!Number.isFinite(value) ||
          (rule.min !== undefined && value < rule.min) ||
          (rule.max !== undefined && value > rule.max))) ||
      (typeof value === "string" &&
        ((rule.minLength !== undefined && value.length < rule.minLength) ||
          (rule.maxLength !== undefined && value.length > rule.maxLength)))
    )
      throw new ApiError(400, "invalid_global_field", `模型不支持所选 ${key}`);
  }
  const images = mode.references?.types?.find((t) => t.mediaType === "image");
  if (
    g.references.length &&
    (!images ||
      g.references.length > (images.max ?? 0) ||
      g.references.length < (images.min ?? 0))
  )
    throw new ApiError(
      400,
      "invalid_global_references",
      "该模型不支持所选图片参考",
    );
  return g;
}
function createGlobalService(
  services,
  {
    runner = createGlobalRunner({
      stateDirectory: path.join(services.paths.root, "global-state"),
    }),
  } = {},
) {
  const { db, repos, media, secrets, paths } = services;
  const owner = uuid();
  let busy = false;
  fs.mkdirSync(path.join(paths.root, "global-state"), {
    recursive: true,
    mode: 0o700,
  });
  function account(id) {
    const row = db.prepare("SELECT * FROM global_accounts WHERE id=?").get(id);
    if (!row)
      throw new ApiError(404, "global_account_missing", "国际账号不存在");
    return row;
  }
  function publicAccount(a) {
    return {
      id: a.id,
      name: a.name,
      profile: a.profile,
      enabled: Boolean(a.enabled),
      authorized: Boolean(a.authorized),
      identityConfirmed: Boolean(a.identity_hash),
      isVip: a.is_vip === null ? null : Boolean(a.is_vip),
      vipLevel: a.vip_level,
      expiresAt: a.expires_at,
      error: a.error,
    };
  }
  function listAccounts() {
    return db
      .prepare("SELECT * FROM global_accounts ORDER BY created_at,id")
      .all()
      .map(publicAccount);
  }
  function createAccount(body) {
    const name = String(body.name || "").trim();
    if (!name || name.length > 60)
      throw new ApiError(400, "invalid_field", "请输入账号别名，最多60字");
    const id = uuid();
    const profile = body.profile
      ? String(body.profile)
      : "sdg_" + id.replaceAll("-", "");
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(profile))
      throw new ApiError(400, "invalid_profile", "profile 格式不正确");
    if (
      db.prepare("SELECT id FROM global_accounts WHERE profile=?").get(profile)
    )
      throw new ApiError(409, "profile_exists", "此 CLI profile 已添加");
    db.prepare(
      "INSERT INTO global_accounts(id,name,profile,created_at,updated_at) VALUES(?,?,?,?,?)",
    ).run(id, name, profile, now(), now());
    return publicAccount(account(id));
  }
  function updateAccount(id, body) {
    const a = account(id);
    const name = body.name === undefined ? a.name : String(body.name).trim();
    if (!name || name.length > 60)
      throw new ApiError(400, "invalid_field", "账号别名不正确");
    db.prepare(
      "UPDATE global_accounts SET name=?,enabled=?,updated_at=? WHERE id=?",
    ).run(
      name,
      body.enabled === undefined ? a.enabled : body.enabled ? 1 : 0,
      now(),
      id,
    );
    return publicAccount(account(id));
  }
  async function checkAccount(id) {
    const a = account(id);
    const status = (await runner.call(a.profile, ["auth", "status"], 30000))
      .data;
    if (!status.loggedIn) {
      db.prepare(
        "UPDATE global_accounts SET authorized=0,error=?,updated_at=? WHERE id=?",
      ).run("尚未授权", now(), id);
      return publicAccount(account(id));
    }
    const identity = (await runner.call(a.profile, ["auth", "account"], 30000))
      .data;
    if (!identity.userId)
      throw new ApiError(400, "identity_missing", "官方未返回唯一账号身份");
    const fingerprint = hash(PROVIDER + ":prod:" + String(identity.userId));
    const duplicate = db
      .prepare("SELECT id FROM global_accounts WHERE identity_hash=? AND id<>?")
      .get(fingerprint, id);
    db.prepare(
      "UPDATE global_accounts SET authorized=?,identity_hash=?,is_vip=?,vip_level=?,expires_at=?,error=?,updated_at=? WHERE id=?",
    ).run(
      duplicate ? 0 : 1,
      fingerprint,
      identity.isVip === undefined ? null : identity.isVip ? 1 : 0,
      identity.vipLevel || "",
      status.expiresAt || null,
      duplicate ? "此身份已绑定其他账号" : "",
      now(),
      id,
    );
    return publicAccount(account(id));
  }
  function beginAuth(id) {
    account(id);
    return transaction(db, () => {
      db.prepare(
        "UPDATE global_auth SET status='cancelled',nonce=NULL,ciphertext=NULL,updated_at=? WHERE account_id=? AND status IN ('queued','starting','awaiting_user')",
      ).run(now(), id);
      const sid = uuid();
      db.prepare(
        "INSERT INTO global_auth(id,account_id,status,updated_at) VALUES(?,?,'queued',?)",
      ).run(sid, id, now());
      return { authSessionId: sid, status: "queued" };
    });
  }
  function getAuth(id) {
    const a = db.prepare("SELECT * FROM global_auth WHERE id=?").get(id);
    if (!a) throw new ApiError(404, "auth_missing", "授权会话不存在");
    return {
      authSessionId: a.id,
      accountId: a.account_id,
      status: a.status,
      authorizationUrl: a.url || "",
      expiresAt: a.expires_at,
      message: a.error || "",
    };
  }
  async function authTick() {
    db.prepare("UPDATE global_auth SET status='failed',error='授权进程中断，请重新授权',updated_at=? WHERE status='starting' AND updated_at<?").run(now(),new Date(Date.now()-120000).toISOString());
    const a = db
      .prepare(
        "SELECT * FROM global_auth WHERE status IN ('queued','awaiting_user') ORDER BY CASE status WHEN 'queued' THEN 0 ELSE 1 END,updated_at LIMIT 1",
      )
      .get();
    if (!a) return;
    const profile = account(a.account_id).profile;
    try {
      if (a.expires_at && Date.parse(a.expires_at) < Date.now())
        throw new ApiError(400, "auth_expired", "授权链接已过期，请重新授权");
      if (a.status === "queued") {
        db.prepare(
          "UPDATE global_auth SET status='starting',updated_at=? WHERE id=? AND status='queued'",
        ).run(now(), a.id);
        const result = (await runner.call(profile, ["auth", "login"], 30000))
          .data;
        if (result?.status === "logged_in" || result?.state?.loggedIn === true) {
          const checked = await checkAccount(a.account_id);
          if (!checked.authorized) throw Error(checked.error || "账号授权未通过检查");
          db.prepare(
            "UPDATE global_auth SET status='authorized',updated_at=? WHERE id=? AND status='starting'",
          ).run(now(), a.id);
          return;
        }
        const c = result?.challenge;
        if (!c?.verificationUriComplete || !c?.deviceCode || !Number.isFinite(Date.parse(c.expiresAt)))
          throw new ApiError(502, "invalid_auth_response", "官方 CLI 未返回有效授权信息，请检查 CLI 状态后重试");
        const url = new URL(c.verificationUriComplete);
        if (url.protocol !== "https:" || url.hostname !== "dreamina.capcut.com")
          throw Error("授权地址不是官方 Dreamina 地址");
        const sealed = secrets.seal(c.deviceCode, {
          accountId: a.account_id,
          purpose: "global-auth",
        });
        db.prepare(
          "UPDATE global_auth SET status='awaiting_user',url=?,expires_at=?,nonce=?,ciphertext=?,updated_at=? WHERE id=? AND status='starting'",
        ).run(
          c.verificationUriComplete,
          c.expiresAt,
          sealed.nonce,
          sealed.ciphertext,
          now(),
          a.id,
        );
      } else {
        const code = secrets.open(
          { nonce: a.nonce, ciphertext: a.ciphertext },
          { accountId: a.account_id, purpose: "global-auth" },
        );
        await runner.call(
          profile,
          ["auth", "wait", "--device-code", code, "--timeout", "1s"],
          10000,
        );
        if (
          db.prepare("SELECT status FROM global_auth WHERE id=?").get(a.id)
            ?.status !== "awaiting_user"
        )
          return;
        await checkAccount(a.account_id);
        db.prepare(
          "UPDATE global_auth SET status='authorized',nonce=NULL,ciphertext=NULL,updated_at=? WHERE id=? AND status='awaiting_user'",
        ).run(now(), a.id);
      }
    } catch (e) {
      if (e.code === "cli.login_wait_timeout")
        db.prepare("UPDATE global_auth SET updated_at=? WHERE id=?").run(
          now(),
          a.id,
        );
      else
        db.prepare(
          "UPDATE global_auth SET status='failed',error=?,nonce=NULL,ciphertext=NULL,updated_at=? WHERE id=? AND status IN ('queued','starting','awaiting_user')",
        ).run(publicMessage(e.message), now(), a.id);
    }
  }
  async function runtime() {
    try {
      const r = await runner.call("default", ["version"], 10000);
      return {
        available: r.data.version === "1.0.3",
        version: r.data.version,
        proxyConfigured: runner.proxyConfigured,
        message:
          r.data.version === "1.0.3"
            ? "Dreamina 国际 CLI 已就绪"
            : "当前仅验证 CLI 1.0.3，请安装此版本",
      };
    } catch (e) {
      return {
        available: false,
        proxyConfigured: runner.proxyConfigured,
        message: publicMessage(e.message),
      };
    }
  }
  async function models(id, type) {
    const a = account(id);
    if (type !== "video")
      throw new ApiError(
        400,
        "global_video_only",
        "Dreamina 国际 CLI 仅用于 Seedance 分镜视频",
      );
    const result = await runner.call(
      a.profile,
      ["model", "list", "--type", type],
      30000,
    );
    result.data.items = result.data.items.filter((item) =>
      item.model.startsWith("seedance_"),
    );
    db.prepare(
      "INSERT OR REPLACE INTO global_runtime(key,value_json) VALUES(?,?)",
    ).run("models:" + id + ":" + type, JSON.stringify(result.data.items));
    return result.data.items;
  }
  function freeze(projectId, body) {
    repos.content.mustProject
      ? repos.content.mustProject(projectId)
      : repos.content.graph(projectId);
    const a = account(body.accountId);
    if (!a.enabled || !a.authorized)
      throw new ApiError(400, "global_auth_required", "请先授权并启用国际账号");
    if (!["shot", "video"].includes(body.kind))
      throw new ApiError(
        400,
        "global_video_only",
        "Dreamina 国际 CLI 仅用于 Seedance 分镜视频",
      );
    if (!String(body.model || "").startsWith("seedance_"))
      throw new ApiError(400, "global_video_only", "请选择 Seedance 视频模型");
    const kind = "video";
    const ids = Array.isArray(body.sourceIds)
      ? [...new Set(body.sourceIds)]
      : [];
    if (!kind || !ids.length || ids.length > 100)
      throw new ApiError(400, "invalid_field", "请选择1–100项生成任务");
    return ids.map((id) => {
      const source = db
        .prepare(
          "SELECT * FROM shots WHERE id=? AND project_id=? AND deleted_at IS NULL",
        )
        .get(id, projectId);
      if (!source) throw new ApiError(404, "source_missing", "生成内容不存在");
      let refs = db
        .prepare(
          "SELECT a.id AS asset_id,a.name,v.id AS version_id,v.media_id,m.sha256 FROM shot_references r JOIN assets a ON a.id=r.asset_id AND a.deleted_at IS NULL LEFT JOIN asset_versions v ON v.id=a.locked_version_id LEFT JOIN media m ON m.id=v.media_id WHERE r.shot_id=? ORDER BY r.position",
        )
        .all(id);
      if (refs.some((r) => !r.media_id))
        throw new ApiError(
          400,
          "reference_not_ready",
          "请先固定分镜引用的资产图片",
        );
      const unique = new Map();
      for (const r of refs)
        if (!unique.has(r.media_id)) unique.set(r.media_id, r);
      refs = [...unique.values()].map((r, i) => ({
        mediaId: r.media_id,
        sha256: r.sha256,
        assetId: r.asset_id || "",
        versionId: r.version_id || "",
        name: r.name || "",
        index: i + 1,
      }));
      const prompt = source.prompt;
      if (!prompt?.trim())
        throw new ApiError(400, "empty_prompt", "提示词不能为空");
      return {
        jobId: uuid(),
        kind,
        sourceId: id,
        title: source.name || source.title,
        promptOriginal: prompt,
        promptSubmitted: prompt,
        references: refs,
        model: String(body.model || ""),
        mode: refs.length ? "m2v" : "t2v",
        ratio: body.ratio || "16:9",
        resolution: body.resolution || "720p",
        duration: source.duration,
        count: 1,
      };
    });
  }
  function createPreview(projectId, body) {
    const items = freeze(projectId, body);
    const id = uuid(),
      stamp = now();
    db.prepare(
      "INSERT INTO global_previews(id,project_id,account_id,status,input_json,input_hash,created_at,updated_at) VALUES(?,?,?,'queued',?,?,?,?)",
    ).run(
      id,
      projectId,
      body.accountId,
      JSON.stringify(items),
      hash(items),
      stamp,
      stamp,
    );
    return getPreview(id);
  }
  function rawPreview(id) {
    const p = db.prepare("SELECT * FROM global_previews WHERE id=?").get(id);
    if (!p) throw new ApiError(404, "preview_missing", "报价计划不存在");
    return p;
  }
  function getPreview(id) {
    const p = rawPreview(id);
    return {
      id: p.id,
      projectId: p.project_id,
      accountId: p.account_id,
      status: p.status,
      inputHash: p.input_hash,
      items: JSON.parse(p.input_json),
      quote: p.quote_json ? JSON.parse(p.quote_json) : null,
      total: p.total,
      error: p.error,
      batchId: p.batch_id,
    };
  }
  async function preparePreview(p) {
    const a = account(p.account_id);
    if (!a.authorized || !a.enabled)
      throw new ApiError(400, "global_auth_required", "国际账号已暂停或未授权");
    let canvas = db
      .prepare(
        "SELECT * FROM global_canvases WHERE local_project_id=? AND account_id=?",
      )
      .get(p.project_id, a.id);
    if (!canvas) {
      db.prepare(
        "INSERT INTO global_canvases(local_project_id,account_id,remote_id) VALUES(?,?,?)",
      ).run(p.project_id, a.id, uuid());
      canvas = db
        .prepare(
          "SELECT * FROM global_canvases WHERE local_project_id=? AND account_id=?",
        )
        .get(p.project_id, a.id);
    }
    const projectFlags = ["--project-id", canvas.remote_id];
    if (!canvas.ready) {
      await runner.call(a.profile, [
        "canvas",
        "create",
        repos.content.graph(p.project_id).project.name,
        ...projectFlags,
      ]);
      db.prepare("UPDATE global_canvases SET ready=1 WHERE remote_id=?").run(
        canvas.remote_id,
      );
    }
    const items = JSON.parse(p.input_json);
    const catalog = await models(a.id, items[0].kind);
    for (const item of items) {
      validateGeneration({...item,prompt:item.promptOriginal},catalog);
      let run = db
        .prepare("SELECT * FROM global_runs WHERE job_id=?")
        .get(item.jobId);
      if (run) continue;
      const refs = [];
      for (const reference of item.references) {
        const m = db
          .prepare("SELECT * FROM media WHERE id=?")
          .get(reference.mediaId);
        if (!m || m.sha256 !== reference.sha256)
          throw new ApiError(400, "media_changed", "引用媒体已变化");
        let upload = db
          .prepare(
            "SELECT * FROM global_materials WHERE account_id=? AND canvas_id=? AND sha256=?",
          )
          .get(a.id, canvas.remote_id, m.sha256);
        if (!upload) {
          db.prepare(
            "INSERT INTO global_materials(account_id,canvas_id,sha256,resource_id) VALUES(?,?,?,?)",
          ).run(a.id, canvas.remote_id, m.sha256, uuid());
          upload = db
            .prepare(
              "SELECT * FROM global_materials WHERE account_id=? AND canvas_id=? AND sha256=?",
            )
            .get(a.id, canvas.remote_id, m.sha256);
        }
        if (!upload.ready) {
          await runner.call(
            a.profile,
            [
              "resource",
              "upload",
              ...projectFlags,
              "--resource-id",
              upload.resource_id,
              "--file",
              media.locate(m.storage_key),
              "--type",
              "image",
            ],
            180000,
          );
          db.prepare(
            "UPDATE global_materials SET ready=1 WHERE account_id=? AND canvas_id=? AND sha256=?",
          ).run(a.id, canvas.remote_id, m.sha256);
        }
        refs.push({ ...reference, resourceId: upload.resource_id });
      }
      const g = {
        ...item,
        references: refs,
        promptSubmitted: withVideoReferenceGuidance(bindReferences(item.promptOriginal, refs), refs),
      };
      validateGeneration({ ...g, prompt: g.promptSubmitted }, catalog);
      const nid = nodeId(),
        update = uuid(),
        submit = uuid();
      db.prepare(
        "INSERT INTO global_runs(job_id,preview_id,canvas_id,node_id,update_id,submit_id,generation_json) VALUES(?,?,?,?,?,?,?)",
      ).run(
        item.jobId,
        p.id,
        canvas.remote_id,
        nid,
        update,
        submit,
        JSON.stringify(g),
      );
      await saveNode(
        a.profile,
        db.prepare("SELECT * FROM global_runs WHERE job_id=?").get(item.jobId),
      );
    }
    // Recovery rechecks saved nodes, never quotes a local-only draft.
    const runs = db
      .prepare("SELECT * FROM global_runs WHERE preview_id=? ORDER BY rowid")
      .all(p.id);
    for (const run of runs) await verifyNode(a.profile, run);
    const quote = await runner.call(a.profile, [
      "node",
      "quote",
      ...projectFlags,
      ...runs.flatMap((r) => ["--node-id", r.node_id]),
    ]);
    const total = quote.data.totalMaxCredits;
    if (
      !Number.isSafeInteger(total) ||
      total < 0 ||
      !quote.data.confirmable ||
      quote.data.items?.length !== runs.length ||
      quote.data.items.some(
        (i) =>
          !Number.isSafeInteger(i.maxCredits) ||
          i.maxCredits < 0 ||
          !runs.some((r) => r.node_id === i.nodeId),
      )
    )
      throw new ApiError(400, "quote_unknown", "无法取得完整报价");
    if (quote.data.items.reduce((n, i) => n + i.maxCredits, 0) !== total)
      throw new ApiError(400, "quote_unknown", "报价合计不一致");
    db.prepare(
      "UPDATE global_previews SET status='quoted',quote_json=?,total=?,error='',lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_owner=?",
    ).run(JSON.stringify(quote.data), total, now(), p.id, owner);
  }
  function generationArgs(g) {
    return [
      "--model",
      g.model,
      "--mode",
      g.mode,
      "--prompt",
      g.promptSubmitted,
      "--ratio",
      g.ratio,
      "--resolution",
      g.resolution,
      "--count",
      "1",
      ...(g.duration === undefined ? [] : ["--duration", String(g.duration)]),
      ...g.references.flatMap((r) => ["--ref", "res:" + r.resourceId]),
    ];
  }
  async function saveNode(profile, run) {
    const g = JSON.parse(run.generation_json);
    await runner.call(profile, [
      "node",
      "create",
      g.kind,
      "--project-id",
      run.canvas_id,
      "--node-id",
      run.node_id,
      "--update-id",
      run.update_id,
      "--title",
      g.title,
      ...generationArgs(g),
    ]);
  }
  async function verifyNode(profile, run) {
    const response = await runner.call(profile, [
      "node",
      "show",
      "--project-id",
      run.canvas_id,
      "--node-id",
      run.node_id,
    ]);
    const node = response.data.nodes?.find(
      (n) => n.node?.nodeId === run.node_id,
    )?.node;
    const actual = node?.generation;
    const expected = JSON.parse(run.generation_json);
    if (
      !actual ||
      actual.model !== expected.model ||
      actual.mode !== expected.mode ||
      actual.prompt !== expected.promptSubmitted ||
      actual.ratio !== expected.ratio ||
      actual.resolution !== expected.resolution ||
      actual.outputCount !== 1 ||
      (expected.duration !== undefined &&
        actual.durationSeconds !== expected.duration)
    )
      throw new ApiError(
        409,
        "global_draft_changed",
        "远程草稿与任务快照不一致，请重新报价",
      );
    const refs = actual.references || [];
    if (
      refs.length !== expected.references.length ||
      expected.references.some(
        (r, i) => refs[i]?.kind !== "resource" || refs[i]?.id !== r.resourceId,
      )
    )
      throw new ApiError(
        409,
        "global_reference_changed",
        "远程参考图顺序与任务快照不一致",
      );
    for (const r of expected.references) {
      if (!expected.promptSubmitted.includes("{{res:" + r.resourceId + "}}"))
        continue;
      const i = refs.findIndex((x) => x.id === r.resourceId);
      if (
        !actual.promptParts?.some(
          (part) => part.kind === "reference" && part.referenceIndex === i,
        )
      )
        throw new ApiError(
          409,
          "global_reference_unbound",
          "提示词没有真正绑定参考图",
        );
    }
  }
  function approve(id, body) {
    return transaction(db, () => {
      const p = rawPreview(id);
      if (JSON.parse(p.input_json).some((item) => item.kind !== "video"))
        throw new ApiError(
          400,
          "global_video_only",
          "国际 CLI 仅用于分镜视频，旧生图报价不可提交",
        );
      if (p.batch_id)
        return {
          batchId: p.batch_id,
          jobIds: JSON.parse(p.input_json).map((i) => i.jobId),
        };
      if (p.status !== "quoted" || body.inputHash !== p.input_hash)
        throw new ApiError(409, "preview_changed", "报价未就绪或已变化");
      const a = account(p.account_id);
      if (!a.authorized || !a.enabled)
        throw new ApiError(400, "global_auth_required", "账号未授权或已暂停");
      if (!Number.isSafeInteger(body.ceiling) || body.ceiling < p.total)
        throw new ApiError(400, "credit_ceiling_low", "批准积分上限不足");
      const batchId = uuid();
      const items = JSON.parse(p.input_json);
      for (const item of items) {
        const run = db
          .prepare("SELECT * FROM global_runs WHERE job_id=?")
          .get(item.jobId);
        if (!run) throw Error("missing prepared run");
        const frozen = JSON.parse(run.generation_json);
        const limit = JSON.parse(p.quote_json).items.find(
          (i) => i.nodeId === run.node_id,
        ).maxCredits;
        db.prepare(
          "INSERT INTO jobs(id,project_id,source_id,batch_id,kind,status,account_id,provider,model,config_snapshot,input_snapshot,created_at,updated_at) VALUES(?,?,?,?,?,'queued',?,?,?,?,?,?,?)",
        ).run(
          item.jobId,
          p.project_id,
          item.sourceId,
          batchId,
          item.kind,
          a.id,
          PROVIDER,
          item.model,
          JSON.stringify({
            ceiling: limit,
            previewId: p.id,
            model: item.model,
          }),
          JSON.stringify(frozen),
          now(),
          now(),
        );
      }
      db.prepare(
        "UPDATE global_previews SET status='approved',batch_id=?,updated_at=? WHERE id=?",
      ).run(batchId, now(), id);
      repos.record("jobs.created", {
        projectId: p.project_id,
        batchId,
        jobIds: items.map((i) => i.jobId),
      });
      return { batchId, jobIds: items.map((i) => i.jobId) };
    });
  }
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      await authTick();
      const stamp = now();
      const p = transaction(db, () => {
        const candidate = db
          .prepare(
            "SELECT * FROM global_previews WHERE status IN ('queued','preparing') AND (lease_until IS NULL OR lease_until<?) ORDER BY created_at LIMIT 1",
          )
          .get(stamp);
        if (!candidate) return null;
        const changed = db
          .prepare(
            "UPDATE global_previews SET status='preparing',lease_owner=?,lease_until=?,updated_at=? WHERE id=? AND (lease_until IS NULL OR lease_until<?)",
          )
          .run(
            owner,
            new Date(Date.now() + 300000).toISOString(),
            stamp,
            candidate.id,
            stamp,
          );
        return changed.changes ? { ...candidate, lease_owner: owner } : null;
      });
      if (p) {
        const renewal=setInterval(()=>{try{db.prepare("UPDATE global_previews SET lease_until=? WHERE id=? AND lease_owner=?").run(new Date(Date.now()+300000).toISOString(),p.id,owner);}catch{}},20000);
        renewal.unref();
        try {
          await preparePreview(p);
        } catch (e) {
          db.prepare(
            "UPDATE global_previews SET status='failed',error=?,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_owner=?",
          ).run(publicMessage(e.message), now(), p.id, owner);
        } finally { clearInterval(renewal); }
      }
    } finally {
      busy = false;
    }
  }
  function provider() {
    async function leased(job, work) {
      if (!repos.accounts.tryLease(job.accountId, owner, "global", 240000))
        return { outcome: "retry", message: "国际账号正在执行其他操作" };
      try {
        return await work();
      } finally {
        repos.accounts.releaseLease(job.accountId, owner);
      }
    }
    return {
      async prepare(job) {
        if (job.kind !== "video")
          throw new ApiError(
            400,
            "global_video_only",
            "国际 CLI 仅用于分镜视频",
          );
        const a = account(job.accountId);
        if (!a.enabled || !a.authorized)
          throw new ApiError(
            400,
            "global_auth_required",
            "国际账号未授权或暂停",
          );
      },
      async submit(job) {
        return leased(job, async () => {
          const a = account(job.accountId),
            run = db
              .prepare("SELECT * FROM global_runs WHERE job_id=?")
              .get(job.id);
          if (!run) return { outcome: "failed", message: "缺少国际任务身份" };
          if (run.run_attempted)
            return { outcome: "remote", remoteTaskId: run.submit_id };
          try {
            await verifyNode(a.profile, run);
            const limit = JSON.parse(job.configSnapshot).ceiling;
            const flags = [
              "--project-id",
              run.canvas_id,
              "--node-id",
              run.node_id,
            ];
            const q = (
              await runner.call(a.profile, ["node", "quote", ...flags])
            ).data;
            if (
              !q.confirmable ||
              !Number.isSafeInteger(q.totalMaxCredits) ||
              q.totalMaxCredits > limit
            )
              return {
                outcome: "failed",
                message: "最新报价超过已批准上限，请重新报价",
              };
            const confirmation = await runner.call(a.profile, [
              "node",
              "confirm",
              ...flags,
              "--credit-ceiling",
              String(limit),
            ]);
            const token = confirmation.data.creditConfirmationToken;
            if (!token)
              throw new ApiError(
                400,
                "credit_token_missing",
                "官方没有返回积分批准凭据",
              );
            db.prepare(
              "UPDATE global_runs SET run_attempted=1 WHERE job_id=?",
            ).run(job.id);
            try {
              const r = await runner.call(
                a.profile,
                [
                  "node",
                  "run",
                  ...flags,
                  "--submit-id",
                  run.submit_id,
                  "--credit-token",
                  token,
                ],
                90000,
              );
              db.prepare(
                "UPDATE global_runs SET request_id=? WHERE job_id=?",
              ).run(r.requestId || null, job.id);
              const item = r.data.items?.find(
                (i) => i.submitId === run.submit_id,
              );
              if (item?.state === "rejected")
                return {
                  outcome: "failed",
                  message: "官方拒绝此生成任务，请检查账号与参数",
                };
              return { outcome: "remote", remoteTaskId: run.submit_id };
            } catch (e) {
              return {
                outcome: "remote",
                remoteTaskId: run.submit_id,
                queueNote: "提交结果待确认，正在查询原任务",
              };
            }
          } catch (e) {
            return {
              outcome: e.action === "login" ? "auth" : "failed",
              message: publicMessage(e.message),
            };
          }
        });
      },
      async query(job) {
        return leased(job, async () => {
          const a = account(job.accountId),
            run = db
              .prepare("SELECT * FROM global_runs WHERE job_id=?")
              .get(job.id);
          try {
            const response = await runner.call(
              a.profile,
              [
                "operation",
                "status",
                run.submit_id,
                "--project-id",
                run.canvas_id,
              ],
              30000,
            );
            const d = response.data;
            db.prepare(
              "UPDATE global_runs SET request_id=? WHERE job_id=?",
            ).run(response.requestId || null, job.id);
            if (d.state === "succeeded") {
              const r = d.resources?.find(
                (r) => r.state === "succeeded" && r.resourceId,
              );
              if (!r)
                return {
                  outcome: "unknown",
                  message: "官方返回成功但没有可用资源，请人工核对",
                };
              db.prepare(
                "UPDATE global_runs SET resource_id=? WHERE job_id=?",
              ).run(r.resourceId, job.id);
              let accounting;
              try {
                const resource = (await runner.call(a.profile, ["resource", "get", r.resourceId, "--project-id", run.canvas_id], 30000)).data;
                if (typeof resource.creditsAmount === "number" && Number.isFinite(resource.creditsAmount) && resource.creditsAmount >= 0)
                  accounting = {creditAmount: resource.creditsAmount, creditKind: "preauthorized"};
              } catch { /* Optional accounting must never prevent downloading completed media. */ }
              return { outcome: "download", remoteTaskId: run.submit_id, accounting };
            }
            if (d.state === "failed" || d.state === "canceled")
              return { outcome: "failed", message: "国际生成任务失败或取消" };
            if (d.submission?.state === "absent" || d.state === "unknown")
              return {
                outcome: "unknown",
                message: "无法确认原任务是否执行，请核对画布，勿重复生成",
              };
            return { outcome: "pending", queueNote: "Dreamina 国际版生成中" };
          } catch (e) {
            return {
              outcome: e.action === "login" ? "auth" : "retry",
              message: publicMessage(e.message),
            };
          }
        });
      },
      async download(job) {
        return leased(job, async () => {
          const a = account(job.accountId),
            run = db
              .prepare("SELECT * FROM global_runs WHERE job_id=?")
              .get(job.id);
          if (!run?.resource_id)
            return { outcome: "unknown", message: "没有已确认的生成资源" };
          const dir = path.join(paths.runs, "global", job.id);
          await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
          const file = path.join(
            dir,
            job.kind === "image" ? "output.png" : "output.mp4",
          );
          try {
            const result = await runner.call(
              a.profile,
              [
                "resource",
                "download",
                run.resource_id,
                "--project-id",
                run.canvas_id,
                "--output",
                file,
              ],
              180000,
            );
            const bytes = await fs.promises.readFile(file);
            if (
              !bytes.length ||
              result.data.size !== bytes.length ||
              result.data.sha256 !== hash(bytes)
            )
              throw Error("下载文件大小或哈希校验失败");
            const saved = await repos.content.saveMedia({
              projectId: job.projectId,
              bytes,
              source: PROVIDER,
              video: job.kind === "video",
              jobId: job.id,
            });
            return { outcome: "succeeded", mediaId: saved.id };
          } catch (e) {
            return {
              outcome: "download_failed",
              message: publicMessage(e.message),
            };
          }
        });
      },
    };
  }
  return {
    runner,
    listAccounts,
    createAccount,
    updateAccount,
    checkAccount,
    beginAuth,
    getAuth,
    runtime,
    models,
    createPreview,
    getPreview,
    approve,
    tick,
    provider,
  };
}
module.exports = {
  createGlobalService,
  PROVIDER,
  bindReferences,
  validateGeneration,
  nodeId,
};
