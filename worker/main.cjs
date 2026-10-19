const crypto = require("node:crypto");
const { openServices } = require("../server/context.cjs");
const { createScheduler } = require("./scheduler.cjs");
const { createImageProvider } = require("./providers/image.cjs");
const { createJimengProvider } = require("./providers/jimeng.cjs");
const { createJimengCliPool } = require("../jimeng-cli.cjs");
const { createRuntimeBootstrap } = require("./runtime.cjs");
const { handleAuthFailure } = require("./auth.cjs");

function createWorker(services = openServices()) {
  const owner = `worker-${process.pid}`;
  let currentAuthSessionId = null;
  const pool = createJimengCliPool({
    directory: services.paths.cli,
    runtimeDirectory: services.paths.runtime,
    allowInstall: false,
    image: process.env.STORYDOCK_CLI_IMAGE || undefined,
    secretStore: {
      ensureKeyringPassword(accountId) {
        return services.repos.accounts.ensureSecret(accountId, "keyring", () => crypto.randomBytes(32).toString("hex"));
      },
    },
    sessionStore: {
      async put(accountId, record) {
        const sealed = services.secrets.seal(record.deviceCode, { accountId, purpose: "auth-device-code" });
        services.repos.accounts.saveAuthExchange(accountId, {
          authSessionId: currentAuthSessionId,
          authorizationUrl: record.authorizationUrl,
          expiresAt: record.expiresAt,
          nonce: sealed.nonce,
          ciphertext: sealed.ciphertext,
        });
      },
      async get(accountId) {
        const row = services.repos.accounts.authExchange(currentAuthSessionId, accountId);
        if (!row?.device_ciphertext) return null;
        return {
          deviceCode: services.secrets.open({ nonce: row.device_nonce, ciphertext: row.device_ciphertext }, { accountId, purpose: "auth-device-code" }),
          expiresAt: row.expires_at,
        };
      },
      async clear(accountId) {
        services.repos.accounts.clearDeviceCode(accountId, currentAuthSessionId);
      },
    },
  });
  const scheduler = createScheduler({
    repos: services.repos,
    db: services.db,
    media: services.media,
    owner,
    providers: {
      image: createImageProvider({ repos: services.repos, publicBase: services.paths.publicBase }),
      jimeng: createJimengProvider({ repos: services.repos, pool, media: services.media, db: services.db, owner }),
    },
  });
  let stopped = false;
  const runtime = createRuntimeBootstrap({
    pool,
    autoInstall: process.env.STORYDOCK_AUTO_INSTALL_CLI !== "0" && !process.env.STORYDOCK_CLI_IMAGE,
    report: (status) => { if (!stopped) services.repos.accounts.setRuntime("cli", status); },
  });
  async function loop() {
    if (stopped) return;
    try {
      void runtime.check();
      const session = runtime.isReady() && services.repos.accounts.nextAuthSession();
      if (session && services.repos.accounts.tryLease(session.account_id, owner, "auth", 240000)) {
        currentAuthSessionId = session.id;
        try {
          if (session.expires_at && Date.parse(session.expires_at) < Date.now()) {
            services.repos.accounts.markAuth(session.id, "expired", "授权已过期，请重新开始");
          } else if (session.status === "queued") {
            services.repos.accounts.markAuth(session.id, "starting");
            await pool.beginAuth(session.account_id);
          } else {
            const result = await pool.finishAuth(session.account_id);
            if (result.authorized) {
              const credit = await pool.inspect(session.account_id);
              if (services.repos.accounts.markAuth(session.id, "authorized", credit.message)) {
                services.repos.accounts.applyCheck(session.account_id, credit);
              }
            }
          }
        } catch (error) {
          await handleAuthFailure({ session, error, pool, accounts: services.repos.accounts });
        } finally {
          currentAuthSessionId = null;
          services.repos.accounts.releaseLease(session.account_id, owner);
        }
      }
      const account = runtime.isReady() && services.repos.accounts.nextCheck();
      if (account && services.repos.accounts.tryLease(account.id, owner, "check", 180000)) {
        try {
          services.repos.accounts.applyCheck(account.id, await pool.inspect(account.id));
        } catch (error) {
          services.repos.accounts.applyCheck(account.id, { authorized: false, permission: "unknown", message: error.message });
        } finally {
          services.repos.accounts.releaseLease(account.id, owner);
        }
      }
      await scheduler.tick();
    } catch (error) {
      console.error(error.message);
    }
    if (!stopped) setTimeout(loop, 1000);
  }
  return {
    services,
    start() { loop(); },
    stop() { stopped = true; services.db.close(); },
  };
}

if (require.main === module) {
  const worker = createWorker();
  if (worker.services.masterKeyCreated) console.log(`已生成主密钥，请单独备份：${worker.services.paths.masterKey}`);
  worker.start();
  process.on("SIGINT", () => { worker.stop(); process.exit(0); });
  process.on("SIGTERM", () => { worker.stop(); process.exit(0); });
}

module.exports = { createWorker };
