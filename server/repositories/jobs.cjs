const crypto = require("node:crypto");
const { ApiError, publicMessage } = require("../errors.cjs");
const { transaction } = require("../db.cjs");
const { freezePrompt } = require("../references.cjs");

const VIDEO_MODELS = new Set(["seedance2.0", "seedance2.0fast", "seedance2.0_vip", "seedance2.0fast_vip", "seedance2.0mini", "seedance2.5"]);
const VIDEO_RATIOS = new Set(["1:1", "3:4", "16:9", "4:3", "9:16", "21:9"]);
const ACTIVE = ["preparing", "submitting", "remote_running", "downloading", "submit_unknown"];

function iso(date = new Date()) {
  return date.toISOString();
}
function hashBody(body) {
  return require("node:crypto").createHash("sha256").update(JSON.stringify(body)).digest("hex");
}
function normalizeJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    sourceId: row.source_id,
    batchId: row.batch_id,
    kind: row.kind,
    status: row.status,
    accountId: row.account_id,
    provider: row.provider,
    model: row.model,
    configSnapshot: row.config_snapshot,
    inputSnapshot: row.input_snapshot,
    remoteTaskId: row.remote_task_id,
    attempt: row.attempt,
    nextRunAt: row.next_run_at,
    leaseOwner: row.lease_owner,
    leaseUntil: row.lease_until,
    version: row.version,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    mediaId: row.media_id,
    paused: row.paused,
    queueNote: row.queue_note,
    resultJson: row.result_json,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    updatedAt: row.updated_at,
  };
}

