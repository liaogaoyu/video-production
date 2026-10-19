const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
async function setup() {
  const handlers = {},
    windows = [],
    writes = [];
  const userData = fs.mkdtempSync(
    require("node:path").join(
      require("node:os").tmpdir(),
      "storydock-desktop-",
    ),
  );
  class Window {
    constructor(options) {
      this.options = options;
      this.webContents = { setWindowOpenHandler() {}, on() {} };
      windows.push(this);
    }
    setMenuBarVisibility() {}
    loadFile() {}
    loadURL() {
      return Promise.resolve();
    }
    on() {}
    isDestroyed() {
      return false;
    }
    show() {}
    focus() {}
  }
  const session = {
    fromPartition: (partition) => ({
      partition,
      cookies: { get: async () => [], flushStore: async () => {}, on() {} },
    }),
  };
  const electron = {
    session,
    net: { fetch: async () => { throw new Error("unexpected network call"); } },
    app: {
      whenReady: () => Promise.resolve(),
      getPath: () => userData,
      on() {},
    },
    BrowserWindow: Window,
    ipcMain: { handle: (n, f) => (handlers[n] = f) },
    dialog: {},
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (k) => Buffer.from("encrypted:" + k),
    },
  };
  const ctx = vm.createContext({
    require: (n) =>
      n === "electron"
        ? electron
        : n === "node:fs/promises"
          ? {
              writeFile: async (...args) => writes.push(args),
              access: async () => {
                throw Error();
              },
            }
          : require(n),
    __dirname,
    process: { platform: "darwin" },
    URL,
    console,
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "electron.cjs"), "utf8"),
    ctx,
  );
  await Promise.resolve();
  return {
    handlers,
    windows,
    writes,
    event: {
      senderFrame: {
        url: pathToFileURL(path.join(__dirname, "index.html")).href,
      },
    },
  };
}
test("Jimeng accounts have separate persistent sessions without the local preload", async () => {
  const x = await setup();
  await x.handlers["open-jimeng-account"](x.event, {
    id: "11111111-1111-1111-1111-111111111111",
    name: "A",
  });
  await x.handlers["open-jimeng-account"](x.event, {
    id: "22222222-2222-2222-2222-222222222222",
    name: "B",
  });
  assert.notEqual(
    x.windows[1].options.webPreferences.session.partition,
    x.windows[2].options.webPreferences.session.partition,
  );
  assert.match(
    x.windows[1].options.webPreferences.session.partition,
    /^persist:/,
  );
  assert.equal(x.windows[1].options.webPreferences.preload, undefined);
  assert.equal(x.windows[1].options.webPreferences.nodeIntegration, false);
  await x.handlers["open-jimeng-account"](x.event, {
    id: "11111111-1111-1111-1111-111111111111",
    name: "A",
  });
  assert.equal(x.windows.length, 3);
});
test("remote pages cannot save keys or open account windows", async () => {
  const x = await setup();
  const remote = { senderFrame: { url: "https://jimeng.jianying.com/" } };
  await assert.rejects(() =>
    x.handlers["save-image-key"](remote, "fake-test-value"),
  );
  await assert.rejects(() =>
    x.handlers["open-jimeng-account"](remote, {
      id: "11111111-1111-1111-1111-111111111111",
      name: "A",
    }),
  );
  assert.equal(x.writes.length, 0);
});
test("API keys are encrypted before writing to a local file", async () => {
  const x = await setup();
  const r = await x.handlers["save-image-key"](x.event, "fake-test-value");
  assert.equal(r.ok, true);
  assert.match(x.writes[0][0], /storydock-image-key\.enc$/);
  assert.equal(x.writes[0][1].toString(), "encrypted:fake-test-value");
  assert.equal(x.writes[0][2].mode, 0o600);
});
