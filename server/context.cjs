const fs = require("node:fs");
const { resolvePaths } = require("./paths.cjs");
const { openDatabase } = require("./db.cjs");
const { loadMasterKey, createSecretStore } = require("./secret-store.cjs");
const { createMediaService } = require("./media-service.cjs");
const { createRepositories } = require("./repositories/index.cjs");

function openServices(options = {}) {
  const paths = options.paths || resolvePaths(options.env, options.cwd);
  for (const directory of [paths.root, paths.media, paths.runs, paths.backups, paths.runtime, paths.cli, `${paths.root}/data`]) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  const db = openDatabase(paths.database);
  const master = loadMasterKey(paths.masterKey);
  const secrets = createSecretStore(master.key);
  const media = createMediaService({ root: paths.media });
  const repos = createRepositories({ db, media, secrets });
  return { paths, db, secrets, media, repos, masterKeyCreated: master.created };
}

module.exports = { openServices };
