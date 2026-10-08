const { _electron: electron, expect } = require('playwright/test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bebo-presence-'));
 const app=await electron.launch({...process.argv[2]?{executablePath:path.resolve(process.argv[2]),args:[`--user-data-dir=${profile}`]}:{executablePath:require('electron'),args:['.',`--user-data-dir=${profile}`]},env,timeout:30000});
 try{
  const desktop=await app.firstWindow();await desktop.waitForSelector('h1');await desktop.evaluate(()=>window.bebo.workConfigure({mode:'screen'}));await desktop.evaluate(()=>localStorage.setItem('bebo-sound','false'));await desktop.reload();await desktop.waitForSelector('h1');const errors=[];desktop.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(()=>{globalThis.requests=[];globalThis.fetch=async(url,options)=>{
   if(String(url).includes('/models/'))return new Response('{}');
   if(!String(url).endsWith('/responses'))throw Error('Unexpected request in contained test');
   globalThis.requests.push(JSON.parse(options.body));
   const action=globalThis.requests.length===1?{type:'ask',reason:'Which folder should I use?',text:'',x:0,y:0}:{type:'done',reason:'Thanks. I have your folder choice.',text:'',x:0,y:0};
   return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify(action)}]}]}));
  };});
  await desktop.getByRole('button',{name:'Personalize',exact:true}).click();
  await desktop.evaluate(()=>window.bebo.connect('local-test-key-never-sent'));await desktop.evaluate(()=>window.bebo.assistantSet({autoActions:['click','double_click','scroll','type','key']}));await desktop.evaluate(()=>window.bebo.phoneAppearance({color:'orbit',energy:'lively'}));
  const nextWindow=app.waitForEvent('window');await desktop.evaluate(()=>window.bebo.pet());const pet=await nextWindow;pet.on('pageerror',e=>errors.push(e.message));await pet.waitForSelector('.desktop-pet');
  await expect(pet.locator('.bebo-avatar')).toHaveAttribute('data-mood','idle');await pet.screenshot({path:'artifacts/bebo-constellation-idle.png',omitBackground:true});
  // Requests originate in the pet; screenshots are local and the provider is mocked.
  const step=await pet.evaluate(()=>window.bebo.plan('Organize the folder I choose.'));assert.equal(step.action.type,'ask');
  await expect(pet.getByRole('textbox',{name:'Your answer to Bebo'})).toBeVisible();await expect(desktop.getByRole('textbox',{name:'Your answer to Bebo'})).toHaveCount(1);
  const dashboardHidden=()=>app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.getURL().includes('pet=1'));return !win.isVisible()||win.isMinimized();});assert.equal(await dashboardHidden(),true);
  await pet.screenshot({path:'artifacts/bebo-constellation-question.png',omitBackground:true});
  await pet.getByRole('textbox',{name:'Your answer to Bebo'}).fill('Downloads');await pet.getByRole('button',{name:'Send answer'}).click();
  await expect(pet.getByRole('heading',{name:'Thanks. I have your folder choice.'})).toBeVisible({timeout:15000});await expect(desktop.getByRole('textbox',{name:'Your answer to Bebo'})).toHaveCount(0);assert.equal(await dashboardHidden(),true);
  await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('pet=1')).getBounds().height)).toBeGreaterThanOrEqual(390);
  await pet.getByRole('button',{name:'Details',exact:true}).click();
  await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('pet=1')).getBounds().height)).toBeGreaterThanOrEqual(580);
  assert.match(await app.evaluate(()=>globalThis.requests[1].input[0].content[0].text),/User clarifications:.*Downloads/);
  assert.equal(await pet.evaluate(async id=>{try{await window.bebo.answer(id,'Documents');return false;}catch{return true;}},step.id),true);
  await pet.evaluate(()=>window.bebo.stop());
  // The native right-click menu updates the same settings as the dashboard.
  await app.evaluate(({Menu})=>{globalThis.menuOriginal=Menu.buildFromTemplate;Menu.buildFromTemplate=items=>{globalThis.testMenu=items;return{popup(){}};};});
  await pet.locator('.bebo-avatar').click({button:'right',force:true});
  await expect.poll(()=>app.evaluate(()=>!!globalThis.testMenu)).toBe(true);
  await app.evaluate(()=>globalThis.testMenu.find(i=>i.label==='Turn off all screen effects').click());assert.deepEqual(await desktop.evaluate(()=>window.bebo.effectsGet()),{cursor:false,dust:false,edges:false});
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().includes('cursor.html')).every(w=>!w.isVisible())),true);
  await desktop.evaluate(()=>window.bebo.effectsSet({cursor:true,dust:true,edges:true}));await desktop.evaluate(()=>window.bebo.cursorPreview());
  const overlay=app.windows().find(w=>w.url().includes('cursor.html'));assert.ok(overlay);await expect(overlay.locator('#cursor')).toHaveAttribute('aria-label','Bebo · cursor preview');
  await expect.poll(()=>overlay.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bebo-color'))).toBe('#141414');
  await expect(overlay.locator('.pointer')).toHaveCSS('fill','rgb(20, 20, 20)');
  await expect(overlay.locator('#dust')).toHaveAttribute('data-edges','false');
  const nonfocus=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().includes('cursor.html')).every(w=>!w.isFocusable()));assert.equal(nonfocus,true);
  // Move only our test companion window, then verify actual motion creates dust.
  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('pet=1'));const b=win.getBounds();win.setBounds({...b,x:b.x-100});});
  await expect.poll(()=>overlay.locator('#dust').getAttribute('data-particles')).not.toBe('0');
  await overlay.screenshot({path:'artifacts/bebo-constellation-edges.png',omitBackground:true});
  await app.evaluate(({Menu})=>{globalThis.testMenu.find(i=>i.label==='Hide Bebo').click();Menu.buildFromTemplate=globalThis.menuOriginal;});
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('pet=1')).isVisible()),false);
  assert.deepEqual(errors,[]);console.log('PASS: native pet task stays on desktop, cloud answer resumes with context, dashboard sync, stale rejection, right-click effects, monochrome cursor, screen-edge dust, movement particles, hide. Provider replies mocked locally.');
 }finally{let timer;try{await Promise.race([app.close(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Test app close timeout')),5000);})]);}catch{app.process().kill();}finally{clearTimeout(timer);}} 
})().catch(e=>{console.error(e);process.exitCode=1;});
