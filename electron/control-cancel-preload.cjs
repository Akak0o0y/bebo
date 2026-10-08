const { contextBridge, ipcRenderer } = require('electron');
// This isolated surface can only stop its current task, never start an action.
contextBridge.exposeInMainWorld('beboCancel', { stop: () => ipcRenderer.send('bebo:control-cancel') });
