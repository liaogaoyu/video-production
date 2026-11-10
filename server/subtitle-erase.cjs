const crypto = require("node:crypto");
const fs = require("node:fs");
const { ApiError } = require("./errors.cjs");
const { createImsClient } = require("./aliyun-ims.cjs");

function createSubtitleEraseService(services, env) {
  const { db, media, repos } = services;
  const ims = createImsClient({}, env);

  function latestShotVideo(shotId) {
    return db
      .prepare(
        `SELECT j.*, m.storage_key, m.mime, m.bytes, m.sha256, m.id AS media_row_id
         FROM jobs j
         JOIN media m ON m.id = j.media_id
         WHERE j.source_id=? AND j.kind='video' AND j.status='succeeded' AND j.media_id IS NOT NULL
           AND j.provider <> 'aliyun_ims_detext'
         ORDER BY COALESCE(j.completed_at, j.updated_at) DESC, j.rowid DESC
         LIMIT 1`,
      )
      .get(shotId);
  }

  function createJob(shotId, { advanced = true } = {}) {
    if (!ims.enabled) throw new ApiError(400, "ims_not_configured", "请先配置阿里云 AccessKey 与 IMS");
    if (!media.oss?.enabled) throw new ApiError(400, "oss_not_configured", "字幕擦除需要先启用 OSS");
    const shot = db.prepare("SELECT * FROM shots WHERE id=? AND deleted_at IS NULL").get(shotId);
    if (!shot) throw new ApiError(404, "shot_not_found", "分镜不存在");
    const source = latestShotVideo(shotId);
    if (!source) throw new ApiError(409, "video_required", "请先生成分镜视频再擦除字幕");
    const existing = db
      .prepare(
        `SELECT id,status FROM jobs
         WHERE source_id=? AND provider='aliyun_ims_detext'
           AND status IN ('queued','preparing','submitting','remote_running','downloading')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(shotId);
    if (existing) throw new ApiError(409, "detext_running", "该分镜已有进行中的字幕擦除任务");

    const now = new Date().toISOString();
    const jobId = crypto.randomUUID();
    const batchId = crypto.randomUUID();
    const outputStorageKey = `${shot.project_id}/videos/${jobId}/detext.mp4`;
    const modelId = advanced ? "algo-video-detext-new" : "default";
    const input = {
      shotId,
      sourceMediaId: source.media_row_id,
      sourceStorageKey: source.storage_key,
      sourceJobId: source.id,
      outputStorageKey,
      modelId,
    };
    db.prepare(
      `INSERT INTO jobs(id,project_id,source_id,batch_id,kind,status,provider,model,config_snapshot,input_snapshot,attempt,version,created_at,updated_at)
       VALUES(?,?,?,?,?,'queued',?,?,?,?,0,1,?,?)`,
    ).run(
      jobId,
      shot.project_id,
      shotId,
      batchId,
      "video",
      "aliyun_ims_detext",
      advanced ? "subtitle-erase-advanced" : "subtitle-erase",
      JSON.stringify({ advanced: Boolean(advanced), modelId }),
      JSON.stringify(input),
      now,
      now,
    );
    return repos.jobs.getJob(jobId);
  }

  function provider() {
    return {
      async prepare(job) {
        const input = JSON.parse(job.inputSnapshot || "{}");
        const row = db.prepare("SELECT * FROM media WHERE id=?").get(input.sourceMediaId);
        if (!row) throw new Error("源视频媒体不存在");
        await media.ensureLocal(row.storage_key);
        await media.ensureOnOss(row.storage_key, row.mime || "video/mp4");
      },
      async submit(job) {
        const input = JSON.parse(job.inputSnapshot || "{}");
        const result = await ims.submitVideoDetext({
          name: `detext-${job.id.slice(0, 8)}`,
          inputOss: media.oss.ossUri(input.sourceStorageKey),
          outputOss: media.oss.ossUri(input.outputStorageKey),
          modelId: input.modelId === "default" ? undefined : input.modelId || "algo-video-detext-new",
        });
        if (!result.JobId) throw new Error("IMS 未返回 JobId");
        return { outcome: "remote", remoteTaskId: result.JobId, queueNote: "字幕擦除处理中" };
      },
      async query(job) {
        const remote = await ims.queryJob(job.remoteTaskId);
        const status = String(remote.Status || remote.Job?.Status || "").toLowerCase();
        if (["success", "succeeded", "finished"].includes(status)) {
          return { outcome: "download", remoteTaskId: job.remoteTaskId, queueNote: "字幕擦除完成，正在入库" };
        }
        if (["fail", "failed", "error"].includes(status)) {
          return { outcome: "failed", message: remote.Message || remote.Job?.Message || "字幕擦除失败" };
        }
        return { outcome: "pending", queueNote: remote.Status || "字幕擦除处理中" };
      },
      async download(job) {
        const input = JSON.parse(job.inputSnapshot || "{}");
        const bytes = await media.oss.get(input.outputStorageKey);
        const info = media.inspect(bytes, { video: true });
        await media.writeAtomic(input.outputStorageKey, bytes, info.mime);
        const mediaId = crypto.randomUUID();
        const now = new Date().toISOString();
        db.prepare(
          "INSERT INTO media(id,project_id,storage_key,mime,bytes,sha256,source,created_at) VALUES(?,?,?,?,?,?,?,?)",
        ).run(mediaId, job.projectId, input.outputStorageKey, info.mime, info.bytes, info.sha256, "aliyun_ims_detext", now);
        return { outcome: "succeeded", mediaId };
      },
    };
  }

  function register(app) {
    app.post("/api/v1/shots/:id/subtitle-erase", async (request, reply) => {
      const job = createJob(request.params.id, {
        advanced: request.body?.advanced !== false,
      });
      reply.code(202);
      return { jobId: job.id, batchId: job.batchId, status: job.status };
    });
  }

  return { createJob, provider, register, ims };
}

module.exports = { createSubtitleEraseService };
