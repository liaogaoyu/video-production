const crypto = require('node:crypto');
const { ApiError } = require('./errors.cjs');
const { transaction } = require('./db.cjs');
const { inspectMp4 } = require('./video-export.cjs');
const DAILY_QUOTA_PER_ACCOUNT = 2;
const phases = new Set(['claimed','switching_account','opening_canvas','fetching_references','writing_prompt',
  'uploading_references','setting_parameters','prepared','checking_submission','submitting','generating','downloading','uploading',
  'cancelling','retrying','needs_attention','resume_requested']);

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
  CREATE UNIQUE INDEX IF NOT EXISTS doubao_one_desktop_task
    ON doubao_local_tasks((1)) WHERE state NOT IN ('queued','succeeded','cancelled','failed');
  CREATE TABLE IF NOT EXISTS doubao_local_usage_seed (
    quota_key TEXT NOT NULL, quota_day TEXT NOT NULL, used INTEGER NOT NULL,
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
  if(!db.prepare("SELECT sql FROM sqlite_master WHERE name='doubao_one_desktop_task'").get().sql.includes("'failed'")) {
    transaction(db,()=>db.exec("DROP INDEX doubao_one_desktop_task; CREATE UNIQUE INDEX doubao_one_desktop_task ON doubao_local_tasks((1)) WHERE state NOT IN ('queued','succeeded','cancelled','failed');"));
  }
  const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
  const get = id => db.prepare('SELECT * FROM doubao_local_tasks WHERE id=?').get(id);
  const seedUsed = (key, date) => db.prepare('SELECT used FROM doubao_local_usage_seed WHERE quota_key=? AND quota_day=?').get(key,date)?.used || 0;
  function remaining(key, date, excludeId = '') {
    // The worker records this note only after verifying the rejection on the task's own canvas.
    const used=db.prepare(`SELECT COUNT(*) AS used FROM doubao_local_tasks
      WHERE quota_key=? AND quota_day=? AND id<>? AND state NOT IN ('queued','cancelled')
        AND NOT (state='failed' AND note=?)`).get(key,date,excludeId,'豆包审核不通过，生成已停止').used;
    return Math.max(0,DAILY_QUOTA_PER_ACCOUNT-used-seedUsed(key,date));
  }
  function queueQuota(queued) {
    const keys=db.prepare(`SELECT DISTINCT entries.value AS quota_key FROM doubao_local_account_pools pools
      LEFT JOIN doubao_local_devices devices ON devices.id=pools.worker_id
      JOIN json_each(pools.quota_keys_json) entries WHERE devices.revoked_at IS NULL`).all();
    if(!keys.length) return null;
    const today=day();
    const capacity=keys.reduce((total,{quota_key})=>total+remaining(quota_key,today),0);
    return {available:Math.max(0,capacity-queued),total:keys.length*DAILY_QUOTA_PER_ACCOUNT};
  }
  function checkQueueQuota() {
    const queued=db.prepare("SELECT COUNT(*) AS count FROM doubao_local_tasks WHERE state='queued'").get().count;
    if(queueQuota(queued)?.available===0)
      throw new ApiError(409,'daily_limit','本地豆包今日额度已用完，任务未入队');
  }
  function enqueue(shotId, requestKey) {
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
      checkQueueQuota();
      const binding=freezeReferences(services,shot);
      const id = crypto.randomUUID(), now = new Date().toISOString();
      db.prepare(`INSERT INTO doubao_local_tasks(id,shot_id,project_id,prompt,request_key,created_at,updated_at,references_json,prompt_original,duration,ratio,model)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, shotId, shot.project_id, binding.prompt, requestKey, now, now,JSON.stringify(binding.references),shot.prompt,shot.duration,ratio,'Seedance 2.0 Fast');
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
      if(account.usedToday!==undefined && (!Number.isInteger(account.usedToday)||account.usedToday<0||account.usedToday>2||!/^\d{4}-\d{2}-\d{2}$/.test(account.usageDate || '')))
        throw new ApiError(400,'invalid_usage','初始使用次数需要日期和0至2的次数');
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
        if(account.usedToday!==undefined && account.usageDate===today) db.prepare(`INSERT INTO doubao_local_usage_seed VALUES(?,?,?)
          ON CONFLICT(quota_key,quota_day) DO UPDATE SET used=MAX(used,excluded.used)`)
          .run(account.quotaKey,today,account.usedToday);
      }
      const active = db.prepare("SELECT * FROM doubao_local_tasks WHERE state NOT IN ('queued','succeeded','cancelled','failed')").get();
      const now=new Date().toISOString();
      db.prepare(`INSERT INTO doubao_local_worker_status(worker_id,seen_at) VALUES(?,?)
        ON CONFLICT(worker_id) DO UPDATE SET seen_at=excluded.seen_at`).run(workerId,now);
      // A lost heartbeat never releases a desktop/account lock.
      if (active) return { task: active.worker_id === workerId ? active : null, reason: 'desktop_locked' };
      const available = eligible.find(account => remaining(account.quotaKey,today)>0);
      if (!available) return { task: null, reason: 'daily_limit' };
      const task = db.prepare("SELECT * FROM doubao_local_tasks WHERE state='queued' ORDER BY created_at,rowid LIMIT 1").get();
      if (!task) return { task: null, reason: 'empty' };
      db.prepare(`UPDATE doubao_local_tasks SET state='claimed',worker_id=?,account_label=?,quota_key=?,quota_day=?,updated_at=? WHERE id=?`)
        .run(workerId, available.label, available.quotaKey, today, now, task.id);
      return { task: get(task.id) };
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
    const fields=`t.id,t.shot_id,t.state,t.note,t.account_label,t.created_at,t.updated_at,
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
    return {active,waiting,recent,account_reports,quota:queueQuota(waiting.length),
      worker:{seen_at,online:!!seen_at&&Date.now()-Date.parse(seen_at)<60000}};
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
      if (state !== task.state && !transitions[task.state]?.includes(state))
        throw new ApiError(409, 'invalid_transition', '任务状态不允许此操作');
      if (state === 'submitting' && task.state !== 'submitting') {
        const today=day();
        if(!remaining(task.quota_key,today,id)) throw new ApiError(409,'daily_limit','该账号今日额度已用完，保留任务供核对');
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
  return { enqueue, claim, update, upload, get, cancel, resume, progress, reportAccounts, overview, list: () => db.prepare('SELECT * FROM doubao_local_tasks ORDER BY created_at DESC,rowid DESC LIMIT 200').all() };
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
  app.post(prefix + '/tasks/:id/state', async request => queue.update(request.params.id, request.body?.workerId, request.body?.state, request.body?.note));
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
  const assets=uniqueAssetReferences(db.prepare(`SELECT r.asset_id,a.id AS resolved_id,a.name,a.deleted_at,
    v.id AS version_id,v.media_id,m.sha256,m.mime FROM shot_references r
    LEFT JOIN assets a ON a.id=r.asset_id LEFT JOIN asset_versions v ON v.id=a.locked_version_id
    LEFT JOIN media m ON m.id=v.media_id AND m.project_id=a.project_id
    WHERE r.shot_id=? ORDER BY r.position,r.asset_id`).all(shot.id));
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
module.exports = { createDoubaoQueue, registerDoubaoLocal, issueDevice, authenticateDevice, freezeReferences };
