const { app, BrowserWindow } = require('electron');
let quitting = false;
app.on('before-quit', () => { quitting = true; });
app.whenReady().then(async () => {
  for (const name of ['normal', 'save prompt', 'untouched']) {
    const win = new BrowserWindow({ width: 420, height: 220, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    await win.loadURL('data:text/html,' + encodeURIComponent(`<title>Bebo test fixture: ${name}</title><body style="font:18px Segoe UI;padding:20px"><h2>${name}</h2><p>Disposable test window. No user documents.</p></body>`));
    if (name === 'save prompt') win.on('close', event => { if (!quitting) { event.preventDefault(); win.setTitle('Bebo test fixture: unsaved work needs a decision'); } });
    win.showInactive();
  }
});
app.on('window-all-closed', () => app.quit());
