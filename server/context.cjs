const fs = require("node:fs");
const { resolvePaths } = require("./paths.cjs");
const { openDatabase } = require("./db.cjs");
const { loadMasterKey, createSecretStore } = require("./secret-store.cjs");
const { createMediaService } = require("./media-service.cjs");
const { createOssStore } = require("./aliyun-oss.cjs");
const { createRepositories } = require("./repositories/index.cjs");

function openServices(options = {}) {
  const env = options.env || process.env;
  const paths = options.paths || resolvePaths(env, options.cwd);
  for (const directory of [paths.root, paths.media, paths.runs, paths.backups, paths.runtime, paths.cli, `${paths.root}/data`]) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  const db = openDatabase(paths.database);
  const master = loadMasterKey(paths.masterKey);
  const secrets = createSecretStore(master.key);
  const oss = createOssStore({
    enabled: env.STORYDOCK_OSS_ENABLED === "1",
    accessKeyId: env.STORYDOCK_OSS_ACCESS_KEY_ID || env.ALIYUN_ACCESS_KEY_ID,
    accessKeySecret: env.STORYDOCK_OSS_ACCESS_KEY_SECRET || env.ALIYUN_ACCESS_KEY_SECRET,
    bucket: env.STORYDOCK_OSS_BUCKET,
    region: env.STORYDOCK_OSS_REGION,
    endpoint: env.STORYDOCK_OSS_ENDPOINT,
    prefix: env.STORYDOCK_OSS_PREFIX,
  });
  const media = createMediaService({ root: paths.media, oss });
  const repos = createRepositories({ db, media, secrets });
  const services = { paths, db, secrets, media, repos, oss, masterKeyCreated: master.created };
  services.global = require("./dreamina-global.cjs").createGlobalService(services);
  services.web = require("./dreamina-web.cjs").createDreaminaWebService(services);
  services.seedanceApi = require('./seedance-api.cjs').createSeedanceApi(services);
  services.billing=require('./billing.cjs').createBilling(services);
  services.subtitleErase = require("./subtitle-erase.cjs").createSubtitleEraseService(services, env);
  return services;
}

module.exports = { openServices };
