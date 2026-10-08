function liveWindow(window) { return !!window && !window.isDestroyed(); }
function sendWindow(window, channel, ...args) {
  if (!liveWindow(window) || window.webContents.isDestroyed()) return false;
  window.webContents.send(channel, ...args); return true;
}
module.exports = { liveWindow, sendWindow };
