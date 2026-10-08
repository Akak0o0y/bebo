const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.join(__dirname, '../build/voice');
const revision = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';
const files = {
  'config.json': ['git', '790faf216e7e3f490e71e8bc80df79ed8941101c'],
  'tokenizer.json': ['git', '4280f55fc1c32211bc9bb4d55545759a00054ecd'],
  'tokenizer_config.json': ['git', '5c81e9a3a06db9139900d6ee5b60e8bb701ccb0b'],
  'onnx/model_quantized.onnx': ['sha256', 'fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478'],
  'voices/am_puck.bin': ['sha256', 'fcf73c989033e9233e0b98713eca600c8c74dcc1614b37009d5450ff4a2274a0'],
  'voices/af_heart.bin': ['sha256', 'd583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b'],
  'voices/bm_george.bin': ['sha256', 'c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc'],
};
function checksum(data, kind) {
  const hash = createHash(kind === 'git' ? 'sha1' : kind);
  if (kind === 'git') hash.update(`blob ${data.length}\0`);
  return hash.update(data).digest('hex');
}
async function download(url, size) {
  if (!size) {
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Voice download failed: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  // Independent ranged transfers avoid one slow CDN connection stalling the build.
  const output = Buffer.alloc(size), chunkSize = 4 * 1024 * 1024;
  let next = 0, completed = 0;
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (next < size) {
      const start = next; next += chunkSize; const end = Math.min(size - 1, start + chunkSize - 1);
      let bytes;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(180000) });
          if (response.status !== 206 || response.headers.get('content-range') !== `bytes ${start}-${end}/${size}`) throw new Error('Unexpected voice download range.');
          bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length !== end - start + 1) throw new Error('Incomplete voice download range.');
          break;
        } catch (error) { if (attempt === 2) throw error; }
      }
      bytes.copy(output, start); completed += bytes.length;
      console.log(`Voice model: ${Math.round(completed / size * 100)}%`);
    }
  }));
  return output;
}
(async () => {
  for (const [name, [kind, expected]] of Object.entries(files)) {
    const destination = path.join(root, name);
    let bytes;
    try { bytes = await fs.readFile(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (bytes && checksum(bytes, kind) === expected) continue;
    console.log(`Downloading Kokoro: ${name}`);
    bytes = await download(`https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/${revision}/${name}?download=true`, name.endsWith('.onnx') ? 92361116 : undefined);
    if (checksum(bytes, kind) !== expected) throw new Error(`Voice checksum mismatch: ${name}`);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(`${destination}.tmp`, bytes);
    await fs.rename(`${destination}.tmp`, destination);
  }
  console.log('Verified offline Kokoro model and three voices. No voice API key required.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
