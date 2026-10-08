const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createPhoneServer } = require('../electron/phone-server.cjs');
const { TaskJournal } = require('../electron/task-journal.cjs');
const { FileTools } = require('../electron/file-tools.cjs');

async function phone(onControl, now) {
  const server = await createPhoneServer({ root: path.resolve('dist'), getState: () => ({}), onControl, now });
  const invite = server.pairing.offer(), claim = server.pairing.request(invite.token, 'Audit phone', 'audit_phone_nonce_123');
  server.pairing.decide(claim.id, true);
  const token = server.pairing.result(claim.ticket).token;
  const send = body => fetch(server.localOrigin + '/api/control', { method: 'POST', headers: { Origin: server.localOrigin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { server, send };
}

test('phone retries keep one operation during long work and after its completion', async () => {
  let time = 0, calls = 0, release, started;
  const begun = new Promise(resolve => { started = resolve; });
  const { server, send } = await phone(async () => { calls++; started(); await new Promise(resolve => { release = resolve; }); }, () => time);
  const command = { op: 'request', text: 'A long task', id: 'long_task_command_123' };
  try {
    const first = send(command); await begun;
    time = 31 * 60000;
    const retry = send(command);
    await new Promise(resolve => setTimeout(resolve, 40));
    // Release all waiters in a faulty implementation too, so a failure cannot hang the suite.
    const count = calls; release();
    if (count !== 1) { await server.close(); await Promise.allSettled([first, retry]); assert.equal(count, 1, 'A retry dispatched a second desktop operation'); }
    assert.equal((await first).status, 200); assert.equal((await retry).status, 200);
    time += 10 * 60000;
    assert.equal((await send(command)).status, 200); assert.equal(calls, 1);
  } finally { release?.(); await server.close(); }
});

test('Stop remains available when phone command receipt capacity is full', async () => {
  let stopped = 0, requested = 0;
  const { server, send } = await phone(async body => { if (body.op === 'stop') stopped++; else requested++; });
  try {
    for (let i = 0; i < 128; i++) assert.equal((await send({ op: 'request', text: 'Completed task', id: `completed_command_${i}` })).status, 200);
    assert.equal((await send({ op: 'stop', id: 'emergency_stop_123' })).status, 200);
    assert.equal(stopped, 1);
    assert.equal((await send({ op: 'stop', id: 'emergency_stop_123' })).status, 200); assert.equal(stopped, 1);
    assert.equal((await send({ op: 'request', text: 'Completed task', id: 'completed_command_0' })).status, 200);
    assert.equal(requested, 128, 'Stop must not discard duplicate protection for an earlier operation');
  } finally { await server.close(); }
});

test('invalid persisted task shapes are quarantined before rendering and never overwritten', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bebo-audit-history-'));
  const file = path.join(root, 'work-history.json');
  const source = JSON.stringify([{ id: 'broken', events: [null], plan: null, stats: { tokens: 'oops' } }]);
  await fs.writeFile(file, source);
  const journal = new TaskJournal(root);
  assert.deepEqual(journal.snapshot().tasks, []);
  assert.match(journal.warning, /preserved/);
  assert.throws(() => journal.clear(), /preserved/);
  assert.equal(await fs.readFile(file, 'utf8'), source);
});

test('text tools refuse invalid UTF-8 instead of silently corrupting an edit', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bebo-audit-encoding-'));
  const target = path.join(root, 'legacy.txt');
  await fs.writeFile(target, Buffer.from([0x63, 0x61, 0x66, 0xe9]));
  await assert.rejects(new FileTools(() => [root]).read(target), /UTF-8/);
});

test('an interrupted file write preserves the previous file and removes its temporary file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bebo-audit-write-'));
  const target = path.join(root, 'note.txt'), tools = new FileTools(() => [root]);
  await fs.writeFile(target, 'Original human content');
  const before = await tools.read(target), originalWrite = fs.writeFile;
  fs.writeFile = async (file, ...args) => {
    if (typeof file === 'string' && path.dirname(file) === root) {
      await originalWrite(file, 'Partial');
      throw Object.assign(Error('Simulated disk full'), { code: 'ENOSPC' });
    }
    return originalWrite(file, ...args);
  };
  try { await assert.rejects(tools.write({ path: target, content: 'Replacement', expected_sha256: before.sha256 }), /disk full/); }
  finally { fs.writeFile = originalWrite; }
  assert.equal(await fs.readFile(target, 'utf8'), 'Original human content');
  assert.deepEqual(await fs.readdir(root), ['note.txt']);
});

test('edits made while Bebo prepares a replacement win over the stale replacement', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bebo-audit-conflict-'));
  const target = path.join(root, 'note.txt'), tools = new FileTools(() => [root]);
  await fs.writeFile(target, 'Original'); const before = await tools.read(target), originalWrite = fs.writeFile;
  fs.writeFile = async (file, ...args) => {
    await originalWrite(file, ...args);
    if (typeof file === 'string' && path.basename(file).startsWith('.bebo-write-')) await originalWrite(target, 'Newer human edit');
  };
  try { await assert.rejects(tools.write({ path: target, content: 'Stale replacement', expected_sha256: before.sha256 }), /changed/); }
  finally { fs.writeFile = originalWrite; }
  assert.equal(await fs.readFile(target, 'utf8'), 'Newer human edit'); assert.deepEqual(await fs.readdir(root), ['note.txt']);
});

test('the task deadline cancels while waiting for a human, before any tool executes', async () => {
  const { AgentSession } = require('../electron/agent-session.cjs'); let deadline, cancelled = 0;
  const expired = new Promise(resolve => { deadline = resolve; });
  const session = new AgentSession({ prompt: 'Ask first', settings: { value: { roots: [], terminal: 'off', maxSteps: 5, maxMinutes: .001, maxCostUsd: 1 } }, runtime: { terminal: { cancel() { cancelled++; } }, execute() { throw Error('No execution allowed'); } }, onDeadline: deadline,
    request: async () => ({ usage: { input_tokens: 1, output_tokens: 1 }, output: [{ type: 'function_call', name: 'ask_user', call_id: 'deadline-test', arguments: JSON.stringify({ question: 'Which file?' }) }] }),
  });
  try {
    assert.equal((await session.next()).type, 'ask'); await expired;
    assert.equal(session.data.status, 'stopped'); assert.match(session.data.phase, /time limit/); assert.ok(cancelled);
    assert.throws(() => session.answer('The note'), /no longer waiting/);
  } finally { session.stop(); }
});
