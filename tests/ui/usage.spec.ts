import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const require=createRequire(import.meta.url),{UsageStore}=require('../../electron/usage-store.cjs');
async function sample(){const store=new UsageStore(fs.mkdtempSync(path.join(os.tmpdir(),'bebo-usage-ui-')));await store.track('desktop','gpt-6-luna',async()=>({usage:{input_tokens:18420,output_tokens:824,input_tokens_details:{cached_tokens:4600,cache_write_tokens:1000}}}));await store.track('transcription','gpt-transcribe',async()=>({usage:{type:'duration',seconds:47.8}}));return store.snapshot();}

test('usage displays accurate small dollar amounts, live changes and unavailable calls',async({page})=>{
 await page.addInitScript(snapshot=>{const w=window as any;w.usage=snapshot;w.billingCalls=0;w.bebo={status:async()=>({connected:false}),onTalk:()=>()=>{},onStopped:()=>()=>{},usageGet:async(period:string)=>({...w.usage,period}),onUsageChanged:(callback:any)=>{w.usageChanged=callback;return()=>{};},usageBilling:async()=>{w.billingCalls++;}};},await sample());
 await page.goto('/');await page.getByRole('button',{name:'Usage',exact:true}).click();
 await expect(page.getByTestId('usage-tokens')).toHaveText('19,244');await expect(page.getByTestId('usage-cost')).toHaveText('$0.00545');await expect(page.getByText('Earlier usage is unavailable here.')).toBeVisible();
 await page.screenshot({path:'artifacts/bebo-usage.png',fullPage:true});
 await page.evaluate(()=>{const w=window as any;w.usage.totals.unknownRequests=1;w.usageChanged();});await expect(page.getByText(/1 request\(s\) have no cost estimate/)).toBeVisible();
 await page.getByRole('button',{name:'OpenAI billing'}).click();expect(await page.evaluate(()=>(window as any).billingCalls)).toBe(1);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/bebo-usage-mobile.png',fullPage:true});
});

test('slow previous-period response cannot overwrite a newer selection',async({page})=>{
 await page.addInitScript(snapshot=>{const w=window as any;w.bebo={status:async()=>({connected:false}),onTalk:()=>()=>{},onStopped:()=>()=>{},usageGet:(period:string)=>period==='month'?new Promise(resolve=>{w.month=()=>resolve({...snapshot,period,totals:{...snapshot.totals,totalTokens:111}});}):Promise.resolve({...snapshot,period,totals:{...snapshot.totals,totalTokens:period==='today'?222:333}})};},await sample());
 await page.goto('/');await page.getByRole('button',{name:'Usage',exact:true}).click();await expect(page.getByTestId('usage-tokens')).toHaveText('333');
 await page.getByRole('button',{name:'This month',exact:true}).click();await page.getByRole('button',{name:'Today',exact:true}).click();await expect(page.getByTestId('usage-tokens')).toHaveText('222');
 await page.evaluate(()=>(window as any).month());await expect(page.getByTestId('usage-tokens')).toHaveText('222');
});

test('preview and ledger failures never pretend the user spent zero',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Usage',exact:true}).click();await expect(page.getByText('Your real usage lives in Bebo.')).toBeVisible();await expect(page.getByTestId('usage-cost')).toHaveCount(0);
 await page.addInitScript(()=>{const w=window as any;w.bebo={status:async()=>({connected:false}),onTalk:()=>()=>{},onStopped:()=>()=>{},usageGet:async()=>{throw Error('disk unavailable');}};});
 await page.reload();await page.getByRole('button',{name:'Usage',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Could not read your usage');await expect(page.getByTestId('usage-cost')).toHaveCount(0);
});
