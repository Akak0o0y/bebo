// Reproduce a closed Cancel overlay without closing any user application.
const { _electron: electron, expect } = require('playwright/test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bebo-overlay-recovery-'));
  const app = await electron.launch({ executablePath: process.argv[2] ? path.resolve(process.argv[2]) : require('electron'), args: [...(process.argv[2] ? [] : ['.']), `--user-data-dir=${profile}`], env });
  try {
    const page = await app.firstWindow(); await page.waitForSelector('h1');
    await page.evaluate(() => window.bebo.cursorPreview());
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('control-cancel.html')).destroy());
    // This production path previously threw "Object has been destroyed".
    await page.evaluate(() => window.bebo.effectsSet({ dust: true }));
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().includes('control-cancel.html')).length)).toBeGreaterThan(0);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('cursor.html')).destroy());
    await page.evaluate(() => window.bebo.effectsSet({ edges: true }));
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().includes('cursor.html')).length)).toBeGreaterThan(0);
    await page.evaluate(() => window.bebo.stop());
    assert.equal((await page.evaluate(() => window.bebo.taskState())).busy, false);
    console.log('PASS: destroyed Cancel and effect windows recover; settings, Stop and shutdown remain usable.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
