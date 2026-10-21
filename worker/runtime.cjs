// Installation runs independently of the job loop so image jobs and heartbeats continue.
function createRuntimeBootstrap({ pool, report, autoInstall = true, now = Date.now, retryMs = 60000 }) {
  let active = null;
  let nextCheck = 0;
  let ready = false;
  async function inspect() {
    const status = await pool.runtimeStatus();
    ready = Boolean(status.ok);
    report({ available: ready, state: ready ? "ready" : "unavailable", version: status.image || "", message: status.message });
    if (ready || !autoInstall || !["image_missing", "architecture_mismatch"].includes(status.code)) return;
    report({ available: false, state: "installing", version: status.image || "", message: "首次启动，正在自动下载并安装即梦 CLI 运行环境，请稍候…" });
    await pool.installRuntime();
    const verified = await pool.runtimeStatus();
    if (!verified.ok) throw new Error(verified.message || "即梦 CLI 安装后检查失败");
    ready = true;
    report({ available: true, state: "ready", version: verified.image || "", message: "即梦 CLI 运行环境已就绪" });
  }
  return {
    check() {
      if (active) return active;
      if (now() < nextCheck) return Promise.resolve();
      active = inspect().catch((error) => {
        ready = false;
        report({ available: false, state: "failed", message: `即梦 CLI 自动安装失败，将稍后重试：${String(error.message || error).slice(0, 220)}` });
      }).finally(() => { nextCheck = now() + retryMs; active = null; });
      return active;
    },
    isReady: () => ready,
  };
}

module.exports = { createRuntimeBootstrap };
