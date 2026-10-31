function installCommercialSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS app_users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS app_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);`);
  const add = (t, n, sql) => {
    if (
      !db
        .prepare(`PRAGMA table_info(${t})`)
        .all()
        .some((c) => c.name === n)
    ) {
      db.exec(`ALTER TABLE ${t} ADD COLUMN ${n} ${sql}`);
      return true;
    }
  };
  if (add("app_users", "role", "TEXT NOT NULL DEFAULT 'user'"))
    db.exec("UPDATE app_users SET role='admin'");
  add("app_users", "email", "TEXT");
  add("app_users", "email_verified_at", "TEXT");
  add("app_users", "status", "TEXT NOT NULL DEFAULT 'active'");
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS user_email ON app_users(email COLLATE NOCASE) WHERE email IS NOT NULL",
  );
  add("projects", "owner_user_id", "TEXT");
  add("projects", "asset_common_prompt", "TEXT NOT NULL DEFAULT ''");
  const admin = db
    .prepare(
      "SELECT id FROM app_users WHERE role='admin' ORDER BY created_at LIMIT 1",
    )
    .get();
  if (admin)
    db.prepare(
      "UPDATE projects SET owner_user_id=? WHERE owner_user_id IS NULL",
    ).run(admin.id);
  db.exec(`CREATE TABLE IF NOT EXISTS commercial_settings(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 1,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS email_challenges(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,email TEXT NOT NULL,purpose TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,consumed INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS email_challenge_lookup ON email_challenges(email,purpose,created_at);
 CREATE TABLE IF NOT EXISTS wallets(user_id TEXT PRIMARY KEY,available INTEGER NOT NULL DEFAULT 0 CHECK(available>=0),frozen INTEGER NOT NULL DEFAULT 0 CHECK(frozen>=0));
 CREATE TABLE IF NOT EXISTS wallet_ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,business_key TEXT NOT NULL UNIQUE,action TEXT NOT NULL,available_delta INTEGER NOT NULL,frozen_delta INTEGER NOT NULL,amount INTEGER NOT NULL,job_id TEXT,operator_id TEXT,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS wallet_ledger_user ON wallet_ledger(user_id,created_at);
 CREATE TABLE IF NOT EXISTS manual_topups(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,operator_id TEXT NOT NULL,amount_fen INTEGER NOT NULL,base_points INTEGER NOT NULL,gift_points INTEGER NOT NULL,request_key TEXT NOT NULL UNIQUE,note TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS public_model_offers(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,group_key TEXT NOT NULL,pricing_json TEXT NOT NULL DEFAULT '{}');
 CREATE TABLE IF NOT EXISTS generation_quotes(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,project_id TEXT NOT NULL,offer_id TEXT NOT NULL,input_hash TEXT NOT NULL,snapshot TEXT NOT NULL,amount INTEGER NOT NULL,expires_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open',result_json TEXT,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS job_billing(job_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,quote_id TEXT NOT NULL,reserved INTEGER NOT NULL,charged INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'frozen',snapshot TEXT NOT NULL,usage_json TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS billing_user ON job_billing(user_id,created_at);
 CREATE INDEX IF NOT EXISTS project_owner ON projects(owner_user_id,created_at);
 CREATE INDEX IF NOT EXISTS quotes_user ON generation_quotes(user_id,created_at);`);
  db.prepare("INSERT OR IGNORE INTO commercial_settings VALUES(1,1,?)").run(
    JSON.stringify({
      enabled: false,
      registrationEnabled: false,
      pointsPerYuan: 100,
      wechat: "",
      qrDataUrl: "",
      rechargeNote: "请添加管理员微信，付款时备注用户编号。",
      rates: {
        domestic: {
          purchaseFen: 26000,
          purchaseCredits: 6200,
          markupPercent: 0,
        },
        international: {
          purchaseFen: 3000,
          purchaseCredits: 1500,
          markupPercent: 0,
        },
        image: { costFen: 10, markupPercent: 0 },
      },
    }),
  );
  add("job_billing", "due", "INTEGER NOT NULL DEFAULT 0");
  add("job_billing", "actual_amount", "INTEGER");
  add("job_billing", "usage_next_at", "TEXT");
  add("job_billing", "usage_error", "TEXT NOT NULL DEFAULT ''");
  db.exec(
    "CREATE INDEX IF NOT EXISTS billing_pending_usage ON job_billing(status,usage_next_at)",
  );
  const pricingRow = db
    .prepare("SELECT value FROM commercial_settings WHERE id=1")
    .get();
  const pricing = JSON.parse(pricingRow.value);
  if (pricing.currency !== "CNY") {
    if (
      pricing.pointsPerYuan !== 100 &&
      db.prepare("SELECT id FROM wallet_ledger LIMIT 1").get()
    )
      throw new Error("历史积分面值不是1分，需先完成显式人民币账务迁移");
    pricing.currency = "CNY";
    pricing.pointsPerYuan = 100;
    db.prepare(
      "UPDATE commercial_settings SET value=?,revision=revision+1 WHERE id=1",
    ).run(JSON.stringify(pricing));
    db.prepare(
      "UPDATE generation_quotes SET status='expired' WHERE status='open'",
    ).run();
  }
  // Seed a channel-wide prepayment estimate from verified domestic Fast tasks (54/9 and 84/14).
  // This is a configurable estimate shared by models; actual consumption always settles separately.
  if (!pricing.domesticEstimateSeeded) {
    if (pricing.rates.domestic.estimateCreditsPerSecond == null)
      pricing.rates.domestic.estimateCreditsPerSecond = 6;
    pricing.domesticEstimateSeeded = true;
    db.prepare(
      "UPDATE commercial_settings SET value=?,revision=revision+1 WHERE id=1",
    ).run(JSON.stringify(pricing));
  }
  const offers = [
    ["image-default", "资产生图", "image", "image", "", "image"],
    [
      "cn-seedance",
      "Seedance 2.0（快速）",
      "video",
      "jimeng",
      "seedance2.0_vip",
      "domestic",
    ],
    [
      "cn-seedance-fast",
      "Seedance 2.0 Fast（快速）",
      "video",
      "jimeng",
      "seedance2.0fast_vip",
      "domestic",
    ],
    [
      "intl-seedance",
      "Seedance 2.0（慢速）",
      "video",
      "dreamina_web_api",
      "jimeng-video-seedance-2.0",
      "international",
    ],
    [
      "intl-seedance-fast",
      "Seedance 2.0 Fast（慢速）",
      "video",
      "dreamina_web_api",
      "jimeng-video-seedance-2.0-fast",
      "international",
    ],
  ];
  for (const o of offers)
    db.prepare(
      "INSERT OR IGNORE INTO public_model_offers(id,name,kind,provider,model,group_key) VALUES(?,?,?,?,?,?)",
    ).run(...o);
}
module.exports = { installCommercialSchema };
