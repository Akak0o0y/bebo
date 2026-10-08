const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { BrowserWindow, screen, ipcMain } = require('electron');
const cancelURL = pathToFileURL(path.join(__dirname, 'control-cancel.html')).href;

class CursorOverlay {
  constructor() {
    this.windows = new Map(); this.active = false; this.suspended = false; this.timer = null;
    this.effects = { cursor: true, dust: true, edges: true }; this.appearance = { color: 'ember', energy: 'lively' };
    this.ambient = { mood: 'idle', controlling: false, pet: null }; this.pulse = 0; this.label = ''; this.phase = 'moving';
    this.cancelListener = event => {
      if (!this.controlling || this.suspended || event.sender.isDestroyed() || event.senderFrame !== event.sender.mainFrame) return;
      if (![...this.windows.values()].some(item => !item.cancelWindow.isDestroyed() && item.cancelWindow.webContents === event.sender && item.cancelWindow.isVisible())) return;
      if (event.senderFrame.url === cancelURL) this.onCancel?.();
    };
    ipcMain.on('bebo:control-cancel', this.cancelListener);
  }
  get controlling() { return !!this.ambient.controlling || (this.active && !this.previewing); }
  intact(item) { return !item.window.isDestroyed() && !item.cancelWindow.isDestroyed() && !item.window.webContents.isDestroyed() && !item.cancelWindow.webContents.isDestroyed(); }
  remove(id, item) {
    if (this.windows.get(id) === item) this.windows.delete(id);
    // Remove the pair before destroying either member: closed events are synchronous.
    for (const win of [item.cancelWindow, item.window]) if (!win.isDestroyed()) win.destroy();
  }
  repair() {
    if (this.closing || this.repairTimer) return;
    this.repairTimer = setTimeout(() => { this.repairTimer = null; this.refresh(); }, 0);
  }
  cancelBounds(bounds) { return { x: bounds.x + Math.round((bounds.width - 132) / 2), y: bounds.y, width: 132, height: 36 }; }
  async prepare() {
    if (this.closing) return;
    if (this.preparing) return this.preparing;
    this.preparing = (async () => {
      const displays = screen.getAllDisplays();
      for (const [id, item] of [...this.windows]) if (!displays.some(d => d.id === id) || !this.intact(item)) this.remove(id, item);
      for (const display of displays) {
        if (this.closing) return;
        if (this.windows.has(display.id)) { const item = this.windows.get(display.id); item.bounds = display.bounds; item.window.setBounds(display.bounds); item.window.setIgnoreMouseEvents(true); item.cancelWindow.setBounds(this.cancelBounds(display.bounds)); continue; }
        const win = new BrowserWindow({ ...display.bounds, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
          focusable: false, skipTaskbar: true, resizable: false, movable: false, hasShadow: false, enableLargerThanScreen: true,
          webPreferences: { preload: path.join(__dirname, 'cursor-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
        win.setIgnoreMouseEvents(true); win.setAlwaysOnTop(true, 'screen-saver'); win.setContentProtection(true);
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); win.webContents.on('will-navigate', event => event.preventDefault());
        // Only this tiny top-edge tab accepts clicks. The full-screen effect stays pass-through.
        const cancelWindow = new BrowserWindow({ ...this.cancelBounds(display.bounds), show: false, frame: false, thickFrame: false, transparent: true,
          backgroundColor: '#00000000', focusable: false, skipTaskbar: true, resizable: false, movable: false, hasShadow: false,
          webPreferences: { preload: path.join(__dirname, 'control-cancel-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
        // Reapply after creation to avoid Windows enlarging the tiny tab at fractional DPI.
        cancelWindow.setMinimumSize(1, 1); cancelWindow.setBounds(this.cancelBounds(display.bounds));
        cancelWindow.setAlwaysOnTop(true, 'screen-saver'); cancelWindow.setContentProtection(true);
        cancelWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); cancelWindow.webContents.on('will-navigate', event => event.preventDefault());
        const item = { window: win, cancelWindow, bounds: display.bounds, ready: false };
        this.windows.set(display.id, item);
        for (const member of [win, cancelWindow]) {
          // WM_CLOSE from a broad desktop command must not remove the emergency stop.
          member.on('close', event => { if (!this.closing && this.controlling) event.preventDefault(); });
          member.on('closed', () => { if (this.windows.get(display.id) !== item) return; this.remove(display.id, item); this.repair(); });
        }
        try {
          await Promise.all([win.loadURL(pathToFileURL(path.join(__dirname, 'cursor.html')).href), cancelWindow.loadURL(cancelURL)]);
          if (this.intact(item)) item.ready = true;
        } catch (error) {
          const wasClosed = !this.intact(item); this.remove(display.id, item);
          if (!wasClosed && !this.closing) throw error;
        }
      }
      this.window = this.windows.get(screen.getPrimaryDisplay().id)?.window;
    })().finally(() => { this.preparing = null; });
    return this.preparing;
  }
  configure(effects, appearance) { this.effects = { ...effects }; this.appearance = { ...appearance }; this.refresh(); }
  setAmbient(ambient) { this.ambient = ambient; this.refresh(); }
  start(action, preview = false) {
    this.active = true; this.previewing = preview; this.suspended = false; this.pulse = 0; this.phase = 'moving';
    this.label = preview ? 'Bebo · cursor preview' : ({ click: 'Bebo · clicking', double_click: 'Bebo · double click', scroll: 'Bebo · scrolling', type: 'Bebo · typing', key: 'Bebo · keyboard' }[action.type] || 'Bebo · working');
    this.refresh();
  }
  refresh() {
    if (this.closing) return;
    for (const [id, item] of [...this.windows]) if (!this.intact(item)) this.remove(id, item);
    const visible = !this.suspended && ((this.active && (this.effects.cursor || this.effects.dust)) || this.controlling || (this.ambient.pet && this.effects.dust));
    if (!visible) { this.hide(); return; }
    if (this.windows.size !== screen.getAllDisplays().length) {
      if (!this.preparing) void this.prepare().then(() => this.refresh()).catch(() => this.hide());
      return;
    }
    // Windows can reset mouse pass-through when a transparent window is shown
    // or resized. Reapply it after those operations, before native input begins.
    this.tick(); for (const { window, cancelWindow, ready } of this.windows.values()) {
      if (!ready || window.isDestroyed() || cancelWindow.isDestroyed()) continue;
      if (!window.isVisible()) { window.showInactive(); window.setIgnoreMouseEvents(true); }
      if (this.controlling) { if (!cancelWindow.isVisible()) cancelWindow.showInactive(); }
      else cancelWindow.hide();
    }
    if (!this.timer) this.timer = setInterval(() => this.tick(), 32);
  }
  tick() {
    if (this.suspended) return;
    const cursor = screen.getCursorScreenPoint();
    const pet = this.getPetBounds ? this.getPetBounds() : this.ambient.pet;
    for (const { window, bounds } of this.windows.values()) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
      window.webContents.send('bebo:cursor-frame', { x: cursor.x - bounds.x, y: cursor.y - bounds.y, label: this.label, pulse: this.pulse, phase: this.phase,
        active: this.active, preview: this.previewing, engaged: this.controlling, mood: this.ambient.mood,
        color: '#141414', calm: this.appearance.energy === 'calm', effects: this.effects,
        pet: pet ? { x: pet.x + pet.width / 2 - bounds.x, y: pet.y + pet.height - 130 - bounds.y } : null });
    }
  }
  event(event) { if (event.event === 'cursor') { this.phase = event.phase; if (event.phase === 'click' || event.phase === 'scroll') this.pulse++; this.tick(); } }
  hide() { clearInterval(this.timer); this.timer = null; for (const { window, cancelWindow } of this.windows.values()) { if (!window.isDestroyed()) window.hide(); if (!cancelWindow.isDestroyed()) cancelWindow.hide(); } }
  suspend() { this.suspended = true; this.hide(); }
  resume() { this.suspended = false; this.refresh(); }
  endAction() { this.active = false; this.previewing = false; this.refresh(); }
  stop() { this.active = false; this.ambient.controlling = false; clearTimeout(this.previewTimer); this.suspend(); }
  async preview() { await this.prepare(); this.start({}, true); this.previewTimer = setTimeout(() => { this.active = false; this.refresh(); }, 5000); }
  close() { this.closing = true; clearTimeout(this.repairTimer); this.stop(); ipcMain.removeListener('bebo:control-cancel', this.cancelListener); for (const [id, item] of [...this.windows]) this.remove(id, item); }
}
module.exports = { CursorOverlay };
