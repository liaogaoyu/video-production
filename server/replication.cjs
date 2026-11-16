const { randomUUID, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs');
const { ApiError } = require('./errors.cjs');
const { transaction } = require('./db.cjs');
const { findMentions } = require('./references.cjs');

const workerRoot = '/api/v1/replication-worker';
const adminRoot = '/api/v1/projects/:id/replications';
const leaseMs = 15 * 60_000;

function authenticateReplicationWorker(request) {
  if (!request.url.startsWith(workerRoot + '/')) return false;
  const expected = Buffer.from(process.env.STORYDOCK_CODEX_WORKER_TOKEN || '');
  const supplied = Buffer.from(String(request.headers.authorization || '').replace(/^Bearer /, ''));
  if (expected.length < 32 || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new ApiError(401, 'worker_auth', 'Codex 执行器凭据无效');
  }
  return true;
}

function registerReplication(app, { db, repos, media }) {
  db.exec(`CREATE TABLE IF NOT EXISTS replication_tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    url TEXT NOT NULL,
    requirements TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'waiting_source',
    source_id TEXT REFERENCES media(id),
    result TEXT,
    error TEXT NOT NULL DEFAULT '',
    lease TEXT,
    lease_until INTEGER,
    episode_id TEXT,
    created_at TEXT NOT NULL
  )`);
  const read = db.prepare('SELECT * FROM replication_tasks WHERE id=?');
  const present = ({ lease, lease_until, result, ...task }) => ({ ...task, result: result ? JSON.parse(result) : null });
  function get(request) {
    const task = read.get(request.params.taskId);
    if (!task || task.project_id !== request.params.id) throw new ApiError(404, 'task_missing', '复刻任务不存在');
    repos.content.mustProject(task.project_id);
    return task;
  }
  function text(value, label, limit) {
    if (typeof value !== 'string' || value.trim().length > limit) {
      throw new ApiError(400, 'invalid_input', label + '格式无效或过长');
    }
    return value.trim();
  }
  app.get(adminRoot, async request => {
    repos.content.mustProject(request.params.id);
    return { tasks: db.prepare('SELECT * FROM replication_tasks WHERE project_id=? ORDER BY created_at DESC,id DESC LIMIT 100')
      .all(request.params.id).map(present) };
  });
  app.post(adminRoot, async request => {
    const project = repos.content.mustProject(request.params.id);
    const input = text(request.body?.url ?? '', '链接', 2048);
    const requirements = text(request.body?.requirements ?? '', '复刻要求', 4000);
    let url;
    try { url = new URL(input); } catch { throw new ApiError(400, 'invalid_url', '请输入完整的视频号分享链接'); }
    if (url.protocol !== 'https:' || url.username || url.password || !(url.hostname === 'weixin.qq.com' || url.hostname.endsWith('.weixin.qq.com'))) {
      throw new ApiError(400, 'invalid_url', '请粘贴微信视频号的 HTTPS 分享链接');
    }
    const id = randomUUID();
    db.prepare('INSERT INTO replication_tasks (id,project_id,url,requirements,created_at) VALUES (?,?,?,?,?)')
      .run(id, project.id, url.href, requirements, new Date().toISOString());
    return present(read.get(id));
  });
  app.post(adminRoot + '/:taskId/source', async request => {
    const task = get(request);
    if (task.status !== 'waiting_source') throw new ApiError(409, 'invalid_state', '这条任务已有参考片');
    const file = await request.file({ limits: { fileSize: 120_000_000, files: 1 } });
    if (!file) throw new ApiError(400, 'file_required', '请选择参考视频');
    const source = await repos.content.saveMedia({ projectId: task.project_id, bytes: await file.toBuffer(), source: 'replication-reference', video: true });
    const changed = db.prepare("UPDATE replication_tasks SET status='queued',source_id=? WHERE id=? AND status='waiting_source'")
      .run(source.id, task.id);
    if (!changed.changes) throw new ApiError(409, 'invalid_state', '已有参考片先上传完成');
    return present(read.get(task.id));
  });
  app.post(adminRoot + '/:taskId/pause', async request => {
    const task = get(request);
    const changed = db.prepare("UPDATE replication_tasks SET status='paused',lease=NULL,lease_until=NULL WHERE id=? AND status IN ('queued','planning')").run(task.id);
    if (!changed.changes) throw new ApiError(409, 'invalid_state', '当前阶段已经结束');
    return present(read.get(task.id));
  });
  app.post(adminRoot + '/:taskId/revise', async request => {
    const task = get(request);
    const note = text(request.body?.note ?? '', '修改意见', 4000);
    const changed = db.prepare(`UPDATE replication_tasks SET note=?,error='',lease=NULL,lease_until=NULL,
      status=CASE WHEN source_id IS NULL THEN 'waiting_source' ELSE 'queued' END WHERE id=? AND episode_id IS NULL`)
      .run(note, task.id);
    if (!changed.changes) throw new ApiError(409, 'invalid_state', '分镜已写入，请在分镜故事板修改');
    return present(read.get(task.id));
  });
  app.post(adminRoot + '/:taskId/import', async request => transaction(db, () => {
    const task = get(request);
    if (task.episode_id) return present(task);
    if (task.status !== 'planned') throw new ApiError(409, 'invalid_state', '请先完成当前版本的分镜规划');
    const plan = JSON.parse(task.result);
    const imported = repos.content.importStoryboard(task.project_id, {
      schemaVersion: 2, kind: 'storyboard', mode: 'commit',
      episodes: [{ key: task.id, title: plan.title, shots: plan.shots.map((shot, index) => ({ ...shot, key: task.id + '-' + index })) }],
    });
    db.prepare("UPDATE replication_tasks SET status='imported',episode_id=? WHERE id=?")
      .run(imported.episodes[0].id, task.id);
    return present(read.get(task.id));
  }));
  app.post(workerRoot + '/claim', async () => transaction(db, () => {
    const task = db.prepare(`SELECT t.* FROM replication_tasks t JOIN projects p ON p.id=t.project_id
      WHERE p.deleted_at IS NULL AND (t.status='queued' OR (t.status='planning' AND t.lease_until<?))
      ORDER BY t.created_at,t.id LIMIT 1`).get(Date.now());
    if (!task) return { task: null };
    const lease = randomUUID();
    db.prepare("UPDATE replication_tasks SET status='planning',lease=?,lease_until=? WHERE id=?")
      .run(lease, Date.now()+leaseMs, task.id);
    const assets = repos.content.liveAssets(task.project_id).map(asset => ({ name: asset.name, type: asset.type }));
    return { task: { ...present(task), lease, assets } };
  }));
  function leased(request, lease) {
    const task = read.get(request.params.taskId);
    if (!task || task.status !== 'planning' || task.lease !== lease || task.lease_until < Date.now()) {
      throw new ApiError(409, 'lease_expired', '该版本已暂停、修改或被重新领取');
    }
    return task;
  }
  app.get(workerRoot + '/:taskId/source', async (request, reply) => {
    const task = leased(request, request.headers['x-task-lease']);
    const row = db.prepare('SELECT storage_key,mime FROM media WHERE id=? AND project_id=?').get(task.source_id, task.project_id);
    if (!row) throw new ApiError(404, 'source_missing', '参考片不存在');
    return reply.type(row.mime).send(fs.createReadStream(await media.ensureLocal(row.storage_key)));
  });
  app.post(workerRoot + '/:taskId/result', async request => {
    const task = leased(request, request.body?.lease);
    const plan = request.body?.plan;
    const valid = typeof plan?.title === 'string' && plan.title.trim() && plan.title.length <= 80 &&
      typeof plan?.summary === 'string' && plan.summary.length <= 4000 &&
      Array.isArray(plan.shots) && plan.shots.length > 0 && plan.shots.length <= 20 &&
      plan.shots.every(shot => typeof shot?.title === 'string' && shot.title.trim() && shot.title.length <= 80 &&
        typeof shot.prompt === 'string' && shot.prompt.trim() && shot.prompt.length <= 20000 &&
        Number.isInteger(shot.duration) && shot.duration >= 4 && shot.duration <= 15);
    if (plan && !valid) throw new ApiError(400, 'invalid_plan', '分镜结果格式无效');
    const transcript = plan ? text(request.body?.transcript ?? '', '参考片转写', 15000) : '';
    const assets = plan ? repos.content.liveAssets(task.project_id).map(asset => ({ id: asset.id, name: asset.name, externalKey: asset.external_key })) : [];
    const matched = plan ? [...new Set(plan.shots.flatMap(shot => findMentions(shot.prompt, assets).map(asset => asset.name)))] : [];
    const error = plan ? '' : text(request.body?.error ?? 'Codex 规划失败', '异常信息', 1000);
    db.prepare(`UPDATE replication_tasks SET status=?,result=COALESCE(?,result),error=?,lease=NULL,lease_until=NULL WHERE id=?`)
      .run(plan ? 'planned' : 'failed', plan ? JSON.stringify({ ...plan, transcript, assets: matched }) : null, error, task.id);
    return { ok: true };
  });
}

module.exports = { registerReplication, authenticateReplicationWorker };
