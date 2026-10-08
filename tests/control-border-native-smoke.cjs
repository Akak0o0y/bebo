// Uses local provider replies, real windows and the production cancel IPC.
// No external model requests or user desktop actions are sent.
const { _electron: electron, expect: baseExpect } = require('playwright/test');
const expect=baseExpect.configure({timeout:15000});
const fs=require('node:fs'), os=require('node:os'), path=require('node:path'), assert=require('node:assert/strict');
(async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bebo-control-border-'));
 const app=await electron.launch({executablePath:process.argv[2]?path.resolve(process.argv[2]):require('electron'),args:[...(process.argv[2]?[]:['.']),`--user-data-dir=${profile}`],env,timeout:30000});
 try{
  const desktop=await app.firstWindow();await desktop.waitForSelector('h1');
  const visibleTabs=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().includes('control-cancel.html')&&w.isVisible()).length);
  await desktop.evaluate(()=>window.bebo.cursorPreview());
  const overlay=app.windows().find(w=>w.url().includes('cursor.html'));
  await expect(overlay.locator('#dust')).toHaveAttribute('data-edges','false');assert.equal(await visibleTabs(),0);
  await desktop.evaluate(()=>window.bebo.stop());await desktop.evaluate(()=>window.bebo.setAvatarState('listening'));assert.equal(await visibleTabs(),0);
  await app.evaluate(()=>{
   globalThis.testAbort=false;
   globalThis.fetch=async(url,options)=>{
    if(String(url).includes('/models/'))return new Response('{}');
    return new Promise((resolve,reject)=>{
     globalThis.testReply=type=>resolve(new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({type,x:0,y:0,text:'',reason:type==='ask'?'Which folder?':'Finished.'})}]}]})));
     options.signal.addEventListener('abort',()=>{globalThis.testAbort=true;reject(Error('Stopped test request'));},{once:true});
    });
   };
  });
  await desktop.evaluate(()=>window.bebo.workConfigure({mode:'screen'}));
  await desktop.evaluate(()=>window.bebo.connect('local-test-key-never-sent'));
  const pending=desktop.evaluate(()=>window.bebo.plan('Wait for my next instruction.')).catch(error=>error.message);
  await expect.poll(visibleTabs).toBeGreaterThan(0);
  await expect.poll(()=>app.evaluate(()=>typeof globalThis.testReply)).toBe('function');
  await expect(overlay.locator('#dust')).toHaveAttribute('data-edges','true');
  const tab=app.windows().find(w=>w.url().includes('control-cancel.html'));
  const geometry=await app.evaluate(({BrowserWindow,screen})=>{
   const primary=screen.getPrimaryDisplay().bounds;
   const tab=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('control-cancel.html')&&Math.abs(w.getBounds().y-primary.y)<2);
   return{bounds:tab.getBounds(),primary,focusable:tab.isFocusable(),top:tab.isAlwaysOnTop()};
  });assert.equal(geometry.focusable,false);assert.equal(geometry.top,true);assert.equal(geometry.bounds.y,geometry.primary.y);assert.ok(Math.abs(geometry.bounds.x+geometry.bounds.width/2-geometry.primary.x-geometry.primary.width/2)<2);
  // A different renderer cannot impersonate the dedicated Cancel tab.
  await app.evaluate(({ipcMain,BrowserWindow})=>{const dashboard=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'));ipcMain.emit('bebo:control-cancel',{sender:dashboard.webContents,senderFrame:dashboard.webContents.mainFrame});});
  assert.equal((await desktop.evaluate(()=>window.bebo.taskState())).busy,true);
  await tab.getByRole('button',{name:"Cancel Bebo's computer task"}).click();await pending;
  assert.equal(await app.evaluate(()=>globalThis.testAbort),true);assert.equal((await desktop.evaluate(()=>window.bebo.taskState())).busy,false);assert.equal(await visibleTabs(),0);
  // Turning decorative effects off must not remove the working Cancel control.
  await desktop.evaluate(()=>window.bebo.effectsSet({cursor:false,dust:false,edges:false}));await app.evaluate(()=>{globalThis.testReply=null;});
  const question=desktop.evaluate(()=>window.bebo.plan('Ask which folder I mean.')).catch(error=>({error:error.message}));
  await expect.poll(visibleTabs).toBeGreaterThan(0);await expect.poll(()=>app.evaluate(()=>typeof globalThis.testReply)).toBe('function');
  await expect(overlay.locator('#dust')).toHaveAttribute('data-edges','false');
  await app.evaluate(()=>globalThis.testReply('ask'));assert.equal((await question).action.type,'ask');assert.equal(await visibleTabs(),0);
  await desktop.evaluate(()=>window.bebo.stop());
  await desktop.evaluate(()=>window.bebo.effectsSet({edges:true}));await app.evaluate(()=>{globalThis.testReply=null;});
  const complete=desktop.evaluate(()=>window.bebo.plan('Finish the test.')).catch(error=>({error:error.message}));
  await expect.poll(visibleTabs).toBeGreaterThan(0);await expect.poll(()=>app.evaluate(()=>typeof globalThis.testReply)).toBe('function');
  await app.evaluate(()=>globalThis.testReply('done'));assert.equal((await complete).action.type,'done');assert.equal(await visibleTabs(),0);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().includes('cursor.html')).every(w=>!w.isVisible())),true);
  console.log('PASS: border only during computer tasks; top-attached non-focusing Cancel aborts the task; sender checks, disabled effects, question pause and completion verified.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
