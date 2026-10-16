const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  exportProject: project => ipcRenderer.invoke('export-project', project),
  saveImageKey: apiKey => ipcRenderer.invoke('save-image-key', apiKey),
  imageKeyStatus: () => ipcRenderer.invoke('image-key-status'),
  checkJimengAccount: id => ipcRenderer.invoke('check-jimeng-account',id),
  openJimengAccount: account => ipcRenderer.invoke('open-jimeng-account', account)
});
