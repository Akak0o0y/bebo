const { Worker } = require('node:worker_threads');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const voices = Object.freeze([
  { id: 'am_puck', name: 'Puck', detail: 'American · male' },
  { id: 'af_heart', name: 'Heart', detail: 'American · female' },
  { id: 'bm_george', name: 'George', detail: 'British · male' },
]);
function validateSpeech(text, voice) {
  if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw new Error('Voice replies must contain 1–2,000 characters.');
  if (!voices.some(option => option.id === voice)) throw new Error('Choose one of Bebo’s available voices.');
  if (/\p{Script=Arabic}/u.test(text)) throw new Error('These local voices speak English. Choose a device voice for Arabic.');
  return { text: text.trim(), voice };
}
class VoiceService {
  constructor(modelRoot) { this.modelRoot = modelRoot; this.worker = null; this.pending = null; }
  generate(text, voice = 'am_puck') {
    let input; try { input = validateSpeech(text, voice); } catch (error) { return Promise.reject(error); }
    if (this.pending) return Promise.reject(new Error('Bebo’s voice is busy. Try again in a moment.'));
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        this.worker = new Worker(path.join(__dirname, 'voice-worker.cjs'), { workerData: { modelRoot: this.modelRoot } });
        const worker = this.worker;
        worker.on('message', result => {
          if (this.worker !== worker || result.id !== this.pending?.id) return;
          const pending = this.pending; this.pending = null; clearTimeout(pending.timer);
          result.error ? pending.reject(new Error(result.error)) : pending.resolve(Buffer.from(result.audio));
        });
        worker.on('error', error => { if (this.worker === worker) this.cancel(`Bebo’s voice stopped: ${error.message}`, true); });
        worker.on('exit', () => { if (this.worker === worker) this.cancel('Bebo’s voice stopped. Try again.', true); });
      }
      const id = randomUUID();
      this.pending = { id, resolve, reject, timer: setTimeout(() => this.cancel('Voice generation took too long. Try a shorter reply.'), 120000) };
      this.worker.postMessage({ id, ...input });
    });
  }
  cancel(message = 'Voice stopped.', force = false) {
    if (!this.pending && !force) return; // Keep the loaded model warm between replies.
    const worker = this.worker; this.worker = null;
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new Error(message)); this.pending = null; }
    void worker?.terminate();
  }
  close() { this.cancel('Voice stopped.', true); }
}
module.exports = { VoiceService, voices, validateSpeech };
