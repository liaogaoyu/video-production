const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openServices } = require("./server/context.cjs");

test("subtitle erase creates an IMS detext job from the latest shot video", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sd-detext-"));
  const keyFile = path.join(root, "master-key");
  fs.writeFileSync(keyFile, Buffer.alloc(32, 7));
  const services = openServices({
    cwd: __dirname,
    env: {
      STORYDOCK_ROOT: root,
      STORYDOCK_MASTER_KEY: keyFile,
      STORYDOCK_OSS_ENABLED: "1",
      STORYDOCK_OSS_ACCESS_KEY_ID: "test",
      STORYDOCK_OSS_ACCESS_KEY_SECRET: "test",
      STORYDOCK_OSS_BUCKET: "storydock-test-bucket",
      STORYDOCK_OSS_REGION: "cn-hangzhou",
      ALIYUN_ACCESS_KEY_ID: "test",
      ALIYUN_ACCESS_KEY_SECRET: "test",
    },
  });
  try {
    const project = services.repos.content.createProject({ name: "擦除测试" }).project;
    const shot = services.repos.content.createShot({
      projectId: project.id,
      episode: 1,
      number: 1,
      title: "测试镜",
      prompt: "无字幕",
      duration: 5,
    });
    const storageKey = `${project.id}/videos/source/output.mp4`;
    const bytes = Buffer.from([0, 0, 0, 16, 102, 116, 121, 112, 109, 112, 52, 50, 0, 0, 0, 0, ...Buffer.alloc(64)]);
    const local = services.media.locate(storageKey);
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, bytes);
    const mediaId = require("node:crypto").randomUUID();
    const now = new Date().toISOString();
    services.db
      .prepare("INSERT INTO media(id,project_id,storage_key,mime,bytes,sha256,source,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(mediaId, project.id, storageKey, "video/mp4", bytes.length, "abc", "upload", now);
    const jobId = require("node:crypto").randomUUID();
    services.db
      .prepare(
        "INSERT INTO jobs(id,project_id,source_id,batch_id,kind,status,provider,model,config_snapshot,input_snapshot,media_id,created_at,updated_at,completed_at) VALUES(?,?,?,?,?,'succeeded','jimeng','seedance','{}','{}',?,?,?,?)",
      )
      .run(jobId, project.id, shot.id, require("node:crypto").randomUUID(), "video", mediaId, now, now, now);

    const created = services.subtitleErase.createJob(shot.id, { advanced: true });
    assert.equal(created.provider, "aliyun_ims_detext");
    assert.equal(created.status, "queued");
    assert.equal(created.kind, "video");
    const input = JSON.parse(services.db.prepare("SELECT input_snapshot FROM jobs WHERE id=?").get(created.id).input_snapshot);
    assert.equal(input.sourceMediaId, mediaId);
    assert.match(input.outputStorageKey, /detext\.mp4$/);
  } finally {
    services.db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
