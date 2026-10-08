const fs = require('node:fs');
const path = require('node:path');
class EffectSettings {
  constructor(directory) { this.file=path.join(directory,'screen-effects.json');this.value={cursor:true,dust:true,edges:true};try{const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));for(const key of Object.keys(this.value))if(typeof saved[key]==='boolean')this.value[key]=saved[key];}catch{} }
  update(patch) {
    if(!patch||typeof patch!=='object'||Object.keys(patch).some(key=>!Object.hasOwn(this.value,key)||typeof patch[key]!=='boolean'))throw new Error('Invalid screen effect setting.');
    const next={...this.value,...patch};fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(next));fs.renameSync(this.file+'.tmp',this.file);this.value=next;return {...next};
  }
}
module.exports={EffectSettings};
