const { reconcileJob } = require("../server/billing.cjs");
function createUsagePoller(s, providers) {
  let running = false,
    task = null,
    stopped = false;
  async function run() {
    const row = s.db
      .prepare(
        "SELECT j.* FROM job_billing b JOIN jobs j ON j.id=b.job_id WHERE b.status='frozen' AND j.status='succeeded' AND j.kind='video' AND (b.usage_next_at IS NULL OR b.usage_next_at<=?) ORDER BY COALESCE(b.usage_next_at,b.created_at) LIMIT 1",
      )
      .get(new Date().toISOString());
    if (!row) return;
    s.db
      .prepare("UPDATE job_billing SET usage_next_at=? WHERE job_id=?")
      .run(new Date(Date.now() + 60000).toISOString(), row.id);
    const job = s.repos.jobs.getJob(row.id);
    try {
      const usage = await providers[row.provider]?.usage?.(job);
      if (!usage) throw Error("尚未取得任务级实际消耗");
      // Persist only if this attempt still owns a pending bill; late lookups never revive refunded jobs.
      require("../server/db.cjs").transaction(s.db, () => {
        const current = s.db
          .prepare(
            "SELECT j.result_json FROM jobs j JOIN job_billing b ON b.job_id=j.id WHERE j.id=? AND j.status='succeeded' AND b.status='frozen'",
          )
          .get(row.id);
        if (!current) return;
        s.db
          .prepare("UPDATE jobs SET result_json=?,version=version+1 WHERE id=?")
          .run(
            JSON.stringify({
              ...JSON.parse(current.result_json || "{}"),
              officialUsage: usage,
            }),
            row.id,
          );
        reconcileJob(s.db, row.id);
        s.db
          .prepare("UPDATE job_billing SET usage_error='' WHERE job_id=?")
          .run(row.id);
        s.repos.record("job.billing.updated", {
          jobId: row.id,
          projectId: row.project_id,
        });
      });
    } catch {
      s.db
        .prepare(
          "UPDATE job_billing SET usage_error='暂未取得可核对的实际消耗，将继续查询' WHERE job_id=? AND status='frozen'",
        )
        .run(row.id);
    }
  }
  return {
    tick() {
      if (running || stopped) return;
      running = true;
      task = run()
        .catch(() => {})
        .finally(() => {
          running = false;
        });
    },
    async stop() {
      stopped = true;
      await task;
    },
  };
}
module.exports = { createUsagePoller };
