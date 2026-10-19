const path = require("node:path");

function resolvePaths(env = process.env, cwd = process.cwd()) {
  const root = path.resolve(env.STORYDOCK_ROOT || path.join(cwd, "var", "storydock"));
  return {
    root,
    database: path.join(root, "data", "storydock.sqlite"),
    media: path.join(root, "media"),
    runs: path.join(root, "runs"),
    backups: path.join(root, "backups"),
    cli: path.join(root, "cli"),
    runtime: path.resolve(env.STORYDOCK_RUNTIME_DIR || path.join(root, "run")),
    masterKey: path.resolve(env.STORYDOCK_MASTER_KEY || path.join(cwd, "var", "master-key")),
    staticRoot: path.resolve(env.STORYDOCK_STATIC_ROOT || cwd),
    port: Number(env.PORT || 4320),
    host: env.HOST || "0.0.0.0",
    accessPassword: env.STORYDOCK_ACCESS_PASSWORD || "",
    publicBase: env.STORYDOCK_PUBLIC_BASE || "",
  };
}

module.exports = { resolvePaths };
