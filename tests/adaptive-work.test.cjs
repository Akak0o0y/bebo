const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { WorkSettings } = require('../electron/work-settings.cjs');
const { FileTools } = require('../electron/file-tools.cjs');
const { validateTool } = require('../electron/tool-contract.cjs');
const { ToolRuntime } = require('../electron/tool-runtime.cjs');
const { AgentSession } = require('../electron/agent-session.cjs');
const { TaskJournal } = require('../electron/task-journal.cjs');
const { redact } = require('../electron/terminal-runner.cjs');

const temporary = () => fs.mkdtemp(path.join(os.tmpdir(), 'bebo-adaptive-'));
const call = (name, args) => ({ model: 'gpt-6-luna', usage: { input_tokens: 100, output_tokens: 20 }, output: [{ type: 'function_call', call_id: Math.random().toString(36), name, arguments: JSON.stringify(args) }] });
function fixture(request, execute = async () => ({ status: 'success', summary: 'Observed.', verifies: true, data: { exists: true }, artifacts: [], next_actions: [] })) {
  return new AgentSession({ prompt: 'Inspect the requested file.', settings: { value: { maxSteps: 15, maxMinutes: 1, maxCostUsd: .5, terminal: 'ask', roots: [] } }, request, runtime: { execute, terminal: { cancel() {} } } });
}

test('file tools bound traversal, block secrets/escapes, reject stale updates, and read back writes', async () => {
  const root = await temporary(), outside = await temporary(), tools = new FileTools(() => [root]);
  const file = path.join(root, 'note.txt');
  await tools.write({ path: file, content: 'first', expected_sha256: '' });
  const before = await tools.read(file); assert.equal(before.content, 'first');
  await fs.writeFile(file, 'human edit');
  await assert.rejects(tools.write({ path: file, content: 'lost edit', expected_sha256: before.sha256 }), /changed/);
  assert.equal(await fs.readFile(file, 'utf8'), 'human edit');
  const fresh = await tools.read(file); assert.equal((await tools.write({ path: file, content: 'agreed edit', expected_sha256: fresh.sha256 })).verified, true);
  const long = path.join(root, 'long.txt'); await fs.writeFile(long, 'a'.repeat(15000));
  const excerpt = await tools.read(long); assert.equal(excerpt.truncated, true);
  await assert.rejects(tools.write({ path: long, content: 'partial edit', expected_sha256: excerpt.sha256 }), /too long/);
  await assert.rejects(tools.write({ path: file, content: 'overwrite', expected_sha256: '' }), /exist/i);
  await fs.writeFile(path.join(root, '.env'), 'private');
  await fs.writeFile(path.join(root, 'luna-credential.json'), 'private');
  await assert.rejects(tools.read(path.join(root, 'luna-credential.json')), /Secret/);
  await fs.symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.writeFile(path.join(outside, 'outside.txt'), 'outside');
  await assert.rejects(tools.read(path.join(root, 'escape', 'outside.txt')), /outside|redirect/);
  await assert.rejects(tools.read(path.join(root, '.env')), /Secret/);
  await assert.rejects(tools.read(path.join(root, '..', path.basename(outside), 'outside.txt')), /outside/);
  const results = await tools.list({ path: root, query: '', depth: 4, sort: 'newest' });
  assert.deepEqual(results.entries.map(x => x.name).sort(), ['long.txt', 'note.txt']); assert.ok(results.skipped >= 2);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(tools.write({ path: path.join(root, 'cancelled.txt'), content: 'no', expected_sha256: '' }, abort.signal));
  assert.equal((await tools.info(path.join(root, 'cancelled.txt'))).exists, false);
});

