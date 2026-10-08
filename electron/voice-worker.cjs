const { parentPort, workerData } = require('node:worker_threads');
const { KokoroTTS } = require('kokoro-js');
const { env } = require('@huggingface/transformers');
// Synthesis is entirely local. Missing packaged assets must never trigger a download.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useFSCache = false;
env.localModelPath = '';
let model;
parentPort.on('message', async ({ id, text, voice }) => {
  try {
    model ||= await KokoroTTS.from_pretrained(workerData.modelRoot.replaceAll('\\', '/'), { dtype: 'q8', device: 'cpu' });
    // Keep every segment below the model's context limit; never silently truncate a reply.
    const parts = text.match(/[^.!?\n]+[.!?\n]*|[.!?\n]+/g) || [text];
    const chunks = parts.flatMap(part => {
      const result = []; let chunk = '';
      for (const word of part.match(/\S+\s*/g) || []) {
        if (chunk.length + word.length > 220) { if (chunk) result.push(chunk); chunk = ''; }
        for (let i = 0; i < word.length; i += 220) {
          const piece = word.slice(i, i + 220);
          if (chunk.length + piece.length > 220) { result.push(chunk); chunk = ''; }
          chunk += piece;
        }
      }
      if (chunk.trim()) result.push(chunk);
      return result;
    });
    const samples = [];
    for (const chunk of chunks) {
      const audio = await model.generate(chunk, { voice, speed: 1 });
      samples.push(audio.audio, new Float32Array(1200));
    }
    const length = samples.reduce((sum, array) => sum + array.length, 0);
    const wav = Buffer.alloc(44 + length * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(length * 2, 40);
    let offset = 44;
    for (const array of samples) for (const sample of array) { wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), offset); offset += 2; }
    parentPort.postMessage({ id, audio: wav });
  } catch (error) { parentPort.postMessage({ id, error: `Local voice could not generate audio: ${error.message}` }); }
});
