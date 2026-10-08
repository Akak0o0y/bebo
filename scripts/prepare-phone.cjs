// Reproducible, pinned Windows tunnel helper. Never installs a service or starts a tunnel.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const version = '2026.2.0';
const sha256 = 'b3279f2186a1c3c438ad5865e802bbbec26090c5d3fdb4ac1113f1143a94837a';
const url = `https://github.com/cloudflare/cloudflared/releases/download/${version}/cloudflared-windows-amd64.exe`;
const destination = path.join(__dirname, '../build/cloudflared.exe');
const digest = buffer => createHash('sha256').update(buffer).digest('hex');

(async () => {
  let existing;
  try { existing = await fs.readFile(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing && digest(existing) === sha256) {
    console.log(`Verified cloudflared ${version}.`); return;
  }
  console.log(`Downloading cloudflared ${version} from its official release…`);
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Download returned HTTP ${response.status}.`);
  const binary = Buffer.from(await response.arrayBuffer());
  if (digest(binary) !== sha256) throw new Error('Cloudflared checksum mismatch; the downloaded file was not installed.');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = path.join(path.dirname(destination), `cloudflared-${randomUUID()}.tmp`);
  try { await fs.writeFile(temporary, binary); await fs.rename(temporary, destination); }
  finally { await fs.rm(temporary, { force: true }); }
  console.log(`Verified and prepared cloudflared ${version}.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
