const fs = require('node:fs');
const path = require('node:path');

// Windows safeStorage binds the registration secret to this Windows account.
class PhoneDeviceStore {
  constructor(directory, encryption) { this.file = path.join(directory, 'registered-phone.json'); this.encryption = encryption; }
  load() {
    if (!fs.existsSync(this.file)) return null;
    const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (saved.version !== 1 || typeof saved.secret !== 'string') throw new Error('Phone registration could not be read. Forget this phone and pair again.');
    const device = JSON.parse(this.encryption.decryptString(Buffer.from(saved.secret, 'base64')));
    if (typeof device.id !== 'string' || typeof device.name !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(device.token)) throw new Error('Phone registration is invalid.');
    return device;
  }
  save(device) {
    if (!device) { if (fs.existsSync(this.file)) fs.unlinkSync(this.file); return; }
    if (!this.encryption.isEncryptionAvailable()) throw new Error('Windows could not securely remember this phone. Try pairing again.');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const contents = JSON.stringify({ version: 1, secret: this.encryption.encryptString(JSON.stringify(device)).toString('base64') });
    fs.writeFileSync(this.file + '.tmp', contents, { mode: 0o600 }); fs.renameSync(this.file + '.tmp', this.file);
  }
  setAccessEnabled(enabled) { const saved = this.load(); if (saved) this.save({ ...saved, accessEnabled: enabled }); }
}
module.exports = { PhoneDeviceStore };
