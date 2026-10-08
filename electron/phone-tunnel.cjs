const { spawn } = require('node:child_process');

function startPhoneTunnel(binary, origin, { onExit = () => {}, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['tunnel', '--no-autoupdate', '--url', origin, '--protocol', 'http2', '--loglevel', 'info'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let settled = false, buffer = '';
    const timeout = setTimeout(() => { child.kill(); finish(new Error('The secure link took too long to connect. Check your internet connection and try again.')); }, 45000);
    const abort = () => { child.kill(); finish(new Error('Phone connection cancelled.')); };
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    function finish(error, url) {
      if (settled) return; settled = true; clearTimeout(timeout);
      error ? reject(error) : resolve({ url, stop: () => child.kill() });
    }
    function read(data) {
      buffer = (buffer + data.toString()).slice(-12000);
      const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/);
      if (match && /Registered tunnel connection/i.test(buffer)) finish(null, match[0]);
    }
    child.stdout.on('data', read); child.stderr.on('data', read);
    child.once('error', () => finish(new Error('The secure-link helper could not start. Reinstall the latest Bebo build.')));
    child.once('exit', () => { signal?.removeEventListener('abort', abort); finish(new Error('The secure connection ended before it was ready.')); onExit(); });
  });
}
module.exports = { startPhoneTunnel };
