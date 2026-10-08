// Exercise the self-extracting launcher, not just win-unpacked/Bebo.exe.
// No model requests, microphone recording, or desktop actions are performed.
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function powershell(script) {
 return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, encoding: 'utf8' }).trim();
}
function deadline(promise, ms) {
 let timer;
 return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Portable launch timed out')), ms); })]).finally(() => clearTimeout(timer));
}
(async () => {
 const executable = path.resolve(process.argv[2]);
 const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bebo-portable-regression-'));
 const quotedProfile = profile.replaceAll("'", "''");
 const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
 const launch = () => spawn(executable, [`--user-data-dir=${profile}`], { env, windowsHide: true, stdio: 'ignore' });
 const mainProcesses = () => JSON.parse(powershell(`ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Bebo.exe' -and $_.CommandLine -and $_.CommandLine.Contains('${quotedProfile}') -and $_.CommandLine -notmatch ' --type=' } | Select-Object ProcessId,ExecutablePath)`));
 const first = launch(); const firstExit = once(first, 'exit');
 let second, original;
 try {
  const started = Date.now();
  while (Date.now() - started < 60000) {
   const current = mainProcesses();
   if (current.length === 1 && powershell(`(Get-Process -Id ${current[0].ProcessId}).MainWindowHandle`) !== '0') { original = current[0]; break; }
   if (first.exitCode !== null) throw Error('First portable launch exited early');
   await pause(500);
  }
  assert.ok(original, 'First portable dashboard must open');
  const bridge = path.join(path.dirname(original.ExecutablePath), 'resources/windows.ps1');
  const expected = fs.readFileSync(bridge);
  let bridgeDisappeared = false;
  const watch = setInterval(() => { if (!fs.existsSync(bridge)) bridgeDisappeared = true; }, 20);
  try {
   second = launch();
   assert.equal((await deadline(once(second, 'exit'), 60000))[0], 0);
  } finally { clearInterval(watch); }
  assert.equal(bridgeDisappeared, false, 'Second extraction must never remove the first bridge');
  assert.ok(fs.readFileSync(bridge).equals(expected), 'Bridge survives second launcher cleanup');
  const remaining = mainProcesses();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].ProcessId, original.ProcessId);
  console.log('PASS: two actual portable launches leave one original Bebo session; its Windows script survives extraction and cleanup.');
 } finally {
  for (const process of mainProcesses()) powershell(`Stop-Process -Id ${process.ProcessId} -Force -ErrorAction SilentlyContinue`);
  await deadline(firstExit, 15000);
  if (second && second.exitCode === null) second.kill();
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
