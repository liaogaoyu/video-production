const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  loadWorkspace: () => ipcRenderer.invoke("load-workspace"),
  saveWorkspace: (workspace) => ipcRenderer.invoke("save-workspace", workspace),
  loadConnections: () => ipcRenderer.invoke("load-connections"),
  saveConnections: (connections) =>
    ipcRenderer.invoke("save-connections", connections),
  generateImage: (request) => ipcRenderer.invoke("generate-image", request),
  selectAssetImage: (request) => ipcRenderer.invoke("select-asset-image", request),
  selectReferenceImages: (request) => ipcRenderer.invoke("select-reference-images", request),
  jimengRuntimeStatus: () => ipcRenderer.invoke("jimeng-runtime-status"),
  beginJimengCliAuth: (account) => ipcRenderer.invoke("begin-jimeng-cli-auth", account),
  finishJimengCliAuth: (id) => ipcRenderer.invoke("finish-jimeng-cli-auth", id),
  checkJimengCli: (id) => ipcRenderer.invoke("check-jimeng-cli", id),
  submitJimengVideo: (request) => ipcRenderer.invoke("submit-jimeng-video", request),
  queryJimengVideo: (request) => ipcRenderer.invoke("query-jimeng-video", request),
  exportProject: (project) => ipcRenderer.invoke("export-project", project),
  importProject: () => ipcRenderer.invoke("import-project"),
  saveImageKey: (apiKey) => ipcRenderer.invoke("save-image-key", apiKey),
  imageKeyStatus: () => ipcRenderer.invoke("image-key-status"),
  checkJimengAccount: (id) => ipcRenderer.invoke("check-jimeng-account", id),
  openJimengAccount: (account) =>
    ipcRenderer.invoke("open-jimeng-account", account),
});
