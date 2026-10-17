const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const ACCOUNT_RE = /^[a-f0-9-]{36}$/;

function bindPromptReferences(prompt, referenceNames) {
  if (!Array.isArray(referenceNames) || !referenceNames.length) return prompt.trim();
  const bindings = referenceNames.map((name, index) => ({
    name: String(name).trim(),
    label: `参考图${index + 1}`,
  }));
  let boundPrompt = prompt.trim();
  for (const binding of bindings) {
    boundPrompt = boundPrompt.split(`@${binding.name}`).join(binding.label);
  }
  const legend = bindings
    .map((binding) => `${binding.label}对应资产“${binding.name}”`)
    .join('；');
  return `参考图对应关系：${legend}。\n${boundPrompt}`;
}

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
  async function run(accountId, command, mounts = [], timeout = 120000) {
    const password = await ensureSecret(accountId);
    const runtime = await fsp.mkdtemp(path.join(os.tmpdir(), 'storydock-dreamina-'));
    const unlockFile = path.join(runtime, 'keyring-password');
    await fsp.writeFile(unlockFile, `${password}\n`, { mode: 0o600 });
    const slug = accountId.replaceAll('-', '');
    const args = ['run', '--rm', '--name', `storydock-dreamina-${slug.slice(0, 12)}-${crypto.randomBytes(3).toString('hex')}`, '--cap-drop=ALL', '--security-opt=no-new-privileges', '--memory=768m', '--cpus=1', '--mount', `type=volume,source=storydock-dreamina-${slug},target=/root`, '--mount', `type=bind,source=${unlockFile},target=/run/secrets/keyring_password,readonly`];
    for (const mount of mounts) args.push('--mount', `type=bind,source=${mount.source},target=${mount.target}${mount.readonly ? ',readonly' : ''}`);
    if (proxy) args.push('--env', `HTTP_PROXY=${proxy}`, '--env', `HTTPS_PROXY=${proxy}`);
    args.push(image, ...command);
    try { return await execute('docker', args, { timeout }); }
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
  function taskResult(result) {
    const output = `${result.stdout}\n${result.stderr}`;
    const submitId = output.match(/"submit_id"\s*:\s*"([a-zA-Z0-9-]+)"|submit_id:\s*([a-zA-Z0-9-]+)/)?.slice(1).find(Boolean);
    const status = output.match(/"gen_status"\s*:\s*"([a-zA-Z_]+)"|gen_status:\s*([a-zA-Z_]+)/)?.slice(1).find(Boolean);
    const encodedReason = output.match(/"fail_reason"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1];
    let reason = output.match(/fail_reason:\s*(.+)/)?.[1];
    if (encodedReason !== undefined) {
      try { reason = JSON.parse(`"${encodedReason}"`); }
      catch { reason = encodedReason; }
    }
    const queueIndex = output.match(/"queue_idx"\s*:\s*(\d+)/)?.[1];
    const remainingSeconds = Number(output.match(/"estimated_remaining_seconds"\s*:\s*(\d+)/)?.[1]);
    const queueNote = [
      queueIndex ? `前面约 ${queueIndex} 个` : "",
      Number.isFinite(remainingSeconds) && remainingSeconds > 0
        ? remainingSeconds >= 3600
          ? `预计还需约 ${Math.round(remainingSeconds / 3600)} 小时`
          : `预计还需约 ${Math.max(1, Math.round(remainingSeconds / 60))} 分钟`
        : "",
    ].filter(Boolean).join("，");
    if (submitId && (!status || status === 'querying')) return { kind: 'accepted', submitId, status: status || 'querying', message: queueNote };
    if (status === 'success') return { kind: 'succeeded', submitId };
    if (/AigcComplianceConfirmationRequired/.test(output)) return { kind: 'blocked', code: 'web_confirmation_required', submitId, message: '请先用这个即梦账号在网页里打开 Seedance，完成首次使用确认后再提交' };
    if (/没有 dreamina_cli 使用权限|仅限会员用户使用/.test(output)) return { kind: 'blocked', code: 'permission_denied', submitId, message: '账号没有官方 CLI 生成权限' };
    if (status === 'fail') return { kind: 'failed', code: /upload resource/i.test(reason || '') ? 'resource_upload_failed' : undefined, submitId, message: String(reason || '即梦生成失败').slice(0, 500) };
    return { kind: result.code === 0 ? 'unrecognized' : 'rejected', message: '无法识别官方 CLI 返回结果' };
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
    },
    async submitVideo(accountId, request) {
      validateAccount(accountId);
      if (!request || !/^[a-z0-9_-]{1,80}$/i.test(request.jobId) || typeof request.prompt !== 'string' || !request.prompt.trim() || request.prompt.length > 20000) throw new Error('视频任务格式不正确');
      const models = new Set(['seedance2.0', 'seedance2.0fast', 'seedance2.0_vip', 'seedance2.0fast_vip', 'seedance2.0mini', 'seedance2.5']);
      const ratios = new Set(['1:1', '3:4', '16:9', '4:3', '9:16', '21:9']);
      if (!models.has(request.model) || !ratios.has(request.ratio) || !Number.isInteger(request.duration) || request.duration < 4 || request.duration > (request.model === 'seedance2.5' ? 30 : 15)) throw new Error('视频模型、画幅或时长不受支持');
      const allowedResolutions = request.model === 'seedance2.5' ? ['480p', '720p', '1080p'] : request.model === 'seedance2.0_vip' ? ['720p', '1080p', '4k'] : ['720p'];
      if (!allowedResolutions.includes(request.resolution)) throw new Error('该模型不支持所选分辨率');
      if (!Array.isArray(request.images) || request.images.length < 1 || request.images.length > (request.model === 'seedance2.5' ? 30 : 9)) throw new Error('参考图数量不受支持');
      if (!Array.isArray(request.referenceNames) || request.referenceNames.length !== request.images.length || request.referenceNames.some((name) => typeof name !== 'string' || !name.trim() || name.length > 120 || /[\r\n]/.test(name))) throw new Error('参考图名称与图片不匹配');
      const submittedPrompt = bindPromptReferences(request.prompt, request.referenceNames);
      if (submittedPrompt.length > 20000) throw new Error('绑定参考图后的提示词过长');
      const runRoot = path.join(accountDirectory(accountId), 'runs', request.jobId);
      const input = path.join(runRoot, 'input');
      await fsp.mkdir(input, { recursive: true, mode: 0o700 });
      const command = ['multimodal2video'];
      for (const [index, source] of request.images.entries()) {
        const extension = path.extname(source).toLowerCase();
        if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) throw new Error('参考图格式不正确');
        const stat = await fsp.stat(source);
        if (!stat.isFile() || stat.size < 1 || stat.size > 50 * 1024 * 1024) throw new Error('参考图为空或超过 50MB');
        const name = `${String(index + 1).padStart(2, '0')}${extension}`;
        await fsp.copyFile(source, path.join(input, name));
        command.push('--image', `/work/input/${name}`);
      }
      command.push('--prompt', submittedPrompt, '--duration', String(request.duration), '--ratio', request.ratio, '--video_resolution', request.resolution, '--model_version', request.model, '--poll', '0');
      return {
        ...taskResult(await run(accountId, command, [{ source: input, target: '/work/input', readonly: true }], 180000)),
        submittedPrompt,
        referenceBindings: request.referenceNames.map((name, index) => ({ name, imageNumber: index + 1 })),
      };
    },
    async queryVideo(accountId, submitId, download = false) {
      validateAccount(accountId);
      if (!/^[a-zA-Z0-9-]{6,100}$/.test(submitId)) throw new Error('任务 ID 不正确');
      const output = path.join(accountDirectory(accountId), 'outputs', submitId);
      const command = ['query_result', `--submit_id=${submitId}`];
      const mounts = [];
      if (download) {
        await fsp.mkdir(output, { recursive: true, mode: 0o700 });
        command.push('--download_dir=/work/output');
        mounts.push({ source: output, target: '/work/output', readonly: false });
      }
      const parsed = taskResult(await run(accountId, command, mounts, 180000));
      if (download && parsed.kind === 'succeeded') {
        const names = await fsp.readdir(output);
        const files = names.filter(name => /\.(mp4|mov|webm)$/i.test(name)).map(name => path.join(output, name));
        if (!files.length) return { kind: 'download_failed', submitId, message: '即梦返回成功，但没有下载到视频文件' };
        parsed.files = files;
      }
      return parsed;
    }
  };
}

module.exports = { bindPromptReferences, createJimengCliPool };