test('tool schemas and work permissions reject extra arguments and persist separate grants', async () => {
  const root = await temporary(), settings = new WorkSettings(root, [root]);
  assert.equal(settings.allows('run_powershell'), false); assert.equal(settings.allows('read_file'), true); assert.equal(settings.allows('write_file'), false);
  settings.update({ terminal: 'auto', autoFiles: true, mode: 'adaptive' });
  assert.equal(new WorkSettings(root).allows('run_powershell'), true);
  assert.throws(() => settings.update({ maxSteps: 1000 }), /limit/);
  assert.throws(() => validateTool('run_powershell', { command: 'hi', cwd: root, reason: 'test', timeout_seconds: 2, administrator: true }), /fields/);
  assert.throws(() => validateTool('run_powershell', { command: 'hi', cwd: root, reason: 'test', timeout_seconds: 200 }), /timeout/);
  assert.equal(redact('sk-test1234567890 password=oops', []), '[redacted] password=[redacted]');
});

test('screenshots cannot be reused or consumed after expiry; terminal off is enforced at runtime', async () => {
  let time = 0, actions = 0;
  const root = await temporary(), settings = new WorkSettings(root, [root]); settings.update({ terminal: 'off' });
  const runtime = new ToolRuntime({ settings, now: () => time, native: async () => ({}), capture: async () => ({ image: 'image', hwnd: '1', width: 100, height: 100 }), desktopAction: async () => { actions++; }, terminal: { run: () => { throw Error('Must not execute'); } }, shell: {} });
  const result = await runtime.execute('observe_screen', { reason: 'Inspect' });
  const args = { observation_id: result.data.observation_id, action: 'click', x: 1, y: 1, text: '', reason: 'Click observed button' };
  time = 60001; await assert.rejects(runtime.execute('desktop_action', args), /stale/); assert.equal(actions, 0);
  const fresh = await runtime.execute('observe_screen', { reason: 'Refresh' }); args.observation_id = fresh.data.observation_id;
  await runtime.execute('desktop_action', args); assert.equal(actions, 1); await assert.rejects(runtime.execute('desktop_action', args), /stale/);
  await assert.rejects(runtime.execute('run_powershell', { command: 'whoami', cwd: root, timeout_seconds: 1, reason: 'Check' }), /disabled/);
});

test('window closing rejects protected, unknown, stale and reused targets and requires later verification', async () => {
  let time = 0, closed = 0;
  const root = await temporary(), settings = new WorkSettings(root, [root]);
  const runtime = new ToolRuntime({ settings, now: () => time, native: async request => request.op === 'inspect' ? { windows: [{ id: '1', title: 'A note', app: 'editor', pid: 55, closable: true }, { id: '2', title: 'Cancel Bebo', pid: 56, closable: false, protectedReason: 'Bebo owns this window.' }] } : (closed++, { requested: request.windows, skipped: [], remaining: [] }) });
  await assert.rejects(runtime.execute('close_windows', { window_ids: ['1'], reason: 'Close note' }), /stale/);
  await runtime.execute('inspect_computer', { reason: 'Inspect' });
  assert.match(runtime.describe('close_windows', { window_ids: ['1'] }), /A note/);
  await assert.rejects(runtime.execute('close_windows', { window_ids: ['2'], reason: 'Close' }), /protected/);
  await assert.rejects(runtime.execute('close_windows', { window_ids: ['99'], reason: 'Close' }), /not been observed/);
  time = 60001; await assert.rejects(runtime.execute('close_windows', { window_ids: ['1'], reason: 'Close' }), /stale/);
  await runtime.execute('inspect_computer', { reason: 'Refresh' });
  assert.equal((await runtime.execute('close_windows', { window_ids: ['1'], reason: 'Close note' })).verifies, false);
  await assert.rejects(runtime.execute('close_windows', { window_ids: ['1'], reason: 'Close again' }), /stale/);
  assert.equal(closed, 1); assert.equal(settings.allows('close_windows'), false);
});

