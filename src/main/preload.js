const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  getSources: () => ipcRenderer.invoke('get-sources'),
  onAppClosing: (callback) => ipcRenderer.on('app-closing', callback),
  setZoomLevel: (level) => ipcRenderer.send('set-zoom-level', level)
});
