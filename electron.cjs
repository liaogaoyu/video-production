const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  safeStorage,
  session,
} = require("electron");
const path = require("node:path");
const { pathToFileURL, fileURLToPath } = require("node:url");
const fs = require("node:fs/promises");
const { createDatabase } = require("./database.cjs");
const { generateImage } = require("./image-provider.cjs");
const { createJimengCliPool } = require("./jimeng-cli.cjs");
const { storeAssetImage } = require("./media-store.cjs");
const { exportProjectPackage, importProjectPackage } = require("./project-package.cjs");
const localPage = pathToFileURL(path.join(__dirname, "index.html")).href;
const accountWindows = new Map();
const { createAccountSessions } = require("./account-sessions.cjs");
function assertLocal(event) {
  if (event.senderFrame?.url !== localPage)
    throw new Error("仅限本地客户端调用");
}
app.whenReady().then(() => {
  const database = createDatabase({ directory: app.getPath("userData") });
  ipcMain.handle("load-workspace", (event) => {
    assertLocal(event);
    return database.readWorkspace();
  });
  ipcMain.handle("save-workspace", (event, value) => {
    assertLocal(event);
    if (!value || !Array.isArray(value.projects))
      throw new Error("项目数据格式不正确");
    database.saveWorkspace(value);
    return true;
  });
  ipcMain.handle("load-connections", (event) => {
    assertLocal(event);
    return database.readConnections();
  });
  ipcMain.handle("save-connections", (event, value) => {
    assertLocal(event);
    if (!value || !value.image || !Array.isArray(value.accounts))
      throw new Error("连接数据格式不正确");
    database.saveConnections(value);
    return true;
  });
  const accountSessions = createAccountSessions({
    session,
    safeStorage,
    directory: path.join(app.getPath("userData"), "storydock-jimeng-sessions"),
  });
  const jimengCli = createJimengCliPool({
    directory: path.join(app.getPath("userData"), "storydock-jimeng-cli"),
    safeStorage,
  });
  function validAccount(account) {
    return !!account && /^[a-f0-9-]{36}$/.test(account.id) && typeof account.name === "string" && account.name.length <= 60;
  }
  function allowedJimengUrl(value) {
    try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "jimeng.jianying.com"; }
    catch { return false; }
  }
  async function navigateAccount(account, url) {
    if (!validAccount(account) || !allowedJimengUrl(url)) return { ok: false, message: "账号或即梦地址不正确" };
    let win = accountWindows.get(account.id);
    if (win && !win.isDestroyed()) {
      await win.loadURL(url);
      win.show();
      win.focus();
      return { ok: true };
    }
    const accountSession = await accountSessions.get(account.id);
    win = new BrowserWindow({
      width: 1200,
      height: 850,
      title: `即梦 · ${account.name}`,
      webPreferences: { session: accountSession, nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    accountWindows.set(account.id, win);
    win.webContents.setWindowOpenHandler(({ url: next }) => {
      if (allowedJimengUrl(next)) win.loadURL(next).catch(() => {});
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (event, next) => {
      if (!allowedJimengUrl(next)) event.preventDefault();
    });
    win.on("closed", () => {
      accountWindows.delete(account.id);
      accountSessions.snapshot(account.id, accountSession).catch(() => {});
    });
    await win.loadURL(url);
    return { ok: true };
  }
  ipcMain.handle("jimeng-runtime-status", (event) => { assertLocal(event); return jimengCli.runtimeStatus(); });
  ipcMain.handle("begin-jimeng-cli-auth", async (event, account) => {
    assertLocal(event);
    if (!validAccount(account)) throw new Error("账号格式不正确");
    const auth = await jimengCli.beginAuth(account.id);
    await navigateAccount(account, auth.authorizationUrl);
    return { ok: true, expiresAt: auth.expiresAt };
  });
  ipcMain.handle("finish-jimeng-cli-auth", (event, id) => { assertLocal(event); return jimengCli.finishAuth(id); });
  ipcMain.handle("check-jimeng-cli", (event, id) => { assertLocal(event); return jimengCli.inspect(id); });
  function allowedCliAccount(id) {
    const account = database.readConnections()?.accounts?.find((item) => item.id === id);
    if (!account?.enabled || account.cliPermission !== "allowed") throw new Error("账号未启用或没有官方 CLI 生成权限");
    return account;
  }
  async function resolveProjectImage(value) {
    const candidate = value.startsWith("file:") ? fileURLToPath(value) : value;
    const root = await fs.realpath(path.join(app.getPath("userData"), "projects"));
    const actual = await fs.realpath(candidate);
    const relative = path.relative(root, actual);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("参考图不在项目媒体目录");
    return actual;
  }
  ipcMain.handle("submit-jimeng-video", async (event, request) => {
    assertLocal(event);
    if (!request || !Array.isArray(request.images) || !Array.isArray(request.referenceNames) || request.referenceNames.length !== request.images.length) throw new Error("视频任务格式不正确");
    allowedCliAccount(request.accountId);
    const images = [];
    for (const value of request.images) images.push(await resolveProjectImage(value));
    return jimengCli.submitVideo(request.accountId, { ...request, images });
  });
  ipcMain.handle("query-jimeng-video", async (event, request) => {
    assertLocal(event);
    allowedCliAccount(request?.accountId);
    const result = await jimengCli.queryVideo(request.accountId, request.submitId, !!request.download);
    if (result.files) result.urls = result.files.map((file) => pathToFileURL(file).href);
    delete result.files;
    return result;
  });
  ipcMain.handle("check-jimeng-account", async (event, id) => {
    assertLocal(event);
    try {
      return await accountSessions.inspect(id);
    } catch {
      return {
        ok: false,
        state: "error",
        message: "检查失败，请重新打开即梦窗口",
      };
    }
  });
  const keyPath = path.join(app.getPath("userData"), "storydock-image-key.enc");
  ipcMain.handle("generate-image", async (event, request) => {
    assertLocal(event);
    if (
      !request ||
      typeof request.prompt !== "string" ||
      request.prompt.length > 20000
    )
      throw new Error("生图请求格式不正确");
    if (!safeStorage.isEncryptionAvailable())
      throw new Error("系统加密存储不可用");
    const encrypted = await fs.readFile(keyPath);
    const apiKey = safeStorage.decryptString(encrypted);
    const references = [];
    if (request.references !== undefined && !Array.isArray(request.references))
      throw new Error("参考图格式不正确");
    if ((request.references || []).length > 15)
      throw new Error("参考图最多 15 张");
    let referenceBytes = 0;
    for (const value of request.references || []) {
      const file = await resolveProjectImage(String(value));
      const bytes = await fs.readFile(file);
      referenceBytes += bytes.length;
      if (bytes.length > 20 * 1024 * 1024 || referenceBytes > 256 * 1024 * 1024)
        throw new Error("参考图单张不能超过 20MB，总计不能超过 256MB");
      const extension = path.extname(file).toLowerCase();
      const mime = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
      references.push(`data:${mime};base64,${bytes.toString("base64")}`);
    }
    return generateImage({
      config: request.config,
      prompt: request.prompt,
      apiKey,
      references,
      projectId: request.projectId,
      assetId: request.assetId,
      outputRoot: path.join(app.getPath("userData"), "projects"),
    });
  });
  ipcMain.handle("select-asset-image", async (event, request) => {
    assertLocal(event);
    if (!request) throw new Error("图片请求格式不正确");
    const picked = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp"] }] });
    if (picked.canceled || !picked.filePaths[0]) return { canceled: true };
    return storeAssetImage({ source: picked.filePaths[0], outputRoot: path.join(app.getPath("userData"), "projects"), projectId: request.projectId, assetId: request.assetId });
  });
  ipcMain.handle("select-reference-images", async (event, request) => {
    assertLocal(event);
    if (!request) throw new Error("参考图请求格式不正确");
    const picked = await dialog.showOpenDialog({
      title: "选择参考图（最多 15 张）",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (picked.canceled) return { canceled: true, images: [] };
    if (picked.filePaths.length > 15) throw new Error("参考图最多 15 张");
    const images = [];
    for (const source of picked.filePaths) {
      images.push(await storeAssetImage({
        source,
        outputRoot: path.join(app.getPath("userData"), "projects"),
        projectId: request.projectId,
        assetId: `${request.assetId}_refs`,
      }));
    }
    return { canceled: false, images };
  });
  ipcMain.handle("export-project", async (event, payload) => {
    assertLocal(event);
    const picked = await dialog.showOpenDialog({ title: "选择项目包保存位置", properties: ["openDirectory", "createDirectory"] });
    if (picked.canceled || !picked.filePaths[0]) return false;
    const output = await exportProjectPackage({ project: payload, projectRoot: path.join(app.getPath("userData"), "projects"), destination: picked.filePaths[0] });
    return { ok: true, output };
  });
  ipcMain.handle("import-project", async (event) => {
    assertLocal(event);
    const picked = await dialog.showOpenDialog({ title: "选择 Storydock 项目包中的 manifest.json", properties: ["openFile"], filters: [{ name: "Storydock 项目清单", extensions: ["json"] }] });
    if (picked.canceled || !picked.filePaths[0]) return { canceled: true };
    const project = await importProjectPackage({ manifestPath: picked.filePaths[0], projectRoot: path.join(app.getPath("userData"), "projects") });
    return { canceled: false, project };
  });
  ipcMain.handle("image-key-status", async (event) => {
    assertLocal(event);
    try {
      await fs.access(keyPath);
      return { saved: true };
    } catch {
      return { saved: false };
    }
  });
  ipcMain.handle("save-image-key", async (event, apiKey) => {
    assertLocal(event);
    if (typeof apiKey !== "string" || !apiKey.trim() || apiKey.length > 8192)
      return { ok: false, message: "密钥格式不正确" };
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === "linux" &&
        safeStorage.getSelectedStorageBackend() === "basic_text")
    )
      return { ok: false, message: "系统加密存储不可用" };
    try {
      await fs.writeFile(keyPath, safeStorage.encryptString(apiKey.trim()), {
        mode: 0o600,
      });
      return { ok: true };
    } catch {
      return { ok: false, message: "密钥保存失败" };
    }
  });
  ipcMain.handle("open-jimeng-account", async (event, account) => {
    assertLocal(event);
    try {
      return await navigateAccount(account, "https://jimeng.jianying.com/ai-tool/home");
    } catch {
      return { ok: false, message: "即梦加载失败，可在账号窗口重试" };
    }
  });
  function createWindow() {
    const win = new BrowserWindow({
      width: 1520,
      height: 980,
      minWidth: 1060,
      minHeight: 720,
      backgroundColor: "#ffffff",
      title: "LumenX · 漫剧工作台",
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.setMenuBarVisibility(false);
    win.loadFile(path.join(__dirname, "index.html"));
  }
  createWindow();
  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
