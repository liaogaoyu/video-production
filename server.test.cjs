const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { openServices } = require("./server/context.cjs");
const { createHttpApp } = require("./server/api.cjs");
const { createSecretStore } = require("./server/secret-store.cjs");
const { findMentions } = require("./server/references.cjs");
const { createScheduler } = require("./worker/scheduler.cjs");
const { zipStore } = require("./server/zip.cjs");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function start() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "storydock-bs-"));
  const services = openServices({
    paths: {
      root,
      database: path.join(root, "data", "storydock.sqlite"),
      media: path.join(root, "media"),
      runs: path.join(root, "runs"),
      backups: path.join(root, "backups"),
      cli: path.join(root, "cli"),
      runtime: path.join(root, "run"),
      masterKey: path.join(root, "master-key"),
      staticRoot: __dirname,
      port: 0,
      host: "127.0.0.1",
      accessPassword: "",
      publicBase: "",
    },
  });
  const app = await createHttpApp(services);
  return {
    app,
    services,
    async close() {
      await app.close();
      services.db.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function json(response) {
  return JSON.parse(response.body);
}

test("browser server bootstrap uses external scripts allowed by CSP", async () => {
  const ctx = await start();
  try {
    const page = await ctx.app.inject({ method: "GET", url: "/" });
    assert.match(page.body, /script-src 'self'/);
    assert.doesNotMatch(page.body, /<script>window\.__STORYDOCK_SERVER__/);
    assert.ok(page.body.indexOf('src="web/api.js"') < page.body.indexOf('src="app.js"'));
    const script = await ctx.app.inject({ method: "GET", url: "/web/api.js" });
    assert.match(script.body, /window\.__STORYDOCK_SERVER__ = true/);
  } finally { await ctx.close(); }
});

test("secret store binds ciphertext to account and purpose", () => {
  const store = createSecretStore(crypto.randomBytes(32));
  const sealed = store.seal("keyring-password", { accountId: "account-1", purpose: "keyring" });
  assert.equal(store.open(sealed, { accountId: "account-1", purpose: "keyring" }), "keyring-password");
  assert.throws(() => store.open(sealed, { accountId: "account-2", purpose: "keyring" }));
  assert.throws(() => store.open(sealed, { accountId: "account-1", purpose: "image-api-key" }));
});

test("asset mentions prefer the longer name and reject exact duplicates", () => {
  const found = findMentions("@少年·外勤装 看向 @少年", [
    { id: "1", name: "少年" },
    { id: "2", name: "少年·外勤装" },
  ]);
  assert.deepEqual(found.map((asset) => asset.name), ["少年·外勤装", "少年"]);
  assert.throws(
    () => findMentions("@少年", [{ id: "1", name: "少年" }, { id: "2", name: "少年" }]),
    /多个资产/,
  );
});

test("two browsers share projects and a stale revision returns 409", async () => {
  const ctx = await start();
  const created = json(await ctx.app.inject({ method: "POST", url: "/api/v1/projects", payload: { name: "雾都来信", ratio: "16:9" } }));
  const listed = json(await ctx.app.inject({ method: "GET", url: "/api/v1/projects" }));
  assert.equal(listed.projects[0].id, created.project.id);
  const saved = json(await ctx.app.inject({
    method: "PATCH",
    url: `/api/v1/projects/${created.project.id}`,
    payload: { revision: created.project.revision, name: "雨夜档案" },
  }));
  assert.equal(saved.project.name, "雨夜档案");
  const stale = await ctx.app.inject({
    method: "PATCH",
    url: `/api/v1/projects/${created.project.id}`,
    payload: { revision: created.project.revision, name: "被覆盖" },
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(json(stale).error.code, "revision_conflict");
  const removed = json(await ctx.app.inject({ method: "DELETE", url: `/api/v1/projects/${created.project.id}` }));
  assert.equal(removed.deleted, true);
  assert.equal(json(await ctx.app.inject({ method: "GET", url: "/api/v1/projects" })).projects.length, 0);
  const page = await ctx.app.inject({ method: "GET", url: "/" });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /src="web\/api.js"/);
  await ctx.close();
});

test("media range requests and frozen video references survive renames", async () => {
  const ctx = await start();
  const project = json(await ctx.app.inject({ method: "POST", url: "/api/v1/projects", payload: { name: "参考图", ratio: "16:9" } })).project;
  await ctx.app.inject({
    method: "PUT",
    url: "/api/v1/connections/image",
    payload: { name: "桩", baseUrl: "https://example.com/v1", model: "gpt-image-2", resolution: "1k", apiKey: "sk-test" },
  });
  const asset = json(await ctx.app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/assets`,
    payload: { name: "宫廷", type: "场景", prompt: "宫殿" },
  }));
  const boundary = "----storydock";
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="court.png"\r\nContent-Type: image/png\r\n\r\n`),
    PNG,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const uploaded = json(await ctx.app.inject({
    method: "POST",
    url: `/api/v1/assets/${asset.id}/versions`,
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload,
  }));
  assert.equal(uploaded.mediaId.length > 10, true);
  const ranged = await ctx.app.inject({ method: "GET", url: `/api/v1/media/${uploaded.mediaId}`, headers: { range: "bytes=0-3" } });
  assert.equal(ranged.statusCode, 206);
  assert.match(String(ranged.headers["content-range"]), /^bytes 0-3\//);
  assert.equal(ranged.rawPayload.length, 4);
  await ctx.app.inject({ method: "PUT", url: `/api/v1/assets/${asset.id}/locked-version`, payload: { versionId: uploaded.id } });
  const shot = json(await ctx.app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/shots`,
    payload: { title: "入殿", prompt: "@宫廷 中转身", episode: 1, number: 1, duration: 6 },
  }));
  const key = crypto.randomUUID();
  const batch = json(await ctx.app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/jobs/batch`,
    headers: { "idempotency-key": key },
    payload: { kind: "video", sourceIds: [shot.id], model: "seedance2.0", resolution: "720p", ratio: "16:9" },
  }));
  assert.equal(batch.jobIds.length, 1);
  const replay = json(await ctx.app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/jobs/batch`,
    headers: { "idempotency-key": key },
    payload: { kind: "video", sourceIds: [shot.id], model: "seedance2.0", resolution: "720p", ratio: "16:9" },
  }));
  assert.deepEqual(replay.jobIds, batch.jobIds);
  const conflict = await ctx.app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/jobs/batch`,
    headers: { "idempotency-key": key },
    payload: { kind: "video", sourceIds: [shot.id], model: "seedance2.0fast", resolution: "720p", ratio: "16:9" },
  });
  assert.equal(conflict.statusCode, 409);
  const frozen = ctx.services.repos.jobs.getJob(batch.jobIds[0]);
  assert.match(frozen.inputSnapshot, /宫廷/);
  const detail = json(await ctx.app.inject({ method: "GET", url: `/api/v1/projects/${project.id}` }));
  const current = detail.project.data.assets[0];
  await ctx.app.inject({
    method: "PATCH",
    url: `/api/v1/assets/${asset.id}`,
    payload: { revision: current.revision, name: "新宫殿" },
  });
  assert.match(ctx.services.repos.jobs.getJob(batch.jobIds[0]).inputSnapshot, /宫廷/);
  assert.doesNotMatch(ctx.services.repos.jobs.getJob(batch.jobIds[0]).inputSnapshot, /新宫殿/);
  await ctx.close();
});

test("an expired submit without a remote id becomes submit_unknown and is not resent", async () => {
  const ctx = await start();
  const project = json(await ctx.app.inject({ method: "POST", url: "/api/v1/projects", payload: { name: "队列" } })).project;
  await ctx.app.inject({
    method: "PUT",
    url: "/api/v1/connections/image",
    payload: { name: "桩", baseUrl: "https://example.com/v1", model: "gpt-image-2", apiKey: "sk-test" },
  });
  const asset = json(await ctx.app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/assets`,
    payload: { name: "角色", type: "角色", prompt: "肖像" },
  }));
  const batch = json(await ctx.app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/jobs/batch`,
    headers: { "idempotency-key": crypto.randomUUID() },
    payload: { kind: "image", sourceIds: [asset.id], ratio: "1:1" },
  }));
  const scheduler = createScheduler({
    repos: ctx.services.repos,
    db: ctx.services.db,
    media: ctx.services.media,
    providers: {
      image: {
        async prepare() {},
        async submit(job) {
          const stored = await ctx.services.repos.content.saveMedia({ projectId: job.projectId, bytes: PNG, source: "generation", assetId: job.sourceId });
          return { outcome: "succeeded", mediaId: stored.id };
        },
        async query() { return { outcome: "pending" }; },
        async download() { return { outcome: "pending" }; },
      },
      jimeng: { async prepare() {}, async submit() { return { outcome: "failed" }; }, async query() { return { outcome: "pending" }; }, async download() { return { outcome: "pending" }; } },
    },
  });
  await scheduler.tick();
  assert.equal(ctx.services.repos.jobs.getJob(batch.jobIds[0]).status, "succeeded");
  const version = ctx.services.repos.content.graph(project.id).assets[0].selected_version_id;
  assert.ok(version);
  const unknown = ctx.services.db.prepare("INSERT INTO jobs(id,project_id,source_id,kind,status,provider,lease_until,remote_task_id,config_snapshot,input_snapshot,created_at,updated_at) VALUES(?,?,?,'image','submitting','image',? ,NULL,'{}','{}',?,?)")
    .run(crypto.randomUUID(), project.id, asset.id, new Date(Date.now() - 5000).toISOString(), new Date().toISOString(), new Date().toISOString());
  void unknown;
  const expiredId = ctx.services.db.prepare("SELECT id FROM jobs WHERE status='submitting'").get().id;
  ctx.services.repos.jobs.claimJob("worker-b");
  assert.equal(ctx.services.repos.jobs.getJob(expiredId).status, "submit_unknown");
  const retry = await ctx.app.inject({ method: "POST", url: `/api/v1/jobs/${expiredId}/retry`, payload: {} });
  assert.equal(retry.statusCode, 409);
  assert.equal(json(retry).error.code, "confirmation_required");
  await ctx.close();
});

