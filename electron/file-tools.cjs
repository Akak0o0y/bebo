const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const hash = data => createHash('sha256').update(data).digest('hex');
const inside = (root, target) => { const rel = path.relative(root, target); return !rel || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
function protectedPath(target) {
  if (/(?:^|[\\/])(?:luna-credential|registered-phone)\.json(?:\.tmp)?$/i.test(target)) return true;
  return target.split(/[\\/]/).some(part => /^(\.env(?:\..*)?|\.ssh|\.aws|\.azure|\.gnupg|\.codex|\.git|node_modules|credentials(?:\..*)?|secrets?(?:\..*)?|login data|cookies|web data)$/i.test(part) || /\.(pem|key|pfx|p12|kdbx)$/i.test(part));
}
class FileTools {
  constructor(getRoots) { this.getRoots = getRoots; }
  async resolve(target, allowMissing = false) {
    if (typeof target !== 'string' || !path.isAbsolute(target) || target.includes('\0') || protectedPath(target) || (process.platform === 'win32' && (target.startsWith('\\\\') || target.slice(2).includes(':')))) throw Error('Use an ordinary absolute path in an allowed folder. Secret, network and device paths are excluded.');
    target = path.resolve(target);
    const roots = (await Promise.all(this.getRoots().map(root => fs.realpath(root).catch(() => null)))).filter(Boolean);
    if (!roots.some(root => inside(root, target))) throw Error('This path is outside Bebo’s allowed folders. Add its folder in Settings, or choose an allowed location.');
    let real;
    try { real = await fs.realpath(target); }
    catch (error) { if (!allowMissing || error.code !== 'ENOENT') throw error; real = path.join(await fs.realpath(path.dirname(target)), path.basename(target)); }
    if (!roots.some(root => inside(root, real)) || protectedPath(real)) throw Error('This path redirects outside the allowed folders or into a protected location.');
    return real;
  }
  async info(target) {
    const real = await this.resolve(target, true);
    try { const s = await fs.stat(real); return { path: real, exists: true, kind: s.isDirectory() ? 'folder' : 'file', size: s.size, modified: s.mtime.toISOString() }; }
    catch (error) { if (error.code === 'ENOENT') return { path: real, exists: false }; throw error; }
  }
  async list(args, signal) {
    const root = await this.resolve(args.path); const pending = [[root, 0]], matches = [];
    let visited = 0, skipped = 0, truncated = false;
    while (pending.length && visited < 5000) {
      signal?.throwIfAborted(); const [folder, depth] = pending.shift();
      let dir;
      try { dir = await fs.opendir(folder); } catch { skipped++; continue; }
      for await (const item of dir) {
        signal?.throwIfAborted(); if (++visited > 5000) { truncated = true; break; }
        const target = path.join(folder, item.name);
        if (item.isSymbolicLink() || protectedPath(target)) { skipped++; continue; }
        let s; try { const real = await this.resolve(target); s = await fs.stat(real); } catch { skipped++; continue; }
        if (item.name.toLowerCase().includes(args.query.toLowerCase())) matches.push({ path: target, name: item.name, kind: s.isDirectory() ? 'folder' : 'file', size: s.size, modified: s.mtime.toISOString() });
        if (s.isDirectory() && depth < args.depth) pending.push([target, depth + 1]);
      }
    }
    matches.sort(args.sort === 'newest' ? (a, b) => b.modified.localeCompare(a.modified) : args.sort === 'largest' ? (a, b) => b.size - a.size : (a, b) => a.path.localeCompare(b.path));
    return { entries: matches.slice(0, 40), matched: matches.length, visited, skipped, truncated: truncated || pending.length > 0 || matches.length > 40 };
  }
  async read(target) {
    const real = await this.resolve(target), stat = await fs.stat(real);
    if (!stat.isFile() || stat.size > 1024 * 1024) throw Error('Choose a text file smaller than 1 MB. Use terminal tools for larger or binary files.');
    const data = await fs.readFile(real);
    if (data.includes(0)) throw Error('This appears to be a binary file. Use its application or a suitable terminal tool.');
    let content;
    try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data); }
    catch { throw Error('This file is not valid UTF-8. Use its application or an encoding-aware terminal tool to preserve the original text.'); }
    return { path: real, sha256: hash(data), content: content.slice(0, 14000), truncated: content.length > 14000 };
  }
  async write(args, signal) {
    const real = await this.resolve(args.path, true);
    signal?.throwIfAborted();
    if (args.expected_sha256) {
      if (!/^[a-f0-9]{64}$/.test(args.expected_sha256)) throw Error('Read the existing file first to obtain its SHA-256.');
      const before = await this.read(real);
      if (before.sha256 !== args.expected_sha256) throw Error('The file changed since it was read. Read it again before updating.');
      if (before.truncated) throw Error('This file is too long for a complete text-tool edit. Use a targeted terminal edit after inspecting the relevant content.');
    }
    const expected = hash(Buffer.from(args.content));
    const temporary = path.join(path.dirname(real), `.bebo-write-${randomUUID()}.tmp`);
    try {
      // Prepare the complete replacement without truncating the owner's file.
      await fs.writeFile(temporary, args.content, { encoding: 'utf8', flag: 'wx' });
      const handle = await fs.open(temporary, 'r+');
      try { await handle.sync(); } finally { await handle.close(); }
      if (hash(await fs.readFile(temporary)) !== expected) throw Error('Temporary write verification failed. The original file was preserved.');
      if (args.expected_sha256 && hash(await fs.readFile(real)) !== args.expected_sha256) throw Error('The file changed while preparing this edit. Read it again before updating.');
      signal?.throwIfAborted();
      if (args.expected_sha256) await fs.rename(temporary, real);
      // An atomic exclusive link publishes a new file without overwriting a
      // file another application created while Bebo was preparing the content.
      else await fs.link(temporary, real);
    } finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    const actual = hash(await fs.readFile(real));
    if (expected !== actual) throw Error('The file changed during verification. Inspect it before retrying.');
    return { path: real, sha256: actual, bytes: Buffer.byteLength(args.content), verified: true };
  }
}
module.exports = { FileTools, inside, protectedPath };
