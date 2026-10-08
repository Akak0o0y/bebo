// Regression: launching Bebo again restores the existing window without
// starting another session or interrupting the active Windows bridge.
const { _electron: electron, expect } = require('playwright/test');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
 const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bebo-single-instance-'));
 const executablePath = process.argv[2] ? path.resolve(process.argv[2]) : require('electron');
 const args = [...(process.argv[2] ? [] : ['.']), `--user-data-dir=${profile}`];
 const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
 const first = await electron.launch({ executablePath, args, env, timeout: 30000 });
 let second;
 try {
  const page = await first.firstWindow(); await page.waitForSelector('h1');
  await first.evaluate(({app, BrowserWindow}) => {
   globalThis.secondLaunches = 0;
   app.on('second-instance', () => globalThis.secondLaunches++);
   BrowserWindow.getAllWindows()[0].minimize();
  });
  second = spawn(executablePath, args, { env, windowsHide: true, stdio: 'ignore' });
  const result = await Promise.race([
   once(second, 'exit'),
   new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('Duplicate instance did not exit')), 15000); timer.unref(); })
  ]);
  assert.equal(result[0], 0);
  await expect.poll(() => first.evaluate(() => globalThis.secondLaunches)).toBe(1);
  await expect.poll(() => first.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(false);
  const bridge = await first.evaluate(({app}) => {
   const require = process.getBuiltinModule('node:module').createRequire(app.getAppPath() + '/package.json');
   const path = require('node:path'), fs = require('node:fs');
   return fs.existsSync(app.isPackaged ? path.join(process.resourcesPath, 'windows.ps1') : path.join(app.getAppPath(), 'electron/windows.ps1'));
  });
  assert.equal(bridge, true);
  assert.equal((await page.evaluate(() => window.bebo.taskState())).busy, false);
  console.log('PASS: second launch exits, original window restores, Windows bridge remains available.');
 } finally {
  if (second && second.exitCode === null) second.kill();
  await first.close();
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