function createJobRepository(db, { record }) {
  function pool() {
    return db.prepare("SELECT strategy, remote_task_limit FROM pool_settings WHERE id=1").get();
  }
  function inflight(accountId) {
    return db.prepare(`SELECT count(*) AS count FROM jobs WHERE account_id=? AND status IN (${ACTIVE.map(() => "?").join(",")})`).get(accountId, ...ACTIVE).count;
  }
  function chooseAccount(nowIso) {
    const settings = pool();
    const accounts = db.prepare(`
      SELECT * FROM jimeng_accounts
      WHERE enabled=1 AND removed_at IS NULL AND authorized=1 AND permission='allowed' AND identity_status<>'duplicate'
        AND (cooldown_until IS NULL OR cooldown_until<=?)
        AND (auth_expires_at IS NULL OR auth_expires_at>?)
      ORDER BY COALESCE(last_assigned_at, ''), id
    `).all(nowIso, nowIso).filter((account) => inflight(account.id) < settings.remote_task_limit);
    if (!accounts.length) return null;
    if (settings.strategy === "least-busy") {
      accounts.sort((left, right) => inflight(left.id) - inflight(right.id) || String(left.last_assigned_at || "").localeCompare(String(right.last_assigned_at || "")));
    }
    return accounts[0];
  }
  function freezeImage(asset, connection, ratio) {
    const references = db.prepare(`
      SELECT r.position, r.media_id, m.sha256 FROM asset_references r
      JOIN media m ON m.id=r.media_id WHERE r.asset_id=? ORDER BY r.position
    `).all(asset.id);
    return {
      provider: "image",
      model: connection?.model || "",
      config: {
        connectionId: connection?.id || "",
        revision: connection?.revision || 0,
        baseUrl: connection?.base_url || "",
        model: connection?.model || "",
        resolution: connection?.resolution || "1k",
        ratio,
      },
      input: {
        assetId: asset.id,
        title: asset.name,
        promptOriginal: asset.prompt,
        promptSubmitted: asset.prompt,
        references: references.map((item) => ({ mediaId: item.media_id, index: item.position, sha256: item.sha256 })),
        ratio,
      },
    };
  }
  function freezeVideo(shot, request) {
    const refs = db.prepare(`
      SELECT sr.position, sr.asset_id, a.name, a.locked_version_id, v.media_id, v.id AS version_id
      FROM shot_references sr
      JOIN assets a ON a.id=sr.asset_id AND a.deleted_at IS NULL
      LEFT JOIN asset_versions v ON v.id=a.locked_version_id
      WHERE sr.shot_id=? ORDER BY sr.position
    `).all(shot.id);
    const missing = refs.filter((item) => !item.media_id);
    if (missing.length) throw new ApiError(400, "reference_not_ready", `分镜“${shot.title}”的资产“${missing[0].name}”还没有固定图片`);
    const names = refs.map((item) => item.name);
    const prompt = freezePrompt(shot.prompt, names);
    const model = request.model;
    const resolution = request.resolution || "720p";
    const ratio = request.ratio;
    if (!VIDEO_MODELS.has(model) || !VIDEO_RATIOS.has(ratio)) throw new ApiError(400, "invalid_field", "视频模型、画幅或时长不受支持");
    const maxDuration = model === "seedance2.5" ? 30 : 15;
    if (!Number.isInteger(shot.duration) || shot.duration < 4 || shot.duration > maxDuration) {
      throw new ApiError(400, "invalid_field", "视频模型、画幅或时长不受支持");
    }
    const allowed = model === "seedance2.5" ? ["480p", "720p", "1080p"] : model === "seedance2.0_vip" ? ["720p", "1080p", "4k"] : ["720p"];
    if (!allowed.includes(resolution)) throw new ApiError(400, "invalid_field", "该模型不支持所选分辨率");
    return {
      provider: "jimeng",
      model,
      config: { model, resolution, ratio, duration: shot.duration },
      input: {
        shotId: shot.id,
        title: shot.title,
        promptOriginal: prompt.promptOriginal,
        promptSubmitted: prompt.promptSubmitted,
        references: refs.map((item) => ({
          assetId: item.asset_id,
          versionId: item.version_id,
          mediaId: item.media_id,
          index: item.position,
          name: item.name,
        })),
        ratio,
        duration: shot.duration,
        resolution,
        model,
      },
    };
  }

  function createBatch({ projectId, body, idempotencyKey }) {
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      throw new ApiError(400, "idempotency_key_required", "创建任务需要 Idempotency-Key");
    }
    const route = `POST /projects/${projectId}/jobs/batch`;
    const bodyHash = hashBody(body);
    return transaction(db, () => {
      const existing = db.prepare("SELECT body_hash, response_json FROM idempotency_keys WHERE workspace='default' AND route=? AND key=?").get(route, idempotencyKey);
      if (existing) {
        if (existing.body_hash !== bodyHash) throw new ApiError(409, "idempotency_conflict", "这个提交键已经用于不同的请求");
        return JSON.parse(existing.response_json);
      }
      const project = db.prepare("SELECT * FROM projects WHERE id=? AND deleted_at IS NULL").get(projectId);
      if (!project) throw new ApiError(404, "project_not_found", "项目不存在");
      const kind = body.kind === "video" || body.kind === "shot" ? "video" : body.kind === "image" || body.kind === "asset" ? "image" : "";
      if (!kind) throw new ApiError(400, "invalid_field", "任务类型不正确");
      const sourceIds = Array.isArray(body.sourceIds) ? [...new Set(body.sourceIds)] : [];
      if (!sourceIds.length || sourceIds.length > 100) throw new ApiError(400, "invalid_field", "请选择要生成的内容");
      const connection = db.prepare("SELECT * FROM model_connections WHERE id='image'").get();
      if (kind === "image" && (!connection?.base_url || !connection.secret_id)) throw new ApiError(400, "image_not_configured", "请先保存生图接口和 API Key");
      const ratio = VIDEO_RATIOS.has(body.ratio) ? body.ratio : project.ratio;
      const now = iso();
      const batchId = crypto.randomUUID();
      const jobIds = [];
      for (const sourceId of sourceIds) {
        const frozen = kind === "image"
          ? freezeImage(db.prepare("SELECT * FROM assets WHERE id=? AND project_id=? AND deleted_at IS NULL").get(sourceId, project.id) || (() => { throw new ApiError(404, "asset_not_found", "资产不存在"); })(), connection, ratio)
          : freezeVideo(db.prepare("SELECT * FROM shots WHERE id=? AND project_id=? AND deleted_at IS NULL").get(sourceId, project.id) || (() => { throw new ApiError(404, "shot_not_found", "分镜不存在"); })(), { ...body, ratio });
        const id = crypto.randomUUID();
        db.prepare(`INSERT INTO jobs(id,project_id,source_id,batch_id,kind,status,provider,model,config_snapshot,input_snapshot,attempt,version,created_at,updated_at)
          VALUES(?,?,?,?,?,'queued',?,?,?,?,0,1,?,?)`)
          .run(id, project.id, sourceId, batchId, kind, frozen.provider, frozen.model, JSON.stringify(frozen.config), JSON.stringify(frozen.input), now, now);
        jobIds.push(id);
      }
      const response = { batchId, jobIds };
      db.prepare("INSERT INTO idempotency_keys(workspace,route,key,body_hash,response_json,created_at) VALUES('default',?,?,?,?,?)")
        .run(route, idempotencyKey, bodyHash, JSON.stringify(response), now);
      record("jobs.created", { projectId, batchId, jobIds });
      return response;
    });
  }

  function listJobs(projectId) {
    return db.prepare("SELECT * FROM jobs WHERE project_id=? ORDER BY created_at, id").all(projectId).map(normalizeJob);
  }
  function getJob(id) {
    return normalizeJob(db.prepare("SELECT * FROM jobs WHERE id=?").get(id));
  }
  function rawJobs(projectId) {
    return db.prepare("SELECT * FROM jobs WHERE project_id=? ORDER BY created_at, id").all(projectId);
  }

  function retryJob(id, { confirm = false } = {}) {
    const job = db.prepare("SELECT * FROM jobs WHERE id=?").get(id);
    if (!job) throw new ApiError(404, "job_not_found", "任务不存在");
    if (job.lease_until && job.lease_until > iso()) throw new ApiError(409, "job_busy", "任务正在执行");
    if (job.provider === "dreamina_global_canvas") {
      const run=db.prepare("SELECT * FROM global_runs WHERE job_id=?").get(id);
      if (run?.run_attempted) {
        db.prepare("UPDATE jobs SET remote_task_id=?,status='remote_running',paused=0,next_run_at=NULL,lease_owner=NULL,lease_until=NULL,attempt=0,error_message='',version=version+1,updated_at=? WHERE id=?").run(run.submit_id,iso(),id);
        return getJob(id);
      }
    }
    if (job.provider === "dreamina_web_api") {
      return transaction(db,()=>{
        const original=db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
        const result=JSON.parse(original.result_json||'{}');
        if(result.resubmittedJobId)return getJob(result.resubmittedJobId);
        const run=db.prepare('SELECT * FROM web_runs WHERE job_id=?').get(id);
        if(original.status==='download_failed'&&run?.history_id){
          db.prepare("UPDATE jobs SET status='downloading',next_run_at=NULL,lease_owner=NULL,lease_until=NULL,attempt=0,error_message='',version=version+1,updated_at=? WHERE id=?").run(iso(),id);
          return getJob(id);
        }
        if(!['failed','submit_unknown','auth_expired'].includes(original.status))throw new ApiError(409,'job_not_retryable','任务仍在进行中或已经完成');
        const nextId=crypto.randomUUID(),batchId=crypto.randomUUID(),submitId=crypto.randomUUID(),created=iso();
        db.prepare("INSERT INTO jobs(id,project_id,source_id,batch_id,kind,status,account_id,provider,model,config_snapshot,input_snapshot,created_at,updated_at) VALUES(?,?,?,?,?,'queued',?,?,?,?,?,?,?)").run(nextId,original.project_id,original.source_id,batchId,original.kind,original.account_id,original.provider,original.model,original.config_snapshot,original.input_snapshot,created,created);
        db.prepare('INSERT INTO web_runs(job_id,submit_id) VALUES(?,?)').run(nextId,submitId);
        db.prepare('UPDATE jobs SET result_json=?,version=version+1,updated_at=? WHERE id=?').run(JSON.stringify({...result,resubmittedJobId:nextId}),created,id);
        record('job.resubmitted',{jobId:id,newJobId:nextId,projectId:original.project_id});
        return getJob(nextId);
      });
    }
    if (job.status === "submit_unknown" && !job.remote_task_id && !confirm) {
      throw new ApiError(409, "confirmation_required", "提交待确认。请核对即梦记录后，再明确重新提交");
    }
    const now = iso();
    let status = "queued";
    if (job.status === "download_failed") status = "downloading";
    else if (job.remote_task_id) status = "remote_running";
    const result = db.prepare("UPDATE jobs SET status=?, paused=0, error_code=NULL, error_message='', next_run_at=NULL, lease_owner=NULL, lease_until=NULL, attempt=0, version=version+1, updated_at=? WHERE id=? AND version=?")
      .run(status, now, job.id, job.version);
    if (result.changes !== 1) throw new ApiError(409, "revision_conflict", "任务状态已变化，请重新加载");
    record("job.retry", { projectId: job.project_id, jobId: job.id, status });
    return getJob(job.id);
  }

  function pauseBatch(batchId) {
    const now = iso();
    const result = db.prepare("UPDATE jobs SET paused=1, updated_at=? WHERE batch_id=? AND remote_task_id IS NULL AND status IN ('queued','preparing')").run(now, batchId);
    record("batch.paused", { batchId, stopped: result.changes });
    return { paused: result.changes };
  }

  function claimJob(owner, ttlMs = 180000, { excludeImages = false } = {}) {
    return transaction(db, () => {
      const now = new Date();
      const nowIso = iso(now);
      db.prepare("UPDATE jobs SET status='submit_unknown', error_code='submit_unconfirmed', error_message='提交待确认', lease_owner=NULL, lease_until=NULL, version=version+1, updated_at=? WHERE status='submitting' AND remote_task_id IS NULL AND lease_until IS NOT NULL AND lease_until < ?").run(nowIso, nowIso);
      db.prepare("UPDATE jobs SET status='queued', lease_owner=NULL, lease_until=NULL, version=version+1, updated_at=? WHERE status='preparing' AND lease_until IS NOT NULL AND lease_until < ?").run(nowIso, nowIso);
      db.prepare("UPDATE jobs SET lease_owner=NULL, lease_until=NULL, version=version+1, updated_at=? WHERE status IN ('remote_running','downloading','download_failed') AND lease_until IS NOT NULL AND lease_until < ?").run(nowIso, nowIso);
      const rows = db.prepare("SELECT * FROM jobs WHERE paused=0 AND (?=0 OR provider<>'image') AND status IN ('queued','remote_running','downloading','download_failed') AND (next_run_at IS NULL OR next_run_at<=?) AND (lease_until IS NULL OR lease_until<?) ORDER BY created_at, id LIMIT 20").all(excludeImages ? 1 : 0, nowIso, nowIso);
      for (const row of rows) {
        let accountId = row.account_id;
        if(row.provider === 'dreamina_web_api' && row.status === 'queued'){
          const a=db.prepare('SELECT * FROM web_accounts WHERE id=?').get(accountId);
          if(!a?.enabled||!a?.authorized||inflight(accountId)>=(a.max_concurrent||3)||db.prepare('SELECT account_id FROM web_leases WHERE account_id=? AND until_at>?').get(accountId,nowIso))continue;
        }
        if (row.provider === "dreamina_global_canvas" && row.status === "queued") {
          const account = db.prepare("SELECT * FROM global_accounts WHERE id=?").get(accountId);
          if (!account?.enabled || !account?.authorized || inflight(accountId) >= 1) continue;
        }
        if (row.provider === "jimeng" && row.kind === "video" && row.status === "queued") {
          const account = accountId ? db.prepare("SELECT * FROM jimeng_accounts WHERE id=?").get(accountId) : chooseAccount(nowIso);
          const usable = account && account.enabled && !account.removed_at && account.authorized && account.permission === "allowed" && account.identity_status !== "duplicate" && (!account.cooldown_until || account.cooldown_until <= nowIso);
          if (!usable) {
            const expired = account && (!account.authorized || account.permission !== "allowed");
            if (expired && accountId) {
              db.prepare("UPDATE jobs SET status='auth_expired', error_code='auth_expired', error_message='授权失效', version=version+1, updated_at=? WHERE id=? AND version=?").run(nowIso, row.id, row.version);
            } else {
              db.prepare("UPDATE jobs SET next_run_at=?, error_message=?, updated_at=? WHERE id=? AND version=?").run(iso(new Date(now.getTime() + 5000)), "没有可用的即梦账号", nowIso, row.id, row.version);
            }
            continue;
          }
          if (inflight(account.id) >= pool().remote_task_limit) {
            db.prepare("UPDATE jobs SET next_run_at=?, updated_at=? WHERE id=? AND version=?").run(iso(new Date(now.getTime() + 5000)), nowIso, row.id, row.version);
            continue;
          }
          accountId = account.id;
        }
        const until = iso(new Date(now.getTime() + (["dreamina_global_canvas","dreamina_web_api"].includes(row.provider) ? Math.max(ttlMs,360000) : ttlMs)));
        const nextStatus = row.status === "queued" ? "preparing" : row.status;
        const claimed = db.prepare("UPDATE jobs SET status=?, account_id=COALESCE(?, account_id), lease_owner=?, lease_until=?, attempt=attempt+1, version=version+1, updated_at=? WHERE id=? AND version=? AND (lease_until IS NULL OR lease_until<?)")
          .run(nextStatus, accountId, owner, until, nowIso, row.id, row.version, nowIso);
        if (claimed.changes === 1) {
          if (accountId && row.provider === "jimeng") db.prepare("UPDATE jimeng_accounts SET last_assigned_at=? WHERE id=?").run(nowIso, accountId);
          record("job.claimed", { jobId: row.id, projectId: row.project_id, status: nextStatus });
          return getJob(row.id);
        }
      }
      return null;
    });
  }

  function commitJob(job, fields) {
    const now = iso();
    fields = {...fields};
    if(fields.status === 'succeeded' && job.status !== 'succeeded')fields.completed_at = now;
    if(['failed','auth_expired','download_failed'].includes(fields.status) && job.status !== fields.status)fields.failed_at = now;
    const columns = [];
    const values = [];
    for (const [column, value] of Object.entries(fields)) {
      columns.push(`${column}=?`);
      values.push(value);
    }
    columns.push("version=version+1", "updated_at=?");
    values.push(now, job.id, job.version, job.leaseOwner);
    const result = db.prepare(`UPDATE jobs SET ${columns.join(", ")} WHERE id=? AND version=? AND lease_owner=?`).run(...values);
    if (result.changes !== 1) throw new ApiError(409, "lease_lost", "任务租约已失效");
    const next = getJob(job.id);
    record("job.updated", { jobId: next.id, projectId: next.projectId, status: next.status });
    return next;
  }

  function releaseLease(job) {
    db.prepare("UPDATE jobs SET lease_owner=NULL, lease_until=NULL, version=version+1, updated_at=? WHERE id=? AND version=? AND lease_owner=?").run(iso(), job.id, job.version, job.leaseOwner);
    return getJob(job.id);
  }

  function succeedWithMedia(job, mediaId) {
    return transaction(db, () => {
      if (job.kind === "image") {
        const asset = db.prepare("SELECT * FROM assets WHERE id=? AND deleted_at IS NULL").get(job.sourceId);
        if (asset) {
          const now = iso();
          const versionId = crypto.randomUUID();
          const input = JSON.parse(job.inputSnapshot || "{}");
          db.prepare("INSERT INTO asset_versions(id,asset_id,media_id,prompt,source,created_at) VALUES(?,?,?,?,?,?)")
            .run(versionId, asset.id, mediaId, input.promptOriginal || asset.prompt, "generation", now);
          db.prepare("UPDATE assets SET selected_version_id=?, locked_version_id=NULL, revision=revision+1, updated_at=? WHERE id=?").run(versionId, now, asset.id);
        }
      }
      return commitJob(job, {
        status: "succeeded",
        media_id: mediaId,
        error_code: null,
        error_message: "",
        queue_note: "",
        lease_owner: null,
        lease_until: null,
      });
    });
  }

  return { createBatch, listJobs, getJob, rawJobs, retryJob, pauseBatch, claimJob, commitJob, releaseLease, chooseAccount, succeedWithMedia };
}

