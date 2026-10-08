const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {TranscriptionService,validateAudio,MAX_AUDIO}=require('../electron/transcription-service.cjs');
const {AssistantSettings}=require('../electron/assistant-settings.cjs');
test('transcription sends bounded English audio to GPT-Transcribe and returns only the transcript',async()=>{
 let calls=0;const service=new TranscriptionService(()=> 'test-key',async(url,request)=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');assert.equal(request.headers.Authorization,'Bearer test-key');
  assert.equal(request.body.get('model'),'gpt-transcribe');assert.equal(request.body.get('language'),'en');assert.equal(request.body.get('keywords[]'),'Bebo');
  assert.equal(request.body.get('file').name,'request.webm');assert.equal(request.body.get('file').size,1000);return new Response(JSON.stringify({text:' Open Chrome. '}));
 });
 assert.equal(await service.transcribe(new Uint8Array(1000),'audio/webm;codecs=opus','en'),'Open Chrome.');assert.equal(calls,1);
 assert.throws(()=>validateAudio(new Uint8Array(MAX_AUDIO+1),'audio/webm','en'),/short/);
 assert.throws(()=>validateAudio(new Uint8Array(1000),'text/html','en'),/format/);
 assert.throws(()=>validateAudio(new Uint8Array(1000),'audio/webm','xx'),/English/);
 await assert.rejects(new TranscriptionService(()=> '').transcribe(new Uint8Array(1000),'audio/mp4','en'),/Connect Luna/);
});
test('stopped or failed transcription cannot return a late transcript',async()=>{
 let release;const service=new TranscriptionService(()=> 'key',()=>new Promise(resolve=>{release=resolve;}));
 const pending=service.transcribe(new Uint8Array(1000),'audio/mp4','en');
 await assert.rejects(service.transcribe(new Uint8Array(1000),'audio/mp4','en'),/already/);
 service.cancel();release(new Response(JSON.stringify({text:'late words'})));await assert.rejects(pending,/stopped/);
 await assert.rejects(new TranscriptionService(()=> 'key',async()=>new Response('{}',{status:429})).transcribe(new Uint8Array(1000),'audio/mp4','en'),/usage limit/);
});
test('automatic permissions persist, apply only to selected actions, and never auto-answer questions',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bebo-permissions-')),settings=new AssistantSettings(root);
 assert.equal(settings.allows({type:'click'}),false);settings.update({autoActions:['click','type']});
 const restored=new AssistantSettings(root);assert.equal(restored.allows({type:'click'}),true);assert.equal(restored.allows({type:'type'}),true);
 for(const type of ['key','scroll','ask','done','blocked'])assert.equal(restored.allows({type}),false);
 assert.throws(()=>restored.update({autoActions:['ask']}),/Invalid/);restored.update({autoActions:[]});assert.equal(restored.allows({type:'click'}),false);
});
