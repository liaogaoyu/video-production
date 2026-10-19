const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const ACCOUNT_RE = /^[a-f0-9-]{36}$/;
const OFFICIAL_LINUX_AMD64_URL = 'https://lf3-static.bytednsdoc.com/obj/eden-cn/psj_hupthlyk/ljhwZthlaukjlkulzlp/dreamina_cli_beta/dreamina_cli_linux_amd64';
const OFFICIAL_LINUX_AMD64_SHA256 = '0a5fdc262ab44669e7db4ce67e6543ece6daf405804aca3d1d17d1345c146f69';

function escapeRegExp(value) {
  return String(value).replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

function bindPromptReferences(prompt, referenceNames) {
  if (!Array.isArray(referenceNames) || !referenceNames.length) return String(prompt || '').trim();
  const bindings = referenceNames.map((name, index) => ({
    name: String(name).trim(),
    label: `参考图${index + 1}`,
  }));
  let boundPrompt = String(prompt || '').trim();
  const ordered = [...bindings].sort((left, right) => right.name.length - left.name.length || left.name.localeCompare(right.name));
  for (const binding of ordered) {
    if (!binding.name) continue;
    const pattern = new RegExp(`@${escapeRegExp(binding.name)}(?=$|[\\s，。！？、；：,.!?:;])`, 'g');
    boundPrompt = boundPrompt.replace(pattern, binding.label);
  }
  const legend = bindings
    .map((binding) => `${binding.label}对应资产“${binding.name}”`)
    .join('；');
  return `参考图对应关系：${legend}。\n${boundPrompt}`;
}

function createJimengCliPool({ directory, safeStorage, execFileImpl = execFile, fetchImpl = globalThis.fetch, image = 'lumenx-dreamina-eval:1.4.21', proxy = process.env.STORYDOCK_DREAMINA_PROXY || '', secretStore = null, sessionStore = null, runtimeDirectory = '', allowInstall = true }) {
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
    if (secretStore) return secretStore.ensureKeyringPassword(accountId);
    if (!safeStorage?.isEncryptionAvailable()) throw new Error('系统加密存储不可用');
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
    return new Promise((resolve) => execFileImpl(file, args, { timeout: 120000, maxBuffer: 2 * 1024 * 1024, ...options }, (error, stdout = '', stderr = '') => resolve({ code: error?.code ?? 0, stdout: String(stdout), stderr: String(stderr), errorMessage: String(error?.message || ''), timedOut: Boolean(error?.killed) })));
  }
  function runtimeFailure(result) {
    const output = `${result.errorMessage}\n${result.stdout}\n${result.stderr}`;
    if (result.code === 'ENOENT' || /spawn docker ENOENT|docker.*not (?:found|recognized)/i.test(output)) return { code: 'docker_missing', canInstall: false, message: 'Docker Desktop 未安装，请安装并启动后重试' };
    if (/cannot connect to the docker daemon|docker daemon is not running|dockerDesktopLinuxEngine|open \\.\/pipe\/docker/i.test(output)) return { code: 'docker_stopped', canInstall: false, message: 'Docker Desktop 未启动，请启动后重试' };
    if (/no such image|unable to find image|pull access denied|manifest unknown/i.test(output)) return { code: 'image_missing', canInstall: allowInstall, message: allowInstall ? '即梦 CLI 运行环境未安装，请点击“安装 CLI 运行环境”' : '服务器尚未安装固定版本的即梦 CLI 镜像' };
    if (/platform .* does not match|exec format error/i.test(output)) return { code: 'architecture_mismatch', canInstall: allowInstall, message: allowInstall ? '即梦 CLI 运行环境架构不兼容，请重新安装运行环境' : '服务器上的即梦 CLI 镜像架构不兼容' };
    const detail = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).find((line) => !/device_code|keyring_password/i.test(line));
    return { code: 'runtime_error', canInstall: false, message: detail ? `即梦 CLI 启动失败：${detail.slice(0, 180)}` : '即梦 CLI 启动失败，请检查 Docker Desktop' };
  }
  async function run(accountId, command, mounts = [], timeout = 120000) {
    const password = await ensureSecret(accountId);
    const runtime = await fsp.mkdtemp(path.join(runtimeDirectory || os.tmpdir(), 'storydock-dreamina-'));
    const unlockFile = path.join(runtime, 'keyring-password');
    await fsp.writeFile(unlockFile, `${password}\n`, { mode: 0o600 });
    // Container root has no DAC override and differs from the service UID.
    // The host directory stays 0700; only this file is mounted, read-only.
    await fsp.chmod(unlockFile, 0o444);
    const slug = accountId.replaceAll('-', '');
    const containerName = `storydock-dreamina-${slug.slice(0, 12)}-${crypto.randomBytes(3).toString('hex')}`;
    const args = ['run', '--rm', '--name', containerName, '--cap-drop=ALL', '--security-opt=no-new-privileges', '--memory=768m', '--cpus=1', '--mount', `type=volume,source=storydock-dreamina-${slug},target=/root`, '--mount', `type=bind,source=${unlockFile},target=/run/secrets/keyring_password,readonly`];
    for (const mount of mounts) args.push('--mount', `type=bind,source=${mount.source},target=${mount.target}${mount.readonly ? ',readonly' : ''}`);
    if (proxy) args.push('--env', `HTTP_PROXY=${proxy}`, '--env', `HTTPS_PROXY=${proxy}`);
    args.push(image, ...command);
    let result;
    let checkingCancellation = false;
    const cancellation = command[0] === 'login' && sessionStore?.isActive ? setInterval(async () => {
      if (checkingCancellation) return;
      checkingCancellation = true;
      try {
        if (!(await sessionStore.isActive(accountId))) await execute('docker', ['rm', '-f', containerName], { timeout: 20000 });
      } catch { /* The normal execution timeout remains the fallback. */ }
      finally { checkingCancellation = false; }
    }, 1000) : null;
    cancellation?.unref();
    try { result = await execute('docker', args, { timeout }); }
    finally {
      if (cancellation) clearInterval(cancellation);
      if (result?.timedOut) await execute('docker', ['rm', '-f', containerName], { timeout: 20000 });
      await fsp.rm(runtime, { recursive: true, force: true });
    }
    return result;
  }
  function match(output, name) {
    return output.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim();
  }
  function publicResult(result) {
    const output = `${result.stdout}\n${result.stderr}`;
    const creditMatch = output.match(/"total_credit"\s*:\s*(\d+(?:\.\d+)?)|total_credit:\s*(\d+(?:\.\d+)?)/);
    // Read the original digits: JSON.parse would round numeric IDs above 2^53.
    const jsonIdentity = output.match(/"user_id"\s*:\s*(?:"([a-zA-Z0-9_-]+)"|(\d+)(?=\s*[,}]))/);
    const identity = jsonIdentity?.[1] || jsonIdentity?.[2] || output.match(/^\s*user_id:\s*([a-zA-Z0-9_-]+)\s*$/m)?.[1];
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
      if (result.code === 0) return { ok: true, code: 'ready', canInstall: false, image, message: '官方 CLI 运行环境已就绪' };
      return { ok: false, image, ...runtimeFailure(result) };
    },
    async installRuntime() {
      const docker = await execute('docker', ['version', '--format', '{{.Server.Os}}/{{.Server.Arch}}'], { timeout: 15000 });
      if (docker.code !== 0) throw new Error(runtimeFailure(docker).message);
      if (typeof fetchImpl !== 'function') throw new Error('客户端无法下载官方 CLI，请检查网络后重试');
      const buildRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'storydock-dreamina-build-'));
      try {
        const response = await fetchImpl(OFFICIAL_LINUX_AMD64_URL, { redirect: 'follow' });
        if (!response.ok) throw new Error(`下载官方 CLI 失败（HTTP ${response.status}）`);
        const binary = Buffer.from(await response.arrayBuffer());
        const digest = crypto.createHash('sha256').update(binary).digest('hex');
        if (digest !== OFFICIAL_LINUX_AMD64_SHA256) throw new Error('官方 CLI 文件校验失败，请稍后重试');
        await fsp.writeFile(path.join(buildRoot, 'dreamina'), binary, { mode: 0o755 });
        await fsp.writeFile(path.join(buildRoot, 'version.json'), JSON.stringify({ version: '1.4.21', source: 'official', sha256: OFFICIAL_LINUX_AMD64_SHA256 }, null, 2));
        await fsp.writeFile(path.join(buildRoot, 'entrypoint.sh'), `#!/bin/sh\nset -eu\nif [ "\${1:-}" != "--inside-keyring" ]; then exec dbus-run-session -- "$0" --inside-keyring "$@"; fi\nshift\nif [ ! -r /run/secrets/keyring_password ]; then echo 'Missing account keyring password' >&2; exit 1; fi\nmkdir -p /run/dreamina-keyring /root/.dreamina_cli\nif [ ! -f /root/.dreamina_cli/version.json ]; then cp /opt/dreamina/version.json /root/.dreamina_cli/version.json; fi\nexport GNOME_KEYRING_CONTROL=/run/dreamina-keyring\ngnome-keyring-daemon --unlock --components=secrets < /run/secrets/keyring_password >/dev/null\nexec /usr/local/bin/dreamina "$@"\n`, { mode: 0o755 });
        await fsp.writeFile(path.join(buildRoot, 'Dockerfile'), `FROM debian:bookworm-slim\nRUN apt-get update && apt-get install -y --no-install-recommends ca-certificates dbus gnome-keyring libsecret-tools && rm -rf /var/lib/apt/lists/*\nCOPY dreamina /usr/local/bin/dreamina\nCOPY entrypoint.sh /usr/local/bin/dreamina-entrypoint\nCOPY version.json /opt/dreamina/version.json\nRUN chmod 755 /usr/local/bin/dreamina /usr/local/bin/dreamina-entrypoint\nENTRYPOINT ["/usr/local/bin/dreamina-entrypoint"]\n`);
        const built = await execute('docker', ['build', '--platform', 'linux/amd64', '--tag', image, buildRoot], { timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
        if (built.code !== 0) throw new Error(runtimeFailure(built).message);
        const verified = await execute('docker', ['image', 'inspect', image, '--format', '{{.Id}}'], { timeout: 15000 });
        if (verified.code !== 0) throw new Error('CLI 运行环境构建完成但校验失败');
        return { ok: true, code: 'ready', canInstall: false, image, message: '官方 CLI 运行环境已安装' };
      } finally {
        await fsp.rm(buildRoot, { recursive: true, force: true });
      }
    },
    async beginAuth(accountId) {
      const result = await run(accountId, ['login', '--headless']);
      const output = `${result.stdout}\n${result.stderr}`;
      const authorizationUrl = output.match(/https:\/\/jimeng\.jianying\.com\/ai-tool\/cli-auth\?[^\s]+/)?.[0];
      const deviceCode = match(output, 'device_code');
      if (!authorizationUrl || !deviceCode) {
        if (result.code !== 0) throw new Error(runtimeFailure(result).message);
        throw new Error('官方 CLI 没有返回有效授权地址，请更新 CLI 运行环境');
      }
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      if (sessionStore) await sessionStore.put(accountId, { deviceCode, authorizationUrl, expiresAt });
      else pending.set(accountId, { deviceCode, expiresAt: Date.parse(expiresAt) });
      return { authorizationUrl, expiresAt };
    },
    async finishAuth(accountId) {
      validateAccount(accountId);
      const stored = sessionStore ? await sessionStore.get(accountId) : null;
      const auth = stored || pending.get(accountId);
      const expiresAt = stored ? Date.parse(stored.expiresAt) : auth?.expiresAt;
      if (!auth?.deviceCode || !expiresAt || expiresAt < Date.now()) throw new Error('授权已过期，请重新开始');
      const result = await run(accountId, ['login', 'checklogin', `--device_code=${auth.deviceCode}`, '--poll=20']);
      const parsed = publicResult(result);
      if (parsed.authorized) {
        if (sessionStore) await sessionStore.clear(accountId);
        else pending.delete(accountId);
      }
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
      if (!Array.isArray(request.images) || request.images.length > (request.model === 'seedance2.5' ? 30 : 9)) throw new Error('参考图数量不受支持');
      if (!Array.isArray(request.referenceNames) || request.referenceNames.length !== request.images.length || request.referenceNames.some((name) => typeof name !== 'string' || !name.trim() || name.length > 120 || /[\r\n]/.test(name))) throw new Error('参考图名称与图片不匹配');
      const submittedPrompt = request.promptAlreadyBound ? request.prompt.trim() : bindPromptReferences(request.prompt, request.referenceNames);
      if (submittedPrompt.length > 20000) throw new Error('绑定参考图后的提示词过长');
      const runRoot = path.join(accountDirectory(accountId), 'runs', request.jobId);
      const input = path.join(runRoot, 'input');
      await fsp.mkdir(input, { recursive: true, mode: 0o700 });
      const command = [request.images.length ? 'multimodal2video' : 'text2video'];
      for (const [index, source] of request.images.entries()) {
        const extension = path.extname(source).toLowerCase();
        if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) throw new Error('参考图格式不正确');
        const stat = await fsp.stat(source);
        if (!stat.isFile() || stat.size < 1 || stat.size > 50 * 1024 * 1024) throw new Error('参考图为空或超过 50MB');
        const name = `${String(index + 1).padStart(2, '0')}${extension}`;
        await fsp.copyFile(source, path.join(input, name));
        await fsp.chmod(path.join(input, name), 0o444);
        command.push('--image', `/work/input/${name}`);
      }
      // Only the staging directory is exposed; its account parent remains 0700.
      await fsp.chmod(input, 0o555);
      command.push('--prompt', submittedPrompt, '--duration', String(request.duration), '--ratio', request.ratio, '--video_resolution', request.resolution, '--model_version', request.model, '--poll', '0');
      return {
        ...taskResult(await run(accountId, command, request.images.length ? [{ source: input, target: '/work/input', readonly: true }] : [], 180000)),
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
        // Container root drops DAC override and has a different UID from the host service.
        // This per-task directory lives below a private account parent.
        await fsp.chmod(output, 0o777);
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
