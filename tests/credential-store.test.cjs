const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { CredentialStore, LunaConnection } = require('../electron/credential-store.cjs');
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bebo-key-')), cipherKey = crypto.randomBytes(32);
  const encryption = { isEncryptionAvailable: () => true,
    encryptString: value => { const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', cipherKey, iv); const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), body]); },
    decryptString: data => { const cipher = crypto.createDecipheriv('aes-256-gcm', cipherKey, data.subarray(0, 12)); cipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString(); }
  };
  return { root, encryption, store: new CredentialStore(root, encryption) };
}
test('credentials persist only as ciphertext; restore, replace, forget and corruption preserve unrelated settings', async () => {
  const { root, store } = fixture(), key = 'fixture-secret-never-transmitted';
  const manager = new LunaConnection({ store, validate: async () => {} }); await manager.connect(key);
  assert.equal(store.load(), key); assert.equal(fs.readFileSync(store.file, 'utf8').includes(key), false);
  assert.equal(JSON.stringify(manager.status()).includes(key), false);
  assert.equal(new LunaConnection({ store, validate: async () => {} }).status().saved, true);
  fs.writeFileSync(path.join(root, 'other-settings.json'), 'preserved');
  const failed = new LunaConnection({ store, validate: async () => { throw Error('Invalid key'); } });
  await assert.rejects(failed.connect('fixture-rejected-key'), /Invalid/); assert.equal(failed.key, key); assert.equal(store.load(), key);
  fs.writeFileSync(store.file, '{corrupt'); assert.match(new LunaConnection({ store }).status().error, /could not be unlocked/);
  assert.equal(fs.readFileSync(store.file, 'utf8'), '{corrupt');
  manager.forget(); assert.equal(store.load(), ''); assert.equal(manager.status().connected, false); assert.equal(fs.readFileSync(path.join(root, 'other-settings.json'), 'utf8'), 'preserved');
});
test('unavailable encryption and stale connection checks never write plaintext or resurrect a forgotten key', async () => {
  const { store, encryption } = fixture(); encryption.isEncryptionAvailable = () => false;
  assert.throws(() => store.save('fixture-secret-key'), /secure storage/); assert.equal(fs.existsSync(store.file), false);
  encryption.isEncryptionAvailable = () => true;
  let finish; const manager = new LunaConnection({ store, validate: () => new Promise(resolve => { finish = resolve; }) });
  const pending = manager.connect('fixture-pending-secret'); await assert.rejects(manager.connect('fixture-second-secret'), /already/);
  manager.forget(); finish(); await assert.rejects(pending, /cancelled/); assert.equal(store.load(), ''); assert.equal(manager.key, '');
});
