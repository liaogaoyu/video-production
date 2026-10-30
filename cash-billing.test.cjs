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
const { cliUsage, webUsage } = require("./server/actual-usage.cjs");
const { movement, reconcileJob } = require("./server/billing.cjs");
function seed(
  c,
  a,
  p,
  {
    reserved = 60,
    status = "succeeded",
    usage,
    kind = "video",
    mediaId = null,
  } = {},
) {
  const db = c.s.db,
    id = crypto.randomUUID(),
    stamp = new Date().toISOString(),
    taskId = "official-" + id;
  db.prepare(
    "INSERT INTO jobs(id,project_id,source_id,kind,status,provider,config_snapshot,input_snapshot,remote_task_id,result_json,media_id,created_at,updated_at) VALUES(?,?,?,?,?,'jimeng','{}','{}',?,?,?,?,?)",
  ).run(
    id,
    p.id,
    crypto.randomUUID(),
    kind,
    status,
    taskId,
    JSON.stringify({
      officialUsage:
        usage === undefined
          ? null
          : {
              source: "official_actual",
              taskId,
              credits: usage,
              receiptId: "receipt-" + id,
            },
    }),
    mediaId,
    stamp,
    stamp,
  );
  movement(db, {
    userId: a.id,
    key: "freeze:" + id,
    action: "freeze",
    available: -reserved,
    frozen: reserved,
    amount: reserved,
    jobId: id,
  });
  db.prepare(
    "INSERT INTO job_billing(job_id,user_id,quote_id,reserved,status,snapshot,created_at,updated_at) VALUES(?,?,?,?,'frozen',?,?,?)",
  ).run(
    id,
    a.id,
    "quote-" + id,
    reserved,
    JSON.stringify({
      kind,
      source: "configured",
      rate:
        kind === "image"
          ? { costFen: 10, markupPercent: 50 }
          : { purchaseFen: 3000, purchaseCredits: 1500, markupPercent: 50 },
    }),
    stamp,
    stamp,
  );
  return { id, taskId };
}
test("actual settlement refunds a lower cost, collects higher cost, handles zero and never guesses missing usage", async () => {
  const c = await setup();
  try {
    const [admin, a] = c.users,
      p = c.s.repos.content.createProject({ name: "cash-test" }).project;
    c.s.billing.topup(
      admin,
      a.id,
      { amountFen: 1000, note: "cash" },
      "cash-recharge-1",
    );
    const low = seed(c, a, p, { usage: 10 });
    reconcileJob(c.s.db, low.id);
    reconcileJob(c.s.db, low.id);
    assert.equal(c.s.billing.wallet(a.id).available, 970);
    const high = seed(c, a, p, { usage: 100 });
    reconcileJob(c.s.db, high.id);
    assert.equal(c.s.billing.wallet(a.id).available, 670);
    const zero = seed(c, a, p, { usage: 0 });
    reconcileJob(c.s.db, zero.id);
    assert.equal(c.s.billing.wallet(a.id).available, 670);
    const missing = seed(c, a, p);
    reconcileJob(c.s.db, missing.id);
    assert.equal(c.s.billing.wallet(a.id).frozen, 60);
    assert.equal(
      c.s.db
        .prepare("SELECT charged FROM job_billing WHERE job_id=?")
        .get(missing.id).charged,
      0,
    );
    c.s.db
      .prepare("UPDATE jobs SET result_json=? WHERE id=?")
      .run(
        JSON.stringify({
          officialUsage: {
            source: "official_actual",
            taskId: "different",
            credits: 1,
          },
        }),
        missing.id,
      );
    reconcileJob(c.s.db, missing.id);
    assert.equal(c.s.billing.wallet(a.id).frozen, 60);
    const failed = seed(c, a, p, { status: "failed", usage: 100 });
    reconcileJob(c.s.db, failed.id);
    assert.equal(c.s.billing.wallet(a.id).frozen, 60);
    assert.equal(
      c.s.db
        .prepare("SELECT count(*) n FROM wallet_ledger WHERE business_key=?")
        .get("settle:" + low.id).n,
      1,
    );
  } finally {
    await c.close();
  }
});
test("insufficient supplemental balance records debt, rejects new generation and topup pays debt once", async () => {
  const c = await setup();
  try {
    const [admin, a] = c.users,
      p = c.s.repos.content.createProject({ name: "debt" }).project;
    c.s.db
      .prepare("UPDATE projects SET owner_user_id=? WHERE id=?")
      .run(a.id, p.id);
    c.s.billing.topup(
      admin,
      a.id,
      { amountFen: 100, note: "cash" },
      "debt-recharge-1",
    );
    const j = seed(c, a, p, { usage: 100 });
    reconcileJob(c.s.db, j.id);
    assert.equal(c.s.billing.wallet(a.id).available, 0);
    assert.equal(c.s.billing.wallet(a.id).due, 200);
    const asset = c.s.repos.content.createAsset({
      projectId: p.id,
      name: "杯子",
      type: "道具",
      prompt: "白杯",
    });
    c.s.billing.pricing.save({
      ...c.s.billing.pricing.publicSettings(),
      enabled: true,
    });
    const q = c.s.billing.quote(a, p.id, {
      offerId: "image-default",
      sourceIds: [asset.id],
    });
    assert.throws(() => c.s.billing.confirm(a, q.id), /待补扣/);
    const r = c.s.billing.topup(
      admin,
      a.id,
      { amountFen: 250, note: "repayment" },
      "debt-recharge-2",
    );
    assert.equal(r.wallet.available, 50);
    assert.equal(r.wallet.due, 0);
    c.s.billing.topup(
      admin,
      a.id,
      { amountFen: 250, note: "repayment" },
      "debt-recharge-2",
    );
    assert.equal(c.s.billing.wallet(a.id).available, 50);
    const b = c.s.db
      .prepare("SELECT * FROM job_billing WHERE job_id=?")
      .get(j.id);
    assert.equal(b.charged, 300);
    assert.equal(b.actual_amount, 300);
    assert.equal(b.status, "settled");
  } finally {
    await c.close();
  }
});
test("CLI parsing accepts actual credit_count zero, rejects injected prompt values and mismatched task IDs", () => {
  assert.equal(
    cliUsage(
      JSON.stringify({
        submit_id: "task",
        gen_status: "success",
        credit_count: 54,
      }),
      "task",
    ).credits,
    54,
  );
  assert.equal(
    cliUsage(
      JSON.stringify({
        submit_id: "task",
        gen_status: "success",
        credit_count: 0,
      }),
      "task",
    ).credits,
    0,
  );
  for (const r of [
    { submit_id: "other", gen_status: "success", credit_count: 54 },
    { submit_id: "task", gen_status: "querying", credit_count: 54 },
    { submit_id: "task", gen_status: "success", prompt: "credit_count: 100" },
    { submit_id: "task", gen_status: "success", credit_count: -1 },
  ])
    assert.equal(cliUsage(JSON.stringify(r), "task"), null);
});
test("international ledger matches task ID across pages, deduplicates receipts and rejects forecasts, refunds and cursor loops", async () => {
  const row = {
    submit_id: "task",
    history_type: 2,
    status: "Checked",
    history_id: "receipt",
    amount: 40,
  };
  let n = 0;
  const u = await webUsage(async ({ cursor }) => {
    n++;
    return cursor
      ? { records: [row], hasMore: false, cursor: "" }
      : {
          records: [{ ...row, submit_id: "other" }, row],
          hasMore: true,
          cursor: "page2",
        };
  }, "task");
  assert.equal(n, 2);
  assert.equal(u.credits, 40);
  assert.equal(u.receiptId, "receipt");
  await assert.rejects(
    webUsage(
      async () => ({
        records: [],
        hasMore: false,
        cursor: "",
        forecast_generate_cost: 50,
      }),
      "task",
    ),
    /尚未取得/,
  );
  await assert.rejects(
    webUsage(
      async () => ({ records: [{ ...row, history_type: 3 }], hasMore: false }),
      "task",
    ),
    /冲正/,
  );
  await assert.rejects(
    webUsage(
      async () => ({ records: [row, { ...row, amount: 50 }], hasMore: false }),
      "task",
    ),
    /冲突/,
  );
  await assert.rejects(
    webUsage(
      async () => ({ records: [], hasMore: true, cursor: "same" }),
      "task",
    ),
    /分页/,
  );
});
test("late usage polling settles once without resubmitting and does not revive a refunded bill", async () => {
  const c = await setup();
  try {
    const [admin, a] = c.users,
      p = c.s.repos.content.createProject({ name: "poll" }).project;
    c.s.billing.topup(
      admin,
      a.id,
      { amountFen: 500, note: "cash" },
      "poll-recharge",
    );
    const j = seed(c, a, p);
    let calls = 0;
    const poll = require("./worker/billing-usage.cjs").createUsagePoller(c.s, {
      jimeng: {
        async usage(job) {
          calls++;
          return {
            source: "official_actual",
            taskId: job.remoteTaskId,
            credits: 10,
            receiptId: "r",
          };
        },
      },
    });
    poll.tick();
    poll.tick();
    await poll.stop();
    assert.equal(calls, 1);
    assert.equal(c.s.billing.wallet(a.id).available, 470);
    assert.equal(c.s.billing.wallet(a.id).frozen, 0);
    const later = seed(c, a, p);
    let release;
    const p2 = require("./worker/billing-usage.cjs").createUsagePoller(c.s, {
      jimeng: {
        async usage(job) {
          await new Promise((r) => (release = r));
          return {
            source: "official_actual",
            taskId: job.remoteTaskId,
            credits: 100,
          };
        },
      },
    });
    p2.tick();
    c.s.db.prepare("UPDATE jobs SET status='failed' WHERE id=?").run(later.id);
    reconcileJob(c.s.db, later.id);
    release();
    await p2.stop();
    assert.equal(c.s.billing.wallet(a.id).available, 470);
  } finally {
    await c.close();
  }
});
test("channel-level estimates suffice for all video offers and settlement retains quoted exchange rates", async () => {
  const c = await setup();
  try {
    const [admin, a] = c.users;
    const p = c.s.repos.content.createProject({
      name: "channel-estimate",
    }).project;
    c.s.db
      .prepare("UPDATE projects SET owner_user_id=? WHERE id=?")
      .run(a.id, p.id);
    const shot = c.s.repos.content.createShot({
      projectId: p.id,
      title: "测试镜头",
      episode: 1,
      number: 1,
      duration: 9,
      prompt: "静止山景",
    });
    const cfg = c.s.billing.pricing.publicSettings();
    cfg.rates.domestic.estimateCreditsPerSecond = 6;
    c.s.billing.pricing.save({ ...cfg, enabled: true });
    for (const offerId of ["cn-seedance", "cn-seedance-fast"]) {
      const q = c.s.billing.quote(a, p.id, { offerId, sourceIds: [shot.id] });
      assert.equal(q.items[0].officialCredits, 54);
      assert.equal(q.amount, 227);
    }
    assert.throws(
      () =>
        c.s.billing.pricing.save({
          ...c.s.billing.pricing.publicSettings(),
          rates: {
            ...cfg.rates,
            domestic: { ...cfg.rates.domestic, estimateCreditsPerSecond: -1 },
          },
        }),
      /预估/,
    );
  } finally {
    await c.close();
  }
});
test("image settlement needs a saved delivery; its actual delivered count does not use upstream video credits", async () => {
  const c = await setup();
  try {
    const [admin, a] = c.users,
      p = c.s.repos.content.createProject({ name: "image" }).project;
    c.s.billing.topup(
      admin,
      a.id,
      { amountFen: 100, note: "image" },
      "image-topup",
    );
    const j = seed(c, a, p, { kind: "image", reserved: 30 });
    reconcileJob(c.s.db, j.id);
    assert.equal(c.s.billing.wallet(a.id).frozen, 30);
    const m = await c.s.repos.content.saveMedia({
      projectId: p.id,
      bytes: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
        "base64",
      ),
      source: "test",
    });
    c.s.db.prepare("UPDATE jobs SET media_id=? WHERE id=?").run(m.id, j.id);
    reconcileJob(c.s.db, j.id);
    assert.equal(c.s.billing.wallet(a.id).available, 85);
    assert.equal(c.s.billing.wallet(a.id).frozen, 0);
  } finally {
    await c.close();
  }
});
test("late usage network errors keep a successful delivery pending without charging the estimate", async () => {
  const c = await setup();
  try {
    const [admin, a] = c.users,
      p = c.s.repos.content.createProject({ name: "missing" }).project;
    c.s.billing.topup(
      admin,
      a.id,
      { amountFen: 100, note: "missing" },
      "missing-topup",
    );
    const j = seed(c, a, p);
    const poll = require("./worker/billing-usage.cjs").createUsagePoller(c.s, {
      jimeng: {
        async usage() {
          throw Error("login fail");
        },
      },
    });
    poll.tick();
    await poll.stop();
    const b = c.s.db
      .prepare("SELECT * FROM job_billing WHERE job_id=?")
      .get(j.id);
    assert.equal(b.status, "frozen");
    assert.equal(b.charged, 0);
    assert.equal(b.actual_amount, null);
    assert.ok(b.usage_next_at);
    assert.ok(b.usage_error);
  } finally {
    await c.close();
  }
});
