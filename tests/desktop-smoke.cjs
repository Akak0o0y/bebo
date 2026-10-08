const { _electron: electron, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

(async () => {
  if (process.argv[2] && /portable\.exe$/i.test(process.argv[2])) {
    throw new Error('Use the packaged win-unpacked/Bebo.exe payload for automation. The portable wrapper does not forward the inspector connection.');
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bebo-smoke-'));
  const profileArg = `--user-data-dir=${profile}`;
  const app = await electron.launch(process.argv[2]
    ? { executablePath: path.resolve(process.argv[2]), args: [profileArg], env, timeout: 30000 }
    : { args: ['.', profileArg], env, timeout: 30000 });
  try {
    const win = await app.firstWindow();
    const errors = [];
    win.on('pageerror', e => errors.push(e.message));
    await win.waitForSelector('h1');
    assert.match(await win.title(), /Bebo/);
    assert.deepEqual(await win.evaluate(async () => {const status=await window.bebo.status();return{connected:status.connected,saved:status.saved};}), { connected: false, saved: false });
    const error = await win.evaluate(async () => {
      try { await window.bebo.plan('Open Chrome'); return ''; }
      catch (e) { return e.message; }
    });
    assert.match(error, /Connect Luna/);
    await expect(win.locator('.aora-renderer svg')).toHaveCount(1);
    await win.screenshot({ path: 'artifacts/bebo-native.png' });
    const petPromise = app.waitForEvent('window');
    await win.evaluate(() => window.bebo.pet());
    const pet = await petPromise;
    pet.on('pageerror', e => errors.push(e.message));
    await pet.waitForSelector('.pet-view');
    assert.equal(app.windows().filter(w=>w.url().includes('index.html')).length, 2);
    assert.equal(await pet.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgba(0, 0, 0, 0)');
    for (const [mood, label] of [['thinking', 'Thinking'], ['approval', 'Your turn'], ['success', 'All done']]) {
      await win.evaluate(m => window.bebo.setAvatarState(m), mood);
      await expect(pet.locator('.bebo-avatar')).toHaveAttribute('data-mood', mood);
      await expect(pet.locator('.pet-emotion')).toHaveText(label);
      assert.equal(await pet.evaluate(() => window.bebo.getAvatarState()), mood);
    }
    const rejected = await pet.evaluate(async () => {
      try { await window.bebo.setAvatarState('thinking'); return false; }
      catch { return true; }
    });
    assert.equal(rejected, true, 'Only the dashboard may publish live avatar state');
    await win.evaluate(() => window.bebo.setAvatarState('idle'));
    await expect(pet.locator('.bebo-avatar')).toHaveAttribute('data-mood', 'idle');
    await pet.screenshot({ path: 'artifacts/bebo-pet.png' });
    await pet.evaluate(() => window.bebo.dashboard());
    assert.deepEqual(errors, []);
    console.log('PASS: native launch, no-key guard, original avatar, transparent companion, live state sync, sender validation, dashboard return.');
  } finally {
    await app.close();
    // Deliberately retain the temporary profile for failed-run inspection.
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
