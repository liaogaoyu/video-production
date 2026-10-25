function createJimengProvider({ repos, pool, media, db, owner }) {
  function imagePaths(job) {
    const input = JSON.parse(job.inputSnapshot || "{}");
    return (input.references || []).map((reference) => {
      const row = db.prepare("SELECT storage_key FROM media WHERE id=?").get(reference.mediaId);
      if (!row) throw Object.assign(new Error("参考图媒体不存在"), { kind: "rejected" });
      return media.locate(row.storage_key);
    });
  }
  async function withLease(accountId, purpose, work) {
    if (!repos.accounts.runtime("cli")?.available) return { outcome: "retry", message: "即梦 CLI 运行环境正在准备，请稍候" };
    const locked = repos.accounts.tryLease(accountId, owner, purpose, 240000);
    if (!locked) return { outcome: "retry", message: "账号正在执行其他 CLI 操作" };
    try { return await work(); }
    finally { repos.accounts.releaseLease(accountId, owner); }
  }
  function mapSubmit(result) {
    if (result.kind === "accepted" && result.submitId) return { outcome: "remote", remoteTaskId: result.submitId, queueNote: result.message || "" };
    if (result.kind === "succeeded" && result.submitId) return { outcome: "download", remoteTaskId: result.submitId };
    if (result.code === "permission_denied" || result.code === "web_confirmation_required") return { outcome: "auth", message: result.message };
    if (!result.submitId) return { outcome: result.kind === "failed" || result.kind === "rejected" || result.kind === "blocked" ? "failed" : "unknown", message: result.message || "提交结果未确认" };
    return { outcome: "unknown", message: result.message || "提交结果未确认" };
  }
  return {
    async prepare(job) {
      imagePaths(job);
    },
    async submit(job) {
      return withLease(job.accountId, "submit", async () => {
        const input = JSON.parse(job.inputSnapshot || "{}");
        try {
          const result = await pool.submitVideo(job.accountId, {
            jobId: job.id,
            prompt: input.promptSubmitted,
            promptAlreadyBound: true,
            images: imagePaths(job),
            referenceNames: input.references.map((reference) => reference.name),
            referenceImageFormat: input.referenceImageFormat,
            model: input.model,
            ratio: input.ratio,
            duration: input.duration,
            resolution: input.resolution,
          });
          return mapSubmit(result);
        } catch (error) {
          return { outcome: "unknown", message: error.message || "提交结果未确认" };
        }
      });
    },
    async query(job) {
      return withLease(job.accountId, "query", async () => {
        try {
          const result = await pool.queryVideo(job.accountId, job.remoteTaskId, false);
          if (result.kind === "accepted") return { outcome: "pending", queueNote: result.message || "" };
          if (result.kind === "succeeded") return { outcome: "download", remoteTaskId: result.submitId || job.remoteTaskId };
          if (result.code === "permission_denied") return { outcome: "auth", message: result.message };
          if (result.kind === "failed" || result.kind === "blocked") return { outcome: "failed", message: result.message };
          return { outcome: "retry", message: result.message || "查询失败" };
        } catch (error) {
          return { outcome: "retry", message: error.message };
        }
      });
    },
    async download(job) {
      return withLease(job.accountId, "download", async () => {
        try {
          const result = await pool.queryVideo(job.accountId, job.remoteTaskId, true);
          if (result.kind === "download_failed") return { outcome: "download_failed", message: result.message };
          if (result.kind !== "succeeded" || !result.files?.length) return mapSubmit(result);
          const bytes = require("node:fs").readFileSync(result.files[0]);
          const stored = await repos.content.saveMedia({ projectId: job.projectId, bytes, source: "jimeng", video: true, jobId: job.id });
          return { outcome: "succeeded", mediaId: stored.id };
        } catch (error) {
          return { outcome: "download_failed", message: error.message };
        }
      });
    },
  };
}

module.exports = { createJimengProvider };
