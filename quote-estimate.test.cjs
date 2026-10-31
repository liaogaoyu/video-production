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
const {
  selectBenefit,
  calculateEstimate,
} = require("./server/web-estimate.cjs");
const benefit = "seedance_20_fast_720p_output";
const catalog = {
  model_list: [
    {
      model_req_key: "fast",
      commercial_config: {
        default: {
          resource_sub_type: "aigc",
          resource_id: "generate_video",
          benefit_type: "legacy",
        },
        resolution_price_configs: [
          {
            resolution: "720p",
            price: {
              resource_sub_type: "aigc",
              resource_id: "generate_video",
              benefit_type: benefit,
            },
          },
        ],
      },
    },
  ],
};
const meta = {
  metadata_list: [
    {
      resource_type: "aigc",
      resource_id: "generate_video",
      benefits_pay_strategy: [
        {
          benefit_type: benefit,
          unit: "second",
          credit_strategy: {
            credit_pricing_info: {
              min_charge_cnt: 1,
              credit_unit_price: 8,
              original_credit_unit_price: 14,
            },
          },
        },
      ],
    },
  ],
};
test("website estimate uses the current resolution price rather than legacy benefit or original undiscounted price", () => {
  assert.equal(selectBenefit(catalog, "fast", "720p"), benefit);
  const r = calculateEstimate(meta, benefit, 5);
  assert.equal(r.credits, 40);
  assert.equal(r.source, "official_web_reference");
  assert.equal(r.unitPrice, 8);
  assert.throws(() => selectBenefit(catalog, "fast", "1080p"), /分辨率/);
  assert.throws(() => selectBenefit(catalog, "unknown", "720p"), /模型/);
  const bad = structuredClone(meta);
  bad.metadata_list[0].benefits_pay_strategy[0].unit = "times";
  assert.throws(() => calculateEstimate(bad, benefit, 5), /单位/);
  const zero = structuredClone(meta);
  zero.metadata_list[0].benefits_pay_strategy[0].credit_strategy.credit_pricing_info.credit_unit_price = 0;
  assert.equal(calculateEstimate(zero, benefit, 5).credits, 0);
  const invalid = structuredClone(meta);
  invalid.metadata_list[0].benefits_pay_strategy[0].credit_strategy.credit_pricing_info.min_charge_cnt = 0;
  assert.throws(() => calculateEstimate(invalid, benefit, 5), /单价/);
});
function projectShot(c, a) {
  const p = c.s.repos.content.createProject({ name: "estimate" }).project;
  c.s.db
    .prepare("UPDATE projects SET owner_user_id=? WHERE id=?")
    .run(a.id, p.id);
  const shot = c.s.repos.content.createShot({
    projectId: p.id,
    title: "山景",
    episode: 1,
    number: 1,
    duration: 5,
    prompt: "静止山景",
  });
  return { p, shot };
}
test("international quote fetches a real estimate without manual model configuration and binds submission to quoted account", async () => {
  const c = await setup();
  try {
    const [admin, a] = c.users,
      { p, shot } = projectShot(c, a),
      account = c.s.web.create({ name: "estimate account", region: "us" });
    c.s.web.saveCredential(account.id, "test-session", "test-identity");
    c.s.billing.pricing.save({
      ...c.s.billing.pricing.publicSettings(),
      enabled: true,
    });
    c.s.billing.topup(
      admin,
      a.id,
      { amountFen: 1000, note: "test" },
      "estimate-topup",
    );
    let calls = 0;
    c.s.web.estimate = async (b) => {
      calls++;
      assert.equal(b.model, "jimeng-video-seedance-2.0-fast");
      assert.equal(b.duration, 5);
      return {
        accountId: account.id,
        credits: 40,
        source: "official_web_reference",
      };
    };
    const q = await c.s.billing.quote(a, p.id, {
      offerId: "intl-seedance-fast",
      sourceIds: [shot.id],
    });
    assert.equal(q.amount, 80);
    assert.equal(q.items[0].source, "official_web_reference");
    assert.equal(calls, 1);
    assert.match(q.basis, /官网/);
    const result = c.s.billing.confirm(a, q.id);
    assert.equal(c.s.repos.jobs.getJob(result.jobIds[0]).accountId, account.id);
    assert.equal(c.s.billing.wallet(a.id).frozen, 80);
    const replay = c.s.billing.confirm(a, q.id);
    assert.equal(replay.jobIds[0], result.jobIds[0]);
    assert.equal(calls, 1);
  } finally {
    await c.close();
  }
});
test("international quote checks ownership before calling provider, rejects input changes and never charges on price query failure", async () => {
  const c = await setup();
  try {
    const [, a, b] = c.users,
      { p, shot } = projectShot(c, a);
    c.s.billing.pricing.save({
      ...c.s.billing.pricing.publicSettings(),
      enabled: true,
    });
    let calls = 0;
    c.s.web.estimate = async () => {
      calls++;
      throw Error("network");
    };
    assert.throws(
      () =>
        c.s.billing.quote(b, p.id, {
          offerId: "intl-seedance",
          sourceIds: [shot.id],
        }),
      /不存在/,
    );
    assert.equal(calls, 0);
    await assert.rejects(
      c.s.billing.quote(a, p.id, {
        offerId: "intl-seedance",
        sourceIds: [shot.id],
      }),
      /network/,
    );
    assert.equal(
      c.s.db.prepare("SELECT count(*) n FROM generation_quotes").get().n,
      0,
    );
    c.s.web.estimate = async () => {
      c.s.db.prepare("UPDATE shots SET duration=6 WHERE id=?").run(shot.id);
      return {
        credits: 40,
        accountId: "account",
        source: "official_web_reference",
      };
    };
    await assert.rejects(
      c.s.billing.quote(a, p.id, {
        offerId: "intl-seedance",
        sourceIds: [shot.id],
      }),
      /变化/,
    );
    assert.equal(c.s.billing.wallet(a.id).frozen, 0);
  } finally {
    await c.close();
  }
});
test("domestic models share the seeded configurable estimate and custom channel settings survive schema re-entry", async () => {
  const c = await setup();
  try {
    const [, a] = c.users,
      { p, shot } = projectShot(c, a);
    c.s.billing.pricing.save({
      ...c.s.billing.pricing.publicSettings(),
      enabled: true,
    });
    assert.equal(
      c.s.billing.pricing.get().rates.domestic.estimateCreditsPerSecond,
      6,
    );
    const q = c.s.billing.quote(a, p.id, {
      offerId: "cn-seedance",
      sourceIds: [shot.id],
    });
    assert.equal(q.items[0].officialCredits, 30);
    assert.equal(q.amount, 126);
    assert.equal(q.items[0].source, "configured");
    const cfg = c.s.billing.pricing.publicSettings();
    cfg.rates.domestic.estimateCreditsPerSecond = 7;
    c.s.billing.pricing.save(cfg);
    require("./server/commercial-schema.cjs").installCommercialSchema(c.s.db);
    assert.equal(
      c.s.billing.pricing.get().rates.domestic.estimateCreditsPerSecond,
      7,
    );
  } finally {
    await c.close();
  }
});
