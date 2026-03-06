const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onAppendClipboard: (callback) => {
    const handler = (_event, text) => callback(text);
    ipcRenderer.on("append-clipboard", handler);
    return () => ipcRenderer.removeListener("append-clipboard", handler);
  },
});
