// Real Windows mouse test, confined to a disposable test button. Model responses
// are injected locally; no API calls or credentials leave this process.
const automatic=process.argv.includes('--auto');
const executable=process.argv.slice(2).find(value=>!value.startsWith('--'));
const { _electron: electron, expect } = require('playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bebo-cursor-smoke-'));
  const app = await electron.launch({ ...(executable ? { executablePath: path.resolve(executable), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }), env, timeout: 30000 });
  try {
    const desktop = await app.firstWindow(); await desktop.waitForSelector('h1');
    await desktop.evaluate(() => { localStorage.setItem('bebo-sound','false'); });
    await desktop.reload(); await desktop.waitForSelector('h1');
    await desktop.evaluate(() => window.bebo.cursorPreview());
    const overlay = app.windows().find(window => window.url().includes('cursor.html'));
    assert.ok(overlay);
    await expect(overlay.locator('#cursor')).toHaveAttribute('aria-label','Bebo · cursor preview');
    await expect(overlay.locator('.pointer')).toBeVisible();
    const flags = await app.evaluate(({ BrowserWindow }) => {
      const overlay = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('cursor.html'));
      return { focusable: overlay.isFocusable(), topmost: overlay.isAlwaysOnTop(), focused: overlay.isFocused() };
    });
    assert.equal(flags.focusable, false); assert.equal(flags.topmost, true); assert.equal(flags.focused, false);
    await desktop.evaluate(() => window.bebo.stop());
    const coordinates = await app.evaluate(async ({ BrowserWindow, screen }) => {
      const display = screen.getPrimaryDisplay();
      const target = new BrowserWindow({ width: 420, height: 330, x: display.bounds.x + 160, y: display.bounds.y + 160, alwaysOnTop: true, webPreferences: { contextIsolation: true, nodeIntegration: false } });
      await target.loadURL('data:text/html,' + encodeURIComponent('<title>Bebo isolated click test</title><body style="margin:0;display:grid;place-items:center;height:100vh;background:#f6ebdc"><button style="width:260px;height:150px;font-size:24px" onclick="this.dataset.clicks=String(Number(this.dataset.clicks||0)+1);this.textContent=\'Bebo clicked here\'">Test click target</button></body>'));
      // Keep the disposable target above other floating desktop apps during this test.
      target.setAlwaysOnTop(true, 'screen-saver');
      globalThis.beboTestTarget = target;
      await target.webContents.executeJavaScript("window.events=[]; for (const event of ['pointerdown','pointerup','click']) document.addEventListener(event,e=>window.events.push({type:event,x:e.clientX,y:e.clientY,target:e.target.tagName}));");
      const content = target.getContentBounds();
      const physical = screen.dipToScreenPoint({ x: content.x + Math.round(content.width/2), y: content.y + Math.round(content.height/2) });
      const origin = screen.dipToScreenPoint({ x: display.bounds.x, y: display.bounds.y });
      const width = Math.round(display.bounds.width * display.scaleFactor), height = Math.round(display.bounds.height * display.scaleFactor);
      const point = { x: Math.round((physical.x-origin.x)/(width-1)*1000), y: Math.round((physical.y-origin.y)/(height-1)*1000) };
      let calls = 0;
      globalThis.fetch = async url => {
        if (String(url).includes('/models/')) return new Response('{}');
        if (!String(url).endsWith('/responses')) throw new Error('Unexpected network request in contained test');
        const action = ++calls === 1 ? { type: 'click', ...point, text: '', reason: 'Click the isolated test button.' } : { type: 'done', x: 0, y: 0, text: '', reason: 'Contained cursor check finished.' };
        return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(action) }] }] }));
      };
      target.focus(); return point;
    });
    await desktop.evaluate(() => window.bebo.workConfigure({mode:'screen'}));
    await desktop.evaluate(() => window.bebo.connect('local-test-key-never-sent'));
    if(automatic)await desktop.evaluate(()=>window.bebo.assistantSet({autoActions:['click']}));
    const step = automatic ? null : await desktop.evaluate(() => window.bebo.plan('Click the isolated test button once.'));
    if(step)assert.equal(step.action.x, coordinates.x);
    await app.evaluate(({app,screen})=>{
      const root=app.getAppPath(),require=process.getBuiltinModule('node:module').createRequire(root+'/package.json'),path=require('node:path');const {ApprovalGate}=require(path.join(root,'electron/policy.cjs'));const consume=ApprovalGate.prototype.consume;ApprovalGate.prototype.consume=function(id){const value=consume.call(this,id);globalThis.testContext=value.context;return value;};
      const {CursorOverlay}=require(path.join(root,'electron/cursor-overlay.cjs'));const onEvent=CursorOverlay.prototype.event;globalThis.cursorEvents=[];CursorOverlay.prototype.event=function(event){globalThis.cursorEvents.push({...event,point:screen.getCursorScreenPoint()});return onEvent.call(this,event);};
    });
    const approve = automatic ? desktop.evaluate(()=>window.bebo.plan('Click the isolated test button once.')) : desktop.evaluate(id => window.bebo.approve(id), step.id);
    await expect(overlay.locator('#cursor')).toHaveAttribute('aria-label','Bebo · clicking', { timeout: 15000 });
    await expect(overlay.locator('.pointer')).toBeVisible();
    // Do not capture the overlay mid-action: DevTools can disturb the active window.

    const done = await approve.catch(async error=>{console.log('Native context',await app.evaluate(()=>({context:globalThis.testContext,cursorEvents:globalThis.cursorEvents})));throw error;}); assert.equal(done.action.type, 'done');
    const result = await app.evaluate(async () => globalThis.beboTestTarget.webContents.executeJavaScript('document.querySelector("button").dataset.clicks'));
    if(result!=='1')console.log('Click diagnostics',await app.evaluate(async({screen})=>({context:globalThis.testContext,cursorEvents:globalThis.cursorEvents,pointer:screen.getCursorScreenPoint(),bounds:globalThis.beboTestTarget.getBounds(),content:globalThis.beboTestTarget.getContentBounds(),events:await globalThis.beboTestTarget.webContents.executeJavaScript('window.events'),rect:await globalThis.beboTestTarget.webContents.executeJavaScript('JSON.stringify(document.querySelector("button").getBoundingClientRect())')})),{coordinates});
    assert.equal(result, '1');
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('cursor.html')).isVisible()), false);
    console.log((automatic?'AUTOMATIC MODE ':'')+'PASS: non-focusing cursor overlay, real Windows movement and one click on isolated target, overlay hidden after action. Model replies mocked locally.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
