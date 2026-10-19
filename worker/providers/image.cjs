const { postImageGeneration, fetchImageTask, imageItem } = require("../../image-provider.cjs");
const { downloadLimited } = require("../../server/net-guard.cjs");

function createImageProvider({ repos, publicBase = "" }) {
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
      const references = (input.references || []).map((reference) => {
        if (!publicBase) throw Object.assign(new Error("带参考图的生图需要配置服务器公网地址"), { kind: "rejected" });
        return `${publicBase.replace(/\/$/, "")}/api/v1/media/${reference.mediaId}`;
      });
      try {
        const posted = await postImageGeneration({
          config,
          prompt: input.promptSubmitted || input.promptOriginal,
          apiKey: repos.accounts.imageApiKey(),
          references,
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
        const polled = await fetchImageTask({ config, apiKey: repos.accounts.imageApiKey(), taskId: job.remoteTaskId });
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
