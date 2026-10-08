const { spawn } = require('node:child_process');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
function redact(text, secrets = []) {
  let value = String(text);
  for (const secret of secrets) if (secret && secret.length >= 8) value = value.split(secret).join('[redacted]');
  return value.replace(/\bsk-[A-Za-z0-9_-]{12,}/g, '[redacted]').replace(/((?:api[_-]?key|password|access[_-]?token|authorization)\s*[=:]\s*)([^\s,;]+)/gi, '$1[redacted]');
}
class TerminalRunner {
  constructor(script = path.join(__dirname, 'terminal.ps1'), secrets = () => []) { this.script = script; this.secrets = secrets; this.job = null; }
  run(args, signal, onOutput = () => {}) {
    if (process.platform !== 'win32') throw Error('PowerShell execution requires Windows.');
    if (this.job) throw Error('A terminal command is already running.');
    if (signal?.aborted) throw Error('Task stopped.');
    return new Promise((resolve, reject) => {
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTHORIZATION)/i.test(key)));
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.script], { windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'] });
      const job = { child, cancelled: false }; this.job = job;
      let stdout = '', stderr = '', truncated = false, timedOut = false, finished = false, notifyTimer;
      const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
      const clean = value => redact(value, this.secrets());
      const notify = () => { notifyTimer = null; try { onOutput({ stdout: clean(stdout), stderr: clean(stderr), truncated }); } catch {} };
      const append = (kind, chunk) => {
        if (kind === 'stdout') { stdout += chunk; if (stdout.length > 24000) { stdout = stdout.slice(-24000); truncated = true; } }
        else { stderr += chunk; if (stderr.length > 8000) { stderr = stderr.slice(-8000); truncated = true; } }
        if (!notifyTimer) notifyTimer = setTimeout(notify, 150);
      };
      const abort = () => { job.cancelled = true; child.kill(); };
      signal?.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(() => { timedOut = true; child.kill(); }, args.timeout_seconds * 1000 + 5000);
      const finish = (error, exitCode) => {
        if (finished) return; finished = true; clearTimeout(timeout); clearTimeout(notifyTimer);
        signal?.removeEventListener('abort', abort); if (this.job === job) this.job = null;
        stdout += decoders.stdout.end(); stderr += decoders.stderr.end(); notify();
        if (job.cancelled || signal?.aborted) reject(Error('Task stopped.'));
        else if (error) reject(error);
        else resolve({ stdout: clean(stdout), stderr: clean(stderr), exitCode, timedOut, truncated });
      };
      child.stdout.on('data', data => append('stdout', decoders.stdout.write(data)));
      child.stderr.on('data', data => append('stderr', decoders.stderr.write(data)));
      child.on('error', error => finish(error)); child.on('close', code => finish(null, code));
      child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify(args));
    });
  }
  cancel() { if (this.job) { this.job.cancelled = true; this.job.child.kill(); } }
}
module.exports = { TerminalRunner, redact };
