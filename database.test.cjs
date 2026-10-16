const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createDatabase } = require("./database.cjs");

test("SQLite state survives reopening and revisions are atomic", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "storydock-db-"));
  const first = createDatabase({ directory });
  assert.equal(first.readWorkspace(), null);
  assert.equal(
    first.saveWorkspace({ activeProjectId: "p1", projects: [] }).revision,
    1,
  );
  assert.equal(
    first.saveWorkspace({ activeProjectId: "p2", projects: [] }).revision,
    2,
  );
  assert.equal(first.eventCount(), 2);
  first.close();
  const second = createDatabase({ directory });
  assert.equal(second.readWorkspace().activeProjectId, "p2");
  second.saveConnections({ image: { model: "gpt-image-2" }, accounts: [] });
  assert.equal(second.readConnections().image.model, "gpt-image-2");
  second.close();
});

test("oversized renderer state is rejected before SQLite write", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "storydock-db-limit-"),
  );
  const database = createDatabase({ directory });
  assert.throws(
    () => database.saveWorkspace({ payload: "x".repeat(26 * 1024 * 1024) }),
    /25MB/,
  );
  assert.equal(database.readWorkspace(), null);
  database.close();
});
