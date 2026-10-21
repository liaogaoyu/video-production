const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  ratio TEXT NOT NULL DEFAULT '16:9',
  style TEXT NOT NULL DEFAULT '',
  script_text TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  storage_key TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  external_key TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  locked_version_id TEXT,
  selected_version_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS asset_versions (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS asset_references (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS project_references (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  UNIQUE(project_id, media_id)
);
CREATE TABLE IF NOT EXISTS shots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  external_key TEXT NOT NULL DEFAULT '',
  episode INTEGER NOT NULL,
  number INTEGER NOT NULL,
  sort_key TEXT NOT NULL,
  title TEXT NOT NULL,
  duration INTEGER NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shot_references (
  shot_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (shot_id, position)
);
CREATE TABLE IF NOT EXISTS model_connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  resolution TEXT NOT NULL DEFAULT '1k',
  secret_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  account_id TEXT NOT NULL DEFAULT '',
  nonce TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jimeng_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  identity_hash TEXT,
  identity_status TEXT NOT NULL DEFAULT 'unconfirmed',
  authorized INTEGER NOT NULL DEFAULT 0,
  permission TEXT NOT NULL DEFAULT 'unknown',
  total_credit REAL,
  checked_at TEXT,
  auth_expires_at TEXT,
  cooldown_until TEXT,
  last_assigned_at TEXT,
  check_requested_at TEXT,
  removed_at TEXT,
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  status TEXT NOT NULL,
  authorization_url TEXT,
  device_nonce TEXT,
  device_ciphertext TEXT,
  expires_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  batch_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  account_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  config_snapshot TEXT NOT NULL DEFAULT '{}',
  input_snapshot TEXT NOT NULL DEFAULT '{}',
  remote_task_id TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  next_run_at TEXT,
  lease_owner TEXT,
  lease_until TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  error_code TEXT,
  error_message TEXT,
  media_id TEXT,
  paused INTEGER NOT NULL DEFAULT 0,
  queue_note TEXT NOT NULL DEFAULT '',
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_claim ON jobs(status, next_run_at);
CREATE TABLE IF NOT EXISTS job_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  phase TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  result_json TEXT
);
CREATE TABLE IF NOT EXISTS job_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS account_leases (
  account_id TEXT PRIMARY KEY,
  owner TEXT,
  purpose TEXT,
  lease_until TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  workspace TEXT NOT NULL,
  route TEXT NOT NULL,
  key TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace, route, key)
);
CREATE TABLE IF NOT EXISTS pool_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  strategy TEXT NOT NULL DEFAULT 'round-robin',
  remote_task_limit INTEGER NOT NULL DEFAULT 3,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  storage_key TEXT,
  manifest_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runtime_status (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

function openDatabase(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  db.exec(SCHEMA);
  const version = db.prepare("SELECT version FROM schema_migrations WHERE version=1").get();
  if (!version) {
    const now = new Date().toISOString();
    db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES(1, ?)").run(now);
    db.prepare("INSERT INTO pool_settings(id, strategy, remote_task_limit, updated_at) VALUES(1, 'round-robin', 3, ?)").run(now);
  }
  require("./global-schema.cjs").installGlobalSchema(db);
  require("./job-times.cjs").installJobTimes(db);
  return db;
}

function transaction(db, fn) {
  const depth = transaction.depth || (transaction.depth = new WeakMap());
  if (depth.get(db)) return fn();
  depth.set(db, 1);
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  } finally {
    depth.set(db, 0);
  }
}

module.exports = { openDatabase, transaction };
