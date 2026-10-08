const fs = require('node:fs');
const path = require('node:path');

class CredentialStore {
  constructor(directory, encryption) { this.file = path.join(directory, 'luna-credential.json'); this.encryption = encryption; }
  available() {
    return this.encryption.isEncryptionAvailable() && (process.platform !== 'linux' || this.encryption.getSelectedStorageBackend?.() !== 'basic_text');
  }
  load() {
    if (!fs.existsSync(this.file)) return '';
    try {
      if (!this.available()) throw Error('Encryption unavailable');
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data.version !== 1 || typeof data.encrypted !== 'string' || data.encrypted.length > 16000) throw Error('Invalid credential');
      const key = this.encryption.decryptString(Buffer.from(data.encrypted, 'base64'));
      if (typeof key !== 'string' || key.length < 15 || key.length > 500) throw Error('Invalid key');
      return key;
    } catch { throw Error('The saved Luna key could not be unlocked. Enter it again in Connect. Your other settings are intact.'); }
  }
  save(key) {
    if (!this.available()) throw Error('Windows secure storage is unavailable. The key was not saved; try connecting again.');
    try {
      const encrypted = this.encryption.encryptString(key).toString('base64');
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file + '.tmp', JSON.stringify({ version: 1, encrypted }), { mode: 0o600 });
      fs.renameSync(this.file + '.tmp', this.file);
    } catch { throw Error('Could not securely save the Luna key. Your previous connection was kept.'); }
  }
  forget() {
    // Only remove this credential; never clear the profile, phone, or usage.
    for (const file of [this.file, this.file + '.tmp']) fs.rmSync(file, { force: true });
  }
}

class LunaConnection {
  constructor({ store, validate, onChange = () => {} }) {
    Object.assign(this, { store, validate, onChange });
    this.key = ''; this.saved = false; this.error = ''; this.epoch = 0; this.pending = null;
    try { this.key = store.load(); this.saved = !!this.key; } catch (error) { this.error = error.message; }
  }
  status() { return { connected: !!this.key, saved: this.saved, error: this.error, checking: !!this.pending }; }
  async connect(value) {
    if (typeof value !== 'string' || value.trim().length < 15 || value.length > 500) throw Error('Enter a valid OpenAI API key.');
    if (this.pending) throw Error('A connection check is already running.');
    const candidate = value.trim(), epoch = ++this.epoch, abort = new AbortController(); this.pending = abort;
    try {
      await this.validate(candidate, AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]));
      if (epoch !== this.epoch) throw Error('Connection check cancelled.');
      this.store.save(candidate); this.key = candidate; this.saved = true; this.error = '';
      return { ...this.status(), checking: false };
    } finally { if (epoch === this.epoch) { this.pending = null; this.onChange(this.status()); } }
  }
  forget() { this.store.forget(); this.clearMemory(); this.saved = false; this.error = ''; this.onChange(this.status()); return this.status(); }
  clearMemory() { this.epoch++; this.pending?.abort(); this.pending = null; this.key = ''; }
}
module.exports = { CredentialStore, LunaConnection };
