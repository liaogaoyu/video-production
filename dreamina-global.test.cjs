const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { openServices } = require("./server/context.cjs");
const {
  createGlobalService,
  bindReferences,
  nodeId,
} = require("./server/dreamina-global.cjs");
const { createGlobalRunner } = require("./worker/dreamina-global/runner.cjs");
const { createScheduler } = require("./worker/scheduler.cjs");
const { createHttpApp } = require("./server/api.cjs");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0oUAAAAASUVORK5CYII=",
  "base64",
);
function catalog(type) {
  return [
    {
      model: type === "image" ? "gpt_image_2" : "seedance_2.0_mini",
      modes: (type === "image" ? ["t2i", "i2i"] : ["t2v", "m2v"]).map(
        (name) => ({
          name,
          flags: [
            { flag: "--prompt", required: true, minLength: 1, maxLength: 4000 },
            { flag: "--ratio", required: true, values: ["16:9"] },
            {
              flag: "--resolution",
              values: [type === "image" ? "1K" : "720p"],
            },
            { flag: "--count", min: 1, max: 1 },
            ...(type === "video"
              ? [{ flag: "--duration", min: 4, max: 15 }]
              : []),
          ],
          references: {
            min: ["i2i", "m2v"].includes(name) ? 1 : 0,
            max: ["i2i", "m2v"].includes(name) ? 9 : 0,
            types: ["i2i", "m2v"].includes(name)
              ? [{ mediaType: "image", min: 1, max: 9 }]
              : [],
          },
        }),
      ),
    },
  ];
}
function fakeRunner() {
  const calls = [],
    nodes = new Map();
  let price = 20,
    lost = false;
  const value = (args, key) => args[args.indexOf(key) + 1];
  const values = (args, key) => args.filter((v, i) => i && args[i - 1] === key);
  return {
    calls,
    nodes,
    setPrice: (p) => (price = p),
    loseSubmit: () => (lost = true),
    async call(profile, args) {
      calls.push({ profile, args });
      const [group, command] = args;
      let data = {};
      if (group === "version") data = { version: "1.0.3" };
      if (group === "auth")
        data =
          command === "status"
            ? { loggedIn: true, expiresAt: "2099-01-01T00:00:00Z" }
            : command === "account"
              ? {
                  userId: profile === "same" ? "111" : profile,
                  isVip: true,
                  vipLevel: "test",
                }
              : command === "login"
                ? {
                    status: "authorization_required",
                    challenge: {
                      verificationUriComplete:
                        "https://dreamina.capcut.com/ai-tool/cli-auth-os?user_code=test",
                      deviceCode: "PRIVATE_DEVICE",
                      expiresAt: "2099-01-01T00:00:00Z",
                    },
                  }
                : { status: "logged_in" };
      if (group === "model") data = { items: catalog(value(args, "--type")) };
      if (group === "node" && command === "create") {
        const g = {
          model: value(args, "--model"),
          mode: value(args, "--mode"),
          prompt: value(args, "--prompt"),
          ratio: value(args, "--ratio"),
          resolution: value(args, "--resolution"),
          outputCount: 1,
          references: values(args, "--ref").map((r) => ({
            kind: "resource",
            id: r.slice(4),
          })),
        };
        if (args.includes("--duration"))
          g.durationSeconds = Number(value(args, "--duration"));
        g.promptParts = g.references.map((r, i) => ({
          kind: "reference",
          referenceIndex: i,
        }));
        nodes.set(value(args, "--node-id"), {
          nodeId: value(args, "--node-id"),
          generation: g,
        });
        data = { node: { generation: g } };
      }
      if (group === "node" && command === "show")
        data = {
          nodes: values(args, "--node-id").map((id) => ({
            node: nodes.get(id),
          })),
        };
      if (group === "node" && command === "quote")
        data = {
          items: values(args, "--node-id").map((id) => ({
            nodeId: id,
            maxCredits: price,
          })),
          totalMaxCredits: values(args, "--node-id").length * price,
          confirmable: true,
        };
      if (group === "node" && command === "confirm")
        data = { creditConfirmationToken: "PRIVATE_CONFIRM" };
      if (group === "node" && command === "run") {
        if (lost) {
          lost = false;
          throw Object.assign(Error("connection lost"), { uncertain: true });
        }
        data = {
          items: [{ submitId: value(args, "--submit-id"), state: "accepted" }],
        };
      }
      if (group === "operation")
        data = {
          state: "succeeded",
          resources: [
            {
              resourceId: "887ee950-d1d6-4b23-ba4b-97193dff05e5",
              state: "succeeded",
            },
          ],
          submission: { state: "completed" },
        };
      if (group === "resource" && command === "download") {
        const bytes = Buffer.from([
          0, 0, 0, 16, 102, 116, 121, 112, 109, 112, 52, 50, 0, 0, 0, 0,
        ]);
        fs.writeFileSync(value(args, "--output"), bytes);
        data = {
          size: bytes.length,
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        };
      }
      return { data, requestId: "test-request" };
    },
  };
}
async function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sd-global-test-"));
  const s = openServices({
    env: {
      STORYDOCK_ROOT: root,
      STORYDOCK_MASTER_KEY: path.join(root, "master"),
      STORYDOCK_STATIC_ROOT: __dirname,
    },
    cwd: __dirname,
  });
  const runner = fakeRunner();
  s.global = createGlobalService(s, { runner });
  const app = await createHttpApp(s);
  return {
    s,
    runner,
    app,
    close: async () => {
      await app.close();
      s.db.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
async function fixture(c) {
  const project = c.s.repos.content.createProject({
    name: "Global test",
  }).project;
  const a = c.s.global.createAccount({ name: "Global A", profile: "test-a" });
  await c.s.global.checkAccount(a.id);
  const asset = c.s.repos.content.createAsset({
    projectId: project.id,
    name: "宫廷",
    type: "场景",
    prompt: "A palace",
  });
  const shot = c.s.repos.content.createShot({
    projectId: project.id,
    title: "纯文分镜",
    prompt: "A palace in clouds",
    episode: 1,
    number: 999,
    duration: 4,
  });
  return { project, a, asset, shot };
}
async function prepare(c, f, overrides = {}) {
  const preview = c.s.global.createPreview(f.project.id, {
    accountId: f.a.id,
    kind: "video",
    sourceIds: [f.shot.id],
    model: "seedance_2.0_mini",
    ratio: "16:9",
    resolution: "720p",
    ...overrides,
  });
  await c.s.global.tick();
  const p = c.s.global.getPreview(preview.id);
  assert.equal(p.status, "quoted", p.error);
  return p;
}
test("global migration is additive and profiles/identity checks remain separate", async () => {
  const c = await setup();
  try {
    const f = await fixture(c);
    assert.match(f.a.profile, /test-a/);
    assert.throws(
      () => c.s.global.createAccount({ name: "B", profile: "test-a" }),
      /已添加/,
    );
    assert.equal(c.s.repos.accounts.listAccounts().length, 0);
    const b = c.s.global.createAccount({ name: "B", profile: "test-b" });
    await c.s.global.checkAccount(b.id);
    assert.equal(
      c.s.global.listAccounts().filter((a) => a.authorized).length,
      2,
    );
    const x = c.s.global.createAccount({ name: "duplicate", profile: "same" });
    await c.s.global.checkAccount(x.id);
    const y = c.s.global.createAccount({
      name: "duplicate2",
      profile: "same2",
    });
    c.runner.call = (function (original) {
      return async (profile, args) =>
        original(profile === "same2" ? "same" : profile, args);
    })(c.runner.call.bind(c.runner));
    await c.s.global.checkAccount(y.id);
    assert.equal(
      c.s.global.listAccounts().find((a) => a.id === y.id).authorized,
      false,
    );
  } finally {
    await c.close();
  }
});
test("preview never submits before approval, binds ceiling, and approval is idempotent", async () => {
  const c = await setup();
  try {
    const f = await fixture(c);
    const p = await prepare(c, f);
    assert.equal(c.s.repos.jobs.listJobs(f.project.id).length, 0);
    assert.ok(!c.runner.calls.some((c) => c.args[1] === "run"));
    assert.throws(
      () => c.s.global.approve(p.id, { inputHash: p.inputHash, ceiling: 19 }),
      /上限不足/,
    );
    const body = { inputHash: p.inputHash, ceiling: 20 };
    const b = c.s.global.approve(p.id, body);
    assert.deepEqual(c.s.global.approve(p.id, body), b);
    assert.equal(c.s.repos.jobs.listJobs(f.project.id).length, 1);
    assert.ok(
      !JSON.stringify(c.s.repos.jobs.listJobs(f.project.id)).includes(
        "PRIVATE_CONFIRM",
      ),
    );
  } finally {
    await c.close();
  }
});
test("global video queue runs through normal scheduler and archives a video", async () => {
  const c = await setup();
  try {
    const f = await fixture(c),
      p = await prepare(c, f);
    const b = c.s.global.approve(p.id, { inputHash: p.inputHash, ceiling: 20 });
    const scheduler = createScheduler({
      repos: c.s.repos,
      db: c.s.db,
      media: c.s.media,
      owner: "test",
      providers: { dreamina_global_canvas: c.s.global.provider() },
    });
    await scheduler.tick();
    let job = c.s.repos.jobs.getJob(b.jobIds[0]);
    assert.equal(job.status, "remote_running");
    c.s.db.prepare("UPDATE jobs SET next_run_at=NULL WHERE id=?").run(job.id);
    await scheduler.tick();
    await scheduler.tick();
    job = c.s.repos.jobs.getJob(job.id);
    assert.equal(job.status, "succeeded", job.errorMessage);
    assert.ok(job.mediaId);
    assert.equal(c.s.repos.content.graph(f.project.id).versions.length, 0);
    assert.equal(
      c.s.db.prepare("SELECT mime FROM media WHERE id=?").get(job.mediaId).mime,
      "video/mp4",
    );
    assert.equal(c.runner.calls.filter((c) => c.args[1] === "run").length, 1);
  } finally {
    await c.close();
  }
});
test("a lost submit response resumes original UUID and retry cannot run generation twice", async () => {
  const c = await setup();
  try {
    const f = await fixture(c),
      p = await prepare(c, f),
      b = c.s.global.approve(p.id, { inputHash: p.inputHash, ceiling: 20 });
    c.runner.loseSubmit();
    const scheduler = createScheduler({
      repos: c.s.repos,
      db: c.s.db,
      media: c.s.media,
      owner: "test",
      providers: { dreamina_global_canvas: c.s.global.provider() },
    });
    await scheduler.tick();
    const job = c.s.repos.jobs.getJob(b.jobIds[0]);
    assert.equal(job.status, "remote_running");
    assert.ok(job.remoteTaskId);
    c.s.repos.jobs.retryJob(job.id, { confirm: true });
    await scheduler.tick();
    await scheduler.tick();
    assert.equal(c.runner.calls.filter((c) => c.args[1] === "run").length, 1);
  } finally {
    await c.close();
  }
});
test("snapshot detects remote draft edits and price increases before any run", async () => {
  for (const mutate of ["price", "draft"]) {
    const c = await setup();
    try {
      const f = await fixture(c),
        p = await prepare(c, f),
        b = c.s.global.approve(p.id, { inputHash: p.inputHash, ceiling: 20 });
      if (mutate === "price") c.runner.setPrice(21);
      else
        for (const node of c.runner.nodes.values())
          node.generation.prompt = "modified";
      const scheduler = createScheduler({
        repos: c.s.repos,
        db: c.s.db,
        media: c.s.media,
        owner: "test",
        providers: { dreamina_global_canvas: c.s.global.provider() },
      });
      await scheduler.tick();
      assert.equal(c.s.repos.jobs.getJob(b.jobIds[0]).status, "failed");
      assert.ok(!c.runner.calls.some((c) => c.args[1] === "run"));
    } finally {
      await c.close();
    }
  }
});
test("global authorization session hides device code and superseded sessions stay cancelled", async () => {
  const c = await setup();
  try {
    const f = await fixture(c);
    const old = c.s.global.beginAuth(f.a.id),
      fresh = c.s.global.beginAuth(f.a.id);
    await c.s.global.tick();
    assert.equal(c.s.global.getAuth(old.authSessionId).status, "cancelled");
    assert.equal(
      c.s.global.getAuth(fresh.authSessionId).status,
      "awaiting_user",
    );
    assert.ok(
      !JSON.stringify(c.s.global.getAuth(fresh.authSessionId)).includes(
        "PRIVATE_DEVICE",
      ),
    );
    await c.s.global.tick();
    assert.equal(c.s.global.getAuth(fresh.authSessionId).status, "authorized");
    assert.equal(
      c.s.db
        .prepare("SELECT ciphertext FROM global_auth WHERE id=?")
        .get(fresh.authSessionId).ciphertext,
      null,
    );
  } finally {
    await c.close();
  }
});
test("global runner accepts stderr JSON and redacts transport diagnostics", async () => {
  const runner = createGlobalRunner({
    exec: (file, args, options, cb) =>
      cb(
        Object.assign(Error("secret-output"), { code: 2 }),
        "",
        JSON.stringify({
          ok: false,
          error: { code: "cli.invalid_command", message: "bad field" },
        }),
      ),
  });
  await assert.rejects(
    runner.call("p", ["version"]),
    (e) => e.code === "cli.invalid_command",
  );
  const missing = createGlobalRunner({
    exec: (f, a, o, cb) =>
      cb(Object.assign(Error("PASSWORD"), { code: "ENOENT" }), "", ""),
  });
  await assert.rejects(
    missing.call("p", ["version"]),
    (e) => e.code === "global_cli_missing" && !e.message.includes("PASSWORD"),
  );
});
test("reference compiler keeps Chinese adjacency and repeated names bound to exact resource", () => {
  assert.match(nodeId(), /^node_[0-9a-hjkmnp-tv-z]{10}$/);
  assert.equal(
    bindReferences("巨大@宫廷内部。", [{ name: "宫廷", resourceId: "id" }]),
    "巨大{{res:id}}内部。",
  );
  assert.equal(
    bindReferences("@宫廷内 @宫廷 @宫廷", [
      { name: "宫廷", resourceId: "one" },
      { name: "宫廷内", resourceId: "two" },
    ]),
    "{{res:two}} {{res:one}} {{res:one}}",
  );
});
test("reference video preview uses fixed version and validates actual resource placeholders", async () => {
  const c = await setup();
  try {
    const f = await fixture(c);
    const v = await c.s.repos.content.addVersion(f.asset.id, {
      bytes: PNG,
      source: "upload",
    });
    c.s.repos.content.setLockedVersion(f.asset.id, v.id);
    const shot = c.s.repos.content.createShot({
      projectId: f.project.id,
      title: "shot",
      prompt: "@宫廷 转场。",
      episode: 1,
      number: 1,
      duration: 4,
    });
    const p = await prepare(c, f, {
      kind: "video",
      sourceIds: [shot.id],
      model: "seedance_2.0_mini",
      resolution: "720p",
    });
    const run = c.s.db
      .prepare("SELECT * FROM global_runs WHERE preview_id=?")
      .get(p.id);
    const g = JSON.parse(run.generation_json);
    assert.equal(g.mode, "m2v");
    assert.match(g.promptSubmitted, /\{\{res:/);
    assert.equal(g.references[0].versionId, v.id);
    assert.ok(
      c.runner.calls.some(
        (c) => c.args[0] === "resource" && c.args[1] === "upload",
      ),
    );
    const b = c.s.global.approve(p.id, { inputHash: p.inputHash, ceiling: 20 });
    const frozen = c.s.repos.jobs.getJob(b.jobIds[0]);
    assert.equal(
      JSON.parse(frozen.inputSnapshot).references[0].versionId,
      v.id,
    );
  } finally {
    await c.close();
  }
});
test("global API routes expose no credentials and static script is CSP-compatible", async () => {
  const c = await setup();
  try {
    const response = await c.app.inject({
      method: "POST",
      url: "/api/v1/dreamina-global/accounts",
      payload: { name: "UI account", profile: "ui-account" },
    });
    assert.equal(response.statusCode, 201);
    const account = JSON.parse(response.body).account;
    const checked = await c.app.inject({
      method: "POST",
      url: `/api/v1/dreamina-global/accounts/${account.id}/check`,
    });
    assert.equal(JSON.parse(checked.body).account.authorized, true);
    const page = await c.app.inject({ method: "GET", url: "/" });
    assert.ok(
      page.body.indexOf("web/global.js") < page.body.indexOf('src="app.js"'),
    );
    assert.equal(
      (await c.app.inject({ method: "GET", url: "/web/global.js" })).statusCode,
      200,
    );
    assert.ok(!JSON.stringify(JSON.parse(response.body)).includes("token"));
  } finally {
    await c.close();
  }
});
test("international CLI is video-only: reject image model discovery and all asset generation requests", async () => {
  const c = await setup();
  try {
    const f = await fixture(c);
    await assert.rejects(
      c.s.global.models(f.a.id, "image"),
      (e) => e.code === "global_video_only",
    );
    assert.throws(
      () =>
        c.s.global.createPreview(f.project.id, {
          accountId: f.a.id,
          kind: "image",
          sourceIds: [f.asset.id],
          model: "gpt_image_2",
        }),
      (e) => e.code === "global_video_only",
    );
    const r = await c.app.inject({
      method: "POST",
      url: `/api/v1/projects/${f.project.id}/global-previews`,
      payload: {
        accountId: f.a.id,
        kind: "asset",
        sourceIds: [f.asset.id],
        model: "gpt_image_2",
      },
    });
    assert.equal(r.statusCode, 400);
    assert.equal(JSON.parse(r.body).error.code, "global_video_only");
    assert.ok(
      !c.runner.calls.some(
        (call) => call.args[0] === "model" && call.args.includes("image"),
      ),
    );
  } finally {
    await c.close();
  }
});
test('long remote polling cannot consume the later download retry budget',async()=>{const c=await setup();try{const f=await fixture(c),p=await prepare(c,f),b=c.s.global.approve(p.id,{inputHash:p.inputHash,ceiling:20});const scheduler=createScheduler({repos:c.s.repos,db:c.s.db,media:c.s.media,owner:'test',providers:{dreamina_global_canvas:c.s.global.provider()}});await scheduler.tick();c.s.db.prepare('UPDATE jobs SET attempt=30,next_run_at=NULL WHERE id=?').run(b.jobIds[0]);await scheduler.tick();assert.equal(c.s.repos.jobs.getJob(b.jobIds[0]).attempt,0);await scheduler.tick();assert.equal(c.s.repos.jobs.getJob(b.jobIds[0]).status,'succeeded');}finally{await c.close();}});
