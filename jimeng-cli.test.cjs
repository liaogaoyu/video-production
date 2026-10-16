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
