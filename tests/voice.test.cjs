const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateSpeech, VoiceService } = require('../electron/voice-service.cjs');

test('voice requests are bounded and cannot select paths or unsupported languages', async () => {
  assert.deepEqual(validateSpeech(' Hi Bebo! ', 'am_puck'), { text: 'Hi Bebo!', voice: 'am_puck' });
  for (const text of ['', ' '.repeat(20), 'x'.repeat(2001), null]) assert.throws(() => validateSpeech(text, 'am_puck'), /characters/);
  assert.throws(() => validateSpeech('Hello', '../../secret'), /available voices/);
  assert.throws(() => validateSpeech('مرحبا', 'am_puck'), /Arabic/);
  const voice = new VoiceService('unused');
  await assert.rejects(voice.generate('x'.repeat(2001)), /characters/);
  assert.equal(voice.worker, null);
});
