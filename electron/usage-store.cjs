const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// USD public API rates verified 2026-10-07. Save each estimate with its rate date;
// future pricing updates must not silently reprice historical requests.
const PRICING = Object.freeze({ date: '2026-10-07', source: 'https://developers.openai.com/api/docs/pricing',
  luna: { input: .10, cached: .01, cacheWrite: .125, output: .50, longInput: .20, longCached: .02, longCacheWrite: .25, longOutput: .75, longThreshold: 272000 },
  transcriptionPerMinute: .0045 });
const count = value => Number.isSafeInteger(value) && value >= 0;
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function measure(kind, data = {}) {
  const usage = data?.usage;
  let inputTokens=null, outputTokens=null, cachedTokens=null, cacheWriteTokens=null, audioSeconds=null, estimatedUsd=null;
  if (count(usage?.input_tokens) && count(usage?.output_tokens) && count(usage.input_tokens+usage.output_tokens)) {
    inputTokens=usage.input_tokens; outputTokens=usage.output_tokens;
    if (kind === 'desktop') {
      const details=usage.input_tokens_details || {};
      const cached=details.cached_tokens ?? 0, written=details.cache_write_tokens ?? 0;
      if (count(cached) && count(written) && cached+written<=inputTokens) { cachedTokens=cached; cacheWriteTokens=written; }
    }
  }
  if (kind === 'transcription' && usage?.type === 'duration' && nonnegative(usage.seconds)) {
    audioSeconds=usage.seconds; estimatedUsd=audioSeconds/60*PRICING.transcriptionPerMinute;
  }
  const model=typeof data?.model==='string'?data.model:'';
  const supportedModel=!model || model==='gpt-6-luna' || /^gpt-6-luna-\d{4}-\d{2}-\d{2}$/.test(model);
  const tier=data?.service_tier || 'default';
  const factor={default:1,standard:1,flex:.5,priority:2,fast:2}[tier];
  if (kind==='desktop' && supportedModel && factor && inputTokens!==null && outputTokens!==null && cachedTokens!==null) {
    const long=inputTokens>PRICING.luna.longThreshold, p=PRICING.luna;
    estimatedUsd=((inputTokens-cachedTokens-cacheWriteTokens)*(long?p.longInput:p.input)+cachedTokens*(long?p.longCached:p.cached)+cacheWriteTokens*(long?p.longCacheWrite:p.cacheWrite)+outputTokens*(long?p.longOutput:p.output))*factor/1e6;
  }
  return { inputTokens, outputTokens, cachedTokens, cacheWriteTokens, audioSeconds, estimatedUsd,
    totalTokens:inputTokens===null?null:inputTokens+outputTokens, rateDate:PRICING.date };
}

function summarize(entries) {
  const totals={requests:entries.length, inputTokens:0, outputTokens:0, totalTokens:0, cachedTokens:0, cacheWriteTokens:0, audioSeconds:0, estimatedUsd:0, pricedRequests:0, unknownRequests:0, pendingRequests:0, tokenRequests:0};
  for(const entry of entries) {
    for(const key of ['inputTokens','outputTokens','totalTokens','cachedTokens','cacheWriteTokens','audioSeconds']) totals[key]+=entry[key]??0;
    if(entry.estimatedUsd!==null){totals.estimatedUsd+=entry.estimatedUsd;totals.pricedRequests++;}
    else if(entry.status==='pending')totals.pendingRequests++;
    else totals.unknownRequests++;
    if(entry.totalTokens!==null)totals.tokenRequests++;
  }
  return totals;
}

class UsageStore {
  constructor(root,{now=()=>new Date(),onChange=()=>{}}={}) {
    this.file=path.join(root,'usage-ledger.json');this.now=now;this.onChange=onChange;this.warning='';this.readFailed=false;
    this.data={version:1,startedAt:this.now().toISOString(),entries:[]};
    try {
      const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));
      if(saved.version!==1 || !Number.isFinite(Date.parse(saved.startedAt)) || !Array.isArray(saved.entries) || !saved.entries.every(validEntry))throw Error('Invalid ledger');
      this.data=saved;
      for(const entry of this.data.entries)if(entry.status==='pending')entry.status='unconfirmed';
    }catch(error){if(error.code!=='ENOENT'){this.readFailed=true;this.warning='Earlier usage could not be read. Its file has been preserved; these totals are incomplete.';}}
    this.save();
  }
  save() {
    if(this.readFailed)return;
    try {fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.data));fs.renameSync(this.file+'.tmp',this.file);this.warning='';}
    catch {this.warning='Usage could not be saved. Current totals may be lost when Bebo closes.';}
  }
  changed(){this.save();try{this.onChange();}catch{/* A closing renderer cannot interrupt an API request or its ledger write. */}}
  async track(kind,model,request) {
    const entry={id:randomUUID(),at:this.now().toISOString(),kind,model,status:'pending',...measure(kind)};
    this.data.entries.push(entry);this.changed();
    try {
      const data=await request();Object.assign(entry,measure(kind,data),{status:'reported'});this.changed();return data;
    }catch(error){entry.status='unconfirmed';this.changed();throw error;}
  }
  snapshot(period='all') {
    if(!['today','month','all'].includes(period))throw Error('Invalid usage period.');
    const now=this.now(), boundary=new Date(now);
    if(period==='today')boundary.setHours(0,0,0,0);
    if(period==='month'){boundary.setDate(1);boundary.setHours(0,0,0,0);}
    const entries=this.data.entries.filter(entry=>period==='all'||new Date(entry.at)>=boundary);
    return {period,startedAt:this.data.startedAt,warning:this.warning,pricing:PRICING,totals:summarize(entries),
      models:['desktop','transcription'].map(kind=>({kind,model:kind==='desktop'?'gpt-6-luna':'gpt-transcribe',...summarize(entries.filter(entry=>entry.kind===kind))})),
      recent:entries.slice(-50).reverse()};
  }
}
function validEntry(entry) {
  return entry && typeof entry.id==='string' && Number.isFinite(Date.parse(entry.at)) && ['desktop','transcription'].includes(entry.kind) &&
    typeof entry.model==='string' && ['pending','reported','unconfirmed'].includes(entry.status) && typeof entry.rateDate==='string' &&
    ['inputTokens','outputTokens','totalTokens','cachedTokens','cacheWriteTokens'].every(key=>entry[key]===null||count(entry[key])) &&
    ['audioSeconds','estimatedUsd'].every(key=>entry[key]===null||nonnegative(entry[key]));
}
module.exports={UsageStore,measure,summarize,PRICING};
