const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { TerminalRunner } = require('../electron/terminal-runner.cjs');

test('real Windows shell preserves Unicode, streams output and reports failed commands', { skip: process.platform !== 'win32', timeout: 30000 }, async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'bebo-terminal-')), runner = new TerminalRunner(); const output = [];
  const result = await runner.run({ command: "Write-Output 'Bebo مرحبا'; Start-Sleep -Milliseconds 300; Write-Output 'done'", cwd, timeout_seconds: 10 }, undefined, value => output.push(value.stdout));
  assert.equal(result.exitCode, 0); assert.match(result.stdout, /Bebo مرحبا/); assert.match(result.stdout, /done/); assert.ok(output.length >= 1);
  const failed = await runner.run({ command: "throw 'fixture failure'", cwd, timeout_seconds: 10 });
  assert.notEqual(failed.exitCode, 0); assert.match(failed.stderr, /fixture failure/);
  const native = await runner.run({ command: 'cmd /c exit 7', cwd, timeout_seconds: 10 }); assert.equal(native.exitCode, 7);
  assert.ok(!result.stderr.includes('CLIXML'));
});

test('Stop and timeouts terminate the Windows job including a child before it writes', { skip: process.platform !== 'win32', timeout: 35000 }, async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'bebo-job-')), runner = new TerminalRunner();
  const marker = path.join(cwd, 'should-not-exist.txt');
  const encoded = Buffer.from(`Start-Sleep -Seconds 3; [IO.File]::WriteAllText('${marker.replace(/'/g, "''")}', 'bad')`, 'utf16le').toString('base64');
  const controller = new AbortController(); let started = false;
  const run = runner.run({ command: `Start-Process powershell.exe -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${encoded}'; Write-Output 'child-started'; Start-Sleep -Seconds 30`, cwd, timeout_seconds: 30 }, controller.signal, result => { if (!started && result.stdout.includes('child-started')) { started = true; controller.abort(); } });
  await assert.rejects(run, /stopped/i); assert.equal(started, true);
  await new Promise(resolve => setTimeout(resolve, 3500)); await assert.rejects(fs.stat(marker), /ENOENT/);
  const timeout = await runner.run({ command: 'Start-Sleep -Seconds 30', cwd, timeout_seconds: 1 }); assert.equal(timeout.timedOut, true);
});
