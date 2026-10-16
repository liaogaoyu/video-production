const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const ACCOUNT_RE = /^[a-f0-9-]{36}$/;

function createJimengCliPool({ directory, safeStorage, execFileImpl = execFile, image = 'lumenx-dreamina-eval:1.4.20', proxy = process.env.STORYDOCK_DREAMINA_PROXY || '' }) {
  const pending = new Map();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (proxy) {
    const parsed = new URL(proxy);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('即梦代理地址格式不正确');
  }

  function validateAccount(accountId) {
    if (!ACCOUNT_RE.test(accountId)) throw new Error('账号 ID 不正确');
  }
  function accountDirectory(accountId) {
    validateAccount(accountId);
    return path.join(directory, accountId);
  }
  async function ensureSecret(accountId) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密存储不可用');
    const folder = accountDirectory(accountId);
    await fsp.mkdir(folder, { recursive: true, mode: 0o700 });
    const encryptedPath = path.join(folder, 'keyring-password.enc');
    try { return safeStorage.decryptString(await fsp.readFile(encryptedPath)); }
    catch (error) {
      if (error?.code !== 'ENOENT') throw new Error('账号凭据无法解密');
      const password = crypto.randomBytes(32).toString('hex');
      await fsp.writeFile(encryptedPath, safeStorage.encryptString(password), { mode: 0o600 });
      return password;
    }
  }
  function execute(file, args, options = {}) {
    return new Promise((resolve) => execFileImpl(file, args, { timeout: 120000, maxBuffer: 2 * 1024 * 1024, ...options }, (error, stdout = '', stderr = '') => resolve({ code: error?.code ?? 0, stdout: String(stdout), stderr: String(stderr) })));
  }
  async function run(accountId, command) {
    const password = await ensureSecret(accountId);
    const runtime = await fsp.mkdtemp(path.join(os.tmpdir(), 'storydock-dreamina-'));
    const unlockFile = path.join(runtime, 'keyring-password');
    await fsp.writeFile(unlockFile, `${password}\n`, { mode: 0o600 });
    const slug = accountId.replaceAll('-', '');
    const args = ['run', '--rm', '--name', `storydock-dreamina-${slug.slice(0, 12)}-${crypto.randomBytes(3).toString('hex')}`, '--cap-drop=ALL', '--security-opt=no-new-privileges', '--memory=768m', '--cpus=1', '--mount', `type=volume,source=storydock-dreamina-${slug},target=/root`, '--mount', `type=bind,source=${unlockFile},target=/run/secrets/keyring_password,readonly`];
    if (proxy) args.push('--env', `HTTP_PROXY=${proxy}`, '--env', `HTTPS_PROXY=${proxy}`);
    args.push(image, ...command);
    try { return await execute('docker', args); }
    finally { await fsp.rm(runtime, { recursive: true, force: true }); }
  }
  function match(output, name) {
    return output.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim();
  }
  function publicResult(result) {
    const output = `${result.stdout}\n${result.stderr}`;
    const creditMatch = output.match(/"total_credit"\s*:\s*(\d+(?:\.\d+)?)|total_credit:\s*(\d+(?:\.\d+)?)/);
    const identity = output.match(/user_id:\s*([^\s]+)/)?.[1];
    return {
      ok: result.code === 0,
      authorized: /OAuth 登录成功|当前登录账户信息|"total_credit"/.test(output),
      permission: /没有 dreamina_cli 使用权限|仅限会员用户使用/.test(output) ? 'denied' : result.code === 0 ? 'allowed' : 'unknown',
      totalCredit: creditMatch ? Number(creditMatch[1] || creditMatch[2]) : undefined,
      identityHash: identity ? crypto.createHash('sha256').update(identity).digest('hex') : undefined,
      message: /仅限会员用户使用/.test(output) ? '已授权，但账号没有 CLI 会员权限' : result.code === 0 ? '官方 CLI 已授权' : /未检测到有效登录态/.test(output) ? '等待官方 CLI 授权' : '官方 CLI 检查失败'
    };
  }
  return {
    async runtimeStatus() {
      const result = await execute('docker', ['image', 'inspect', image, '--format', '{{.Id}}'], { timeout: 15000 });
      return { ok: result.code === 0, image, message: result.code === 0 ? '官方 CLI 运行环境已就绪' : '缺少即梦官方 CLI 容器镜像' };
    },
    async beginAuth(accountId) {
      const result = await run(accountId, ['login', '--headless']);
      const output = `${result.stdout}\n${result.stderr}`;
      const authorizationUrl = output.match(/https:\/\/jimeng\.jianying\.com\/ai-tool\/cli-auth\?[^\s]+/)?.[0];
      const deviceCode = match(output, 'device_code');
      if (!authorizationUrl || !deviceCode) throw new Error('官方 CLI 没有返回有效授权地址');
      pending.set(accountId, { deviceCode, expiresAt: Date.now() + 10 * 60 * 1000 });
      return { authorizationUrl, expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
    },
    async finishAuth(accountId) {
      validateAccount(accountId);
      const auth = pending.get(accountId);
      if (!auth || auth.expiresAt < Date.now()) throw new Error('授权已过期，请重新开始');
      const result = await run(accountId, ['login', 'checklogin', `--device_code=${auth.deviceCode}`, '--poll=20']);
      const parsed = publicResult(result);
      if (parsed.authorized) pending.delete(accountId);
      return parsed;
    },
    async inspect(accountId) {
      const result = await run(accountId, ['user_credit']);
      return publicResult(result);
    }
  };
}

module.exports = { createJimengCliPool };