test('adaptive tasks keep actual evidence, recover from invented completion, and account for every response', async () => {
  let n = 0, session;
  session = fixture(async body => {
    assert.equal(body.model, 'gpt-6-luna'); assert.equal(body.store, false); assert.equal(body.parallel_tool_calls, false);
    if (++n === 1) return call('finish', { outcome: 'done', summary: 'Invented', evidence_ids: ['fake'] });
    if (n === 2) return call('file_info', { path: 'C:\\fixture\\note.txt', reason: 'Check the file' });
    const id = [...session.records.values()].find(r => r.tool === 'file_info').id;
    assert.ok(body.input.some(item => item.type === 'function_call_output'));
    return call('finish', { outcome: 'done', summary: 'The file exists.', evidence_ids: [id] });
  });
  try {
    assert.equal((await session.next()).type, 'tool'); await session.execute(); assert.equal((await session.next()).type, 'done');
    assert.equal(session.data.stats.requests, 3); assert.equal(session.data.stats.tokens, 360); assert.equal(session.data.stats.retries, 1);
    assert.equal(session.data.events[0].status, 'error'); assert.ok(session.data.stats.estimatedUsd > 0);
  } finally { session.stop(); }
});

test('launches require a later visual observation and human answers continue the same task', async () => {
  let n = 0, session;
  session = fixture(async () => {
    n++;
    if (n === 1) return call('ask_user', { question: 'Which document?' });
    if (n === 2) return call('open_path', { path: 'C:\\fixture\\note.txt', reason: 'Open chosen note' });
    if (n === 3) return call('finish', { outcome: 'done', summary: 'Opened.', evidence_ids: [session.data.events.at(-1).id] });
    if (n === 4) return call('inspect_computer', { reason: 'Verify the opened window' });
    return call('finish', { outcome: 'done', summary: 'Verified window.', evidence_ids: [session.data.events.at(-1).id] });
  }, async name => ({ status: 'success', summary: 'Observed.', verifies: name === 'inspect_computer', next_actions: [], artifacts: [] }));
  try {
    assert.equal((await session.next()).type, 'ask'); session.answer('The note'); assert.equal((await session.next()).type, 'tool');
    await session.execute(); assert.equal((await session.next()).type, 'tool'); assert.equal(session.pending.name, 'inspect_computer'); await session.execute();
    assert.equal((await session.next()).type, 'done'); assert.equal(session.answers[0], 'The note');
  } finally { session.stop(); }
});

test('repeated failures and task budgets stop before another tool; late cancelled results cannot finish', async () => {
  let calls = 0;
  const repeat = fixture(async () => { calls++; return call('file_info', { path: 'C:\\missing', reason: `Attempt ${calls}` }); }, async () => { throw Error('Missing'); });
  try { await repeat.next(); await repeat.execute(); await repeat.next(); await repeat.execute(); await assert.rejects(repeat.next(), /repeated/); assert.equal(calls, 3); } finally { repeat.stop(); }
  const budget = fixture(async () => ({ ...call('inspect_computer', { reason: 'Check' }), usage: { input_tokens: 10000000, output_tokens: 2000000 } }));
  try { await assert.rejects(budget.next(), /budget/); assert.equal(budget.pending, null); } finally { budget.stop(); }
  let release;
  const cancelled = fixture(() => new Promise(resolve => { release = resolve; }));
  const late = cancelled.next(); cancelled.stop(); release(call('inspect_computer', { reason: 'Late' })); await assert.rejects(late, /stopped/i); assert.equal(cancelled.data.status, 'stopped');
});

test('task journals retain summaries across restart without raw terminal output or commands', async () => {
  const root = await temporary(), journal = new TaskJournal(root);
  const session = fixture(async () => {}), task = session.snapshot(); session.stop();
  task.events = [{ id: 'event', tool: 'run_powershell', label: 'Inspect', at: task.startedAt, status: 'success', durationMs: 10, artifacts: [], summary: 'Command exited.', details: 'private-command', output: 'private-output' }];
  journal.save(task);
  const disk = await fs.readFile(path.join(root, 'work-history.json'), 'utf8'); assert.ok(!disk.includes('private-'));
  const restored = new TaskJournal(root); assert.equal(restored.snapshot().tasks[0].status, 'interrupted'); restored.clear(); assert.equal(restored.snapshot().tasks.length, 0);
});
