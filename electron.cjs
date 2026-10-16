const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
const localPage = pathToFileURL(path.join(__dirname, 'index.html')).href;
const accountWindows = new Map();
function assertLocal(event) {
  if (event.senderFrame?.url !== localPage) throw new Error('仅限本地客户端调用');
}
app.whenReady().then(() => {
  const keyPath = path.join(app.getPath('userData'), 'storydock-image-key.enc');
  ipcMain.handle('export-project', async (event, payload) => {
    assertLocal(event);
    const name = String(payload.name || 'project').replace(/[\\/:*?"<>|]/g, '_');
    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: `${name}-project.json`, filters: [{name: '项目文件', extensions: ['json']}] });
    if (canceled) return false;
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return true;
  });
  ipcMain.handle('image-key-status', async event => {
    assertLocal(event);
    try { await fs.access(keyPath); return { saved: true }; } catch { return { saved: false }; }
  });
  ipcMain.handle('save-image-key', async (event, apiKey) => {
    assertLocal(event);
    if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 8192) return {ok: false, message: '密钥格式不正确'};
    if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) return {ok: false, message: '系统加密存储不可用'};
    try {
      await fs.writeFile(keyPath, safeStorage.encryptString(apiKey.trim()), {mode: 0o600});
      return {ok: true};
    } catch { return {ok: false, message: '密钥保存失败'}; }
  });
  ipcMain.handle('open-jimeng-account', async (event, account) => {
    assertLocal(event);
    if (!account || !/^[a-f0-9-]{36}$/.test(account.id) || typeof account.name !== 'string' || account.name.length > 60) return {ok: false, message: '账号格式不正确'};
    let win = accountWindows.get(account.id);
    if (win && !win.isDestroyed()) { win.show(); win.focus(); return {ok: true}; }
    win = new BrowserWindow({width: 1200, height: 850, title: `即梦 · ${account.name}`, webPreferences: {partition: `persist:storydock-jimeng-${account.id}`, nodeIntegration: false, contextIsolation: true, sandbox: true}});
    accountWindows.set(account.id, win);
    win.webContents.setWindowOpenHandler(({url}) => {
      if (url.startsWith('https://')) { win.loadURL(url).catch(() => {}); }
      return {action: 'deny'};
    });
    win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('https://')) e.preventDefault(); });
    win.on('closed', () => accountWindows.delete(account.id));
    try { await win.loadURL('https://jimeng.jianying.com/ai-tool/home'); return {ok: true}; }
    catch { return {ok: false, message: '即梦加载失败，可在账号窗口重试'}; }
  });
  function createWindow() {
    const win = new BrowserWindow({width: 1520, height: 980, minWidth: 1060, minHeight: 720, backgroundColor: '#ffffff', title: 'LumenX · 漫剧工作台', webPreferences: {preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true}});
    win.setMenuBarVisibility(false);
    win.loadFile(path.join(__dirname, 'index.html'));
  }
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
