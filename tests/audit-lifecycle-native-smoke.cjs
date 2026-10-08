// Actual dashboard controls, reload, expiring approvals/questions and recovery.
// All model decisions are fixtures; files are confined to a disposable folder.
const { _electron: electron, expect } = require('playwright/test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bebo-lifecycle-audit-'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(root, 'profile')}`], env });
  try {
    const page = await app.firstWindow(); await page.waitForSelector('h1');
    await page.evaluate(() => localStorage.setItem('bebo-sound', 'false')); await page.reload(); await page.waitForSelector('h1');
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(root => window.bebo.workConfigure({ roots: [root], autoFiles: false, terminal: 'off' }), root);
    await app.evaluate(({ app }, root) => {
      const require = process.getBuiltinModule('node:module').createRequire(app.getAppPath() + '/package.json');
      const { ApprovalGate, QuestionGate } = require(app.getAppPath() + '/electron/policy.cjs');
      for (const Gate of [ApprovalGate, QuestionGate]) {
        const consume = Gate.prototype.consume;
        Gate.prototype.consume = function (...args) { if (globalThis.expireNext && this.pending) { this.pending.expires = 0; globalThis.expireNext = false; } return consume.apply(this, args); };
      }
      globalThis.auditMode = 'write';
      globalThis.fetch = async (url) => {
        if (String(url).includes('/models/')) return new Response('{}');
        if (!String(url).endsWith('/responses')) throw Error('Unexpected network request');
        const name = globalThis.auditMode === 'ask' ? 'ask_user' : 'write_file';
        const args = name === 'ask_user' ? { question: 'Which test note should I use?' } : { path: root + '\\never-created.txt', content: 'Only write after approval.', expected_sha256: '', reason: 'Review the test note before saving' };
        return new Response(JSON.stringify({ model: 'gpt-6-luna', usage: { input_tokens: 10, output_tokens: 5 }, output: [{ type: 'function_call', call_id: 'audit-call', name, arguments: JSON.stringify(args) }] }));
      };
    }, root);
    await page.evaluate(() => window.bebo.connect('local-lifecycle-key-not-sent'));
    await page.getByRole('textbox', { name: 'Ask Bebo' }).fill('Create a test note.');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText('Review the test note before saving', { exact: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.locator('.task-panel')).toContainText('Review the test note before saving');
    await app.evaluate(() => { globalThis.expireNext = true; });
    const pending = await page.evaluate(() => window.bebo.taskState());
    await assert.rejects(page.evaluate(id => window.bebo.approve(id), pending.pending.id), /expired/);
    let state = await page.evaluate(() => window.bebo.taskState());
    assert.equal(state.busy, false); assert.equal(state.pending, null); assert.equal(state.hasError, true);
    assert.equal((await page.evaluate(() => window.bebo.workHistory())).tasks[0].status, 'error');
    assert.equal(fs.existsSync(path.join(root, 'never-created.txt')), false);
    await app.evaluate(() => { globalThis.auditMode = 'ask'; });
    const question = await page.evaluate(() => window.bebo.plan('Ask me which note.'));
    await app.evaluate(() => { globalThis.expireNext = true; });
    await assert.rejects(page.evaluate(id => window.bebo.answer(id, 'The test note'), question.id), /expired/);
    state = await page.evaluate(() => window.bebo.taskState()); assert.equal(state.pending, null); assert.equal(state.busy, false);
    // An expired task must release the app for the next independent request.
    const next = await page.evaluate(() => window.bebo.plan('Ask another question.')); assert.equal(next.action.type, 'ask');
    await page.evaluate(() => window.bebo.stop()); assert.deepEqual(errors, []);
    console.log('PASS: real dashboard submission, reload restores pending approval, expiry clears task state, no unapproved write, question expiry, subsequent request and Stop.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
