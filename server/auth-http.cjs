const crypto = require("node:crypto"),
  fs = require("node:fs"),
  { promisify } = require("node:util");
const { ApiError } = require("./errors.cjs");
const scrypt = promisify(crypto.scrypt),
  digest = (v) => crypto.createHash("sha256").update(v).digest("hex");
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt:${salt}:${(await scrypt(password, salt, 32)).toString("hex")}`;
}
async function verify(password, hash) {
  if (hash.startsWith("scrypt:")) {
    const [, salt, key] = hash.split(":");
    const value = await scrypt(password, salt, 32),
      expected = Buffer.from(key, "hex");
    return (
      value.length === expected.length &&
      crypto.timingSafeEqual(value, expected)
    );
  }
  if (/^\$2[aby]\$/.test(hash))
    return require("bcryptjs").compare(
      password,
      hash.replace(/^\$2y\$/, "$2b$"),
    );
  return false;
}
function installAuth(db) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS app_users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS app_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);`,
  );
}
function importLegacyUsers(db, file) {
  installAuth(db);
  if (
    db.prepare("SELECT id FROM app_users LIMIT 1").get() ||
    !file ||
    !fs.existsSync(file)
  )
    return;
  const insert = db.prepare("INSERT OR IGNORE INTO app_users(id,username,password_hash,created_at,role) VALUES(?,?,?,?,'admin')");
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const index = line.indexOf(":");
    if (index < 1) continue;
    const username = line.slice(0, index),
      hash = line.slice(index + 1).trim();
    if (!/^\$2[aby]\$/.test(hash)) throw Error("旧登录密码格式不支持自动迁移");
    insert.run(crypto.randomUUID(), username, hash, new Date().toISOString());
  }
}
function createAuth(services) {
  const { db } = services;
  installAuth(db);
  importLegacyUsers(db, process.env.STORYDOCK_LEGACY_HTPASSWD);
  require('./commercial-schema.cjs').installCommercialSchema(db);
  const attempts = new Map(),
    cookie = "storydock_session";
  const enabled = () =>
    Boolean(db.prepare("SELECT id FROM app_users LIMIT 1").get()) ||
    process.env.STORYDOCK_AUTH_REQUIRED === "1";
  function user(request) {
    const token = String(request.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(cookie + "="))
      ?.slice(cookie.length + 1);
    if (!token) return null;
    return (
      db
        .prepare(
          "SELECT u.id,u.username,u.email,u.role,u.status FROM app_sessions s JOIN app_users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>? AND u.status='active'",
        )
        .get(digest(token), Date.now()) || null
    );
  }
  function issue(request, reply, id) {
    const token = crypto.randomBytes(32).toString("hex"),
      age = 7 * 86400;
    db.prepare("DELETE FROM app_sessions WHERE expires_at<?").run(Date.now());
    db.prepare("INSERT INTO app_sessions VALUES(?,?,?)").run(
      digest(token),
      id,
      Date.now() + age * 1000,
    );
    reply.header(
      "Set-Cookie",
      `${cookie}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${request.headers["x-forwarded-proto"] === "https" ? "; Secure" : ""}`,
    );
  }
  function guard(request) {
    if (!enabled()) return;
    const u = user(request);
    if (!u) throw new ApiError(401, "unauthorized", "请先登录");
    request.appUser = u;
  }
  function sameOrigin(request) {
    const origin = request.headers.origin;
    if (origin && new URL(origin).host !== request.headers.host)
      throw new ApiError(403, "cross_origin", "请求来源不受支持");
  }
  return {
    enabled,
    guard,
    sameOrigin,
    register(app) {
      app.get("/api/v1/auth/session", async (request, reply) => {
        reply.header("Cache-Control", "no-store");
        return {
          authenticated: !enabled() || !!user(request),
          user: user(request),
          enabled: enabled(),
        };
      });
      app.post("/api/v1/auth/login", async (request, reply) => {
        sameOrigin(request);
        const key = request.ip,
          record = attempts.get(key);
        if (record && record.until > Date.now() && record.count >= 5)
          throw new ApiError(429, "rate_limited", "尝试次数过多，请稍后再试");
        const { username, password } = request.body || {};
        if (
          typeof username !== "string" ||
          typeof password !== "string" ||
          password.length > 1024
        )
          throw new ApiError(400, "invalid_login", "请输入账号和密码");
        const u = db
          .prepare("SELECT * FROM app_users WHERE username=?")
          .get(username.trim()) || db.prepare("SELECT * FROM app_users WHERE username=?").get(username.trim().toLowerCase());
        if (!u || u.status!=='active' || (u.role!=='admin'&&!u.email_verified_at) || !(await verify(password, u.password_hash))) {
          if (attempts.size > 1000) attempts.clear();
          attempts.set(key, {
            count: record && record.until > Date.now() ? record.count + 1 : 1,
            until: Date.now() + 900000,
          });
          throw new ApiError(401, "invalid_login", "账号或密码不正确");
        }
        attempts.delete(key);
        if (!u.password_hash.startsWith("scrypt:"))
          db.prepare("UPDATE app_users SET password_hash=? WHERE id=?").run(
            await hashPassword(password),
            u.id,
          );
        issue(request, reply, u.id);
        return { user: { id: u.id, username: u.username, email: u.email, role: u.role } };
      });
      app.post("/api/v1/auth/logout", async (request, reply) => {
        sameOrigin(request);
        const token = String(request.headers.cookie || "")
          .split(";")
          .map((x) => x.trim())
          .find((x) => x.startsWith(cookie + "="))
          ?.slice(cookie.length + 1);
        if (token)
          db.prepare("DELETE FROM app_sessions WHERE token_hash=?").run(
            digest(token),
          );
        reply.header(
          "Set-Cookie",
          `${cookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
        );
        return { ok: true };
      });
      app.put("/api/v1/auth/password", async (request, reply) => {
        guard(request);
        sameOrigin(request);
        const { currentPassword, password, username } = request.body || {};
        if (
          typeof password !== "string" ||
          password.length < 8 ||
          password.length > 200 ||
          typeof username !== "string" ||
          !username.trim() ||
          username.length > 60
        )
          throw new ApiError(
            400,
            "invalid_password",
            "账号不能为空，新密码需为 8–200 位",
          );
        const u = db
          .prepare("SELECT * FROM app_users WHERE id=?")
          .get(request.appUser.id);
        if (
          typeof currentPassword !== "string" ||
          !(await verify(currentPassword, u.password_hash))
        )
          throw new ApiError(400, "invalid_password", "当前密码不正确");
        const occupied = db
          .prepare("SELECT id FROM app_users WHERE username=? AND id<>?")
          .get(username.trim(), u.id);
        if (occupied)
          throw new ApiError(409, "username_taken", "账号名称已存在");
        db.prepare(
          "UPDATE app_users SET username=?,password_hash=? WHERE id=?",
        ).run(username.trim(), await hashPassword(password), u.id);
        db.prepare("DELETE FROM app_sessions WHERE user_id=?").run(u.id);
        issue(request, reply, u.id);
        return { user: { id: u.id, username: username.trim(),role:u.role,email:u.email } };
      });
    },
  };
}
module.exports = {
  createAuth,
  hashPassword,
  verify,
  installAuth,
  importLegacyUsers,
};
