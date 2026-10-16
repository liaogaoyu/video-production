const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createJimengCliPool } = require('./jimeng-cli.cjs');

function setup(outputs) {
  const calls = [];
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(`enc:${value}`), decryptString: value => value.toString().slice(4) };
  const execFileImpl = (file, args, options, callback) => { calls.push({ file, args }); const next = outputs.shift() || { stdout: '', stderr: '', code: 0 }; const error = next.code ? Object.assign(new Error('exit'), { code: next.code }) : null; callback(error, next.stdout, next.stderr); };
  const pool = createJimengCliPool({ directory: fs.mkdtempSync(path.join(os.tmpdir(), 'storydock-cli-')), safeStorage, execFileImpl });
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
  assert.deepEqual(calls[0].args.slice(0, 3), ['image', 'inspect', 'lumenx-dreamina-eval:1.4.20']);
  await assert.rejects(() => pool.inspect('../escape'), /ID/);
});

test('video submission stages ordered images and returns an accepted remote id', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storydock-video-'));
  const one = path.join(root, 'one.png');
  const two = path.join(root, 'two.jpg');
  fs.writeFileSync(one, 'one');
  fs.writeFileSync(two, 'two');
  const { pool, calls } = setup([{ stdout: 'submit_id: remote-123\ngen_status: querying\n' }]);
  const result = await pool.submitVideo('33333333-3333-3333-3333-333333333333', { jobId: 'job-1', prompt: '人物在场景中转身', images: [one, two], model: 'seedance2.0', ratio: '9:16', duration: 5, resolution: '720p' });
  assert.deepEqual(result, { kind: 'accepted', submitId: 'remote-123', status: 'querying' });
  const command = calls[0].args;
  assert.ok(command.indexOf('/work/input/01.png') < command.indexOf('/work/input/02.jpg'));
  assert.equal(command.includes('--model_version'), true);
  assert.equal(command.includes('seedance2.0'), true);
});

test('video preflight rejects invalid limits before starting Docker', async () => {
  const { pool, calls } = setup([]);
  await assert.rejects(() => pool.submitVideo('44444444-4444-4444-4444-444444444444', { jobId: 'job-2', prompt: 'p', images: [], model: 'seedance2.0', ratio: '9:16', duration: 5, resolution: '720p' }), /参考图数量/);
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
