const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { openServices } = require("./server/context.cjs"),
  { createHttpApp } = require("./server/api.cjs"),
  { hashPassword } = require("./server/auth-http.cjs");
async function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "commercial-"));
  const s = openServices({
    env: { STORYDOCK_ROOT: root, STORYDOCK_MASTER_KEY: path.join(root, "key") },
    cwd: __dirname,
  });
  const users = [];
  for (const name of ["admin", "alice", "bob"]) {
    const id = crypto.randomUUID();
    s.db
      .prepare(
        "INSERT INTO app_users(id,username,password_hash,created_at,role,email,email_verified_at) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        id,
        name,
        await hashPassword("password123"),
        new Date().toISOString(),
        name === "admin" ? "admin" : "user",
        name + "@example.com",
        new Date().toISOString(),
      );
    users.push({ id, name });
  }
  const app = await createHttpApp(s);
  for (const u of users) {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: u.name, password: "password123" },
    });
    assert.equal(r.statusCode, 200, r.body);
    u.cookie = r.headers["set-cookie"].split(";")[0];
  }
  return {
    s,
    app,
    users,
    async close() {
      await app.close();
      s.db.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
const req = (c, u, method, url, payload) =>
  c.app.inject({
    method,
    url: "/api/v1/" + url,
    headers: { cookie: u.cookie },
    payload,
  });
test("members own new projects and cannot access another users project, files, tasks, admin routes or SSE events", async () => {
  const c = await setup();
  try {
    const [admin, a, b] = c.users;
    const r = await req(c, a, "POST", "projects", {
      name: "私有项目",
      assetCommonPrompt: "暖金日光",
    });
    assert.equal(r.statusCode, 201, r.body);
    const p = r.json().project;
    assert.equal(p.assetCommonPrompt, "暖金日光");
    assert.equal(
      c.s.db.prepare("SELECT owner_user_id FROM projects WHERE id=?").get(p.id)
        .owner_user_id,
      a.id,
    );
    assert.equal(
      (await req(c, b, "GET", "projects")).json().projects.length,
      0,
    );
    assert.equal((await req(c, b, "GET", "projects/" + p.id)).statusCode, 404);
    assert.equal(
      (
        await req(c, b, "PATCH", "projects/" + p.id, {
          revision: p.revision,
          name: "偷改",
        })
      ).statusCode,
      404,
    );
    const m = await c.s.repos.content.saveMedia({
      projectId: p.id,
      bytes: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
        "base64",
      ),
      source: "test",
    });
    assert.equal((await req(c, b, "GET", "media/" + m.id)).statusCode, 404);
    assert.equal((await req(c, a, "GET", "jimeng/accounts")).statusCode, 403);
    assert.equal(
      (await req(c, a, "POST", "projects/" + p.id + "/jobs/batch", {}))
        .statusCode,
      403,
    );
    assert.equal(
      (await req(c, b, "GET", "events?after=0")).json().events.length,
      0,
    );
    assert.ok((await req(c, a, "GET", "events?after=0")).json().events.length);
    assert.equal(
      (await req(c, admin, "GET", "projects/" + p.id)).statusCode,
      200,
    );
  } finally {
    await c.close();
  }
});
module.exports = { setup, req };
test("email verification and password reset are expiring, single-use and revoke old sessions", async () => {
  const c = await setup();
  try {
    const sent = [];
    c.s.mailer = async (m) => sent.push(m);
    const cfg = require("./server/commercial-settings.cjs").settingsService(
      c.s,
    );
    cfg.save({ ...cfg.publicSettings(), registrationEnabled: true });
    let r = await c.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "New@Example.com", password: "password123" },
    });
    assert.equal(r.statusCode, 200, r.body);
    const code = sent[0].text.match(/\d{6}/)[0];
    assert.ok(!r.body.includes(code));
    r = await c.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "new@example.com", password: "password123" },
    });
    assert.equal(r.statusCode, 401);
    for (let i = 0; i < 2; i++) {
      r = await c.app.inject({
        method: "POST",
        url: "/api/v1/auth/email/verify",
        payload: { email: "new@example.com", code },
      });
      assert.equal(r.statusCode, i ? 400 : 200, r.body);
    }
    r = await c.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "new@example.com", password: "password123" },
    });
    assert.equal(r.statusCode, 200, r.body);
    const cookie = r.headers["set-cookie"].split(";")[0];
    await c.app.inject({
      method: "POST",
      url: "/api/v1/auth/password/forgot",
      payload: { email: "new@example.com" },
    });
    const reset = sent[1].text.match(/\d{6}/)[0];
    r = await c.app.inject({
      method: "POST",
      url: "/api/v1/auth/password/reset",
      payload: {
        email: "new@example.com",
        code: reset,
        password: "newpassword123",
      },
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(
      (await c.app.inject({ url: "/api/v1/projects", headers: { cookie } }))
        .statusCode,
      401,
    );
    assert.equal(
      c.s.db.prepare("SELECT count(*) n FROM wallet_ledger").get().n,
      0,
    );
  } finally {
    await c.close();
  }
});
test("manual topups, quote freeze, success settlement and failure refund are atomic and replay safe", async () => {
  const c = await setup();
  try {
    const [admin, a, b] = c.users;
    const cfg = c.s.billing.pricing;
    cfg.save({
      ...cfg.publicSettings(),
      enabled: true,
      rates: {
        domestic: {
          purchaseFen: 26000,
          purchaseCredits: 6200,
          markupPercent: 50,
        },
        international: {
          purchaseFen: 3000,
          purchaseCredits: 1500,
          markupPercent: 50,
        },
        image: { costFen: 10, markupPercent: 50 },
      },
    });
    const topup = () =>
      c.app.inject({
        method: "POST",
        url: "/api/v1/admin/users/" + a.id + "/topups",
        headers: { cookie: admin.cookie, "idempotency-key": "test-topup-1" },
        payload: { amountFen: 100, giftPoints: 0, note: "微信收款测试" },
      });
    assert.equal((await topup()).statusCode, 200);
    await topup();
    assert.equal(c.s.billing.wallet(a.id).available, 100);
    assert.equal(
      (
        await req(c, a, "POST", "admin/users/" + a.id + "/topups", {
          amountFen: 100,
        })
      ).statusCode,
      403,
    );
    const p = (await req(c, a, "POST", "projects", { name: "计费项目" })).json()
      .project;
    const asset = c.s.repos.content.createAsset({
      projectId: p.id,
      name: "碗",
      type: "道具",
      prompt: "白瓷碗",
    });
    c.s.repos.accounts.saveImageConnection(
      { name: "test", baseUrl: "https://example.com/v1", model: "gpt-image-2" },
      c.s.secrets.seal("test-key", { accountId: "", purpose: "image-api-key" }),
    );
    let quote = await req(
      c,
      a,
      "POST",
      "projects/" + p.id + "/generation-quotes",
      { offerId: "image-default", sourceIds: [asset.id] },
    );
    assert.equal(quote.statusCode, 200, quote.body);
    const q = quote.json();
    assert.equal(q.amount, 15);
    assert.equal(
      (await req(c, b, "POST", "generation-quotes/" + q.id + "/confirm", {}))
        .statusCode,
      404,
    );
    const confirm = () =>
      req(c, a, "POST", "generation-quotes/" + q.id + "/confirm", {});
    const r = await confirm();
    assert.equal(r.statusCode, 202, r.body);
    const id = r.json().jobIds[0];
    assert.equal((await confirm()).json().jobIds[0], id);
    assert.deepEqual(
      { ...c.s.billing.wallet(a.id) },
      { user_id: a.id, available: 85, frozen: 15, due: 0, currency:"CNY" },
    );
    c.s.db.prepare("UPDATE jobs SET status='failed' WHERE id=?").run(id);
    c.s.billing.reconcile();
    c.s.billing.reconcile();
    assert.equal(c.s.billing.wallet(a.id).available, 100);
    assert.equal(c.s.billing.wallet(a.id).frozen, 0);
    quote = await req(c, a, "POST", "projects/" + p.id + "/generation-quotes", {
      offerId: "image-default",
      sourceIds: [asset.id],
    });
    const done = (
      await req(
        c,
        a,
        "POST",
        "generation-quotes/" + quote.json().id + "/confirm",
        {},
      )
    ).json().jobIds[0];
    const media = await c.s.repos.content.saveMedia({projectId:p.id,bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'),source:'test'});
    c.s.db.prepare("UPDATE jobs SET status='succeeded',media_id=? WHERE id=?").run(media.id,done);
    c.s.billing.reconcile();
    c.s.billing.reconcile();
    assert.equal(c.s.billing.wallet(a.id).available, 85);
    assert.equal(c.s.billing.wallet(a.id).frozen, 0);
    assert.equal(
      c.s.db
        .prepare("SELECT COUNT(*) n FROM wallet_ledger WHERE business_key=?")
        .get("settle:" + done).n,
      1,
    );
    quote = await req(c, a, "POST", "projects/" + p.id + "/generation-quotes", {
      offerId: "image-default",
      sourceIds: [asset.id],
    });
    c.s.db
      .prepare("UPDATE generation_quotes SET expires_at=0 WHERE id=?")
      .run(quote.json().id);
    assert.equal(
      (
        await req(
          c,
          a,
          "POST",
          "generation-quotes/" + quote.json().id + "/confirm",
          {},
        )
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await req(c, a, "POST", "projects/" + p.id + "/generation-quotes", {
          offerId: "cn-seedance",
          sourceIds: [asset.id],
        })
      ).statusCode,
      404,
    );
  } finally {
    await c.close();
  }
});
test("pricing separates channels and computes actual task charges; account balance never bills a task", () => {
  const { price } = require("./server/billing.cjs");
  assert.equal(
    price(
      20000,
      { purchaseFen: 26000, purchaseCredits: 6200, markupPercent: 50 },
      100,
      "video",
    ),
    126,
  );
  assert.equal(
    price(
      20000,
      { purchaseFen: 3000, purchaseCredits: 1500, markupPercent: 50 },
      100,
      "video",
    ),
    60,
  );
  assert.equal(
    price(1000, { costFen: 10, markupPercent: 50 }, 100, "image"),
    15,
  );
});
test("parallel requests never mix owners or overspend a wallet; changed inputs require a fresh quote", async () => {
  const c = await setup();
  try {
    const [, a, b] = c.users;
    const ps = await Promise.all([
      req(c, a, "POST", "projects", { name: "A" }),
      req(c, b, "POST", "projects", { name: "B" }),
    ]);
    for (let i = 0; i < 2; i++)
      assert.equal(
        c.s.db
          .prepare("SELECT owner_user_id FROM projects WHERE id=?")
          .get(ps[i].json().project.id).owner_user_id,
        [a, b][i].id,
      );
    const p = ps[0].json().project;
    c.s.billing.pricing.save({
      ...c.s.billing.pricing.publicSettings(),
      enabled: true,
    });
    c.s.billing.topup(
      c.users[0],
      a.id,
      { amountFen: 15, giftPoints: 0, note: "test" },
      "parallel-topup",
    );
    c.s.repos.accounts.saveImageConnection(
      { name: "test", baseUrl: "https://example.com/v1", model: "gpt-image-2" },
      c.s.secrets.seal("k", { accountId: "", purpose: "image-api-key" }),
    );
    const asset = c.s.repos.content.createAsset({
        projectId: p.id,
        name: "道具",
        type: "道具",
        prompt: "p",
      }),
      input = { offerId: "image-default", sourceIds: [asset.id] };
    const qs = await Promise.all([
      req(c, a, "POST", "projects/" + p.id + "/generation-quotes", input),
      req(c, a, "POST", "projects/" + p.id + "/generation-quotes", input),
    ]);
    const rs = await Promise.all(
      qs.map((q) =>
        req(c, a, "POST", "generation-quotes/" + q.json().id + "/confirm", {}),
      ),
    );
    assert.deepEqual(rs.map((r) => r.statusCode).sort(), [202, 409]);
    assert.equal(c.s.billing.wallet(a.id).available, 5);
    assert.equal(c.s.billing.wallet(a.id).frozen, 10);
    const q = await req(
      c,
      a,
      "POST",
      "projects/" + p.id + "/generation-quotes",
      input,
    );
    c.s.db
      .prepare("UPDATE assets SET prompt=? WHERE id=?")
      .run("changed", asset.id);
    assert.equal(
      (
        await req(
          c,
          a,
          "POST",
          "generation-quotes/" + q.json().id + "/confirm",
          {},
        )
      ).statusCode,
      409,
    );
  } finally {
    await c.close();
  }
});
test("public style is frozen into new image jobs and survives later edits without changing asset text", async () => {
  const c = await setup();
  try {
    const p = c.s.repos.content.createProject({
        name: "风格",
        assetCommonPrompt: "暖金日光",
      }).project,
      a = c.s.repos.content.createAsset({
        projectId: p.id,
        name: "空房间",
        type: "场景",
        prompt: "木地板",
      });
    c.s.repos.accounts.saveImageConnection(
      { name: "test", baseUrl: "https://example.com/v1", model: "image" },
      c.s.secrets.seal("k", { accountId: "", purpose: "image-api-key" }),
    );
    const batch = c.s.repos.jobs.createBatch({
      projectId: p.id,
      body: { kind: "image", sourceIds: [a.id] },
      idempotencyKey: crypto.randomUUID(),
    });
    const input = JSON.parse(
      c.s.repos.jobs.getJob(batch.jobIds[0]).inputSnapshot,
    );
    assert.equal(input.promptOriginal, "木地板");
    assert.equal(input.projectPromptOriginal, "暖金日光");
    assert.match(input.promptSubmitted, /暖金日光/);
    assert.match(input.promptSubmitted, /场景资产范围/);
    c.s.repos.content.updateProject(p.id, {
      revision: p.revision,
      assetCommonPrompt: "冷光",
    });
    assert.equal(
      JSON.parse(c.s.repos.jobs.getJob(batch.jobIds[0]).inputSnapshot)
        .projectPromptOriginal,
      "暖金日光",
    );
  } finally {
    await c.close();
  }
});
test("download errors retain reservations, explicit cancellation refunds once, actual task usage returns the difference", async () => {
  const c = await setup();
  try {
    const { db, billing } = c.s,
      a = c.users[1],
      stamp = new Date().toISOString(),
      p = c.s.repos.content.createProject({ name: "结算恢复" }).project;
    const { transaction } = require("./server/db.cjs"),
      { movement } = require("./server/billing.cjs");
    billing.topup(
      c.users[0],
      a.id,
      { amountFen: 1000, giftPoints: 0, note: "test" },
      "settlement-topup",
    );
    const seed = (status, actual) => {
      const id = crypto.randomUUID();
      transaction(db, () => {
        db.prepare(
          "INSERT INTO jobs(id,project_id,source_id,kind,status,provider,config_snapshot,input_snapshot,remote_task_id,result_json,created_at,updated_at) VALUES(?,?,?,'video',?,'jimeng','{}','{}',?,?,?,?)",
        ).run(
          id,
          p.id,
          crypto.randomUUID(),
          status,
          "official-" + id,
          JSON.stringify({
            officialUsage:
              actual === undefined
                ? null
                : {
                    source: "official_actual",
                    taskId: "official-" + id,
                    credits: actual,
                  },
          }),
          stamp,
          stamp,
        );
        movement(db, {
          userId: a.id,
          key: "freeze:" + id,
          action: "freeze",
          available: -60,
          frozen: 60,
          amount: 60,
          jobId: id,
        });
        db.prepare("INSERT INTO job_billing(job_id,user_id,quote_id,reserved,charged,status,snapshot,usage_json,created_at,updated_at) VALUES(?,?,?,?,0,?,?,?,?,?)").run(
          id,
          a.id,
          "quote-test",
          60,
          "frozen",
          JSON.stringify({
            kind: "video",
            source: "configured",
            rate: {
              purchaseFen: 3000,
              purchaseCredits: 1500,
              markupPercent: 50,
            },
            pointsPerYuan: 100,
          }),
          null,
          stamp,
          stamp,
        );
      });
      return id;
    };
    const pending = seed("download_failed");
    billing.reconcile();
    assert.equal(billing.wallet(a.id).frozen, 60);
    db.prepare("UPDATE jobs SET status='failed' WHERE id=?").run(pending);
    billing.reconcile();
    assert.equal(billing.wallet(a.id).frozen, 0);
    const good = seed("succeeded", 10);
    billing.reconcile();
    assert.equal(
      db.prepare("SELECT charged FROM job_billing WHERE job_id=?").get(good)
        .charged,
      30,
    );
    const high = seed("succeeded", 100);
    billing.reconcile();
    assert.equal(
      db.prepare("SELECT charged FROM job_billing WHERE job_id=?").get(high)
        .charged,
      300,
    );
    const unknown = seed("succeeded");
    billing.reconcile();
    assert.equal(
      db.prepare("SELECT charged FROM job_billing WHERE job_id=?").get(unknown)
        .charged,
      0,
    );
    const cancelled = seed("queued");
    db.prepare("UPDATE projects SET owner_user_id=? WHERE id=?").run(
      a.id,
      p.id,
    );
    assert.equal(
      (await req(c, a, "POST", "jobs/" + cancelled + "/cancel", {})).statusCode,
      200,
    );
    assert.equal(
      (await req(c, a, "POST", "jobs/" + cancelled + "/cancel", {})).statusCode,
      200,
    );
    assert.equal(billing.wallet(a.id).frozen, 60);
    assert.equal(
      db.prepare("SELECT status FROM job_billing WHERE job_id=?").get(cancelled)
        .status,
      "refunded",
    );
  } finally {
    await c.close();
  }
});
test("SMTP secrets are encrypted, member settings are denied, and confirmed quotes retain old prices", async () => {
  const c = await setup();
  try {
    const [, a] = c.users,
      cfg = c.s.billing.pricing;
    const before = cfg.publicSettings();
    const after = cfg.save({
      ...before,
      smtp: {
        host: "smtp.example.com",
        port: 465,
        user: "sender@example.com",
        from: "sender@example.com",
        password: "fixture-smtp-secret-only",
      },
      enabled: true,
    });
    assert.equal(after.smtpConfigured, true);
    assert.equal(
      JSON.stringify(after).includes("fixture-smtp-secret-only"),
      false,
    );
    const stored = JSON.parse(
      c.s.db.prepare("SELECT value FROM commercial_settings WHERE id=1").get()
        .value,
    );
    assert.equal(
      JSON.stringify(stored).includes("fixture-smtp-secret-only"),
      false,
    );
    assert.equal(
      c.s.secrets.open(stored.smtpSecret, {
        accountId: "",
        purpose: "smtp-password",
      }),
      "fixture-smtp-secret-only",
    );
    assert.equal((await req(c, a, "GET", "admin/settings")).statusCode, 403);
    const p = (await req(c, a, "POST", "projects", { name: "报价锁价" })).json()
        .project,
      asset = c.s.repos.content.createAsset({
        projectId: p.id,
        name: "碗",
        type: "道具",
        prompt: "p",
      });
    c.s.repos.accounts.saveImageConnection(
      { name: "test", baseUrl: "https://example.com/v1", model: "gpt-image" },
      c.s.secrets.seal("k", { accountId: "", purpose: "image-api-key" }),
    );
    c.s.billing.topup(
      c.users[0],
      a.id,
      { amountFen: 100, giftPoints: 0, note: "test" },
      "price-lock-topup",
    );
    const q = (
      await req(c, a, "POST", "projects/" + p.id + "/generation-quotes", {
        offerId: "image-default",
        sourceIds: [asset.id],
      })
    ).json();
    assert.equal(q.amount, 10);
    const rates = cfg.get().rates;
    cfg.save({
      ...cfg.publicSettings(),
      rates: { ...rates, image: { costFen: 10, markupPercent: 100 } },
    });
    const response = await req(
      c,
      a,
      "POST",
      "generation-quotes/" + q.id + "/confirm",
      {},
    );
    assert.equal(response.statusCode, 202, response.body);
    assert.equal(c.s.billing.wallet(a.id).frozen, 10);
    assert.throws(
      () => cfg.save({ ...cfg.publicSettings(), pointsPerYuan: 200 }),
      /不能修改面值/,
    );
  } finally {
    await c.close();
  }
});
test("billed resource failure retries get a new quote, preserve JPEG recovery and link attempts once", async () => {
  const c = await setup();
  try {
    const [, a] = c.users,
      db = c.s.db;
    const p = (await req(c, a, "POST", "projects", { name: "收费重试" })).json()
      .project;
    const shot = c.s.repos.content.createShot({
      projectId: p.id,
      title: "镜头",
      prompt: "空房间",
      number: 1,
      episode: 1,
      duration: 9,
    });
    c.s.billing.pricing.save({
      ...c.s.billing.pricing.publicSettings(),
      enabled: true,
    });
    c.s.billing.updateOffer("cn-seedance", {
      pricing: { perSecondCredits: 1 },
    });
    const account = c.s.repos.accounts.createAccount({ name: "测试账号" });
    db.prepare(
      "UPDATE jimeng_accounts SET authorized=1,permission='allowed' WHERE id=?",
    ).run(account.id);
    c.s.billing.topup(
      c.users[0],
      a.id,
      { amountFen: 1000, giftPoints: 0, note: "test" },
      "retry-test-topup",
    );
    const original = crypto.randomUUID(),
      stamp = new Date().toISOString();
    db.prepare(
      "INSERT INTO jobs(id,project_id,source_id,kind,status,provider,config_snapshot,input_snapshot,error_message,remote_task_id,created_at,updated_at) VALUES(?,?,?,'video','failed','jimeng','{}','{}','18005 ParamImageResourceUnavailable','old-task',?,?)",
    ).run(original, p.id, shot.id, stamp, stamp);
    assert.equal(
      (await req(c, a, "POST", "jobs/" + original + "/retry", {})).statusCode,
      409,
    );
    const body = {
        offerId: "cn-seedance",
        sourceIds: [shot.id],
        retryJobId: original,
      },
      q = (
        await req(c, a, "POST", "projects/" + p.id + "/generation-quotes", body)
      ).json(),
      response = await req(
        c,
        a,
        "POST",
        "generation-quotes/" + q.id + "/confirm",
        {},
      );
    assert.equal(response.statusCode, 202, response.body);
    const next = response.json().jobIds[0];
    assert.equal(
      JSON.parse(c.s.repos.jobs.getJob(next).inputSnapshot)
        .referenceImageFormat,
      "jpeg",
    );
    assert.equal(
      JSON.parse(c.s.repos.jobs.getJob(original).resultJson).resubmittedJobId,
      next,
    );
    assert.equal(
      (await req(c, a, "POST", "projects/" + p.id + "/generation-quotes", body))
        .statusCode,
      409,
    );
  } finally {
    await c.close();
  }
});
