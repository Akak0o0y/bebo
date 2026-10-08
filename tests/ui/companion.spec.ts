import { test, expect } from '@playwright/test';

test('desktop companion listens in place, opens a context menu, and submits a question once', async ({page})=>{
 await page.setViewportSize({width:360,height:580});
 await page.addInitScript(()=>{const w=window as any;localStorage.setItem('bebo-sound','false');w.calls=[];w.state={prompt:'Organize a folder',busy:false,acting:false,listening:false,pending:null,message:'',hasError:false,connected:true,mood:'idle',color:'orbit',energy:'lively',approvalExpires:null};
 w.bebo={taskState:async()=>w.state,onTaskState:(cb:any)=>{w.receive=cb;return()=>{};},onAvatarState:()=>()=>{},effectsGet:async()=>({cursor:true,dust:true,edges:true}),onEffectsChanged:()=>()=>{},companionBubble:async(value:boolean)=>{w.calls.push(['bubble',value]);},talk:async()=>{w.calls.push(['talk']);w.state={...w.state,listening:!w.state.listening,mood:w.state.listening?'idle':'listening'};w.receive(w.state);},companionMenu:async()=>{w.calls.push(['menu']);},dashboard:async()=>{w.calls.push(['dashboard']);},stop:async()=>{},answer:(id:string,text:string)=>{w.calls.push(['answer',id,text]);return new Promise(resolve=>{w.finishAnswer=resolve;});}};
 });
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?pet=1');await page.getByRole('button',{name:'Talk to Bebo',exact:true}).click({force:true});
 await expect(page.locator('.bebo-avatar')).toHaveAttribute('data-mood','listening');
 await page.getByRole('button',{name:'Stop listening',exact:true}).click({force:true});
 await page.locator('.bebo-avatar').click({button:'right',force:true});await expect.poll(()=>page.evaluate(()=>(window as any).calls.filter((x:any)=>x[0]==='menu').length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).calls.some((x:any)=>x[0]==='dashboard'))).toBe(false);
 await page.evaluate(()=>{const w=window as any;w.state={...w.state,mood:'help',pending:{id:'question-1',step:1,action:{type:'ask',reason:'Which folder should I use?',x:0,y:0,text:''}}};w.receive(w.state);});
 const input=page.getByRole('textbox',{name:'Your answer to Bebo'});await expect(input).toBeVisible();
 await page.screenshot({path:'artifacts/bebo-question-cloud.png',omitBackground:true});
 await input.fill('Downloads');await input.press('Enter');await expect(page.getByRole('button',{name:'Send answer'})).toBeDisabled();
 expect(await page.evaluate(()=>(window as any).calls.filter((x:any)=>x[0]==='answer'))).toEqual([['answer','question-1','Downloads']]);
 await page.evaluate(()=>{const w=window as any;w.receive({...w.state,pending:{...w.state.pending,id:'question-2',action:{...w.state.pending.action,reason:'What should I name it?'}}});});
 await expect(page.getByRole('heading',{name:'What should I name it?'})).toBeVisible();
 await input.fill('Ideas');await page.evaluate(()=>(window as any).finishAnswer({action:{type:'done'}}));
 await expect(input).toHaveValue('Ideas');expect(errors).toEqual([]);
});

test('paired phone answers the same question instead of approving a click',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>sessionStorage.setItem('bebo-phone-session','test-session'));
 let state:any={connected:true,mood:'help',color:'ember',energy:'lively',busy:false,acting:false,prompt:'Organize a folder',pending:{id:'question-1',step:1,action:{type:'ask',reason:'Which folder should I use?',x:0,y:0,text:''}},message:'',hasError:false,approvalExpires:Date.now()+100000,sessionExpires:Date.now()+100000};const calls:any[]=[];
 await page.route('**/api/state',route=>route.fulfill({json:state}));await page.route('**/api/control',async route=>{calls.push(route.request().postDataJSON());state={...state,busy:true,mood:'thinking',pending:null};await route.fulfill({json:{ok:true}});});
 await page.goto('/?phone=1');await expect(page.getByRole('textbox',{name:'Your answer to Bebo'})).toBeVisible();await expect(page.getByRole('button',{name:'Allow this step'})).toHaveCount(0);
 await page.getByRole('textbox',{name:'Your answer to Bebo'}).fill('Downloads');await page.getByRole('button',{name:'Send answer'}).click();await expect(page.getByRole('textbox',{name:'Your answer to Bebo'})).toHaveCount(0);
 expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({op:'answer',stepId:'question-1',text:'Downloads'});
});

test('reduced motion stops the companion and dust, and questions remain usable',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:360,height:300});await page.goto('/?pet=1');await expect(page.locator('.bebo-avatar')).toHaveAttribute('data-motion','still');
 const before=await page.locator('.pet-local-dust').evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL());await page.waitForTimeout(250);expect(await page.locator('.pet-local-dust').evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL())).toBe(before);
 expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
});

test('completed results use a small bubble with optional full details',async({page})=>{
 await page.setViewportSize({width:360,height:390});
 await page.addInitScript(()=>{const w=window as any;localStorage.setItem('bebo-sound','false');w.sizes=[];w.bebo={taskState:async()=>({connected:true,source:'pet',mood:'success',color:'ember',energy:'calm',pending:{id:'result',action:{type:'done',reason:'Your folder is ready. '+ 'The full result stays available here. '.repeat(10)}},busy:false,message:''}),companionBubble:async(size:string)=>w.sizes.push(size)};});
 await page.goto('/?pet=1');await expect(page.locator('.notice-compact')).toBeVisible();
 const box=(await page.locator('.notice-compact').boundingBox())!;expect(box.width).toBeLessThanOrEqual(270);expect(box.height).toBeLessThan(95);
 await page.screenshot({path:'artifacts/bebo-compact-result.png',omitBackground:true});
 await expect.poll(()=>page.evaluate(()=>(window as any).sizes.at(-1))).toBe('compact');
 await page.getByRole('button',{name:'Details',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).sizes.at(-1))).toBe('expanded');
 await page.getByRole('button',{name:'Dismiss Bebo message'}).click();await expect.poll(()=>page.evaluate(()=>(window as any).sizes.at(-1))).toBe('none');
});
