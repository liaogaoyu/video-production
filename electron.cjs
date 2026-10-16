const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
app.whenReady().then(() => {
  ipcMain.handle('export-project', async (_, payload) => {
    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: '雾都来信-project.json', filters: [{name: '项目文件', extensions: ['json']}] });
    if (canceled) return false;
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return true;
  });
  function createWindow() {
  const win = new BrowserWindow({ width: 1520, height: 980, minWidth: 1060, minHeight: 720, backgroundColor: '#111214', title: 'LumenX · 漫剧工作台', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.setMenuBarVisibility(false);
  win.loadFile('index.html');
  }
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
