const crypto = require('node:crypto');
const { ApiError } = require('./errors.cjs');
const { transaction } = require('./db.cjs');
const { inspectMp4 } = require('./video-export.cjs');
const DAILY_PRE_SUBMIT_SECONDS_LIMIT = Math.max(
  1,
  Number(process.env.STORYDOCK_DOUBAO_PRE_SUBMIT_SECONDS) || 19,
);
const MAX_TASKS_PER_ACCOUNT_PER_DAY = Math.max(
  2,
  Number(process.env.STORYDOCK_DOUBAO_MAX_TASKS_PER_DAY) || 6,
);
const LEGACY_USED_SLOT_SECONDS = 15;
const PACK_WINDOW_SIZE = 24;
const phases = new Set(['claimed','switching_account','opening_canvas','fetching_references','writing_prompt',
  'uploading_references','setting_parameters','prepared','checking_submission','submitting','generating','downloading','uploading',
  'cancelling','retrying','needs_attention','resume_requested']);

function standardSlotsForUsage(
  usedSeconds,
  usedCount = 0,
  limit = DAILY_PRE_SUBMIT_SECONDS_LIMIT,
  maxTasks = MAX_TASKS_PER_ACCOUNT_PER_DAY,
) {
  if (usedSeconds >= limit || usedCount >= maxTasks) return 0;
  return Math.min(maxTasks - usedCount, Math.floor((limit - 1 - usedSeconds) / 10) + 1);
}

function selectNextAssignment(accountStates, queuedTasks, options = {}) {
  const limit = Number(options.preSubmitSecondsLimit) || DAILY_PRE_SUBMIT_SECONDS_LIMIT;
  const maxTasks = Number(options.maxTasksPerDay) || MAX_TASKS_PER_ACCOUNT_PER_DAY;
  const openAccounts = (Array.isArray(accountStates) ? accountStates : [])
    .filter(a => a && a.usedSeconds < limit && a.usedCount < maxTasks);
  if (!openAccounts.length || !Array.isArray(queuedTasks) || !queuedTasks.length) return null;

  const windowTasks = queuedTasks.slice(0, PACK_WINDOW_SIZE).map((task, idx) => ({
    ...task,
    duration: Number(task.duration) || 10,
    order: task.order ?? idx,
  }));

  // 1. Close out started accounts that cannot accept any keep-alive short shot (< limit) with their longest available shot.
  const closingAccounts = openAccounts
    .filter(a => a.usedSeconds > 0 && !windowTasks.some(t => a.usedSeconds + t.duration < limit && a.usedCount + 1 < maxTasks))
    .sort((a, b) => (b.usedSeconds - a.usedSeconds) || (a.order - b.order));
  if (closingAccounts.length) {
    const account = closingAccounts[0];
    const task = [...windowTasks].sort((a, b) => (b.duration - a.duration) || (a.order - b.order))[0];
    return { account, task, strategy: 'closeout_longest' };
  }

  // 2. Pack short keep-alive shots onto started accounts toward (limit - 1)s before using their final overdraft shot.
  let bestPartial = null;
  for (const account of openAccounts) {
    if (account.usedSeconds <= 0) continue;
    for (const task of windowTasks) {
      const after = account.usedSeconds + task.duration;
      if (after >= limit || account.usedCount + 1 >= maxTasks) continue;
      if (
        !bestPartial ||
        after > bestPartial.after ||
        (after === bestPartial.after && (
          account.usedSeconds > bestPartial.account.usedSeconds ||
          (account.usedSeconds === bestPartial.account.usedSeconds && (
            task.duration > bestPartial.task.duration ||
            (task.duration === bestPartial.task.duration && (
              account.order < bestPartial.account.order ||
              (account.order === bestPartial.account.order && task.order < bestPartial.task.order)
            ))
          ))
        ))
      ) {
        bestPartial = { account, task, after, strategy: 'pack_partial' };
      }
    }
  }
  if (bestPartial) return { account: bestPartial.account, task: bestPartial.task, strategy: bestPartial.strategy };

  // 3. Start a fresh account: pair short shots when another queued shot can follow (< limit), otherwise lead with longest.
  const freshAccount = openAccounts
    .filter(a => a.usedSeconds === 0)
    .sort((a, b) => a.order - b.order)[0];
  if (freshAccount) {
    let bestPair = null;
    if (maxTasks >= 3) {
      for (let i = 0; i < windowTasks.length; i += 1) {
        for (let j = i + 1; j < windowTasks.length; j += 1) {
          const sum = windowTasks[i].duration + windowTasks[j].duration;
          if (sum >= limit) continue;
          if (!bestPair || sum > bestPair.sum) {
            bestPair = { task: windowTasks[i], sum };
          }
        }
      }
    }
    if (bestPair) {
      return { account: freshAccount, task: bestPair.task, strategy: 'start_short_pair' };
    }
    const longest = [...windowTasks].sort((a, b) => (b.duration - a.duration) || (a.order - b.order))[0];
    return { account: freshAccount, task: longest, strategy: 'start_longest' };
  }

  // 4. Fallback: highest-usage open account + longest available shot.
  const fallbackAccount = [...openAccounts].sort((a, b) => (b.usedSeconds - a.usedSeconds) || (a.order - b.order))[0];
  const fallbackTask = [...windowTasks].sort((a, b) => (b.duration - a.duration) || (a.order - b.order))[0];
  return { account: fallbackAccount, task: fallbackTask, strategy: 'fallback' };
}

function ossFailureReason(error) {
  if (/InvalidAccessKeyId/.test(String(error.body || error.message || ''))) return 'AccessKey 无效或已停用';
  if (error.statusCode === 403) return 'OSS 拒绝写入，请检查权限';
  if (error.code === 'ABORT_ERR' || error.name === 'TimeoutError') return 'OSS 同步超时';
  return Number.isInteger(error.statusCode) ? `OSS 返回 HTTP ${error.statusCode}` : '无法连接 OSS';
}

