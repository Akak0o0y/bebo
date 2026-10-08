import {test,expect} from '@playwright/test';

test('monochrome cursor flows inside its silhouette and scatters black dust on clicks',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:660,height:360});
 await page.goto('/cursor-preview/cursor.html?demo=1&color=orbit');await expect(page.locator('.pointer')).toBeVisible();await expect(page.locator('.pointer-body')).toHaveCSS('fill','rgb(20, 20, 20)');await expect(page.locator('#scout,.halo,.scout-orbit,.cursor-link')).toHaveCount(0);
 const first=await page.locator('#ink-waves').innerHTML();await expect.poll(()=>page.locator('#ink-waves').innerHTML()).not.toBe(first);
 await page.evaluate(()=>{const el=document.querySelector('#cursor')!;(window as any).cursorPhases=[];new MutationObserver(()=>{(window as any).cursorPhases.push(el.getAttribute('data-phase'));}).observe(el,{attributes:true,attributeFilter:['data-phase']});});
 await page.mouse.move(50,40);await page.mouse.move(390,125,{steps:20});await expect.poll(async()=>Number(await page.locator('#dust').getAttribute('data-particles'))).toBeGreaterThan(0);await expect(page.locator('#dust')).toHaveAttribute('data-ink','#141414');
 await page.getByRole('button',{name:'Give a little click'}).click();await expect.poll(()=>page.evaluate(()=>(window as any).cursorPhases)).toContain('click');
 await page.getByRole('textbox',{name:'Type in the cursor playground'}).fill('Hello Bebo');await expect.poll(()=>page.evaluate(()=>(window as any).cursorPhases)).toContain('typing');
 await page.getByRole('button',{name:'Try a scroll'}).click();await expect.poll(()=>page.evaluate(()=>(window as any).cursorPhases)).toContain('scroll');
 await page.mouse.move(350,110);await page.mouse.move(445,145,{steps:14});await page.screenshot({path:'artifacts/bebo-ink-cursor.png'});expect(errors).toEqual([]);
});

test('Personalize keeps the cursor monochrome across avatar editions and pauses it in Calm mode',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Personalize',exact:true}).click();await page.getByRole('button',{name:'sprout edition'}).click();const frame=page.frameLocator('iframe[title="Interactive Bebo cursor playground"]');await expect(frame.locator('.pointer-body')).toHaveCSS('fill','rgb(20, 20, 20)');await page.getByRole('button',{name:'Calm',exact:true}).click();await expect(frame.locator('#cursor')).toHaveAttribute('data-calm','true');await frame.getByRole('button',{name:'Give a little click'}).click();await expect(frame.locator('#dust')).toHaveAttribute('data-particles','0');const still=await frame.locator('#ink-waves').innerHTML();await page.waitForTimeout(180);expect(await frame.locator('#ink-waves').innerHTML()).toBe(still);
});

test('reduced motion freezes the ink without decorative rings or backgrounds',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:350});await page.goto('/cursor-preview/cursor.html?demo=1');await page.mouse.move(320,265);await expect(page.locator('#cursor')).toHaveAttribute('data-calm','true');await expect(page.locator('#dust')).toHaveAttribute('data-particles','0');const first=await page.locator('#ink-waves').innerHTML();await page.waitForTimeout(180);expect(await page.locator('#ink-waves').innerHTML()).toBe(first);await expect(page.locator('#cursor')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
});

for(const theme of ['light','dark'])test(`control border keeps dense black dust and the attached Cancel tab on ${theme} apps`,async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto(`/cursor-preview/cursor.html?demo=1&control=1${theme==='dark'?'&dark=1':''}`);
 await expect(page.locator('#edge-wash')).toBeVisible();await expect.poll(async()=>Number(await page.locator('#dust').getAttribute('data-edge-particles'))).toBeGreaterThan(1000);
 const cancel=page.getByRole('button',{name:"Cancel Bebo's computer task"});await expect(cancel).toBeVisible();const bounds=await cancel.boundingBox();expect(bounds?.y).toBe(0);expect(bounds?.width).toBe(132);expect(bounds!.x+bounds!.width/2).toBe(720);
 await page.screenshot({path:`artifacts/bebo-control-border-${theme}.png`});
 await cancel.click();await expect(cancel).toBeHidden();await expect(page.locator('#edge-wash')).toBeHidden();await expect(page.locator('#dust')).toHaveAttribute('data-edge-particles','0');
 await expect(page.locator('.pointer')).toBeVisible();
});

test('control border is static with reduced motion and absent in an idle cursor preview',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/cursor-preview/cursor.html?demo=1&control=1');await expect(page.locator('#dust')).toHaveAttribute('data-edges','true');const still=await page.locator('#dust').evaluate((el:HTMLCanvasElement)=>el.toDataURL());await page.waitForTimeout(200);expect(await page.locator('#dust').evaluate((el:HTMLCanvasElement)=>el.toDataURL())).toBe(still);
 await page.goto('/cursor-preview/cursor.html?demo=1');await expect(page.locator('#edge-wash')).toBeHidden();await expect(page.locator('.demo-cancel')).toHaveCount(0);await expect(page.locator('#dust')).toHaveAttribute('data-edges','false');
});
