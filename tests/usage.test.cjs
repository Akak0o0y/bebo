const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {UsageStore,measure}=require('../electron/usage-store.cjs');
const {TranscriptionService}=require('../electron/transcription-service.cjs');
const directory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'bebo-usage-'));
const reply=(input=1000,output=200,cached=300,write=100)=>({model:'gpt-6-luna-2026-09-22',service_tier:'default',usage:{input_tokens:input,output_tokens:output,input_tokens_details:{cached_tokens:cached,cache_write_tokens:write},output_tokens_details:{reasoning_tokens:80}}});
test('USD estimate separates cached reads and writes; output already includes reasoning',()=>{
 const measured=measure('desktop',reply());assert.equal(measured.totalTokens,1200);assert.equal(measured.outputTokens,200);assert.ok(Math.abs(measured.estimatedUsd-.0001755)<1e-12);
 assert.ok(Math.abs(measure('desktop',{...reply(),service_tier:'fast'}).estimatedUsd-.000351)<1e-12);
 assert.ok(Math.abs(measure('desktop',{...reply(),service_tier:'flex'}).estimatedUsd-.00008775)<1e-12);
 assert.equal(measure('desktop',reply(272000,200,0,0)).estimatedUsd,(272000*.1+200*.5)/1e6);
 assert.equal(measure('desktop',reply(272001,200,0,0)).estimatedUsd,(272001*.2+200*.75)/1e6);
});
test('duration-billed voice has cost without invented tokens; unsupported metadata stays unknown',()=>{
 const measured=measure('transcription',{usage:{type:'duration',seconds:30}});assert.equal(measured.totalTokens,null);assert.equal(measured.estimatedUsd,.00225);
 assert.equal(measure('transcription',{usage:{type:'tokens',input_tokens:5,output_tokens:8}}).estimatedUsd,null);
 for(const data of [{},reply(-1),reply(100,20,200),{...reply(),service_tier:'unknown'},{...reply(),model:'another-model'}])assert.equal(measure('desktop',data).estimatedUsd,null);
});
test('usage survives restart, keeps monetary precision, and filters by local calendar periods',async()=>{
 const root=directory();let when=new Date(2026,9,6,12);const store=new UsageStore(root,{now:()=>when});
 await store.track('desktop','gpt-6-luna',async()=>reply());when=new Date(2026,9,7,12);
 await store.track('transcription','gpt-transcribe',async()=>({text:'private words never persisted',usage:{type:'duration',seconds:30}}));
 when=new Date(2026,10,1,12);await store.track('desktop','gpt-6-luna',async()=>reply());
 const restored=new UsageStore(root,{now:()=>when});assert.equal(restored.snapshot().totals.totalTokens,2400);assert.equal(restored.snapshot('month').totals.requests,1);assert.equal(restored.snapshot('today').totals.requests,1);
 assert.ok(Math.abs(restored.snapshot().totals.estimatedUsd-.002601)<1e-12);assert.equal(restored.snapshot().recent[0].rateDate,'2026-10-07');
 assert.equal(fs.readFileSync(store.file,'utf8').includes('private words'),false);assert.throws(()=>restored.snapshot('tomorrow'),/Invalid/);
});
test('concurrent requests, cancellation, empty usage and restart-pending calls cannot silently disappear',async()=>{
 const root=directory(),store=new UsageStore(root);let release;
 const first=store.track('desktop','gpt-6-luna',()=>new Promise(resolve=>{release=resolve;}));assert.equal(store.snapshot().totals.pendingRequests,1);
 await store.track('transcription','gpt-transcribe',async()=>({usage:{type:'duration',seconds:1}}));
 const reboot=new UsageStore(root);assert.equal(reboot.snapshot().totals.unknownRequests,1);assert.equal(reboot.snapshot().totals.pendingRequests,0);
 release(reply());await first;await assert.rejects(store.track('desktop','gpt-6-luna',async()=>{throw Error('aborted');}),/aborted/);
 await store.track('desktop','gpt-6-luna',async()=>({}));const totals=store.snapshot().totals;
 assert.equal(totals.requests,4);assert.equal(totals.pricedRequests,2);assert.equal(totals.unknownRequests,2);assert.equal(totals.totalTokens,1200);
});
test('unreadable history is preserved; failed writes do not block a paid request',async()=>{
 const root=directory(),file=path.join(root,'usage-ledger.json');fs.writeFileSync(file,'broken-ledger');
 const store=new UsageStore(root);await store.track('desktop','gpt-6-luna',async()=>reply());assert.match(store.snapshot().warning,/incomplete/);assert.equal(fs.readFileSync(file,'utf8'),'broken-ledger');
 const blocked=directory(),blockedStore=new UsageStore(blocked);fs.mkdirSync(blockedStore.file+'.tmp');await blockedStore.track('desktop','gpt-6-luna',async()=>reply());assert.match(blockedStore.snapshot().warning,/could not be saved/);assert.equal(blockedStore.snapshot().totals.totalTokens,1200);
});
test('transcription records reported billing before rejecting empty or late words',async()=>{
 const store=new UsageStore(directory());const service=new TranscriptionService(()=> 'test-key',async()=>new Response(JSON.stringify({text:'',usage:{type:'duration',seconds:10}})),(...args)=>store.track(...args));
 await assert.rejects(service.transcribe(new Uint8Array(1000),'audio/webm','en'),/hear any words/);assert.equal(store.snapshot().totals.audioSeconds,10);
 let release;service.request=()=>new Promise(resolve=>{release=resolve;});const pending=service.transcribe(new Uint8Array(1000),'audio/webm','en');service.cancel();release(new Response(JSON.stringify({text:'late',usage:{type:'duration',seconds:5}})));await assert.rejects(pending,/stopped/);
 assert.equal(store.snapshot().totals.audioSeconds,15);assert.equal(store.snapshot().totals.pricedRequests,2);
});
