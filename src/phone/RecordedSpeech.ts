export type Transcribe = (audio: Blob, language: string, signal: AbortSignal) => Promise<string>;

/** MediaRecorder adapter with the same completion events as browser recognition. */
export class RecordedSpeech {
  lang='en-US'; continuous=true; interimResults=false;
  onresult?: (event:any)=>void; onend?: ()=>void; onerror?: (event:any)=>void;
  private recorder:MediaRecorder|null=null;
  private stream:MediaStream|null=null;
  private controller=new AbortController();
  private stopped=false; private chunks:Blob[]=[]; private bytes=0;
  constructor(private transcribe:Transcribe){}
  start(){void this.capture();}
  private async capture(){
    try{
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('Microphone recording is unavailable in this browser. Open Bebo in Safari or use Device recognition.');
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      if(this.stopped||this.controller.signal.aborted){stream.getTracks().forEach(track=>track.stop());return;}
      this.stream=stream;
      const mimeType=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));
      const recorder=this.recorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined);
      recorder.ondataavailable=event=>{if(this.controller.signal.aborted)return;this.bytes+=event.data.size;if(this.bytes>12*1024*1024){this.fail('That recording is too long. Try a shorter request.');return;}this.chunks.push(event.data);};
      recorder.onerror=()=>this.fail('The microphone stopped unexpectedly. Try recording again.');
      recorder.onstop=()=>{this.stream?.getTracks().forEach(track=>track.stop());void this.complete(recorder.mimeType);};
      recorder.start(250);
    }catch(error){if(!this.controller.signal.aborted)this.fail(error instanceof DOMException&&error.name==='NotAllowedError'?'Allow microphone access for Bebo, then try again.':error instanceof Error?error.message:'Microphone unavailable.');}
  }
  private async complete(mime:string){
    if(this.controller.signal.aborted)return;
    try{
      const audio=new Blob(this.chunks,{type:mime});this.chunks=[];
      if(audio.size<100)throw Error('I didn’t hear a recording. Hold Bebo a little longer.');
      const words=await this.transcribe(audio,this.lang.startsWith('ar')?'ar':'en',this.controller.signal);
      if(this.controller.signal.aborted)return;
      const result:any=[{transcript:words}];result.isFinal=true;this.onresult?.({results:[result]});this.onend?.();
    }catch(error){if(!this.controller.signal.aborted)this.fail(error instanceof Error?error.message:'Transcription failed. Try again.');}
  }
  private fail(message:string){this.abort();this.onerror?.({error:'recording',message});}
  stop(){
    this.stopped=true;
    if(this.recorder?.state==='recording')this.recorder.stop();
    else if(!this.recorder){this.abort();this.onerror?.({error:'recording',message:'Microphone permission is ready. Hold Bebo again to record.'});}
  }
  abort(){this.controller.abort();this.stopped=true;if(this.recorder?.state==='recording')this.recorder.stop();this.stream?.getTracks().forEach(track=>track.stop());this.chunks=[];}
}

export async function transcribeOnDesktop(audio:Blob,language:string,signal:AbortSignal){
  const bytes=new Uint8Array(await audio.arrayBuffer());if(signal.aborted)throw Error('Recording stopped.');
  const stop=()=>{void window.bebo?.transcriptionStop?.().catch(()=>{});};signal.addEventListener('abort',stop,{once:true});
  try{return await window.bebo!.transcribe!(bytes,audio.type,language);}finally{signal.removeEventListener('abort',stop);}
}
