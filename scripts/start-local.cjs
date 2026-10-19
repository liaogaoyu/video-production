const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolvePaths } = require('../server/paths.cjs');
const cwd = path.resolve(__dirname, '..');
const paths = resolvePaths(process.env, cwd);
const directory = path.join(paths.root, 'local-services');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const port = Number(process.env.PORT || 4320);
const base = `http://127.0.0.1:${port}`;
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function start(name, entry) {
  const pidFile = path.join(directory, `${name}.pid`);
  let pid = Number(fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8'));
  if (pid > 0 && alive(pid)) return;
  const descriptor = fs.openSync(path.join(directory, `${name}.log`), 'a', 0o600);
  try {
    const child = spawn(process.execPath, [entry], { cwd, env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) }, detached: true, stdio: ['ignore', descriptor, descriptor] });
    child.unref();
    fs.writeFileSync(pidFile, String(child.pid), { mode: 0o600 });
    console.log(`${name} started (PID ${child.pid})`);
  } finally { fs.closeSync(descriptor); }
}
async function health() { try { const r = await fetch(base + '/api/v1/system/runtime', { signal: AbortSignal.timeout(2000) }); return r.ok ? await r.json() : null; } catch { return null; } }
(async () => {
  let status = await health();
  if (!status) start('api', 'server/main.cjs');
  if (status?.worker !== 'ok') start('worker', 'worker/main.cjs');
  for (let attempt = 0; attempt < 25; attempt++) {
    status = await health();
    if (status?.api === 'ok' && status.worker === 'ok') { console.log(`Ready: ${base}\nLogs: ${directory}`); return; }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error(`服务未就绪，请查看 ${directory} 下的日志`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
