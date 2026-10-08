const { ipcRenderer } = require('electron');
ipcRenderer.on('bebo:cursor-frame', (_event, frame) => {
  // One-way renderer: the cursor window has no desktop-control bridge.
  window.dispatchEvent(new CustomEvent('bebo-cursor', { detail: frame }));
});
