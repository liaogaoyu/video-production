const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  loadWorkspace: () => ipcRenderer.invoke("load-workspace"),
  saveWorkspace: (workspace) => ipcRenderer.invoke("save-workspace", workspace),
  loadConnections: () => ipcRenderer.invoke("load-connections"),
  saveConnections: (connections) =>
    ipcRenderer.invoke("save-connections", connections),
  generateImage: (request) => ipcRenderer.invoke("generate-image", request),
  exportProject: (project) => ipcRenderer.invoke("export-project", project),
  saveImageKey: (apiKey) => ipcRenderer.invoke("save-image-key", apiKey),
  imageKeyStatus: () => ipcRenderer.invoke("image-key-status"),
  checkJimengAccount: (id) => ipcRenderer.invoke("check-jimeng-account", id),
  openJimengAccount: (account) =>
    ipcRenderer.invoke("open-jimeng-account", account),
});
