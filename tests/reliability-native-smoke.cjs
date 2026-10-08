// Real Windows/Electron boundaries with disposable windows and mocked API replies.
const { _electron: electron, expect: baseExpect } = require('playwright/test');
const expect = baseExpect.configure({ timeout: 20000 });
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bebo-reliability-')), profile = path.join(root, 'profile');
  const options = { executablePath: process.argv[2] ? path.resolve(process.argv[2]) : require('electron'), args: [...(process.argv[2] ? [] : ['.']), `--user-data-dir=${profile}`], env, timeout: 30000 };
  let app = await electron.launch(options), fixtures;
  try {
    let page = await app.firstWindow(); await page.waitForSelector('h1');
    await page.evaluate(() => localStorage.setItem('bebo-sound', 'false')); await page.reload(); await page.waitForSelector('h1');
    await app.evaluate(({dialog}) => {
      globalThis.testFatalErrors=[];dialog.showErrorBox=(title,content)=>{globalThis.testFatalErrors.push({title,content});console.error('TEST MAIN ERROR',title,content);};
      globalThis.testMode = 'close'; globalThis.testTurn = 0;
      globalThis.fetch = async (url, options) => {
        if (String(url).includes('/models/')) return new Response('{}', { status: String(options.headers.Authorization).includes('invalid') ? 401 : 200 });
        if (!String(url).endsWith('/responses')) throw Error('Unexpected external call');
        if (globalThis.testMode === 'rate') return new Response('{}', { status: 429 });
        if (globalThis.testMode === 'network') throw Error('Offline fixture');
        if (globalThis.testMode === 'empty') return new Response(JSON.stringify({ output: [], usage: { input_tokens: 1, output_tokens: 0 } }));
        if (globalThis.testMode === 'wait') return new Promise((resolve, reject) => { globalThis.waitStarted = true; options.signal.addEventListener('abort', () => reject(Error('Cancelled fixture')), { once: true }); });
        const body = JSON.parse(options.body), n = ++globalThis.testTurn;
        const observations = body.input.filter(item => item.type === 'function_call_output').map(item => JSON.parse(item.output[0].text));
        const last = observations.at(-1); let name, args;
        if (globalThis.testMode === 'invalid') { name = 'invented_tool'; args = {}; }
        else if (n === 1 || n === 3) { name = 'inspect_computer'; args = { reason: n === 1 ? 'Check disposable test windows' : 'Verify which fixture windows remain' }; }
        else if (n === 2) { name = 'close_windows'; args = { window_ids: last.data.windows.filter(win => ['Bebo test fixture: normal', 'Bebo test fixture: save prompt'].includes(win.title)).map(win => win.id), reason: 'Close only the two requested test windows' }; }
        else { name = 'finish'; args = { outcome: 'blocked', summary: 'The normal test window closed. The unsaved-work fixture remains for your decision.', evidence_ids: [last.id] }; }
        return new Response(JSON.stringify({ model: 'gpt-6-luna', usage: { input_tokens: 50, output_tokens: 10 }, output: [{ type: 'function_call', name, arguments: JSON.stringify(args), call_id: 'fixture-' + n }] }));
      };
    });
    console.log('Checking saved credentials and graceful window closure');
    const secret = 'local-fixture-key-never-sent';
    await page.evaluate(key => window.bebo.connect(key), secret);
    assert.equal((await page.evaluate(() => window.bebo.status())).saved, true);
    const credential = path.join(profile, 'luna-credential.json');
    assert.ok(fs.existsSync(credential)); assert.ok(!fs.readFileSync(credential, 'utf8').includes(secret));
    assert.ok(!JSON.stringify(await page.evaluate(() => window.bebo.status())).includes(secret));
    await assert.rejects(page.evaluate(() => window.bebo.connect('invalid-fixture-key')), /not accepted/);
    assert.equal((await page.evaluate(() => window.bebo.status())).connected, true);
    fixtures = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, 'close-windows-fixture.cjs'), `--user-data-dir=${path.join(root, 'fixtures')}`], env });
    await expect.poll(() => fixtures.windows().length).toBe(3);
    await expect.poll(() => fixtures.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(win => win.isVisible()))).toBe(true);
    const approval = await page.evaluate(() => window.bebo.plan('Close only the normal and save prompt test fixtures.'));
    assert.equal(approval.action.type, 'tool'); assert.match(approval.action.text, /Bebo test fixture: normal/); assert.match(approval.action.text, /save prompt/);
    assert.equal(fixtures.windows().length, 3);
    const result = await page.evaluate(id => window.bebo.approve(id), approval.id); assert.equal(result.action.type, 'blocked');
    await expect.poll(() => fixtures.windows().length).toBe(2);
    const titles = await fixtures.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(win => win.getTitle()));
    assert.ok(titles.includes('Bebo test fixture: untouched')); assert.ok(titles.includes('Bebo test fixture: unsaved work needs a decision'));
    assert.equal((await page.evaluate(() => window.bebo.workHistory())).tasks[0].events.filter(event => event.tool === 'run_powershell').length, 0);
    await assert.rejects(page.evaluate(id => window.bebo.approve(id), approval.id), /no longer pending/i);
    // Main-process protection is independent of titles and of planner exclusions.
    const script = process.argv[2] ? path.join(path.dirname(path.resolve(process.argv[2])), 'resources/windows.ps1') : path.join(__dirname, '../electron/windows.ps1');
    const beboProcessId = await app.evaluate(() => process.pid);
    await app.evaluate(({BrowserWindow}) => {const dashboard=BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().includes('index.html')&&!win.webContents.getURL().includes('pet=1'));dashboard.showInactive();});
    const native = request => new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script], { windowsHide: true }); let out = '', error = '';
      child.stdout.on('data', chunk => out += chunk); child.stderr.on('data', chunk => error += chunk); child.on('error', reject); child.on('close', code => code ? reject(Error(error)) : resolve(JSON.parse(out.replace(/^\uFEFF/, '')))); child.stdin.end(JSON.stringify({ ...request, protectedPids: [beboProcessId] }));
    });
    const state = await native({ op: 'inspect' }), owned = state.windows.filter(win => win.pid === beboProcessId);
    assert.ok(owned.length); assert.ok(owned.every(win => !win.closable));
    const protectedResult = await native({ op: 'close-windows', windows: owned });
    assert.equal(protectedResult.requested.length, 0); assert.ok(protectedResult.skipped.length > 0);
    console.log('Checking provider failures and interruption');
    // Controlled failures must leave no busy task, overlay, or unusable app.
    for (const mode of ['rate', 'network', 'empty', 'invalid']) {
      await app.evaluate((_, mode) => { globalThis.testMode = mode; globalThis.testTurn = 0; }, mode);
      const error = await page.evaluate(async () => { try { await window.bebo.plan('Exercise a controlled failure.'); return ''; } catch (error) { return error.message; } });
      assert.ok(error); assert.ok(!error.includes('Object has been destroyed'));
      assert.equal((await page.evaluate(() => window.bebo.taskState())).busy, false);
      assert.equal((await page.evaluate(() => window.bebo.workHistory())).tasks[0].status, 'error');
    }
    await app.evaluate(() => { globalThis.testMode = 'wait'; globalThis.waitStarted = false; });
    const pending = page.evaluate(() => window.bebo.plan('Wait for the cancellation test.')).catch(error => error.message);
    await expect.poll(() => app.evaluate(() => globalThis.waitStarted)).toBe(true);
    // Closing the companion while a task is running must not break later updates.
    console.log('Checking companion destruction during a task');
    await page.evaluate(() => window.bebo.pet());
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(win => win.webContents.getURL().includes('?pet=1')))).toBe(true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('?pet=1')).destroy());
    await page.evaluate(() => window.bebo.stop()); await pending;
    assert.equal((await page.evaluate(() => window.bebo.workHistory())).tasks[0].status, 'stopped');
    assert.deepEqual(await app.evaluate(()=>globalThis.testFatalErrors), []);
    console.log('Checking restart and encrypted key restoration');
    await app.close(); app = await electron.launch(options); page = await app.firstWindow(); await page.waitForSelector('h1');
    const restored = await page.evaluate(() => window.bebo.status()); assert.equal(restored.connected, true); assert.equal(restored.saved, true);
    await page.getByRole('button', { name: 'Settings', exact: true }).first().click(); await expect(page.getByText('Saved securely · reconnects after restart')).toBeVisible();
    await page.screenshot({ path: 'artifacts/bebo-saved-connection.png' });
    await page.evaluate(() => window.bebo.forgetKey()); assert.equal(fs.existsSync(credential), false);
    assert.ok((await page.evaluate(() => window.bebo.workHistory())).tasks.length >= 6);
    await app.close(); fs.writeFileSync(credential, '{broken fixture'); app = await electron.launch(options); page = await app.firstWindow(); await page.waitForSelector('h1');
    assert.match((await page.evaluate(() => window.bebo.status())).error, /could not be unlocked/); assert.equal((await page.evaluate(() => window.bebo.status())).connected, false);
    await app.evaluate(() => { globalThis.quittingFixtureReady = false; globalThis.fetch = async (url, options) => String(url).includes('/models/') ? new Response('{}') : new Promise((resolve, reject) => { globalThis.quittingFixtureReady = true; options.signal.addEventListener('abort', () => reject(Error('Bebo quit during test')), { once: true }); }); });
    await page.evaluate(() => window.bebo.connect('fixture-repaired-connection'));
    const quittingTask = page.evaluate(() => window.bebo.plan('Wait until this test app quits.')).catch(() => {});
    await expect.poll(() => app.evaluate(() => globalThis.quittingFixtureReady)).toBe(true);
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(win => win.webContents.getURL().includes('control-cancel.html') && win.isVisible()))).toBe(true);
    let quitTimer;
    try { await Promise.race([app.close(), new Promise((_, reject) => { quitTimer = setTimeout(() => reject(Error('Quitting an active task was blocked by an overlay')), 10000); })]); }
    finally { clearTimeout(quitTimer); }
    await quittingTask;
    console.log('PASS: graceful targeted closure, unsaved-work protection, protected Bebo process, approvals, provider failures, companion close, Stop, active-task shutdown, real Windows-encrypted key persistence/forget/corruption and restart. Mocked inference; no API charges.');
  } finally { if (fixtures) await fixtures.close(); await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