test("old project packages report missing files and do not resubmit remote jobs", async () => {
  const ctx = await start();
  const manifest = {
    schemaVersion: 1,
    kind: "storydock-project",
    project: {
      name: "旧项目",
      description: "",
      style: "",
      data: {
        settings: { ratio: "9:16" },
        assets: [{ name: "沈知微", type: "角色", prompt: "肖像", image: "file:///tmp/missing.png" }],
        shots: [{ title: "开场", prompt: "@沈知微 转身", episode: 1, number: 1, duration: 6 }],
        jobs: [{ id: "old-job", sourceId: "old", submitId: "remote-123", video: "file:///tmp/missing.mp4" }],
      },
    },
  };
  const archive = zipStore([{ name: "manifest.json", data: Buffer.from(JSON.stringify(manifest)) }]);
  const boundary = "----storydockzip";
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="project.zip"\r\nContent-Type: application/zip\r\n\r\n`),
    archive,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const imported = json(await ctx.app.inject({
    method: "POST",
    url: "/api/v1/imports",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload,
  }));
  assert.equal(imported.report.assets, 1);
  assert.equal(imported.report.shots, 1);
  assert.equal(imported.report.missing.length, 2);
  const job = ctx.services.db.prepare("SELECT status, remote_task_id FROM jobs WHERE project_id=?").get(imported.project.id);
  assert.equal(job.status, "submit_unknown");
  assert.equal(job.remote_task_id, "remote-123");
  await ctx.close();
});
