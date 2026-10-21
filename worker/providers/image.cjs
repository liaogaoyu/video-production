const { postImageGeneration, fetchImageTask, imageItem, isApiMart } = require("../../image-provider.cjs");
const { downloadLimited } = require("../../server/net-guard.cjs");

function createImageProvider({ repos, publicBase = "", fetchImpl }) {
  async function materialize(job, image, config) {
    let bytes;
    if (image?.b64_json) bytes = Buffer.from(image.b64_json, "base64");
    else if (image?.url) {
      const allowedHosts = [];
      try { allowedHosts.push(new URL(config.baseUrl).hostname); } catch {}
      const downloaded = await downloadLimited(image.url, { allowedHosts, maxBytes: 50 * 1024 * 1024 });
      bytes = downloaded.bytes;
    } else {
      throw Object.assign(new Error("生图接口没有返回图片数据"), { kind: "rejected" });
    }
    return repos.content.saveMedia({ projectId: job.projectId, bytes, source: "generation", assetId: job.sourceId });
  }
  function configOf(job) {
    const config = JSON.parse(job.configSnapshot || "{}");
    return { baseUrl: config.baseUrl, model: config.model, resolution: config.resolution, ratio: config.ratio };
  }
  return {
    async prepare() {},
    async submit(job) {
      const config = configOf(job);
      const input = JSON.parse(job.inputSnapshot || "{}");
      try {
        const files = [];
        let referenceBytes = 0;
        for (const reference of input.references || []) {
          const file = repos.content.readReferenceMedia(job.projectId, reference.mediaId, reference.sha256);
          referenceBytes += file.bytes.length;
          if (referenceBytes > 50 * 1024 * 1024) throw new Error("参考图总大小超过 50MB，请压缩图片后重新提交");
          files.push(file);
        }
        const references = isApiMart(config.baseUrl) ? files.map(file => `data:${file.mime};base64,${file.bytes.toString("base64")}`) : [];
        const posted = await postImageGeneration({
          config,
          fetchImpl,
          prompt: input.promptSubmitted || input.promptOriginal,
          apiKey: repos.accounts.imageApiKey(),
          references,
          referenceFiles: isApiMart(config.baseUrl) ? [] : files,
        });
        if (posted.task?.id) return { outcome: "remote", remoteTaskId: posted.task.id };
        const image = imageItem(posted.payload);
        if (!image) return { outcome: "failed", message: "生图接口没有返回图片数据" };
        const stored = await materialize(job, image, config);
        return { outcome: "succeeded", mediaId: stored.id };
      } catch (error) {
        if (error.kind === "network" || error.kind === "uncertain") return { outcome: "unknown", message: "提交结果未确认" };
        return { outcome: "failed", message: error.message };
      }
    },
    async query(job) {
      const config = configOf(job);
      try {
        const polled = await fetchImageTask({ config, fetchImpl, apiKey: repos.accounts.imageApiKey(), taskId: job.remoteTaskId });
        if (!polled.image) return { outcome: "pending" };
        const stored = await materialize(job, polled.image, config);
        return { outcome: "succeeded", mediaId: stored.id };
      } catch (error) {
        if (error.kind === "rejected") return { outcome: "failed", message: error.message };
        return { outcome: "retry", message: error.message };
      }
    },
    async download(job) {
      return this.query(job);
    },
  };
}

module.exports = { createImageProvider };
