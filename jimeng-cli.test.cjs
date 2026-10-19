const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bindPromptReferences, createJimengCliPool } = require('./jimeng-cli.cjs');

function setup(outputs, options = {}) {
  const calls = [];
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(`enc:${value}`), decryptString: value => value.toString().slice(4) };
  const execFileImpl = (file, args, execOptions, callback) => { calls.push({ file, args }); const next = outputs.shift() || { stdout: '', stderr: '', code: 0 }; const error = next.code ? Object.assign(new Error(next.errorMessage || 'exit'), { code: next.code }) : null; callback(error, next.stdout, next.stderr); };
  const pool = createJimengCliPool({ directory: fs.mkdtempSync(path.join(os.tmpdir(), 'storydock-cli-')), safeStorage, execFileImpl, ...options });
  return { pool, calls };
}

test('official CLI auth material stays private and account volumes are isolated', async () => {
  const url = 'https://jimeng.jianying.com/ai-tool/cli-auth?verification_uri=https%3A%2F%2Fjimeng.jianying.com%2Fpassport%2Fopen%2Fscan_user_code%2F%3Fuser_code%3Dabc';
  const { pool, calls } = setup([{ stdout: `verification_uri: ${url}\ndevice_code: secret-device\n` }, { stdout: 'OAuth 登录成功。\ntotal_credit: 120\nuser_id: account-b\n', code: 0 }]);
  const id = '11111111-1111-1111-1111-111111111111';
  const begun = await pool.beginAuth(id);
  assert.equal(begun.authorizationUrl, url);
  assert.equal(JSON.stringify(begun).includes('secret-device'), false);
  const finished = await pool.finishAuth(id);
  assert.equal(finished.totalCredit, 120);
  assert.equal(finished.identityHash.length, 64);
  assert.match(calls[0].args.join(' '), /storydock-dreamina-11111111111111111111111111111111/);
  assert.equal(calls[0].args.join(' ').includes('secret-device'), false);
  assert.equal(calls[1].args.join(' ').includes('secret-device'), true);
});

test('OAuth success and CLI membership permission are separate states', async () => {
  const url = 'https://jimeng.jianying.com/ai-tool/cli-auth?verification_uri=x';
  const { pool } = setup([{ stdout: `verification_uri: ${url}\ndevice_code: private\n` }, { stdout: 'OAuth 登录成功。\n登录成功，但当前账号没有 dreamina_cli 使用权限: 仅限会员用户使用\ntotal_credit: 160\nuser_id: same-account\n', code: 1 }]);
  const id = '22222222-2222-2222-2222-222222222222';
  await pool.beginAuth(id);
  const result = await pool.finishAuth(id);
  assert.equal(result.authorized, true);
  assert.equal(result.permission, 'denied');
  assert.equal(result.ok, false);
});

test('runtime status uses the pinned image and invalid IDs never reach Docker', async () => {
  const { pool, calls } = setup([{ stdout: 'sha256:test' }]);
  assert.equal((await pool.runtimeStatus()).ok, true);
  assert.deepEqual(calls[0].args.slice(0, 3), ['image', 'inspect', 'lumenx-dreamina-eval:1.4.21']);
  await assert.rejects(() => pool.inspect('../escape'), /ID/);
});

test('auth reports missing Docker instead of a misleading authorization URL error', async () => {
  const { pool } = setup([{ code: 'ENOENT', errorMessage: 'spawn docker ENOENT' }]);
  await assert.rejects(() => pool.beginAuth('77777777-7777-7777-7777-777777777777'), /Docker Desktop 未安装/);
});

test('auth tells the user to install the CLI runtime when the image is missing', async () => {
  const { pool } = setup([{ code: 125, stderr: 'Unable to find image locally\ndocker: pull access denied for lumenx-dreamina-eval' }]);
  await assert.rejects(() => pool.beginAuth('88888888-8888-8888-8888-888888888888'), /安装.*CLI 运行环境/);
});

