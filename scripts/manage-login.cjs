// Password is read from stdin; never pass it as a command argument.
const { openServices } = require("../server/context.cjs");
const { installAuth, hashPassword } = require("../server/auth-http.cjs");
(async () => {
  const username = process.argv[2];
  if (!username)
    throw Error(
      "用法：node scripts/manage-login.cjs <账号>，密码通过标准输入传入",
    );
  let password = "";
  for await (const chunk of process.stdin) password += chunk;
  password = password.trimEnd();
  if (password.length < 8) throw Error("密码至少8位");
  const s = openServices();
  try {
    installAuth(s.db);
    const existing = s.db
      .prepare("SELECT id FROM app_users WHERE username=?")
      .get(username);
    const id = existing?.id || require("node:crypto").randomUUID();
    s.db
      .prepare(
        "INSERT INTO app_users(id,username,password_hash,created_at,role) VALUES(?,?,?,?,'admin') ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash",
      )
      .run(
        id,
        username,
        await hashPassword(password),
        new Date().toISOString(),
      );
    s.db.prepare("DELETE FROM app_sessions WHERE user_id=?").run(id);
    console.log("登录账号已保存");
  } finally {
    await s.web.close();
    s.db.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
