import { test, expect } from '@playwright/test';

const idle = { connected:true, mood:'idle', color:'ember', energy:'lively', busy:false, acting:false, pending:null, message:'', hasError:false };
test('touch hold never selects text, waits for release, and includes the final result', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(() => {
    localStorage.setItem('bebo-phone-session','remembered');
    class Speech {
      onresult:any; onend:any; onerror:any;
      start(){(window as any).speech=this;}
      stop(){setTimeout(()=>{const r:any=[{transcript:'Open my Downloads folder'}];r.isFinal=true;this.onresult?.({results:[r]});this.onend?.();},100);}
      abort(){}
    }
    (window as any).SpeechRecognition=Speech;
  });
  const calls:any[]=[];
  await page.route('**/api/state',r=>r.fulfill({json:idle}));
  await page.route('**/api/control',r=>{calls.push(r.request().postDataJSON());return r.fulfill({json:{accepted:true}});});
  await page.goto('/?phone=1');await expect(page.getByText('Desktop connected',{exact:true})).toBeVisible();
  const avatar=page.locator('.bebo-avatar'),box=(await avatar.boundingBox())!;
  const touch=await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
  await expect(avatar).toHaveAttribute('data-mood','listening');
  await page.evaluate(()=>{const r:any=[{transcript:'Open my Downloads'}];r.isFinal=false;(window as any).speech.onresult({results:[r]});});
  await page.waitForTimeout(700);expect(calls).toHaveLength(0);
  await expect(avatar).toHaveCSS('user-select','none');await expect(avatar).toHaveCSS('touch-action','none');
  expect(await page.evaluate(()=>getSelection()?.toString())).toBe('');
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>calls.length).toBe(1);expect(calls[0].text).toBe('Open my Downloads folder');
  await page.evaluate(()=>(window as any).speech.onend());await page.waitForTimeout(100);expect(calls).toHaveLength(1);
});

test('interrupted holds discard words and early speech-end does not send before release',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('bebo-phone-session','remembered');
    class Speech { onresult:any;onend:any;start(){(window as any).speech=this;}stop(){this.onend?.();}abort(){} }
    (window as any).SpeechRecognition=Speech;
  });
  const calls:any[]=[];await page.route('**/api/state',r=>r.fulfill({json:idle}));await page.route('**/api/control',r=>{calls.push(r.request().postDataJSON());return r.fulfill({json:{accepted:true}});});
  await page.goto('/?phone=1');await expect(page.getByText('Desktop connected',{exact:true})).toBeVisible();
  await page.locator('.bebo-avatar').hover();await page.mouse.down();
  await page.evaluate(()=>{const r:any=[{transcript:'Open Chrome'}];r.isFinal=true;const s=(window as any).speech;s.onresult({results:[r]});s.onend();});
  await page.waitForTimeout(250);expect(calls).toHaveLength(0);await page.mouse.up();await expect.poll(()=>calls.length).toBe(1);
  await page.locator('.bebo-avatar').hover();await page.mouse.down();
  await page.evaluate(()=>{const r:any=[{transcript:'Do not send this'}];r.isFinal=true;(window as any).speech.onresult({results:[r]});window.dispatchEvent(new Event('blur'));});
  await page.mouse.up();await page.waitForTimeout(150);expect(calls).toHaveLength(1);
});

test('reconnect link remembers registration in new tabs without another verification',async({page,context})=>{
  let pairRequests=0;
  await context.route('**/api/state',r=>{expect(r.request().headers().authorization).toBe('Bearer registered-secret');return r.fulfill({json:idle});});
  await context.route('**/api/pair',r=>{pairRequests++;return r.fulfill({status:400,json:{}});});
  await page.goto('/?phone=1#resume=registered-secret');await expect(page.getByText('Desktop connected',{exact:true})).toBeVisible();
  expect(page.url()).not.toContain('registered-secret');
  const next=await context.newPage();await next.goto('/?phone=1');await expect(next.getByText('Desktop connected',{exact:true})).toBeVisible();
  expect(pairRequests).toBe(0);
  await next.getByRole('button',{name:'Forget this phone'}).click();await next.reload();await expect(next.getByText('Not paired',{exact:true})).toBeVisible();
});

test('enhanced phone recording uploads English audio on release and Stop discards a late transcript',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('bebo-phone-session','registered');const w=window as any;w.stoppedTracks=0;
  Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>w.stoppedTracks++}]})}});
  w.MediaRecorder=class{static isTypeSupported(type:string){return type.startsWith('audio/webm');}state='inactive';mimeType='audio/webm;codecs=opus';ondataavailable:any;onstop:any;start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob([new Uint8Array(500)],{type:this.mimeType})});this.onstop?.();}};
 });
 let uploads=0,release:()=>void=()=>{};const commands:any[]=[];
 await page.route('**/api/state',r=>r.fulfill({json:{...idle,transcription:'gpt-transcribe'}}));
 await page.route('**/api/transcribe',async r=>{uploads++;expect(r.request().headers()['x-bebo-language']).toBe('en');expect(r.request().postDataBuffer()?.length).toBe(500);if(uploads===2)await new Promise<void>(resolve=>release=resolve);await r.fulfill({json:{text:'Open Chrome'}}).catch(()=>{});});
 await page.route('**/api/control',r=>{commands.push(r.request().postDataJSON());return r.fulfill({json:{accepted:true}});});
 await page.goto('/?phone=1');await expect(page.getByText('Desktop connected',{exact:true})).toBeVisible();
 await page.locator('.bebo-avatar').hover();await page.mouse.down();await expect(page.locator('.bebo-avatar')).toHaveAttribute('data-mood','listening');expect(uploads).toBe(0);await page.mouse.up();
 await expect.poll(()=>commands.filter(c=>c.op==='request').length).toBe(1);expect(commands[0].text).toBe('Open Chrome');
 await page.locator('.bebo-avatar').hover();await page.mouse.down();await page.mouse.up();await expect.poll(()=>uploads).toBe(2);await page.getByRole('button',{name:'Stop',exact:true}).click();release();await page.waitForTimeout(150);
 expect(commands.filter(c=>c.op==='request')).toHaveLength(1);expect(await page.evaluate(()=>(window as any).stoppedTracks)).toBeGreaterThanOrEqual(2);
});
