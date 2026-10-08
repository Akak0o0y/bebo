// Isolated files and mocked provider decisions, real Electron IPC and Windows tools.
const { _electron: electron, expect } = require('playwright/test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bebo-adaptive-native-')), profile = path.join(root, 'profile'), files = path.join(root, 'files'); fs.mkdirSync(files);
  const options = { executablePath: process.argv[2] ? path.resolve(process.argv[2]) : require('electron'), args: [...(process.argv[2] ? [] : ['.']), `--user-data-dir=${profile}`], env, timeout: 30000 };
  let app = await electron.launch(options);
  try {
    let page = await app.firstWindow(); await page.waitForSelector('h1');
    await page.evaluate(() => localStorage.setItem('bebo-sound', 'false')); await page.reload(); await page.waitForSelector('h1');
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.evaluate(root => window.bebo.workConfigure({ roots: [root], mode: 'adaptive', terminal: 'ask' }), files);
    await app.evaluate((_, files) => {
      globalThis.mode = 'write'; globalThis.turn = 0; globalThis.bodies = []; globalThis.fixtureRoot = files;
      globalThis.fetch = async (url, options) => {
        if (String(url).includes('/models/')) return new Response('{}');
        if (!String(url).endsWith('/responses')) throw Error('Unexpected external call');
        const body = JSON.parse(options.body); globalThis.bodies.push(body); const n = ++globalThis.turn;
        const observations = body.input.filter(i => i.type === 'function_call_output').map(i => JSON.parse(i.output.find(c => c.type === 'input_text').text));
        const last = observations.at(-1);
        let name, args;
        if (globalThis.mode === 'write' && n === 1) { name = 'write_file'; args = { path: files + '\\note.txt', content: 'Hello from Bebo.', expected_sha256: '', reason: 'Create the requested note' }; }
        else if (globalThis.mode === 'write' && n === 2) { name = 'read_file'; args = { path: files + '\\note.txt', reason: 'Check the saved contents' }; }
        else if (globalThis.mode === 'terminal' && n === 1) { name = 'run_powershell'; args = { command: "Write-Output 'terminal verified'", cwd: files, timeout_seconds: 10, reason: 'Run the requested check' }; }
        else if (globalThis.mode === 'cancel' && n === 1) { name = 'run_powershell'; args = { command: "Write-Output 'running-fixture'; Start-Sleep -Seconds 40", cwd: files, timeout_seconds: 60, reason: 'Run the cancellation fixture' }; }
        else if (globalThis.mode === 'screen' && n === 1) { name = 'observe_screen'; args = { reason: 'Inspect the primary display' }; }
        else if (globalThis.mode === 'question' && n === 1) { name = 'ask_user'; args = { question: 'Which note should I check?' }; }
        else if (globalThis.mode === 'question' && n === 2) { name = 'file_info'; args = { path: files + '\\note.txt', reason: 'Check the note you chose' }; }
        else { name = 'finish'; args = { outcome: 'done', summary: 'Verified the requested result.', evidence_ids: [last.id] }; }
        return new Response(JSON.stringify({ model: 'gpt-6-luna', usage: { input_tokens: 100, output_tokens: 20 }, output: [{ type: 'function_call', call_id: 'fixture-' + globalThis.bodies.length, name, arguments: JSON.stringify(args) }] }));
      };
    }, files);
    await page.evaluate(() => window.bebo.connect('local-test-key-never-sent'));
    const approval = await page.evaluate(() => window.bebo.plan('Create my note.'));
    assert.equal(approval.action.type, 'tool'); assert.match(approval.action.text, /Hello from Bebo/); assert.equal(fs.existsSync(path.join(files, 'note.txt')), false);
    const done = await page.evaluate(id => window.bebo.approve(id), approval.id); assert.equal(done.action.type, 'done'); assert.equal(fs.readFileSync(path.join(files, 'note.txt'), 'utf8'), 'Hello from Bebo.');
    const history = await page.evaluate(() => window.bebo.workHistory()); assert.equal(history.tasks[0].stats.screenshots, 0); assert.equal(history.tasks[0].stats.requests, 3);
    assert.equal(await page.evaluate(async id => { try { await window.bebo.approve(id); return false; } catch { return true; } }, approval.id), true);
    await app.evaluate(() => { globalThis.mode = 'terminal'; globalThis.turn = 0; });
    const terminal = await page.evaluate(() => window.bebo.plan('Run a terminal check.')); assert.match(terminal.action.text, /Write-Output 'terminal verified'/); assert.match(terminal.action.text, /Folder:/);
    const terminalDone = await page.evaluate(id => window.bebo.approve(id), terminal.id); assert.equal(terminalDone.action.type, 'done');
    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'How the work happened.' })).toBeVisible();
    await page.locator('.work-card').first().getByText('1 recorded steps').click();
    await page.locator('.work-card').first().getByText('Command & output').click();
    await expect(page.locator('.work-terminal-output').first()).toContainText('terminal verified');
    await page.screenshot({ path: 'artifacts/bebo-adaptive-native.png', fullPage: true });
    await app.evaluate(() => { globalThis.mode = 'screen'; globalThis.turn = 0; });
    assert.equal((await page.evaluate(() => window.bebo.plan('Inspect the screen.'))).action.type, 'done');
    assert.equal((await page.evaluate(() => window.bebo.workHistory())).tasks[0].stats.screenshots, 1);
    await app.evaluate(() => { globalThis.mode = 'question'; globalThis.turn = 0; });
    const question = await page.evaluate(() => window.bebo.plan('Check the note I choose.')); assert.equal(question.action.type, 'ask');
    assert.equal((await page.evaluate(id => window.bebo.answer(id, 'note.txt'), question.id)).action.type, 'done');
    await app.evaluate(() => { globalThis.mode = 'cancel'; globalThis.turn = 0; });
    await page.evaluate(() => window.bebo.workConfigure({ terminal: 'auto' }));
    const pending = page.evaluate(() => window.bebo.plan('Run the cancellable command.')).catch(e => e.message);
    await expect.poll(async () => (await page.evaluate(() => window.bebo.workHistory())).tasks[0]?.events[0]?.output, { timeout: 20000 }).toContain('running-fixture');
    const cancelTab = app.windows().find(w => w.url().includes('control-cancel.html'));
    await cancelTab.getByRole('button', { name: "Cancel Bebo's computer task" }).click(); await pending;
    assert.equal((await page.evaluate(() => window.bebo.taskState())).busy, false);
    assert.equal((await page.evaluate(() => window.bebo.workHistory())).tasks[0].status, 'stopped');
    const usage = await page.evaluate(() => window.bebo.usageGet('all')); assert.equal(usage.totals.requests, 11);
    assert.deepEqual(errors, []);
    await app.close(); app = await electron.launch(options); page = await app.firstWindow(); await page.waitForSelector('h1');
    const restored = await page.evaluate(() => window.bebo.workHistory()); assert.equal(restored.tasks.length, 5); assert.equal(restored.tasks[0].status, 'stopped'); assert.ok(restored.tasks.every(t => t.events.every(e => !e.output && !e.details)));
    assert.equal((await page.evaluate(() => window.bebo.workSettings())).terminal, 'auto');
    console.log('PASS: real adaptive Electron loop, file approvals and verification, PowerShell, screenshot handoff, questions, Cancel process stop, usage and persisted history. Provider decisions mocked; no API charges.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
