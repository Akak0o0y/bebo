import {test,expect} from '@playwright/test';
for(const pet of [false,true])test(`enhanced recording submits desktop speech once (${pet?'floating avatar':'dashboard'})`,async({page})=>{
 await page.addInitScript(()=>{
  const w=window as any;localStorage.setItem('bebo-sound','false');w.requests=[];w.audio=[];w.dashboardCalls=0;
  Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
  w.MediaRecorder=class{static isTypeSupported(){return true;}state='inactive';mimeType='audio/webm';ondataavailable:any;onstop:any;start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob([new Uint8Array(500)],{type:this.mimeType})});this.onstop?.();}};
  w.bebo={status:async()=>({connected:true}),assistantGet:async()=>({transcription:'gpt-transcribe',autoActions:[]}),onTalk:()=>()=>{},onStopped:()=>()=>{},setAvatarState:async()=>{},
   transcribe:async(bytes:Uint8Array,mime:string,lang:string)=>{w.audio.push([bytes.length,mime,lang]);return 'Open Chrome';},transcriptionStop:async()=>{},
   plan:async(text:string)=>{w.requests.push(text);return{id:'question',step:1,action:{type:'ask',text:'',x:0,y:0,reason:'Which profile?'}};},
   taskState:async()=>({prompt:'',connected:true,source:'pet',mood:'idle',color:'ember',energy:'calm',pending:null,busy:false,acting:false,hasError:false,message:''}),companionBubble:async()=>{},dashboard:async()=>{w.dashboardCalls++;}};
 });
 await page.goto(pet?'/?pet=1':'/');const button=pet?page.locator('.bebo-avatar'):page.locator('.voice-button');
 await button.click({force:true});await expect(page.locator('.bebo-avatar')).toHaveAttribute('data-mood','listening');
 await button.click({force:true});await expect.poll(()=>page.evaluate(()=>(window as any).requests)).toEqual(['Open Chrome']);
 expect(await page.evaluate(()=>(window as any).audio)).toEqual([[500,'audio/webm','en']]);expect(await page.evaluate(()=>(window as any).dashboardCalls)).toBe(0);
});

test('permission choices expose all actions and individual controls',async({page})=>{
 await page.addInitScript(()=>{const w=window as any;w.saved={transcription:'gpt-transcribe',autoActions:[]};w.listeners=[];w.bebo={status:async()=>({connected:true}),onTalk:()=>()=>{},onStopped:()=>()=>{},setAvatarState:async()=>{},assistantGet:async()=>w.saved,onAssistantChanged:(cb:any)=>{w.listeners.push(cb);return()=>{};},assistantSet:async(patch:any)=>{w.saved={...w.saved,...patch};w.listeners.forEach((cb:any)=>cb(w.saved));return w.saved;}};});
 await page.goto('/');await page.getByRole('button',{name:'Settings',exact:true}).first().click();
 const all=page.getByRole('switch',{name:'Allow all supported actions automatically'});await expect(all).not.toBeChecked();await all.click();
 await expect(all).toBeChecked();await page.getByLabel('Keyboard shortcuts',{exact:true}).uncheck();
 expect(await page.evaluate(()=>(window as any).saved.autoActions)).toEqual(['click','double_click','scroll','type']);
 await page.getByLabel('Understand my voice',{exact:true}).selectOption('device');expect(await page.evaluate(()=>(window as any).saved.transcription)).toBe('device');
 await page.screenshot({path:'artifacts/bebo-voice-permissions.png',fullPage:true});
});
