// Isolated Windows profile. Tests encryption, persistence and cancellation;
// it never sends recognized speech to a model or performs a desktop action.
const { _electron: electron, expect } = require('playwright/test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bebo-phone-mic-'));
 const app=await electron.launch({...process.argv[2]?{executablePath:path.resolve(process.argv[2]),args:[`--user-data-dir=${profile}`]}:{args:['.',`--user-data-dir=${profile}`]},env,timeout:30000});
 try{
  const page=await app.firstWindow();await page.waitForSelector('h1');
  const proof=await app.evaluate(({app,safeStorage})=>{
   const require=process.getBuiltinModule('node:module').createRequire(app.getAppPath()+'/package.json');
   const path=require('node:path'),fs=require('node:fs');
   const {PhoneDeviceStore}=require(path.join(app.getAppPath(),'electron/phone-device-store.cjs'));
   const {PhonePairing}=require(path.join(app.getAppPath(),'electron/phone-server.cjs'));
   const store=new PhoneDeviceStore(path.join(app.getPath('userData'),'test-only'),safeStorage);
   const first=new PhonePairing({store}),invite=first.offer(),claim=first.request(invite.token,'Test phone','native_nonce_12345');
   first.decide(claim.id,true);const token=first.result(claim.ticket).token;first.dispose();
   const second=new PhonePairing({store});const valid=second.authorize(token).name==='Test phone';
   const encrypted=!fs.readFileSync(store.file,'utf8').includes(token);second.revoke();
   let revoked=false;try{new PhonePairing({store}).authorize(token);}catch{revoked=true;}
   return{valid,encrypted,revoked};
  });assert.deepEqual(proof,{valid:true,encrypted:true,revoked:true});
  const listening=page.evaluate(()=>window.bebo.listen());
  await expect.poll(()=>page.evaluate(async()=> (await window.bebo.taskState()).listening)).toBe(true);
  // Exercise the same stop path as a second microphone click in the app.
  await page.waitForTimeout(1000);await page.evaluate(()=>window.bebo.stop());
  assert.equal(await listening,'');
  const state=await page.evaluate(()=>window.bebo.taskState());assert.equal(state.listening,false);assert.equal(state.hasError,false);
  console.log('PASS: Windows-encrypted phone registration survives reload; revocation persists; stopped microphone resolves cleanly without a false error.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
