import {test, expect} from '@playwright/test';

async function setup(page:any) {
  await page.addInitScript(() => {
    const w=window as any;
    localStorage.setItem('bebo-sound','false');
    w.workPrefs={mode:'adaptive',terminal:'ask',autoApps:true,autoFiles:false,roots:['C:\\Bebo files'],maxSteps:40,maxMinutes:10,maxCostUsd:.5};
    w.work={warning:'',tasks:[{id:'fixture',prompt:'Find the latest project note',status:'running',phase:'Checking the saved file',startedAt:'2026-10-08T08:00:00.000Z',endedAt:null,steps:3,maxSteps:40,plan:['Find the note','Check its contents'],stats:{requests:3,tokens:1240,estimatedUsd:.000184,unknownCosts:0,screenshots:0,retries:0},events:[{id:'read',tool:'read_file',label:'Read the project note',at:'2026-10-08T08:00:01.000Z',status:'success',summary:'Read text.',durationMs:18,artifacts:[]},{id:'shell',tool:'run_powershell',label:'Check file metadata',at:'2026-10-08T08:00:02.000Z',status:'running',summary:'',durationMs:0,details:"Folder: C:\\Bebo files\nGet-Item -LiteralPath './note.txt'",output:'note.txt · 184 bytes',artifacts:[]}]}]};
    w.workListeners=[];w.prefListeners=[];
    w.bebo={status:async()=>({connected:true}),onTalk:()=>()=>{},onStopped:()=>()=>{},setAvatarState:async()=>{},
      workSettings:async()=>structuredClone(w.workPrefs),workConfigure:async(patch:any)=>{w.workPrefs={...w.workPrefs,...patch};w.prefListeners.forEach((cb:any)=>cb(structuredClone(w.workPrefs)));return structuredClone(w.workPrefs);},
      onWorkSettingsChanged:(cb:any)=>{w.prefListeners.push(cb);return()=>{w.prefListeners=w.prefListeners.filter((x:any)=>x!==cb);};},
      workFolder:async()=>{w.workPrefs.roots.push('C:\\Projects');return structuredClone(w.workPrefs);},
      workHistory:async()=>structuredClone(w.work),onWorkChanged:(cb:any)=>{w.workListeners.push(cb);return()=>{w.workListeners=w.workListeners.filter((x:any)=>x!==cb);};},
      workClear:async()=>{w.work.tasks=[];w.workListeners.forEach((cb:any)=>cb());},
    };
  });
}

test('work preferences expose explicit terminal permissions and persist folder/limit choices',async({page})=>{
  await setup(page);await page.goto('/');await page.getByRole('button',{name:'Settings',exact:true}).first().click();
  await expect(page.getByLabel('Terminal access',{exact:true})).toHaveValue('ask');
  await page.getByLabel('Terminal access',{exact:true}).selectOption('auto');
  await expect(page.getByText('Commands run automatically within your request,',{exact:false})).toBeVisible();
  await page.getByLabel('Create and update text files automatically').check();
  await page.getByLabel('Steps per task',{exact:true}).selectOption('60');
  await page.getByRole('button',{name:'Add folder'}).click();
  await expect(page.getByRole('button',{name:'Remove allowed folder C:\\Projects'})).toBeVisible();
  await page.getByRole('button',{name:'Remove allowed folder C:\\Bebo files'}).click();
  expect(await page.evaluate(()=>(window as any).workPrefs)).toMatchObject({terminal:'auto',autoFiles:true,maxSteps:60,roots:['C:\\Projects']});
  await page.getByRole('button',{name:'Close dialog'}).click();await page.getByRole('button',{name:'Settings',exact:true}).first().click();
  await expect(page.getByLabel('Terminal access',{exact:true})).toHaveValue('auto');
  await page.screenshot({path:'artifacts/bebo-work-settings.png'});
});

test('Activity streams real steps and command output; history clearing is separate from usage',async({page})=>{
  await setup(page);await page.goto('/');await page.getByRole('button',{name:'Activity',exact:true}).click();
  await expect(page.getByRole('heading',{name:'How the work happened.'})).toBeVisible();
  await expect(page.getByText('1,240 tokens')).toBeVisible();await expect(page.getByText('0 screen checks')).toBeVisible();
  await page.getByText('Command & output').click();await expect(page.locator('.work-terminal-output')).toContainText('184 bytes');
  await expect(page.getByRole('button',{name:'Clear task history'})).toBeDisabled();
  await page.evaluate(()=>{const w=window as any;w.work.tasks[0].status='done';w.work.tasks[0].phase='Found and checked note.txt.';w.work.tasks[0].events[1].status='success';w.work.tasks[0].events[1].summary='PowerShell exited with code 0.';w.workListeners.forEach((cb:any)=>cb());});
  await expect(page.getByText('Found and checked note.txt.')).toBeVisible();
  await page.screenshot({path:'artifacts/bebo-work-activity.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/bebo-work-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Clear task history'}).click();await expect(page.getByText('Your next adaptive task will appear here, step by step.')).toBeVisible();
});

test('late history response cannot overwrite newer live progress',async({page})=>{
  await setup(page);
  await page.addInitScript(()=>{const w=window as any;let n=0;w.bebo.workHistory=()=>++n===1?new Promise(resolve=>{w.releaseOld=resolve;}):Promise.resolve(w.work);});
  await page.goto('/');await expect.poll(()=>page.evaluate(()=>typeof(window as any).releaseOld)).toBe('function');
  await page.evaluate(()=>{const w=window as any;w.workListeners.forEach((cb:any)=>cb());});
  await expect(page.getByText('Checking the saved file')).toBeVisible();
  await page.evaluate(()=>(window as any).releaseOld({tasks:[],warning:''}));await expect(page.getByText('Checking the saved file')).toBeVisible();
});