function createDoubaoQueue(services) {
  const { db } = services;
  db.exec(`CREATE TABLE IF NOT EXISTS doubao_local_tasks (
    id TEXT PRIMARY KEY, shot_id TEXT NOT NULL, project_id TEXT NOT NULL,
    prompt TEXT NOT NULL, request_key TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL DEFAULT 'queued', worker_id TEXT,
    account_label TEXT, quota_key TEXT, quota_day TEXT,
    note TEXT NOT NULL DEFAULT '', media_id TEXT,
    references_json TEXT NOT NULL DEFAULT '[]', prompt_original TEXT NOT NULL DEFAULT '',
    duration INTEGER NOT NULL DEFAULT 10, ratio TEXT NOT NULL DEFAULT 'auto', model TEXT NOT NULL DEFAULT 'Seedance 2.0 Fast',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS doubao_local_usage_seed (
    quota_key TEXT NOT NULL, quota_day TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0,
    used_seconds INTEGER,
    PRIMARY KEY(quota_key,quota_day)
  );
  CREATE TABLE IF NOT EXISTS doubao_local_devices (
    id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
    created_at TEXT NOT NULL, revoked_at TEXT
  );
  CREATE TABLE IF NOT EXISTS doubao_local_account_pools (
    worker_id TEXT PRIMARY KEY, quota_keys_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS doubao_local_account_reports (
    worker_id TEXT PRIMARY KEY, labels_json TEXT NOT NULL, seen_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS doubao_local_excluded_accounts (
    worker_id TEXT NOT NULL, account_label TEXT NOT NULL,
    PRIMARY KEY(worker_id,account_label)
  );
  CREATE TABLE IF NOT EXISTS doubao_local_worker_status (
    worker_id TEXT PRIMARY KEY, task_id TEXT, phase TEXT,
    completed INTEGER, total INTEGER, seen_at TEXT NOT NULL
  );`);
  const columns=db.prepare('PRAGMA table_info(doubao_local_tasks)').all().map(column=>column.name);
  if(!columns.includes('references_json')) db.exec("ALTER TABLE doubao_local_tasks ADD COLUMN references_json TEXT NOT NULL DEFAULT '[]'");
  if(!columns.includes('prompt_original')) db.exec("ALTER TABLE doubao_local_tasks ADD COLUMN prompt_original TEXT NOT NULL DEFAULT ''");
  if(!columns.includes('duration')) db.exec('ALTER TABLE doubao_local_tasks ADD COLUMN duration INTEGER NOT NULL DEFAULT 10');
  if(!columns.includes('ratio')) db.exec("ALTER TABLE doubao_local_tasks ADD COLUMN ratio TEXT NOT NULL DEFAULT 'auto'");
  if(!columns.includes('resume_revision')) db.exec("ALTER TABLE doubao_local_tasks ADD COLUMN resume_revision INTEGER NOT NULL DEFAULT 0");
  const statusColumns=db.prepare('PRAGMA table_info(doubao_local_worker_status)').all();
  if(!statusColumns.some(column=>column.name==='interruption_json'))
    db.exec('ALTER TABLE doubao_local_worker_status ADD COLUMN interruption_json TEXT');
  if(!columns.includes('model')) {
    db.exec("ALTER TABLE doubao_local_tasks ADD COLUMN model TEXT NOT NULL DEFAULT 'Seedance 2.0 Mini'");
    db.prepare("UPDATE doubao_local_tasks SET model='Seedance 2.0 Fast' WHERE state IN ('queued','claimed','prepared','cancelling')").run();
  }
  const usageSeedColumns = db.prepare('PRAGMA table_info(doubao_local_usage_seed)').all().map(column => column.name);
  if (!usageSeedColumns.includes('used_seconds')) {
    db.exec('ALTER TABLE doubao_local_usage_seed ADD COLUMN used_seconds INTEGER');
    db.prepare(`UPDATE doubao_local_usage_seed SET used_seconds = used * ${LEGACY_USED_SLOT_SECONDS} WHERE used_seconds IS NULL`).run();
  }
  const activeStates = "state NOT IN ('queued','succeeded','cancelled','failed')";
  transaction(db,()=>db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS doubao_one_task_per_worker
      ON doubao_local_tasks(worker_id) WHERE ${activeStates};
    CREATE UNIQUE INDEX IF NOT EXISTS doubao_one_task_per_account
      ON doubao_local_tasks(quota_key) WHERE ${activeStates};
    DROP INDEX IF EXISTS doubao_one_desktop_task;
  `));
  const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
  const get = id => db.prepare('SELECT * FROM doubao_local_tasks WHERE id=?').get(id);
  function seedUsage(key, date) {
    const row = db.prepare('SELECT used, used_seconds FROM doubao_local_usage_seed WHERE quota_key=? AND quota_day=?').get(key, date);
    const usedCount = Number(row?.used || 0);
    const usedSeconds =
      row?.used_seconds !== null && row?.used_seconds !== undefined
        ? Number(row.used_seconds)
        : usedCount * LEGACY_USED_SLOT_SECONDS;
    return { usedCount, usedSeconds };
  }
  function accountUsage(key, date, excludeId = '') {
    // The worker records this note only after verifying the rejection on the task's own canvas.
    const row = db.prepare(`SELECT COUNT(*) AS used_count, COALESCE(SUM(duration), 0) AS used_seconds FROM doubao_local_tasks
      WHERE quota_key=? AND quota_day=? AND id<>? AND state NOT IN ('queued','cancelled')
        AND NOT (state='failed' AND note=?)`).get(key, date, excludeId, '豆包审核不通过，生成已停止');
    const seed = seedUsage(key, date);
    const dbCount = Number(row?.used_count || 0);
    const dbSeconds = Number(row?.used_seconds || 0);
    const usedCount = dbCount + seed.usedCount;
    const usedSeconds = dbSeconds + seed.usedSeconds;
    const canAccept = usedSeconds < DAILY_PRE_SUBMIT_SECONDS_LIMIT && usedCount < MAX_TASKS_PER_ACCOUNT_PER_DAY;
    return {
      quotaKey: key,
      dbCount,
      dbSeconds,
      seedCount: seed.usedCount,
      seedSeconds: seed.usedSeconds,
      usedCount,
      usedSeconds,
      canAccept,
      remainingBeforeLimit: canAccept ? Math.max(0, DAILY_PRE_SUBMIT_SECONDS_LIMIT - 1 - usedSeconds) : 0,
      standardSlots: standardSlotsForUsage(usedSeconds, usedCount),
    };
  }
  function activePoolKeys() {
    return db.prepare(`SELECT DISTINCT entries.value AS quota_key FROM doubao_local_account_pools pools
      LEFT JOIN doubao_local_devices devices ON devices.id=pools.worker_id
      JOIN json_each(pools.quota_keys_json) entries WHERE devices.revoked_at IS NULL
      ORDER BY entries.value`).all().map(row => row.quota_key);
  }
  function simulateQueueOnPool(keys, queuedTasks, today) {
    const states = keys.map((quotaKey, order) => {
      const usage = accountUsage(quotaKey, today);
      return { quotaKey, usedSeconds: usage.usedSeconds, usedCount: usage.usedCount, order };
    });
    const pending = queuedTasks.map((task, order) => ({
      id: task.id ?? `sim-${order}`,
      duration: Number(task.duration) || 10,
      order,
    }));
    while (pending.length) {
      const pick = selectNextAssignment(states, pending);
      if (!pick) {
        return { allFit: false, remainingAccounts: states, unplacedCount: pending.length };
      }
      pick.account.usedSeconds += pick.task.duration;
      pick.account.usedCount += 1;
      const idx = pending.findIndex(item => item.id === pick.task.id);
      if (idx >= 0) pending.splice(idx, 1);
      else pending.shift();
    }
    return { allFit: true, remainingAccounts: states, unplacedCount: 0 };
  }
  function queueQuotaDetails(queuedTasks) {
    const keys = activePoolKeys();
    if (!keys.length) return null;
    const today = day();
    const labelRows = db.prepare(
      'SELECT quota_key, account_label FROM doubao_local_tasks WHERE quota_key IS NOT NULL AND account_label IS NOT NULL ORDER BY updated_at DESC, rowid DESC'
    ).all();
    const labelsByKey = new Map();
    for (const row of labelRows) {
      if (!labelsByKey.has(row.quota_key)) labelsByKey.set(row.quota_key, row.account_label);
    }
    const perAccount = keys.map(key => ({
      ...accountUsage(key, today),
      accountLabel: labelsByKey.get(key) || null,
    }));
    const sim = simulateQueueOnPool(keys, queuedTasks, today);
    const available = sim.remainingAccounts.reduce(
      (total, acc) => total + standardSlotsForUsage(acc.usedSeconds, acc.usedCount),
      0,
    );
    const total = keys.length * standardSlotsForUsage(0, 0);
    const openAccounts = sim.remainingAccounts.filter(
      acc => acc.usedSeconds < DAILY_PRE_SUBMIT_SECONDS_LIMIT && acc.usedCount < MAX_TASKS_PER_ACCOUNT_PER_DAY,
    ).length;
    const maxRemainingSeconds = sim.remainingAccounts.reduce((totalSecs, acc) => {
      if (acc.usedSeconds >= DAILY_PRE_SUBMIT_SECONDS_LIMIT || acc.usedCount >= MAX_TASKS_PER_ACCOUNT_PER_DAY) {
        return totalSecs;
      }
      return totalSecs + (DAILY_PRE_SUBMIT_SECONDS_LIMIT - 1 - acc.usedSeconds) + 15;
    }, 0);
    return {
      quota: { available, total },
      details: {
        mode: 'seconds_threshold',
        preSubmitSecondsLimit: DAILY_PRE_SUBMIT_SECONDS_LIMIT,
        maxTasksPerDay: MAX_TASKS_PER_ACCOUNT_PER_DAY,
        usedSecondsTotal: perAccount.reduce((sum, acc) => sum + acc.usedSeconds, 0),
        queuedSecondsTotal: queuedTasks.reduce((sum, task) => sum + (Number(task.duration) || 10), 0),
        openAccounts,
        maxRemainingSeconds,
        accounts: perAccount,
      },
    };
  }
  function checkQueueQuota(newDuration) {
    const keys = activePoolKeys();
    if (!keys.length) return;
    const queuedTasks = db.prepare("SELECT id, duration FROM doubao_local_tasks WHERE state='queued' ORDER BY created_at,rowid").all();
    const sim = simulateQueueOnPool(keys, [...queuedTasks, { id: '__incoming__', duration: Number(newDuration) || 10 }], day());
    if (!sim.allFit) {
      throw new ApiError(409, 'daily_limit', '本地豆包今日额度已用完，任务未入队');
    }
  }
  function enqueue(shotId, requestKey, { postProductionSubtitles = false } = {}) {
    if(typeof shotId!=='string'||!shotId||shotId.length>100) throw new ApiError(400,'shot_required','请选择分镜');
    if (typeof requestKey !== 'string' || !requestKey || requestKey.length > 100)
      throw new ApiError(400, 'request_key_required', '请提供唯一请求编号');
    return transaction(db, () => {
      const old = db.prepare('SELECT * FROM doubao_local_tasks WHERE request_key=?').get(requestKey);
      if (old) {
        if (old.shot_id !== shotId) throw new ApiError(409, 'key_conflict', '请求编号已用于其他分镜');
        return old;
      }
      const shot = db.prepare('SELECT * FROM shots WHERE id=? AND deleted_at IS NULL').get(shotId);
      if (!shot) throw new ApiError(404, 'shot_not_found', '分镜不存在');
      require('./tenant.cjs').own(db, shot.project_id);
      if (!shot.prompt.trim()) throw new ApiError(422, 'prompt_required', '请先保存分镜提示词');
      if(!Number.isInteger(shot.duration)||shot.duration<4||shot.duration>15)
        throw new ApiError(422,'unsupported_duration','本地豆包支持4至15秒镜头');
      const ratio=db.prepare('SELECT ratio FROM projects WHERE id=?').get(shot.project_id).ratio;
      if(!['16:9','9:16','1:1','3:4','4:3','21:9'].includes(ratio)) throw new ApiError(422,'unsupported_ratio','豆包不支持项目当前画幅');
      checkQueueQuota(shot.duration);
      const binding=freezeReferences(services,shot);
      const prompt = postProductionSubtitles
        ? binding.prompt + '\n\n【后期字幕】请保留对白原声和口型。生成画面时禁止叠加字幕、台词文字或标题，画面字幕由后期工具添加。'
        : binding.prompt;
      const id = crypto.randomUUID(), now = new Date().toISOString();
      db.prepare(`INSERT INTO doubao_local_tasks(id,shot_id,project_id,prompt,request_key,created_at,updated_at,references_json,prompt_original,duration,ratio,model)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, shotId, shot.project_id, prompt, requestKey, now, now,JSON.stringify(binding.references),shot.prompt,shot.duration,ratio,'Seedance 2.0 Fast');
      return get(id);
    });
  }
  function claim(workerId, accounts) {
    if (typeof workerId !== 'string' || !workerId || workerId.length > 100 || !Array.isArray(accounts) || !accounts.length || accounts.length > 50)
      throw new ApiError(400, 'invalid_worker', '执行器与账号配置无效');
    for (const account of accounts) {
      if (typeof account?.label !== 'string' || !account.label.trim() || account.label.length > 200 ||
          typeof account.quotaKey !== 'string' || !account.quotaKey.trim() || account.quotaKey.length > 100)
        throw new ApiError(400, 'invalid_account', '账号需要界面名称和额度归属编号');
      if(account.usedToday!==undefined && (!Number.isInteger(account.usedToday)||account.usedToday<0||account.usedToday>MAX_TASKS_PER_ACCOUNT_PER_DAY||!/^\d{4}-\d{2}-\d{2}$/.test(account.usageDate || '')))
        throw new ApiError(400,'invalid_usage',`初始使用次数需要日期和0至${MAX_TASKS_PER_ACCOUNT_PER_DAY}的次数`);
      if(account.usedSecondsToday!==undefined && (!Number.isInteger(account.usedSecondsToday)||account.usedSecondsToday<0||account.usedSecondsToday>300||!/^\d{4}-\d{2}-\d{2}$/.test(account.usageDate || '')))
        throw new ApiError(400,'invalid_usage','初始已用秒数需要日期和0至300的整数秒数');
    }
    return transaction(db, () => {
      const excluded=new Set(db.prepare('SELECT account_label FROM doubao_local_excluded_accounts WHERE worker_id=?')
        .all(workerId).map(row=>row.account_label));
      const eligible=accounts.filter(account=>!excluded.has(account.label));
      const keys=JSON.stringify([...new Set(eligible.map(account=>account.quotaKey))].sort());
      db.prepare(`INSERT INTO doubao_local_account_pools(worker_id,quota_keys_json) VALUES(?,?)
        ON CONFLICT(worker_id) DO UPDATE SET quota_keys_json=excluded.quota_keys_json
        WHERE quota_keys_json<>excluded.quota_keys_json`).run(workerId,keys);
      const today = day();
      for(const account of eligible) {
        const hasCount = account.usedToday !== undefined;
        const hasSec = account.usedSecondsToday !== undefined;
        if((hasCount || hasSec) && account.usageDate===today) {
          const seedCount = hasCount ? account.usedToday : 0;
          const seedSecs = hasSec ? account.usedSecondsToday : seedCount * LEGACY_USED_SLOT_SECONDS;
          db.prepare(`INSERT INTO doubao_local_usage_seed(quota_key,quota_day,used,used_seconds) VALUES(?,?,?,?)
            ON CONFLICT(quota_key,quota_day) DO UPDATE SET used=MAX(used,excluded.used),
              used_seconds=MAX(COALESCE(used_seconds, used*${LEGACY_USED_SLOT_SECONDS}), excluded.used_seconds)`)
            .run(account.quotaKey,today,seedCount,seedSecs);
        }
      }
      const active = db.prepare(`SELECT * FROM doubao_local_tasks WHERE worker_id=? AND ${activeStates}`).get(workerId);
      const now=new Date().toISOString();
      db.prepare(`INSERT INTO doubao_local_worker_status(worker_id,seen_at) VALUES(?,?)
        ON CONFLICT(worker_id) DO UPDATE SET seen_at=excluded.seen_at`).run(workerId,now);
      // A lost heartbeat never releases a desktop/account lock.
      if (active) return { task: active, reason: 'desktop_locked' };
      const lockedAccounts = new Set(db.prepare(`SELECT quota_key FROM doubao_local_tasks WHERE ${activeStates}`)
        .all().map(task=>task.quota_key));
      const openStates = [];
      const seenQuotaKeys = new Set();
      let anyLocked = false;
      eligible.forEach((account, order) => {
        if (lockedAccounts.has(account.quotaKey)) {
          anyLocked = true;
          return;
        }
        if (seenQuotaKeys.has(account.quotaKey)) return;
        const usage = accountUsage(account.quotaKey, today);
        if (!usage.canAccept) return;
        seenQuotaKeys.add(account.quotaKey);
        openStates.push({
          quotaKey: account.quotaKey,
          account,
          usedSeconds: usage.usedSeconds,
          usedCount: usage.usedCount,
          order,
        });
      });
      if (!openStates.length) return { task: null, reason: anyLocked ? 'desktop_locked' : 'daily_limit' };
      const queuedTasks = db.prepare("SELECT id, duration FROM doubao_local_tasks WHERE state='queued' ORDER BY created_at,rowid").all();
      if (!queuedTasks.length) return { task: null, reason: 'empty' };
      const pick = selectNextAssignment(openStates, queuedTasks);
      if (!pick) return { task: null, reason: 'daily_limit' };
      db.prepare(`UPDATE doubao_local_tasks SET state='claimed',worker_id=?,account_label=?,quota_key=?,quota_day=?,updated_at=? WHERE id=?`)
        .run(workerId, pick.account.account.label, pick.account.quotaKey, today, now, pick.task.id);
      return { task: get(pick.task.id) };
    });
  }
  function owned(id, workerId) {
    const task = get(id);
    if (!task || task.worker_id !== workerId) throw new ApiError(409, 'worker_mismatch', '任务与执行器不匹配');
    return task;
  }
  function progress(id, workerId, {phase,completed=null,total=null,interruption=null,resumeRevision=0}={}) {
    if(!phases.has(phase) || ((completed!==null || total!==null) &&
       !(Number.isInteger(completed)&&Number.isInteger(total)&&total>0&&total<=100&&completed>=0&&completed<=total)))
      throw new ApiError(400,'invalid_progress','执行阶段或进度无效');
    const task=owned(id,workerId);
    if(['succeeded','failed','cancelled'].includes(task.state)) return {ok:true};
    if (interruption && (!['retrying','needs_attention'].includes(phase) || !phases.has(interruption.phase) ||
      [interruption.reason,interruption.recovery].some(value=>typeof value!=='string' || !value.trim() || value.length>500)))
      throw new ApiError(400,'invalid_interruption','中断原因或恢复说明无效');
    const details=interruption && JSON.stringify({phase:interruption.phase,reason:interruption.reason,recovery:interruption.recovery});
    db.prepare(`INSERT INTO doubao_local_worker_status(worker_id,task_id,phase,completed,total,seen_at,interruption_json)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(worker_id) DO UPDATE SET task_id=excluded.task_id,phase=excluded.phase,
      completed=excluded.completed,total=excluded.total,seen_at=excluded.seen_at,interruption_json=excluded.interruption_json
      WHERE doubao_local_worker_status.task_id IS NOT excluded.task_id OR doubao_local_worker_status.phase IS NOT 'resume_requested'
        OR excluded.phase NOT IN ('needs_attention','retrying') OR ?`)
      .run(workerId,id,phase,completed,total,new Date().toISOString(),details,Number(resumeRevision===task.resume_revision));
    return {ok:true};
  }
  function reportAccounts(workerId, labels) {
    if (!Array.isArray(labels) || !labels.length || labels.length>50 ||
        labels.some(label=>typeof label!=='string' || !label.trim() || label.length>200 || /[\x00-\x1f\x7f]/.test(label)))
      throw new ApiError(400,'invalid_account_report','账号上报需要有效的豆包账号显示名');
    const names=[...new Set(labels.map(label=>label.trim()))];
    const now=new Date().toISOString();
    return transaction(db,()=>{
      db.prepare(`INSERT INTO doubao_local_account_reports(worker_id,labels_json,seen_at) VALUES(?,?,?)
        ON CONFLICT(worker_id) DO UPDATE SET labels_json=excluded.labels_json,seen_at=excluded.seen_at`)
        .run(workerId,JSON.stringify(names),now);
      db.prepare(`INSERT INTO doubao_local_worker_status(worker_id,seen_at) VALUES(?,?)
        ON CONFLICT(worker_id) DO UPDATE SET seen_at=excluded.seen_at`).run(workerId,now);
      return {ok:true};
    });
  }
  function overview() {
    const fields=`t.id,t.shot_id,t.state,t.note,t.account_label,t.duration,t.created_at,t.updated_at,
      p.name AS project_name,s.episode,s.number,s.title,
      w.phase,w.completed,w.total,w.seen_at,w.interruption_json`;
    const joins=`FROM doubao_local_tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN shots s ON s.id=t.shot_id
      LEFT JOIN doubao_local_worker_status w ON w.worker_id=t.worker_id AND w.task_id=t.id`;
    const waiting=db.prepare(`SELECT ${fields} ${joins} WHERE t.state='queued' ORDER BY t.created_at,t.rowid`).all();
    const active=db.prepare(`SELECT ${fields} ${joins} WHERE t.state NOT IN ('queued','succeeded','failed','cancelled')
      ORDER BY t.created_at,t.rowid`).all().map(({interruption_json,...task})=>({
        ...task,interruption:interruption_json?JSON.parse(interruption_json):null,
      }));
    const recent=db.prepare(`SELECT ${fields} ${joins} WHERE t.state IN ('succeeded','failed','cancelled')
      ORDER BY t.updated_at DESC,t.rowid DESC LIMIT 200`).all();
    const {seen_at}=db.prepare(`SELECT MAX(w.seen_at) AS seen_at FROM doubao_local_worker_status w
      LEFT JOIN doubao_local_devices d ON d.id=w.worker_id WHERE d.revoked_at IS NULL`).get();
    const account_reports=db.prepare(`SELECT d.id,d.label,r.labels_json,r.seen_at FROM doubao_local_account_reports r
      JOIN doubao_local_devices d ON d.id=r.worker_id WHERE d.revoked_at IS NULL ORDER BY r.seen_at DESC`).all()
      .map(({labels_json,...device})=>({...device,labels:JSON.parse(labels_json)}));
    const quotaInfo = queueQuotaDetails(waiting);
    return {
      active,
      waiting,
      recent,
      account_reports,
      quota: quotaInfo ? quotaInfo.quota : null,
      quota_details: quotaInfo ? quotaInfo.details : null,
      worker:{seen_at,online:!!seen_at&&Date.now()-Date.parse(seen_at)<60000},
    };
  }
  const transitions = { claimed: ['prepared', 'blocked'], prepared: ['submitting', 'blocked'], submitting: ['running', 'blocked', 'failed'], running: ['awaiting_video', 'blocked', 'failed'], awaiting_video: ['blocked'], blocked: [], cancelling:['cancelled'] };
  function resume(id) {
    return transaction(db,()=>{
      const task=get(id);
      if(!task) throw new ApiError(404,'task_not_found','任务不存在');
      if(!['claimed','prepared','submitting','running','awaiting_video'].includes(task.state))
        throw new ApiError(409,'not_resumable','任务当前不能恢复');
      const status=db.prepare('SELECT phase FROM doubao_local_worker_status WHERE worker_id=? AND task_id=?').get(task.worker_id,id);
      if(status?.phase==='resume_requested') return {requested:true};
      if(status?.phase!=='needs_attention')
        throw new ApiError(409,'not_paused','任务当前未暂停等待恢复');
      db.prepare('UPDATE doubao_local_tasks SET resume_revision=resume_revision+1 WHERE id=?').run(id);
      db.prepare("UPDATE doubao_local_worker_status SET phase='resume_requested' WHERE worker_id=? AND task_id=?").run(task.worker_id,id);
      return {requested:true};
    });
  }
  function cancel(id) {
    return transaction(db,()=>{
      const task=get(id);
      if(!task) throw new ApiError(404,'task_not_found','任务不存在');
      if(['cancelled','cancelling'].includes(task.state)) return task;
      if(!['queued','claimed','prepared'].includes(task.state))
        throw new ApiError(409,'already_submitting','任务已进入提交阶段，无法终止提交前操作');
      const state=task.state==='queued'?'cancelled':'cancelling';
      db.prepare('UPDATE doubao_local_tasks SET state=?,note=?,updated_at=? WHERE id=?')
        .run(state,state==='cancelled'?'用户终止排队任务':'用户请求终止，等待本机停止操作',new Date().toISOString(),id);
      return get(id);
    });
  }
  function update(id, workerId, state, note = '') {
    return transaction(db, () => {
      const task = owned(id, workerId);
      if(state==='account_missing') {
        if(!['claimed','prepared'].includes(task.state) || !task.account_label)
          throw new ApiError(409,'already_submitting','只可换号处理尚未提交的任务');
        db.prepare('INSERT OR IGNORE INTO doubao_local_excluded_accounts(worker_id,account_label) VALUES(?,?)')
          .run(workerId,task.account_label);
        db.prepare(`UPDATE doubao_local_tasks SET state='queued',worker_id=NULL,account_label=NULL,
          quota_key=NULL,quota_day=NULL,note=?,updated_at=? WHERE id=?`)
          .run('原账号已从豆包列表移除，等待分配其他账号',new Date().toISOString(),id);
        db.prepare('DELETE FROM doubao_local_worker_status WHERE worker_id=? AND task_id=?').run(workerId,id);
        return get(id);
      }
      if (state !== task.state && !transitions[task.state]?.includes(state))
        throw new ApiError(409, 'invalid_transition', '任务状态不允许此操作');
      if (state === 'submitting' && task.state !== 'submitting') {
        const today=day();
        if(!accountUsage(task.quota_key,today,id).canAccept) throw new ApiError(409,'daily_limit','该账号今日额度已用完，保留任务供核对');
        db.prepare('UPDATE doubao_local_tasks SET quota_day=? WHERE id=?').run(today,id);
      }
      db.prepare('UPDATE doubao_local_tasks SET state=?,note=?,updated_at=? WHERE id=?')
        .run(state, String(note).slice(0,1000), new Date().toISOString(), id);
      return get(id);
    });
  }
  async function upload(id, workerId, bytes) {
    const original = owned(id, workerId);
    if (original.state === 'succeeded') return original;
    if (!['running', 'awaiting_video', 'blocked'].includes(original.state))
      throw new ApiError(409, 'not_running', '任务尚未提交');
    const metadata = inspectMp4(bytes);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    let ossWarning;
    const stored = await services.repos.content.saveMedia({
      projectId: original.project_id, bytes, source: 'doubao_local', video: true, jobId: id,
      onOssError: error => { ossWarning = ossFailureReason(error); },
    });
    return transaction(db, () => {
      const current = owned(id, workerId);
      if (current.state === 'succeeded') return current;
      const shot = db.prepare('SELECT id FROM shots WHERE id=? AND deleted_at IS NULL').get(original.shot_id);
      if (!shot) throw new ApiError(409, 'shot_deleted', '原分镜已删除，保留账号锁供人工处理');
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO jobs(id,project_id,source_id,batch_id,kind,status,provider,model,config_snapshot,input_snapshot,result_json,media_id,created_at,updated_at,completed_at)
        VALUES(?,?,?,?,'video','succeeded','doubao_local',?,?,?,?,?,?,?,?)`)
        .run(id, original.project_id, original.shot_id, id, original.model, JSON.stringify({ratio:original.ratio,duration:original.duration,model:original.model}), JSON.stringify({promptOriginal: original.prompt_original||original.prompt,promptSubmitted:original.prompt,references:JSON.parse(original.references_json),ratio:original.ratio,duration:original.duration}),
          JSON.stringify({accountLabel: original.account_label, sha256: sha, videoMetadata: metadata, ossWarning}), stored.id, now, now, now);
      const note = ossWarning ? `成片已保存到服务器，OSS 暂未同步（${ossWarning}）` : '成片已保存，账号锁已释放';
      db.prepare("UPDATE doubao_local_tasks SET state='succeeded',note=?,media_id=?,updated_at=? WHERE id=?").run(note, stored.id, now, id);
      services.repos.record('job.succeeded', {jobId:id,projectId:original.project_id,sourceId:original.shot_id,source:'doubao_local'});
      return get(id);
    });
  }
  function seedManualUsage({ quotaKey, accountLabel, quotaDay, extraSeconds, totalUsedSeconds, usedCount } = {}) {
    const targetDay = quotaDay === undefined ? day() : String(quotaDay || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDay)) {
      throw new ApiError(400, 'invalid_usage', '日期格式需为 YYYY-MM-DD');
    }
    return transaction(db, () => {
      let resolvedKey = typeof quotaKey === 'string' && quotaKey.trim() ? quotaKey.trim() : '';
      if (!resolvedKey && typeof accountLabel === 'string' && accountLabel.trim()) {
        const matched = db.prepare(
          'SELECT quota_key FROM doubao_local_tasks WHERE account_label=? AND quota_key IS NOT NULL ORDER BY updated_at DESC, rowid DESC LIMIT 1'
        ).get(accountLabel.trim());
        if (!matched?.quota_key) {
          throw new ApiError(404, 'account_not_found', `未找到账号「${accountLabel.trim()}」的额度归属记录`);
        }
        resolvedKey = matched.quota_key;
      }
      if (!resolvedKey || resolvedKey.length > 100) {
        throw new ApiError(400, 'invalid_account', '请提供有效的 quotaKey 或已运行过任务的账号名称');
      }
      let seedCount = 0;
      if (usedCount !== undefined) {
        if (!Number.isInteger(usedCount) || usedCount < 0 || usedCount > MAX_TASKS_PER_ACCOUNT_PER_DAY) {
          throw new ApiError(400, 'invalid_usage', `初始使用次数需为0至${MAX_TASKS_PER_ACCOUNT_PER_DAY}的整数`);
        }
        seedCount = usedCount;
      }
      const dbRow = db.prepare(`SELECT COALESCE(SUM(duration), 0) AS used_seconds FROM doubao_local_tasks
        WHERE quota_key=? AND quota_day=? AND state NOT IN ('queued','cancelled')
          AND NOT (state='failed' AND note=?)`).get(resolvedKey, targetDay, '豆包审核不通过，生成已停止');
      const dbSeconds = Number(dbRow?.used_seconds || 0);
      let seedSeconds;
      if (totalUsedSeconds !== undefined) {
        if (!Number.isInteger(totalUsedSeconds) || totalUsedSeconds < 0 || totalUsedSeconds > 300) {
          throw new ApiError(400, 'invalid_usage', '今日累计已用秒数需为0至300的整数');
        }
        seedSeconds = Math.max(0, totalUsedSeconds - dbSeconds);
      } else if (extraSeconds !== undefined) {
        if (!Number.isInteger(extraSeconds) || extraSeconds < 0 || extraSeconds > 300) {
          throw new ApiError(400, 'invalid_usage', '追加已用秒数需为0至300的整数');
        }
        seedSeconds = extraSeconds;
      } else {
        throw new ApiError(400, 'invalid_usage', '请提供 totalUsedSeconds 或 extraSeconds');
      }
      db.prepare(`INSERT INTO doubao_local_usage_seed(quota_key,quota_day,used,used_seconds) VALUES(?,?,?,?)
        ON CONFLICT(quota_key,quota_day) DO UPDATE SET used=excluded.used, used_seconds=excluded.used_seconds`)
        .run(resolvedKey, targetDay, seedCount, seedSeconds);
      return accountUsage(resolvedKey, targetDay);
    });
  }
  return { enqueue, claim, update, upload, get, cancel, resume, progress, reportAccounts, seedManualUsage, overview, list: () => db.prepare('SELECT * FROM doubao_local_tasks ORDER BY created_at DESC,rowid DESC LIMIT 200').all() };
}

function registerDoubaoLocal(app, services) {
  const queue = createDoubaoQueue(services);
  const prefix = '/api/v1/doubao-local';
  app.addHook('preHandler', async request => {
    if (request.url.startsWith(prefix) && request.appUser && request.appUser.role !== 'admin')
      throw new ApiError(403, 'admin_required', '豆包本地执行器仅限管理员');
    if(request.doubaoDevice) {
      const workerId=request.body?.workerId || request.headers['x-doubao-worker'];
      if(request.method==='POST' && workerId!==request.doubaoDevice.id)
        throw new ApiError(403,'device_mismatch','执行器编号不匹配');
      if(request.params.id && queue.get(request.params.id)?.worker_id!==request.doubaoDevice.id)
        throw new ApiError(403,'device_mismatch','只能访问本机领取的任务');
    }
  });
  app.post(prefix+'/devices',async request=>issueDevice(services,String(request.body?.label||'Mac豆包执行器')));
  app.get(prefix+'/queue',async()=>queue.overview());
  app.get(prefix + '/tasks', async () => queue.list());
  app.get(prefix + '/tasks/:id', async request => {
    const task=queue.get(request.params.id);
    if(!task) throw new ApiError(404,'task_not_found','本地任务不存在');
    return task;
  });
  app.get(prefix+'/tasks/:id/references/:index',async(request,reply)=>{
    const task=queue.get(request.params.id);
    if(!task) throw new ApiError(404,'task_not_found','本地任务不存在');
    const reference=JSON.parse(task.references_json).find(r=>String(r.index)===request.params.index);
    if(!reference) throw new ApiError(404,'reference_not_found','参考图不存在');
    const file=services.repos.content.readReferenceMedia(task.project_id,reference.mediaId,reference.sha256);
    if(crypto.createHash('sha256').update(file.bytes).digest('hex')!==reference.sha256)
      throw new ApiError(409,'reference_changed','参考图文件校验失败');
    reply.type(file.mime).header('Cache-Control','no-store');return file.bytes;
  });
  app.post(prefix + '/tasks', async request => queue.enqueue(request.body?.shotId, request.body?.requestKey));
  app.post(prefix + '/batches', async request => {
    if (request.doubaoDevice) throw new ApiError(403, 'admin_required', '仅管理员可提交批量生成');
    const {projectId, shotIds, requestKey} = request.body || {};
    if (typeof projectId !== "string" || !projectId || !Array.isArray(shotIds) || !shotIds.length || shotIds.length > 200 ||
        shotIds.some(id => typeof id !== 'string' || !id) ||
        typeof requestKey !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(requestKey)) {
      throw new ApiError(400, 'invalid_batch', '请选择 1–200 个分镜并提供有效请求编号');
    }
    services.repos.content.mustProject(projectId);
    const db = services.db;
    const shot = db.prepare('SELECT id FROM shots WHERE id=? AND project_id=? AND deleted_at IS NULL');
    const complete = db.prepare("SELECT 1 FROM jobs WHERE project_id=? AND source_id=? AND kind='video' AND status='succeeded' AND media_id IS NOT NULL LIMIT 1");
    const active = db.prepare("SELECT id FROM doubao_local_tasks WHERE shot_id=? AND state NOT IN ('succeeded','cancelled','failed')");
    return transaction(db, () => {
      const tasks = [];
      const skipped = [];
      for (const [index, id] of [...new Set(shotIds)].entries()) {
        if (!shot.get(id, projectId)) throw new ApiError(404, 'shot_not_found', '分镜已删除或不属于当前项目');
        if (complete.get(projectId, id)) {
          skipped.push(id);
          continue;
        }
        const running = active.get(id);
        tasks.push(running || queue.enqueue(id, `batch-${requestKey}-${index}`, { postProductionSubtitles: true }));
      }
      return { taskIds: tasks.map(task => task.id), skipped };
    });
  });
  const studioRoute = prefix + '/studio-generations';
  const studioDb = services.db;
  studioDb.exec(`CREATE TABLE IF NOT EXISTS studio_video_generations (
    request_key TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    episode_id TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    shots_json TEXT NOT NULL
  )`);
  const studioRead = studioDb.prepare('SELECT * FROM studio_video_generations WHERE request_key=?');
  function studioResult(row) {
    services.repos.content.mustProject(row.project_id);
    const shots = JSON.parse(row.shots_json).map(({ key, shotId, taskId }) => {
      const task = queue.get(taskId);
      return { key, shotId, taskId, state: task?.state || 'missing', note: task?.note || '',
        video: task?.state === 'succeeded' && task.media_id ? '/api/v1/media/' + task.media_id : null };
    });
    return { generationId: row.request_key, projectId: row.project_id, episodeId: row.episode_id, shots };
  }
  app.get(studioRoute + '/:key', async request => {
    const row = studioRead.get(request.params.key);
    if (!row) throw new ApiError(404, 'generation_missing', '没有找到生成任务');
    return studioResult(row);
  });
  app.post(studioRoute, async request => {
    const { projectId, requestKey, episode } = request.body || {};
    services.repos.content.mustProject(projectId);
    if (typeof requestKey !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(requestKey) ||
        !Array.isArray(episode?.shots) || !episode.shots.length || episode.shots.length > 20) {
      throw new ApiError(400, 'invalid_generation', '请提供任务编号及 1–20 个镜头');
    }
    const inputHash = crypto.createHash('sha256').update(JSON.stringify(episode)).digest('hex');
    return transaction(studioDb, () => {
      const previous = studioRead.get(requestKey);
      if (previous) {
        if (previous.project_id !== projectId || previous.input_hash !== inputHash) {
          throw new ApiError(409, 'generation_conflict', '任务编号已被另一版分镜使用');
        }
        return studioResult(previous);
      }
      const result = services.repos.content.importStoryboard(projectId, {
        schemaVersion: 2, kind: 'storyboard', mode: 'commit', episodes: [episode],
      });
      const episodeId = result.episodes[0].id;
      const byKey = studioDb.prepare('SELECT id FROM shots WHERE episode_id=? AND external_key=? AND deleted_at IS NULL');
      const shots = episode.shots.map((shot, index) => {
        const { id: shotId } = byKey.get(episodeId, shot.key);
        const task = queue.enqueue(shotId, `studio-${requestKey}-${index}`, { postProductionSubtitles: true });
        return { key: shot.key, shotId, taskId: task.id };
      });
      studioDb.prepare('INSERT INTO studio_video_generations VALUES (?,?,?,?,?)')
        .run(requestKey, projectId, episodeId, inputHash, JSON.stringify(shots));
      return studioResult(studioRead.get(requestKey));
    });
  });
  app.post(prefix+'/tasks/:id/cancel',async request=>queue.cancel(request.params.id));
  app.post(prefix+'/tasks/:id/resume',async request=>{
    if(request.doubaoDevice) throw new ApiError(403,'admin_required','仅管理员可恢复任务');
    return queue.resume(request.params.id);
  });
  app.post(prefix + '/claim', async request => queue.claim(request.body?.workerId, request.body?.accounts));
  app.post(prefix + '/account-report', async request => {
    if (!request.doubaoDevice) throw new ApiError(403,'device_required','账号名单仅接受设备凭据上报');
    return queue.reportAccounts(request.doubaoDevice.id,request.body?.labels);
  });
  app.post(prefix + '/usage-seed', async request => {
    if (request.doubaoDevice) throw new ApiError(403, 'admin_required', '仅管理员可调整账号已用额度');
    return queue.seedManualUsage(request.body || {});
  });
  app.post(prefix + '/tasks/:id/state', async request => {
    const {workerId,state,note}=request.body || {};
    if(state==='account_missing' && (!request.doubaoDevice || request.doubaoDevice.id!==workerId))
      throw new ApiError(403,'device_required','仅领取任务的执行器可上报账号缺失');
    return queue.update(request.params.id,workerId,state,note);
  });
  app.post(prefix + '/tasks/:id/progress', async request => queue.progress(request.params.id,request.body?.workerId,request.body));
  app.post(prefix + '/tasks/:id/video', async request => {
    const file = await request.file({limits:{fileSize:500*1024*1024, files:1}});
    if (!file) throw new ApiError(400, 'file_required', '请上传视频');
    const bytes = await file.toBuffer();
    if (file.file.truncated) throw new ApiError(413, 'file_too_large', '视频超过500MB');
    return queue.upload(request.params.id, String(request.headers['x-doubao-worker'] || ''), bytes);
  });
  return queue;
}
function issueDevice(services,label) {
  const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('base64url');
  services.db.prepare('INSERT INTO doubao_local_devices(id,token_hash,label,created_at) VALUES(?,?,?,?)')
    .run(id,crypto.createHash('sha256').update(token).digest('hex'),label.slice(0,100),new Date().toISOString());
  return {id,token};
}
function authenticateDevice(services,request) {
  const token=request.headers['x-doubao-device'];
  if(!token) return false;
  const device=services.db.prepare('SELECT id FROM doubao_local_devices WHERE token_hash=? AND revoked_at IS NULL')
    .get(crypto.createHash('sha256').update(String(token)).digest('hex'));
  if(!device) throw new ApiError(401,'invalid_device','本地执行器凭据无效');
  const endpoint=request.url.split('?')[0];
  const allowed=(request.method==='POST'&&['/api/v1/doubao-local/claim','/api/v1/doubao-local/account-report'].includes(endpoint)) ||
    (request.method==='GET'&&/^\/api\/v1\/doubao-local\/tasks\/[^/]+(?:\/references\/[1-9])?$/.test(endpoint)) ||
    (request.method==='POST'&&/^\/api\/v1\/doubao-local\/tasks\/[^/]+\/(state|video|progress)$/.test(endpoint));
  if(!allowed) throw new ApiError(403,'device_scope','本地执行器无此操作权限');
  request.doubaoDevice=device;
  // This marker reaches only the allowlisted worker routes above.
  request.appUser={id:device.id,role:'admin'};
  return true;
}
function freezeReferences(services,shot) {
  const {db}=services;
  const {uniqueAssetReferences,findMentions,freezePrompt}=require('./references.cjs');
  const assets=uniqueAssetReferences(db.prepare(`SELECT r.asset_id,a.id AS resolved_id,a.name,a.type,a.deleted_at,
    v.id AS version_id,v.media_id,m.sha256,m.mime FROM shot_references r
    LEFT JOIN assets a ON a.id=r.asset_id LEFT JOIN asset_versions v ON v.id=a.locked_version_id
    LEFT JOIN media m ON m.id=v.media_id AND m.project_id=a.project_id
    WHERE r.shot_id=? ORDER BY r.position,r.asset_id`).all(shot.id));
  if(assets.some(a=>a.type==="音色"&&!a.deleted_at)) throw new ApiError(422,"unsupported_audio_reference","本地豆包暂不支持音色资产，请选择 Seedance API 渠道");
  const missing=assets.find(a=>!a.resolved_id||a.deleted_at||!a.media_id||!a.sha256||!a.mime?.startsWith('image/'));
  if(missing) throw new ApiError(422,'reference_not_ready',`资产“${missing.name||missing.asset_id}”缺少固定参考图`);
  findMentions(shot.prompt,assets.map(a=>({id:a.asset_id,name:a.name})));
  const references=[],slots=[];
  for(const asset of assets) {
    let ref=references.find(r=>r.sha256===asset.sha256);
    if(!ref) {ref={index:references.length+1,mediaId:asset.media_id,sha256:asset.sha256,mime:asset.mime,assets:[]};references.push(ref);}
    ref.assets.push({assetId:asset.asset_id,versionId:asset.version_id,name:asset.name});slots.push(ref.index);
  }
  if(references.length>9) throw new ApiError(422,'too_many_references','本地豆包最多支持9张去重后的参考图');
  const prompt=freezePrompt(shot.prompt,assets.map(a=>a.name)).promptSubmitted.replace(/参考图(\d+)/g,(_,index)=>'图'+slots[Number(index)-1]);
  if(prompt.includes('@')) throw new ApiError(422,'unresolved_reference','提示词包含未匹配的资产引用，请核对分镜参考资产');
  return {prompt,references};
}
module.exports = {
  createDoubaoQueue,
  registerDoubaoLocal,
  issueDevice,
  authenticateDevice,
  freezeReferences,
  selectNextAssignment,
  standardSlotsForUsage,
};
