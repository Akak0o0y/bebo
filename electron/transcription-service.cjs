const MAX_AUDIO=12*1024*1024;
const extensions={'audio/webm':'webm','audio/mp4':'m4a','audio/mpeg':'mp3','audio/wav':'wav','audio/x-wav':'wav','audio/ogg':'ogg'};
function validateAudio(bytes,mime,language){
 const format=typeof mime==='string'?mime.split(';')[0].trim():'';
 if(!(bytes instanceof Uint8Array)||bytes.length<100||bytes.length>MAX_AUDIO)throw Error('Record a short voice request, up to one minute.');
 if(!Object.hasOwn(extensions,format))throw Error('This audio format is not supported.');
 if(!['en','ar'].includes(language))throw Error('Choose English or Arabic for voice input.');
 return{format,extension:extensions[format]};
}
class TranscriptionService{
 constructor(getKey,request=(...args)=>fetch(...args),track=(_kind,_model,request)=>request()){this.getKey=getKey;this.request=request;this.track=track;this.controller=null;}
 cancel(){this.controller?.abort();this.controller=null;}
 async transcribe(bytes,mime,language='en',signal){
  const {format,extension}=validateAudio(bytes,mime,language),key=this.getKey();
  if(!key)throw Error('Connect Luna in the desktop app before using enhanced transcription.');
  if(this.controller)throw Error('Bebo is already transcribing. Wait a moment or press Stop.');
  const controller=new AbortController();this.controller=controller;
  const form=new FormData();form.append('file',new Blob([bytes],{type:format}),`request.${extension}`);form.append('model','gpt-transcribe');form.append('response_format','json');form.append('language',language);form.append('keywords[]','Bebo');
  try{
   const signals=[controller.signal,AbortSignal.timeout(45000),...(signal?[signal]:[])];
   const data=await this.track('transcription','gpt-transcribe',async()=>{
   const response=await this.request('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form,signal:AbortSignal.any(signals)});
   if(!response.ok)throw Error(response.status===401?'The API key was not accepted. Reconnect Luna.':response.status===429?'Transcription reached your API usage limit. Check credits or choose Device recognition in Settings.':response.status===403||response.status===404?'GPT-Transcribe is unavailable for this account. Check model access or choose Device recognition in Settings.':`Transcription failed (${response.status}). Try speaking again.`);
   return response.json();});if(controller.signal.aborted||signal?.aborted)throw Error('Transcription stopped.');
   if(typeof data.text!=='string'||!data.text.trim())throw Error('I didn’t hear any words. Try again a little closer to the microphone.');
   if(data.text.length>4000)throw Error('That request is too long. Try a shorter recording.');
   return data.text.trim();
  }finally{if(this.controller===controller)this.controller=null;}
 }
}
module.exports={TranscriptionService,validateAudio,MAX_AUDIO};
