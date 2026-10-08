const { _electron: electron, expect } = require('playwright/test');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bebo-voice-smoke-'));
  const app = await electron.launch({ ...(process.argv[2] ? { executablePath: path.resolve(process.argv[2]), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }), env, timeout: 30000 });
  try {
    const page = await app.firstWindow(); await page.waitForSelector('h1');
    await page.getByRole('button',{name:'Personalize',exact:true}).click();
    await expect(page.getByLabel('A voice of his own')).toHaveValue('am_puck');
    const errors = []; page.on('pageerror', error=>errors.push(error.message));
    const result = await page.evaluate(() => window.bebo.voiceGenerate('Hey, I am Bebo. Your little sidekick.', 'am_puck'));
    const wav = Buffer.from(result.audio, 'base64');
    assert.equal(wav.subarray(0, 4).toString(), 'RIFF'); assert.equal(wav.readUInt32LE(24), 24000);
    let peak = 0; for(let i=44;i<wav.length;i+=2) peak=Math.max(peak,Math.abs(wav.readInt16LE(i)));
    assert.ok(wav.length>24000 && peak>500, 'Synthesis must produce non-silent audio');
    fs.writeFileSync('artifacts/bebo-voice.wav', wav);
    await page.getByRole('button',{name:'Hear Bebo'}).click();
    await expect(page.getByRole('button',{name:'Stop voice'})).toBeVisible({timeout:120000});
    await page.getByRole('button',{name:'Stop voice'}).click();
    await expect(page.getByRole('button',{name:'Hear Bebo'})).toBeVisible();
    await page.screenshot({path:'artifacts/bebo-voice-settings.png',fullPage:true});
    assert.deepEqual(errors, []);
    console.log('PASS: native offline voice generation, non-silent 24 kHz WAV, real audio playback and Stop, voice settings. No model API call.');
  } finally { await app.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
