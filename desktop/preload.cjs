const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("c3dDesktop", {
  platform: "macOS",
  openFile: () => ipcRenderer.invoke("c3d:choose-file"),
  openFolder: () => ipcRenderer.invoke("c3d:choose-folder"),
  openDroppedFile: (file) => {
    const path = webUtils.getPathForFile(file);
    if (!path) return Promise.reject(new Error("无法获取这个文件的本地路径。"));
    return ipcRenderer.invoke("c3d:open-path", path);
  },
  onOpen: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("c3d:opened", listener);
    return () => ipcRenderer.removeListener("c3d:opened", listener);
  },
  getPreferences: () => ipcRenderer.invoke("c3d:get-preferences"),
  setPreferences: (preferences) =>
    ipcRenderer.invoke("c3d:set-preferences", preferences),
  onSettings: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("c3d:settings", listener);
    return () => ipcRenderer.removeListener("c3d:settings", listener);
  },
  ready: () => ipcRenderer.invoke("c3d:ready"),
});
