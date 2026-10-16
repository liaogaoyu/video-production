const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', { exportProject: (project) => ipcRenderer.invoke('export-project', project) });
