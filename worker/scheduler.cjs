const { publicMessage } = require("../server/errors.cjs");
const { presentProject } = require("../server/present.cjs");
const { zipStore } = require("../server/zip.cjs");
const fs = require("node:fs");

function backoff(attempt) {
  const base = Math.min(60000, 1000 * 2 ** Math.min(Math.max(attempt, 1), 6));
  return new Date(Date.now() + base + Math.floor(Math.random() * base * 0.2)).toISOString();
}

function createScheduler({ repos, providers, owner = "worker", db, media }) {
  function settle(job, result) {
    if (result.outcome === "remote") {
      return repos.jobs.commitJob(job, {
        status: "remote_running",
        remote_task_id: result.remoteTaskId,
        queue_note: result.queueNote || "",
        error_message: "",
        next_run_at: new Date(Date.now() + 3000).toISOString(),
        lease_owner: null,
        lease_until: null,
      });
    }
    if (result.outcome === "succeeded") return repos.jobs.succeedWithMedia(job, result.mediaId);
    if (result.outcome === "download") {
      return repos.jobs.commitJob(job, {
        status: "downloading",
        remote_task_id: result.remoteTaskId || job.remoteTaskId,
        lease_owner: null,
        lease_until: null,
        next_run_at: null,
      });
    }
    if (result.outcome === "pending" || result.outcome === "retry") {
      return repos.jobs.commitJob(job, {
        status: result.outcome === "retry" && job.status === "submitting" ? "queued" : job.status,
        queue_note: result.queueNote || "",
        error_message: publicMessage(result.message || ""),
        next_run_at: backoff(job.attempt),
        lease_owner: null,
        lease_until: null,
      });
    }
    if (result.outcome === "unknown") {
      return repos.jobs.commitJob(job, {
        status: "submit_unknown",
        error_code: "submit_unconfirmed",
        error_message: publicMessage(result.message || "提交待确认"),
        lease_owner: null,
        lease_until: null,
      });
    }
    if (result.outcome === "auth") {
      if (job.accountId) db.prepare("UPDATE jimeng_accounts SET authorized=0, permission='denied', message=?, updated_at=? WHERE id=?").run(publicMessage(result.message), new Date().toISOString(), job.accountId);
      return repos.jobs.commitJob(job, {
        status: "auth_expired",
        error_code: "auth_expired",
        error_message: publicMessage(result.message || "授权失效"),
        lease_owner: null,
        lease_until: null,
      });
    }
    if (result.outcome === "download_failed") {
      return repos.jobs.commitJob(job, {
        status: "download_failed",
        error_code: "download_failed",
        error_message: publicMessage(result.message || "下载失败"),
        next_run_at: backoff(job.attempt),
        lease_owner: null,
        lease_until: null,
      });
    }
    return repos.jobs.commitJob(job, {
      status: "failed",
      error_code: "failed",
      error_message: publicMessage(result.message || "生成失败"),
      lease_owner: null,
      lease_until: null,
    });
  }

  async function step(job) {
    const provider = job.provider === "jimeng" ? providers.jimeng : providers.image;
    try {
      if (job.status === "preparing") {
        await provider.prepare(job);
        job = repos.jobs.commitJob(job, { status: "submitting" });
      }
      if (job.status === "submitting") return settle(job, await provider.submit(job));
      if (job.status === "remote_running") return settle(job, await provider.query(job));
      if (job.status === "downloading" || job.status === "download_failed") {
        if (job.attempt > 8) {
          return repos.jobs.commitJob(job, { status: "failed", error_code: "download_failed", error_message: "下载多次失败", lease_owner: null, lease_until: null });
        }
        return settle(job, await provider.download(job));
      }
      return job;
    } catch (error) {
      const unknown = job.status === "submitting" && !job.remoteTaskId;
      return repos.jobs.commitJob(job, {
        status: unknown ? "submit_unknown" : "failed",
        error_code: unknown ? "submit_unconfirmed" : "failed",
        error_message: publicMessage(error.message),
        lease_owner: null,
        lease_until: null,
      });
    }
  }

  async function exportOne() {
    const row = repos.accounts.nextExport();
    if (!row || !media) return;
    try {
      const project = presentProject(repos.content.graph(row.project_id));
      const previous = JSON.parse(row.manifest_json || "{}");
      const files = [];
      if (row.kind === "videos") {
        const used = new Set();
        for (const shot of [...project.data.shots].sort((left, right) => left.episode - right.episode || left.number - right.number || left.id.localeCompare(right.id))) {
          const job = [...project.data.jobs].reverse().find((item) => item.sourceId === shot.id && item.status === "done" && item.video);
          if (!job) continue;
          const mediaId = job.video.split("/").pop();
          const stored = db.prepare("SELECT * FROM media WHERE id=?").get(mediaId);
          if (!stored) continue;
          let name = `E${String(shot.episode).padStart(3, "0")}_S${String(shot.number).padStart(4, "0")}_${shot.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40)}.mp4`;
          if (used.has(name)) name = name.replace(/\.mp4$/, `_${shot.id.slice(0, 8)}.mp4`);
          used.add(name);
          files.push({ name, data: fs.readFileSync(media.locate(stored.storage_key)) });
        }
      } else {
        files.push({ name: "project.json", data: Buffer.from(JSON.stringify(project, null, 2)) });
        const mediaRows = db.prepare("SELECT * FROM media WHERE project_id=?").all(project.id);
        for (const stored of mediaRows) files.push({ name: `media/${stored.storage_key}`, data: fs.readFileSync(media.locate(stored.storage_key)) });
      }
      const manifest = { kind: row.kind === "videos" ? "storydock-video-pack" : "storydock-backup", missing: previous.missing || [], files: files.map((file) => file.name) };
      files.push({ name: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2)) });
      const storageKey = `exports/${row.id}.zip`;
      await media.writeAtomic(storageKey, zipStore(files));
      repos.accounts.finishExport(row.id, { status: "succeeded", storageKey, manifest });
    } catch (error) {
      repos.accounts.finishExport(row.id, { status: "failed", errorMessage: publicMessage(error.message), manifest: {} });
    }
  }

  async function tick() {
    repos.accounts.setRuntime("worker", { ok: true, owner });
    await exportOne();
    const job = repos.jobs.claimJob(owner);
    if (job) await step(job);
  }

  return { tick, step, backoff };
}

module.exports = { createScheduler, backoff };