test('video submission stages ordered images and returns an accepted remote id', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storydock-video-'));
  const one = path.join(root, 'one.png');
  const two = path.join(root, 'two.jpg');
  fs.writeFileSync(one, 'one');
  fs.writeFileSync(two, 'two');
  const { pool, calls } = setup([{ stdout: 'submit_id: remote-123\ngen_status: querying\n' }]);
  const result = await pool.submitVideo('33333333-3333-3333-3333-333333333333', { jobId: 'job-1', prompt: '场景：@兜率宫·大殿内。@银童子 在场景中转身，再看向 @银童子。', images: [one, two], referenceNames: ['兜率宫·大殿内', '银童子'], model: 'seedance2.0', ratio: '9:16', duration: 5, resolution: '720p' });
  assert.equal(result.kind, 'accepted');
  assert.equal(result.submitId, 'remote-123');
  assert.equal(result.status, 'querying');
  const command = calls[0].args;
  assert.ok(command.indexOf('/work/input/01.png') < command.indexOf('/work/input/02.jpg'));
  assert.equal(command.includes('--model_version'), true);
  assert.equal(command.includes('seedance2.0'), true);
  const submittedPrompt = command[command.indexOf('--prompt') + 1];
  assert.equal(submittedPrompt.includes('@兜率宫·大殿内'), false);
  assert.equal(submittedPrompt.includes('@银童子'), false);
  assert.match(submittedPrompt, /参考图1对应资产“兜率宫·大殿内”/);
  assert.match(submittedPrompt, /参考图2对应资产“银童子”/);
  assert.match(submittedPrompt, /场景：参考图1。参考图2 在场景中转身，再看向 参考图2。/);
  assert.deepEqual(result.referenceBindings, [
    { name: '兜率宫·大殿内', imageNumber: 1 },
    { name: '银童子', imageNumber: 2 },
  ]);
});

test('overlapping asset names bind the longer token', () => {
  const bound = bindPromptReferences('@少年·外勤装 看向 @少年', ['少年', '少年·外勤装']);
  assert.match(bound, /参考图1对应资产“少年”/);
  assert.match(bound, /参考图2对应资产“少年·外勤装”/);
  assert.match(bound, /参考图2 看向 参考图1/);
  assert.equal(bound.includes('@'), false);
});

test('prompt binding keeps the CLI image order as the semantic reference order', () => {
  assert.equal(
    bindPromptReferences('@角色甲 拿起 @道具乙', ['角色甲', '道具乙']),
    '参考图对应关系：参考图1对应资产“角色甲”；参考图2对应资产“道具乙”。\n参考图1 拿起 参考图2',
  );
});

test('video preflight rejects invalid limits before starting Docker', async () => {
  const { pool, calls } = setup([]);
  await assert.rejects(() => pool.submitVideo('44444444-4444-4444-4444-444444444444', { jobId: 'job-2', prompt: 'p', images: [], referenceNames: [], model: 'seedance2.0', ratio: '9:16', duration: 5, resolution: '720p' }), /参考图数量/);
  assert.equal(calls.length, 0);
});

test('video query distinguishes running, success and terminal failure', async () => {
  const { pool } = setup([
    { stdout: 'submit_id: remote-456\ngen_status: querying\n' },
    { stdout: 'submit_id: remote-456\ngen_status: success\n' },
    { stdout: 'submit_id: remote-456\ngen_status: fail\nfail_reason: 内容校验失败\n', code: 1 },
  ]);
  const account = '55555555-5555-5555-5555-555555555555';
  assert.equal((await pool.queryVideo(account, 'remote-456')).kind, 'accepted');
  assert.equal((await pool.queryVideo(account, 'remote-456')).kind, 'succeeded');
  const failed = await pool.queryVideo(account, 'remote-456');
  assert.equal(failed.kind, 'failed');
  assert.match(failed.message, /内容校验失败/);
});

test('escaped resource upload failure keeps the complete official CLI reason', async () => {
  const { pool } = setup([{
    stdout: '{"gen_status":"fail","fail_reason":"upload resource \\\"/work/input/04.png\\\": request timeout"}\n',
    code: 1,
  }]);
  const result = await pool.queryVideo('55555555-5555-5555-5555-555555555555', 'remote-upload');
  assert.equal(result.kind, 'failed');
  assert.equal(result.code, 'resource_upload_failed');
  assert.equal(result.message, 'upload resource "/work/input/04.png": request timeout');
});

test('queued JSON result stays accepted and reports the official wait', async () => {
  const { pool } = setup([{ stdout: '{"submit_id":"f4eb3670-84d5-4f26-9303-d685680141d0","gen_status":"querying","queue_info":{"queue_idx":3559,"queue_status":"Queueing"},"estimated_remaining_seconds":29028}\n' }]);
  const result = await pool.queryVideo('66666666-6666-6666-6666-666666666666', 'f4eb3670-84d5-4f26-9303-d685680141d0');
  assert.equal(result.kind, 'accepted');
  assert.equal(result.status, 'querying');
  assert.match(result.message, /前面约 3559 个/);
  assert.match(result.message, /8 小时/);
});

test('first-use compliance failure is not shown as a raw API error', async () => {
  const { pool } = setup([{ stdout: 'submit_id: remote-789\ngen_status: fail\nfail_reason: api error: ret=4010, message=AigcComplianceConfirmationRequired, aigc compliance confirmation required\n', code: 1 }]);
  const result = await pool.queryVideo('66666666-6666-6666-6666-666666666666', 'remote-789');
  assert.equal(result.kind, 'blocked');
  assert.equal(result.code, 'web_confirmation_required');
  assert.match(result.message, /首次使用确认/);
});
