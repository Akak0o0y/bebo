// Actual Responses/transcription integration, isolated profile and local API fixtures.
// No provider request, charge, microphone access or desktop input is performed.
const {_electron:electron,expect}=require('playwright/test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bebo-usage-native-'));
 const options={executablePath:process.argv[2]?path.resolve(process.argv[2]):require('electron'),args:[...(process.argv[2]?[]:['.']),`--user-data-dir=${profile}`],env,timeout:30000};
 let app=await electron.launch(options);
 try{
  let page=await app.firstWindow();await page.waitForSelector('h1');
  await app.evaluate(({shell})=>{
   globalThis.openedLink='';shell.openExternal=async url=>{globalThis.openedLink=url;};
   globalThis.fetch=async url=>{
    if(String(url).includes('/models/'))return new Response('{}');
    if(String(url).endsWith('/audio/transcriptions'))return new Response(JSON.stringify({text:'Testing usage only',usage:{type:'duration',seconds:12.5}}));
    if(String(url).endsWith('/responses'))return new Response(JSON.stringify({model:'gpt-6-luna',service_tier:'default',usage:{input_tokens:1000,output_tokens:200,input_tokens_details:{cached_tokens:300,cache_write_tokens:100}},output:[{content:[{type:'output_text',text:JSON.stringify({type:'done',x:0,y:0,text:'',reason:'Local usage test complete.'})}]}]}));
    throw Error('Unexpected endpoint');
   };
  });
  await page.evaluate(()=>window.bebo.workConfigure({mode:'screen'}));
  await page.evaluate(()=>window.bebo.connect('local-test-key-never-sent'));assert.equal((await page.evaluate(()=>window.bebo.usageGet('all'))).totals.requests,0);
  await page.evaluate(()=>window.bebo.plan('Test the usage ledger.'));await page.evaluate(()=>window.bebo.transcribe(new Uint8Array(1000),'audio/webm','en'));
  const first=await page.evaluate(()=>window.bebo.usageGet('all'));assert.equal(first.totals.totalTokens,1200);assert.equal(first.totals.requests,2);assert.equal(first.totals.audioSeconds,12.5);assert.ok(Math.abs(first.totals.estimatedUsd-.001113)<1e-12);
  await page.getByRole('button',{name:'Usage',exact:true}).click();await expect(page.getByTestId('usage-tokens')).toHaveText('1,200');await expect(page.getByTestId('usage-cost')).toHaveText('$0.001113');
  await page.getByRole('button',{name:'OpenAI billing'}).click();assert.equal(await app.evaluate(()=>globalThis.openedLink),'https://platform.openai.com/usage');
  await page.evaluate(()=>localStorage.setItem('bebo-history',JSON.stringify([{text:'Test',detail:'Done',time:new Date().toISOString(),ok:true}])));await page.reload();await page.getByRole('button',{name:'Activity',exact:true}).click();await page.getByRole('button',{name:'Clear history'}).click();assert.equal((await page.evaluate(()=>window.bebo.usageGet('all'))).totals.totalTokens,1200);
  await app.close();app=await electron.launch(options);page=await app.firstWindow();await page.waitForSelector('h1');
  const restored=await page.evaluate(()=>window.bebo.usageGet('all'));assert.deepEqual(restored.totals,first.totals);
  await page.getByRole('button',{name:'Usage',exact:true}).click();await expect(page.getByTestId('usage-cost')).toHaveText('$0.001113');
  await page.screenshot({path:'artifacts/bebo-usage-native.png'});
  console.log('PASS: actual desktop and transcription paths record usage; billing link, Activity independence, USD precision and app restart verified. API replies mocked; no charges incurred.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
