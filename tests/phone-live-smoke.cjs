// Opt-in integration check: opens a temporary Cloudflare HTTPS link, pairs an
// isolated browser, verifies the no-key guard, then runs a disposable file task.
// Provider decisions are mocked. No real key, audio upload, desktop input or API charge.
const { _electron: electron, chromium, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bebo-phone-smoke-'));
  const app = await electron.launch({ ...(process.argv[2] ? { executablePath: path.resolve(process.argv[2]), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }), env, timeout: 30000 });
  let browser;
  try {
    const desktop = await app.firstWindow(); await desktop.waitForSelector('h1');
    await desktop.getByRole('button', { name: 'Phone', exact: true }).click();
    await desktop.getByRole('button', { name: 'Create phone link' }).click();
    await expect(desktop.getByRole('heading', { name: 'Say hello from your phone.' })).toBeVisible({ timeout: 55000 });
    const invitation = await desktop.evaluate(() => window.bebo.phoneStatus());
    assert.match(invitation.url, /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/);
    browser = await chromium.launch({ channel: 'chrome' });
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    // Source QA serves current React from Vite without generating a build. API
    // traffic still crosses the real public HTTPS tunnel to the real desktop.
    if (process.env.BEBO_SOURCE_QA) await phone.route('**/api/**', async route => {
      const headers = { ...route.request().headers(), origin: invitation.url };
      delete headers.host;
      try { const response = await route.fetch({ url: invitation.url + new URL(route.request().url()).pathname, headers, timeout: 95000 }); await route.fulfill({ response }); }
      catch { await route.abort().catch(() => {}); }
    });
    const errors = []; phone.on('pageerror', e => { errors.push(e.message); console.error('Phone page error:', e.message); });
    phone.on('response', async response => { if (new URL(response.url()).pathname === '/api/state' && response.status() !== 200) console.error('Phone state HTTP:', response.status(), (await response.text()).slice(0,180)); });
    await phone.goto(`${process.env.BEBO_SOURCE_QA ? 'http://127.0.0.1:5173' : invitation.url}/?phone=1#pair=${invitation.invite.token}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect(phone.getByRole('heading', { name: 'A quick hello on your desktop.' })).toBeVisible({ timeout: 20000 });
    await expect(desktop.getByRole('heading', { name: 'Is this your phone?' })).toBeVisible();
    const displayed = await desktop.locator('.pair-match-code').textContent();
    await expect(phone.locator('.pair-match-code')).toHaveText(displayed);
    await desktop.getByRole('button', { name: 'Yes, pair this phone' }).click();
    try { await expect(phone.getByText('Desktop connected', { exact: true })).toBeVisible({ timeout: 15000 }); }
    catch(error) {
      console.error('State diagnostic:', await phone.evaluate(async()=>{const response=await fetch('/api/state',{headers:{Authorization:`Bearer ${localStorage.getItem('bebo-phone-session')}`}});return {status:response.status,body:(await response.text()).slice(0,300),abortAny:typeof AbortSignal.any,abortTimeout:typeof AbortSignal.timeout};}));
      throw error;
    }
    await expect(phone.getByRole('heading', { name: 'Let’s connect my brain.' })).toBeVisible();
    const guard = await phone.evaluate(async () => {
      const response = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('bebo-phone-session')}` }, body: JSON.stringify({ op: 'request', text: 'Open Calculator', id: crypto.randomUUID().replaceAll('-', '') }) });
      return { status: response.status, data: await response.json() };
    });
    assert.equal(guard.status, 409); assert.match(guard.data.error, /Connect Luna/);
    const files = path.join(profile, 'audit-files'); fs.mkdirSync(files);
    await desktop.evaluate(root => window.bebo.workConfigure({ roots: [root], mode: 'adaptive', autoFiles: false }), files);
    await app.evaluate((_, root) => {
      globalThis.phoneTurns = 0; globalThis.holdPhoneModel = false;
      globalThis.fetch = async (url, options) => {
        if (String(url).includes('/models/')) return new Response('{}');
        if (!String(url).endsWith('/responses')) throw Error('Unexpected provider request in phone audit');
        if (globalThis.holdPhoneModel) return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('Test model stopped')), { once: true }));
        const body = JSON.parse(options.body), n = ++globalThis.phoneTurns;
        const last = body.input.filter(item => item.type === 'function_call_output').map(item => JSON.parse(item.output[0].text)).at(-1);
        const name = n === 1 ? 'ask_user' : n === 2 ? 'write_file' : n === 3 ? 'read_file' : 'finish';
        const args = n === 1 ? { question: 'What should the audit note say?' } : n === 2 ? { path: root + '\\phone-note.txt', content: 'Checked from the phone.', expected_sha256: '', reason: 'Save the audit note you requested' } : n === 3 ? { path: root + '\\phone-note.txt', reason: 'Verify the saved note' } : { outcome: 'done', summary: 'Phone note saved and verified.', evidence_ids: [last.id] };
        return new Response(JSON.stringify({ model: 'gpt-6-luna', usage: { input_tokens: 100, output_tokens: 20 }, output: [{ type: 'function_call', call_id: 'phone-audit-' + n, name, arguments: JSON.stringify(args) }] }));
      };
    }, files);
    await desktop.evaluate(() => window.bebo.connect('phone-audit-key-never-sent'));
    await phone.getByRole('button', { name: 'Type instead' }).click();
    await phone.getByLabel('A little request for your desktop').fill('Create an audit note in the test folder.');
    await phone.getByRole('button', { name: 'Send phone request' }).click();
    await phone.getByRole('textbox', { name: 'Your answer to Bebo' }).fill('Checked from the phone.');
    await phone.getByRole('button', { name: 'Send answer' }).click();
    await expect(phone.getByRole('button', { name: 'Allow this step' })).toBeEnabled({ timeout: 20000 });
    assert.equal(fs.existsSync(path.join(files, 'phone-note.txt')), false);
    await phone.getByRole('button', { name: 'Allow this step' }).click();
    await expect(phone.locator('.phone-live-copy')).toContainText('Phone note saved and verified.', { timeout: 30000 });
    assert.equal(fs.readFileSync(path.join(files, 'phone-note.txt'), 'utf8'), 'Checked from the phone.');
    assert.equal(await app.evaluate(() => globalThis.phoneTurns), 4);
    const journal = await desktop.evaluate(() => window.bebo.workHistory());
    assert.equal(journal.tasks[0].status, 'done'); assert.equal(journal.tasks[0].stats.tokens, 480);
    await phone.reload(); await expect(phone.getByText('Desktop connected', { exact: true })).toBeVisible({ timeout: 15000 });
    await app.evaluate(() => { globalThis.holdPhoneModel = true; });
    await phone.getByRole('button', { name: 'Type instead' }).click();
    await phone.getByLabel('A little request for your desktop').fill('Exercise cancellation without taking an action.');
    await phone.getByRole('button', { name: 'Send phone request' }).click();
    await expect.poll(() => desktop.evaluate(async () => (await window.bebo.taskState()).busy)).toBe(true);
    await phone.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect.poll(() => desktop.evaluate(async () => (await window.bebo.taskState()).busy)).toBe(false);
    await phone.screenshot({ path: 'artifacts/phone-live-connected.png', fullPage: true });
    await desktop.screenshot({ path: 'artifacts/phone-desktop-paired.png', fullPage: true });
    await desktop.getByRole('button', { name: 'Forget this phone', exact: true }).click();
    await expect(phone.getByText('Not paired', { exact: true })).toBeVisible({ timeout: 10000 });
    await desktop.getByRole('button', { name: 'Turn off phone access' }).click();
    await expect(desktop.getByRole('button', { name: 'Create phone link' })).toBeVisible();
    assert.deepEqual(errors, []);
    console.log('PASS: real public HTTPS API, desktop pairing, no-key guard, phone question/answer, approved file write, verified result, usage, remembered registration after reload, phone Stop, revocation and tunnel shutdown. Inference mocked; current React served from Vite in source QA.');
  } finally { await browser?.close(); await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
