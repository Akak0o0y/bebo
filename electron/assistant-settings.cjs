const fs=require('node:fs'),path=require('node:path');
const actionTypes=['click','double_click','scroll','type','key'];
const defaults={transcription:'gpt-transcribe',autoActions:[]};
function validate(patch){
 if(!patch||typeof patch!=='object'||Object.keys(patch).some(key=>!Object.hasOwn(defaults,key)))throw Error('Invalid assistant setting.');
 if(Object.hasOwn(patch,'transcription')&&!['gpt-transcribe','device'].includes(patch.transcription))throw Error('Unknown transcription model.');
 if(Object.hasOwn(patch,'autoActions')&&(!Array.isArray(patch.autoActions)||patch.autoActions.length>actionTypes.length||new Set(patch.autoActions).size!==patch.autoActions.length||patch.autoActions.some(type=>!actionTypes.includes(type))))throw Error('Invalid automatic actions.');
}
class AssistantSettings{
 constructor(directory){this.file=path.join(directory,'assistant-settings.json');this.value={...defaults,autoActions:[]};try{const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));validate(saved);this.value={...this.value,...saved};}catch{}}
 update(patch){validate(patch);const next={...this.value,...patch};fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(next));fs.renameSync(this.file+'.tmp',this.file);this.value=next;return structuredClone(next);}
 allows(action){return actionTypes.includes(action.type)&&this.value.autoActions.includes(action.type);}
}
module.exports={AssistantSettings,actionTypes};
