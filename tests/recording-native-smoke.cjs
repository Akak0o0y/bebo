// Real microphone capture; the transcription endpoint is mocked inside this
// isolated Electron process. No audio or credentials go to a provider.
const {_electron:electron}=require('playwright/test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bebo-recording-'));
 const app=await electron.launch({executablePath:process.argv[2]?path.resolve(process.argv[2]):require('electron'),args:[...process.argv[2]?[]:['.'],`--user-data-dir=${profile}`],env,timeout:30000});
 try{
  const page=await app.firstWindow();await page.waitForSelector('h1');
  await app.evaluate(()=>{globalThis.audioCheck=null;globalThis.fetch=async(url,options)=>{
   if(String(url).includes('/models/'))return new Response('{}');
   if(!String(url).endsWith('/audio/transcriptions'))throw Error('Unexpected provider request');
   const file=options.body.get('file');globalThis.audioCheck={bytes:file.size,mime:file.type,model:options.body.get('model'),language:options.body.get('language')};
   return new Response(JSON.stringify({text:'Local microphone transport check'}));
  };});
  await page.evaluate(()=>window.bebo.connect('local-test-key-never-sent'));
  const transcript=await page.evaluate(async()=>{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
   try{
    const recorder=new MediaRecorder(stream,{mimeType:'audio/webm;codecs=opus'});const chunks=[];
    const blob=await new Promise((resolve,reject)=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onerror=()=>reject(Error('Microphone capture failed'));recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType}));recorder.start();setTimeout(()=>recorder.stop(),450);});
    return await window.bebo.transcribe(new Uint8Array(await blob.arrayBuffer()),blob.type,'en');
   }finally{stream.getTracks().forEach(track=>track.stop());}
  });
  assert.equal(transcript,'Local microphone transport check');const details=await app.evaluate(()=>globalThis.audioCheck);
  assert.ok(details.bytes>=100);assert.equal(details.model,'gpt-transcribe');assert.equal(details.language,'en');
  console.log('PASS: real Windows microphone recording, audio bytes over isolated IPC, GPT-Transcribe multipart request. Provider response mocked; no audio sent externally.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
