const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  loadWorkspace: () => ipcRenderer.invoke("load-workspace"),
  saveWorkspace: (workspace) => ipcRenderer.invoke("save-workspace", workspace),
  loadConnections: () => ipcRenderer.invoke("load-connections"),
  saveConnections: (connections) =>
    ipcRenderer.invoke("save-connections", connections),
  generateImage: (request) => ipcRenderer.invoke("generate-image", request),
  jimengRuntimeStatus: () => ipcRenderer.invoke("jimeng-runtime-status"),
  beginJimengCliAuth: (account) => ipcRenderer.invoke("begin-jimeng-cli-auth", account),
  finishJimengCliAuth: (id) => ipcRenderer.invoke("finish-jimeng-cli-auth", id),
  checkJimengCli: (id) => ipcRenderer.invoke("check-jimeng-cli", id),
  exportProject: (project) => ipcRenderer.invoke("export-project", project),
  saveImageKey: (apiKey) => ipcRenderer.invoke("save-image-key", apiKey),
  imageKeyStatus: () => ipcRenderer.invoke("image-key-status"),
  checkJimengAccount: (id) => ipcRenderer.invoke("check-jimeng-account", id),
  openJimengAccount: (account) =>
    ipcRenderer.invoke("open-jimeng-account", account),
});
