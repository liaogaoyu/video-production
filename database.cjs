const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function createDatabase({ directory }) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, "storydock.sqlite");
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const select = db.prepare(
    "SELECT value_json, revision FROM app_state WHERE key=?",
  );
  const upsert = db.prepare(`
    INSERT INTO app_state(key,value_json,revision,updated_at) VALUES(?,?,1,?)
    ON CONFLICT(key) DO UPDATE SET
      value_json=excluded.value_json,
      revision=app_state.revision+1,
      updated_at=excluded.updated_at
  `);
  const event = db.prepare(
    "INSERT INTO app_events(type,payload_json,created_at) VALUES(?,?,?)",
  );

  function read(key) {
    const row = select.get(key);
    if (!row) return null;
    try {
      return { value: JSON.parse(row.value_json), revision: row.revision };
    } catch {
      throw new Error(`本地数据库中的 ${key} 数据损坏`);
    }
  }
  function write(key, value, type = "state.saved") {
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json) > 25 * 1024 * 1024)
      throw new Error("本地状态超过 25MB，请先导出并整理媒体文件");
    const now = new Date().toISOString();
    db.exec("BEGIN IMMEDIATE");
    try {
      upsert.run(key, json, now);
      event.run(type, JSON.stringify({ key }), now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return read(key);
  }
  return {
    filename,
    readWorkspace: () => read("workspace")?.value || null,
    saveWorkspace: (value) => write("workspace", value, "workspace.saved"),
    readConnections: () => read("connections")?.value || null,
    saveConnections: (value) =>
      write("connections", value, "connections.saved"),
    eventCount: () =>
      db.prepare("SELECT count(*) AS count FROM app_events").get().count,
    close: () => db.close(),
  };
}

module.exports = { createDatabase };