function createAccountRepository(db, { secrets, record }) {
  function pool() {
    return db.prepare("SELECT strategy, remote_task_limit FROM pool_settings WHERE id=1").get();
  }
  function listAccounts() {
    return db.prepare("SELECT * FROM jimeng_accounts WHERE removed_at IS NULL ORDER BY created_at, id").all();
  }
  function createAccount(input) {
    const name = String(input.name || "").trim();
    if (!name || name.length > 60) throw new ApiError(400, "invalid_field", "请输入不超过 60 字的账号别名");
    const id = input.id || crypto.randomUUID();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(400, "invalid_id", "账号不正确");
    const duplicate = db.prepare("SELECT id FROM jimeng_accounts WHERE name=? AND removed_at IS NULL").get(name);
    if (duplicate && duplicate.id !== id) throw new ApiError(409, "account_exists", "这个别名已经存在");
    if (db.prepare("SELECT id FROM jimeng_accounts WHERE id=?").get(id)) return db.prepare("SELECT * FROM jimeng_accounts WHERE id=?").get(id);
    const now = iso();
    db.prepare("INSERT INTO jimeng_accounts(id,name,enabled,created_at,updated_at) VALUES(?,?,1,?,?)").run(id, name, now, now);
    record("account.created", { accountId: id });
    return db.prepare("SELECT * FROM jimeng_accounts WHERE id=?").get(id);
  }
  function updateAccount(id, patch) {
    const account = db.prepare("SELECT * FROM jimeng_accounts WHERE id=? AND removed_at IS NULL").get(id);
    if (!account) throw new ApiError(404, "account_not_found", "账号不存在");
    const name = patch.name === undefined ? account.name : String(patch.name).trim();
    if (!name || name.length > 60) throw new ApiError(400, "invalid_field", "请输入不超过 60 字的账号别名");
    db.prepare("UPDATE jimeng_accounts SET name=?, enabled=?, updated_at=? WHERE id=?").run(name, patch.enabled === undefined ? account.enabled : (patch.enabled ? 1 : 0), iso(), id);
    record("account.updated", { accountId: id });
    return db.prepare("SELECT * FROM jimeng_accounts WHERE id=?").get(id);
  }
  function removeAccount(id) {
    const running = db.prepare("SELECT count(*) AS count FROM jobs WHERE account_id=? AND status IN ('submitting','remote_running','downloading','submit_unknown')").get(id).count;
    db.prepare("UPDATE jimeng_accounts SET enabled=0, removed_at=?, updated_at=? WHERE id=? AND removed_at IS NULL").run(iso(), iso(), id);
    record("account.removed", { accountId: id, running });
    return { removed: true, volumeKept: running > 0, remoteContinuing: running };
  }
  function createAuthSession(accountId) {
    const account = db.prepare("SELECT * FROM jimeng_accounts WHERE id=? AND removed_at IS NULL").get(accountId);
    if (!account) throw new ApiError(404, "account_not_found", "账号不存在");
    const now = iso();
    const id = crypto.randomUUID();
    db.prepare("UPDATE auth_sessions SET status='cancelled', updated_at=? WHERE account_id=? AND status IN ('queued','starting','awaiting_user')").run(now, accountId);
    db.prepare("INSERT INTO auth_sessions(id,account_id,status,created_at,updated_at) VALUES(?,?,'queued',?,?)").run(id, accountId, now, now);
    record("auth.queued", { accountId, authSessionId: id });
    return { authSessionId: id, status: "queued", accountName: account.name };
  }
  function getAuthSession(id) {
    const row = db.prepare("SELECT s.*, a.name AS account_name FROM auth_sessions s JOIN jimeng_accounts a ON a.id=s.account_id WHERE s.id=?").get(id);
    if (!row) throw new ApiError(404, "session_not_found", "授权会话不存在");
    return {
      authSessionId: row.id,
      accountId: row.account_id,
      accountName: row.account_name,
      status: row.status,
      authorizationUrl: row.authorization_url || "",
      expiresAt: row.expires_at || "",
      message: publicMessage(row.error_message || ""),
    };
  }
  function requestCheck(accountId) {
    const account = db.prepare("SELECT id FROM jimeng_accounts WHERE id=? AND removed_at IS NULL").get(accountId);
    if (!account) throw new ApiError(404, "account_not_found", "账号不存在");
    db.prepare("UPDATE jimeng_accounts SET check_requested_at=?, updated_at=? WHERE id=?").run(iso(), iso(), accountId);
    record("account.check", { accountId });
    return { accepted: true };
  }
  function updatePool(patch) {
    const current = db.prepare("SELECT * FROM pool_settings WHERE id=1").get();
    const strategy = patch.strategy || current.strategy;
    const limit = patch.remoteTaskLimit === undefined ? current.remote_task_limit : Number(patch.remoteTaskLimit);
    if (!["round-robin", "least-busy"].includes(strategy)) throw new ApiError(400, "invalid_field", "分配方式不受支持");
    if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw new ApiError(400, "invalid_field", "每账号远端任务上限为 1–5，首次验收请保持 1");
    db.prepare("UPDATE pool_settings SET strategy=?, remote_task_limit=?, updated_at=? WHERE id=1").run(strategy, limit, iso());
    return { strategy, remoteTaskLimit: limit };
  }
  function imageConnection() {
    const row = db.prepare("SELECT * FROM model_connections WHERE id='image'").get();
    if (!row) return { name: "", baseUrl: "", model: "", resolution: "1k", revision: 0, apiKeySaved: false };
    return { name: row.name, baseUrl: row.base_url, model: row.model, resolution: row.resolution, revision: row.revision, apiKeySaved: Boolean(row.secret_id) };
  }
  function saveImageConnection(input, sealed) {
    const current = db.prepare("SELECT * FROM model_connections WHERE id='image'").get();
    if (current && input.revision !== undefined && Number(input.revision) !== current.revision) {
      throw new ApiError(409, "revision_conflict", "模型配置已被其他窗口更新，请重新加载");
    }
    const now = iso();
    let secretId = current?.secret_id || null;
    if (sealed) {
      secretId = crypto.randomUUID();
      db.prepare("INSERT INTO secrets(id,purpose,account_id,nonce,ciphertext,created_at) VALUES(?,?,?,?,?,?)")
        .run(secretId, "image-api-key", "", sealed.nonce, sealed.ciphertext, now);
    }
    if (!secretId && !current) throw new ApiError(400, "api_key_required", "请先保存 API Key");
    const name = String(input.name || current?.name || "").trim();
    const baseUrl = String(input.baseUrl || current?.base_url || "").trim();
    const model = String(input.model || current?.model || "").trim();
    const resolution = ["1k", "2k", "4k"].includes(input.resolution) ? input.resolution : (current?.resolution || "1k");
    if (!name || !baseUrl || !model) throw new ApiError(400, "invalid_field", "请填写配置名称、接口地址和模型名称");
    if (current) {
      db.prepare("UPDATE model_connections SET name=?, base_url=?, model=?, resolution=?, secret_id=?, revision=revision+1, updated_at=? WHERE id='image'")
        .run(name, baseUrl, model, resolution, secretId, now);
    } else {
      db.prepare("INSERT INTO model_connections(id,name,base_url,model,resolution,secret_id,revision,updated_at) VALUES('image',?,?,?,?,?,1,?)")
        .run(name, baseUrl, model, resolution, secretId, now);
    }
    record("connection.updated", {});
    return imageConnection();
  }
  function imageApiKey() {
    const row = db.prepare("SELECT secret_id FROM model_connections WHERE id='image'").get();
    if (!row?.secret_id) return "";
    const secret = db.prepare("SELECT nonce, ciphertext FROM secrets WHERE id=?").get(row.secret_id);
    if (!secret) return "";
    return secrets.open(secret, { accountId: "", purpose: "image-api-key" });
  }
  function ensureSecret(accountId, purpose, plaintextFactory) {
    const existing = db.prepare("SELECT nonce, ciphertext FROM secrets WHERE account_id=? AND purpose=? ORDER BY created_at DESC LIMIT 1").get(accountId, purpose);
    if (existing) return secrets.open(existing, { accountId, purpose });
    const plaintext = plaintextFactory();
    const sealed = secrets.seal(plaintext, { accountId, purpose });
    db.prepare("INSERT INTO secrets(id,purpose,account_id,nonce,ciphertext,created_at) VALUES(?,?,?,?,?,?)")
      .run(crypto.randomUUID(), purpose, accountId, sealed.nonce, sealed.ciphertext, iso());
    return plaintext;
  }
  function nextAuthSession() {
    return db.prepare("SELECT * FROM auth_sessions WHERE status IN ('queued','awaiting_user') ORDER BY CASE WHEN status='queued' THEN 0 ELSE 1 END, updated_at, created_at LIMIT 1").get() || null;
  }
  function saveAuthExchange(accountId, { authorizationUrl, expiresAt, nonce, ciphertext, authSessionId = null }) {
    db.prepare("UPDATE auth_sessions SET status='awaiting_user', authorization_url=?, expires_at=?, device_nonce=?, device_ciphertext=?, updated_at=? WHERE account_id=? AND status IN ('queued','starting','awaiting_user') AND (? IS NULL OR id=?)")
      .run(authorizationUrl, expiresAt, nonce, ciphertext, iso(), accountId, authSessionId, authSessionId);
  }
  function activeAuth(accountId) {
    return db.prepare("SELECT * FROM auth_sessions WHERE account_id=? AND status='awaiting_user' ORDER BY created_at DESC LIMIT 1").get() || null;
  }
  function authExchange(id, accountId) {
    return db.prepare("SELECT * FROM auth_sessions WHERE id=? AND account_id=? AND status='awaiting_user'").get(id, accountId) || null;
  }
  function markAuth(id, status, message = "") {
    const updated = db.prepare("UPDATE auth_sessions SET status=?, error_message=?, updated_at=? WHERE id=? AND status IN ('queued','starting','awaiting_user')").run(status, publicMessage(message), iso(), id);
    if (!updated.changes) return false;
    const row = db.prepare("SELECT account_id FROM auth_sessions WHERE id=?").get(id);
    if (row) record("auth.updated", { accountId: row.account_id, authSessionId: id, status });
    return true;
  }
  function clearDeviceCode(accountId, authSessionId = null) {
    db.prepare("UPDATE auth_sessions SET device_nonce=NULL, device_ciphertext=NULL, updated_at=? WHERE account_id=? AND status IN ('awaiting_user','authorized') AND (? IS NULL OR id=?)").run(iso(), accountId, authSessionId, authSessionId);
  }
  function nextCheck() {
    return db.prepare("SELECT * FROM jimeng_accounts WHERE removed_at IS NULL AND check_requested_at IS NOT NULL ORDER BY check_requested_at LIMIT 1").get() || null;
  }
  function applyCheck(accountId, result) {
    const hash = result.identityHash || null;
    let identityStatus = hash ? "confirmed" : "unconfirmed";
    if (hash && db.prepare("SELECT id FROM jimeng_accounts WHERE identity_hash=? AND id<>? AND removed_at IS NULL").get(hash, accountId)) identityStatus = "duplicate";
    db.prepare("UPDATE jimeng_accounts SET authorized=?, permission=?, total_credit=?, identity_hash=?, identity_status=?, checked_at=?, message=?, check_requested_at=NULL, updated_at=? WHERE id=?")
      .run(result.authorized ? 1 : 0, result.permission || "unknown", Number.isFinite(result.totalCredit) ? result.totalCredit : null, hash, identityStatus, iso(), publicMessage(result.message), iso(), accountId);
    record("account.checked", { accountId, identityStatus });
  }
  function tryLease(accountId, owner, purpose, ttlMs) {
    const now = new Date();
    const nowIso = iso(now);
    const until = iso(new Date(now.getTime() + ttlMs));
    return transaction(db, () => {
      const row = db.prepare("SELECT owner, lease_until, version FROM account_leases WHERE account_id=?").get(accountId);
      if (row && row.lease_until && row.lease_until > nowIso && row.owner !== owner) return false;
      if (!row) db.prepare("INSERT INTO account_leases(account_id, owner, purpose, lease_until, version) VALUES(?,?,?,?,1)").run(accountId, owner, purpose, until);
      else {
        const updated = db.prepare("UPDATE account_leases SET owner=?, purpose=?, lease_until=?, version=version+1 WHERE account_id=? AND version=?").run(owner, purpose, until, accountId, row.version);
        if (updated.changes !== 1) return false;
      }
      return true;
    });
  }
  function releaseLease(accountId, owner) {
    db.prepare("UPDATE account_leases SET owner=NULL, purpose=NULL, lease_until=NULL WHERE account_id=? AND owner=?").run(accountId, owner);
  }
  function setRuntime(key, value) {
    db.prepare("INSERT INTO runtime_status(key, value_json, updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at")
      .run(key, JSON.stringify(value), iso());
  }
  function runtime(key) {
    const row = db.prepare("SELECT value_json, updated_at FROM runtime_status WHERE key=?").get(key);
    if (!row) return null;
    return { ...JSON.parse(row.value_json), updatedAt: row.updated_at };
  }
  function eventsAfter(seq, limit = 200) {
    return db.prepare("SELECT seq, job_id, type, payload_json, created_at FROM job_events WHERE seq>? ORDER BY seq LIMIT ?").all(Number(seq) || 0, limit).map((row) => ({
      seq: row.seq,
      jobId: row.job_id,
      type: row.type,
      payload: JSON.parse(row.payload_json),
      createdAt: row.created_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    }));
  }
  function createExport(input) {
    const id = crypto.randomUUID();
    const now = iso();
    db.prepare("INSERT INTO exports(id,project_id,kind,status,manifest_json,created_at,updated_at) VALUES(?,?,?,'queued',?,?,?)")
      .run(id, input.projectId || null, input.kind, JSON.stringify(input.manifest || {}), now, now);
    record("export.queued", { exportId: id, projectId: input.projectId || "" });
    return db.prepare("SELECT * FROM exports WHERE id=?").get(id);
  }
  function nextExport() {
    return db.prepare("SELECT * FROM exports WHERE status='queued' ORDER BY created_at LIMIT 1").get() || null;
  }
  function finishExport(id, fields) {
    db.prepare("UPDATE exports SET status=?, storage_key=?, manifest_json=?, error_message=?, updated_at=? WHERE id=?")
      .run(fields.status, fields.storageKey || null, JSON.stringify(fields.manifest || {}), fields.errorMessage || "", iso(), id);
  }
  function getExport(id) {
    return db.prepare("SELECT * FROM exports WHERE id=?").get(id) || null;
  }

  return {
    listAccounts, createAccount, updateAccount, removeAccount, createAuthSession, getAuthSession, requestCheck, updatePool,
    imageConnection, saveImageConnection, imageApiKey, ensureSecret, nextAuthSession, saveAuthExchange, activeAuth, authExchange, markAuth,
    clearDeviceCode, nextCheck, applyCheck, tryLease, releaseLease, setRuntime, runtime, eventsAfter, createExport, nextExport,
    finishExport, getExport, pool,
  };
}

module.exports = { createJobRepository, createAccountRepository, normalizeJob, publicMessage };
