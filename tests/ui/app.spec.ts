import {test,expect} from '@playwright/test';
test('stopping the microphone ignores its late cancellation error and allows retry',async({page})=>{
 await page.addInitScript(()=>{const w=window as any;w.listenCount=0;localStorage.setItem('bebo-sound','false');w.bebo={status:async()=>({connected:true}),onTalk:()=>()=>{},onStopped:(cb:any)=>{w.stopped=cb;return()=>{};},listen:()=>{w.listenCount++;return new Promise((resolve,reject)=>{w.rejectListen=reject;});},stop:async()=>{w.stopped();w.rejectListen(new Error("Error invoking remote method 'bebo:listen': Error: Desktop operation stopped."));},setAvatarState:async()=>{}};});
 await page.goto('/');await page.locator('.voice-button').click({force:true});await expect(page.locator('.bebo-avatar')).toHaveAttribute('data-mood','listening');await page.locator('.voice-button').click({force:true});
 await expect(page.getByText('Desktop operation stopped.',{exact:false})).toHaveCount(0);await expect(page.locator('.bebo-avatar')).not.toHaveAttribute('data-mood','help');
 await page.locator('.voice-button').click({force:true});await expect.poll(()=>page.evaluate(()=>(window as any).listenCount)).toBe(2);await expect(page.locator('.bebo-avatar')).toHaveAttribute('data-mood','listening');
});
test('request starts an honest desktop connection flow and dialog restores focus',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await page.getByRole('button',{name:'“Bebo, open Chrome”'}).click();await expect(page.getByRole('textbox',{name:'Ask Bebo'})).toHaveValue('Open Google Chrome');
 await page.getByRole('button',{name:'Send request'}).click();await expect(page.getByRole('dialog')).toContainText('Open the Windows app to connect');await expect(page.locator('input[type=password]')).toHaveCount(0);
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Send request'})).toBeFocused();expect(errors).toEqual([]);
 await page.screenshot({path:'test-results/bebo-desktop.png',fullPage:true});
});
test('customization and shortcuts survive reload; deletion is scoped',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Personalize',exact:true}).click();await page.getByRole('button',{name:'sprout edition'}).click();await page.reload();await page.getByRole('button',{name:'Personalize',exact:true}).click();await expect(page.getByRole('button',{name:'sprout edition'})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Shortcuts',exact:true}).click();await page.getByRole('button',{name:'New shortcut'}).click();await page.getByLabel('What should Bebo do?').fill('Open Calculator');await page.getByRole('button',{name:'Save shortcut'}).click();await page.reload();await page.getByRole('button',{name:'Shortcuts',exact:true}).click();await expect(page.getByRole('heading',{name:'Open Calculator'})).toBeVisible();await page.getByRole('button',{name:'Delete Open Calculator'}).click();await expect(page.getByRole('heading',{name:'Open Calculator'})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Open Google Chrome'})).toBeVisible();
});
test('mobile fits viewport and navigation remains available',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'test-results/bebo-mobile.png',fullPage:true});await page.getByRole('button',{name:'Activity',exact:true}).click();await expect(page.getByRole('heading',{name:'A fresh little start.'})).toBeVisible();await page.getByRole('button',{name:'Home',exact:true}).click();await expect(page.getByRole('heading',{name:'Just say the word.'})).toBeVisible();
});
test('reduced motion stops character animations and modal traps focus',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
 const avatar=page.locator('.bebo-avatar');await expect(avatar).toHaveAttribute('data-motion','still');
 const snapshot=await avatar.locator('svg').innerHTML();await page.waitForTimeout(350);expect(await avatar.locator('svg').innerHTML()).toBe(snapshot);
 await page.getByRole('button',{name:'Settings',exact:true}).first().click();await page.keyboard.press('Shift+Tab');await expect(page.getByRole('dialog').getByRole('button',{name:'Personalize'})).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Close dialog'})).toBeFocused();
});
