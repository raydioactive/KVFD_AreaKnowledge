/**
 * Electron Preload Script
 * Provides secure context bridge between main and renderer processes
 */
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // API port (set by main process)
  apiPort: null,

  // Listener for API port updates
  onApiPortReady: (callback) => {
    ipcRenderer.on('api-port', (event, port) => {
      window.electronAPI.apiPort = port;
      callback(port);
    });
  },

  // Get API port via IPC
  getApiPort: () => ipcRenderer.invoke('get-api-port'),

  // Platform information
  platform: process.platform,

  // App version (can be populated later)
  version: '1.0.0'
});
