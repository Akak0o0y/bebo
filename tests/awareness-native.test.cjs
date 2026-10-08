const { test } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const { spawn } = require('node:child_process');
function inspect(request) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '../electron/windows.ps1')], { windowsHide: true });
    let out='', err=''; const timer=setTimeout(()=>{child.kill();reject(Error('Native observation timed out'));},20000);
    child.stdout.on('data', b=>out+=b);child.stderr.on('data', b=>err+=b);child.on('error',reject);
    child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error(err));try{resolve(JSON.parse(out.replace(/^\uFEFF/,'')));}catch(error){reject(error);}});
    child.stdin.end(JSON.stringify(request));
  });
}
test('Windows awareness returns bounded window and installed-app metadata without screenshots', {skip:process.platform!=='win32',timeout:45000}, async()=>{
  const windows=await inspect({op:'inspect'});assert.ok(Array.isArray(windows.windows));assert.ok(windows.windows.length<=80);assert.ok(windows.primary.width>0);assert.equal(windows.image,undefined);
  for(const win of windows.windows){assert.equal(typeof win.id,'string');assert.equal(typeof win.title,'string');}
  const apps=await inspect({op:'apps',query:'Notepad'});assert.ok(Array.isArray(apps.apps));assert.ok(apps.apps.length<=80);
  for(const app of apps.apps){assert.equal(typeof app.name,'string');assert.equal(typeof app.id,'string');}
});
