import { useEffect, useState } from 'react';
import { AudioLines, Coins, ExternalLink, Layers3, ArrowDownLeft, ArrowUpRight, RefreshCw, Info, Monitor } from 'lucide-react';
import type { UsagePeriod, UsageSnapshot, UsageTotals } from '../usage-types';
import './usage.css';

const number = (value:number)=>value.toLocaleString();
export function usd(value:number){return value>0&&value<.000001?'<$0.000001':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:6}).format(value);}
const duration=(seconds:number)=>`${number(Math.round(seconds*10)/10)} sec`;
function estimate(totals:UsageTotals){return totals.requests&&!totals.pricedRequests?'—':usd(totals.estimatedUsd);}
export function UsagePage(){
 const [period,setPeriod]=useState<UsagePeriod>('all'),[data,setData]=useState<UsageSnapshot|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
 const desktop=!!window.bebo?.usageGet;
 useEffect(()=>{
  if(!desktop)return;
  let alive=true,generation=0;
  const read=async()=>{const current=++generation;setLoading(true);try{const value=await window.bebo!.usageGet!(period);if(alive&&current===generation){setData(value);setError('');}}catch{if(alive&&current===generation)setError('Could not read your usage. Try refreshing.');}finally{if(alive&&current===generation)setLoading(false);}};
  void read();const off=window.bebo?.onUsageChanged?.(()=>void read());
  const onFocus=()=>void read();window.addEventListener('focus',onFocus);
  // Refresh date boundaries while the page remains open overnight.
  const timer=setInterval(()=>void read(),60000);
  return()=>{alive=false;off?.();clearInterval(timer);window.removeEventListener('focus',onFocus);};
 },[period,revision,desktop]);
 async function openLink(kind:'billing'|'pricing'){
  try{const open=kind==='billing'?window.bebo?.usageBilling:window.bebo?.usagePricing;if(open)await open();else window.open(kind==='billing'?'https://platform.openai.com/usage':'https://developers.openai.com/api/docs/pricing','_blank','noopener,noreferrer');}
  catch{setError('The browser could not open. Try again.');}
 }
 const current=data?.period===period?data:null,t=current?.totals;
 return <section className="usage-page" aria-label="Bebo usage and cost">
  <div className="usage-toolbar"><div className="usage-periods" role="group" aria-label="Usage period">{([['today','Today'],['month','This month'],['all','All tracked']] as const).map(([value,label])=><button key={value} aria-pressed={period===value} onClick={()=>setPeriod(value)}>{label}</button>)}</div><button className="text-button" onClick={()=>void openLink('billing')}>OpenAI billing <ExternalLink size={13}/></button></div>
  {!desktop?<div className="usage-unavailable"><Monitor size={28}/><h2>Your real usage lives in Bebo.</h2><p>Open the Windows app to see recorded tokens and costs. This browser preview has no access to your usage history.</p></div>:<>
   {error&&<div className="usage-warning" role="alert">{error}<button className="text-button" onClick={()=>setRevision(value=>value+1)}><RefreshCw size={13}/>Retry</button></div>}
   {!current?<div className="usage-unavailable" role="status">{loading?'Reading your usage…':'Usage is unavailable.'}</div>:<>
    {current.warning&&<div className="usage-warning" role="alert">{current.warning}</div>}
    <div className="usage-metrics" aria-busy={loading}>
     <article className="usage-metric cost"><span><Coins size={17}/>ESTIMATED SPEND · USD</span><strong data-testid="usage-cost">{estimate(t!)}</strong><p>{t!.unknownRequests||t!.pendingRequests?'Known charges so far · total incomplete':'From recorded Bebo API requests'}</p></article>
     <article className="usage-metric"><span><Layers3 size={17}/>REPORTED TOKENS</span><strong data-testid="usage-tokens">{t!.requests&&!t!.tokenRequests?'—':number(t!.totalTokens)}</strong><p>Input + output, including reasoning</p></article>
     <article className="usage-metric"><span><AudioLines size={17}/>VOICE TRANSCRIBED</span><strong>{duration(t!.audioSeconds)}</strong><p>Recorded duration reported by OpenAI</p></article>
    </div>
    <div className="usage-token-strip"><span><ArrowDownLeft size={15}/><b>{number(t!.inputTokens)}</b> input</span><span><ArrowUpRight size={15}/><b>{number(t!.outputTokens)}</b> output</span><span><b>{number(t!.cachedTokens)}</b> cached reads</span><span><b>{number(t!.cacheWriteTokens)}</b> cache writes</span><span><b>{number(t!.requests)}</b> API requests</span></div>
    {(t!.unknownRequests>0||t!.pendingRequests>0)&&<div className="usage-warning"><Info size={16}/><p>{t!.pendingRequests>0?`${t!.pendingRequests} request(s) still waiting for usage. `:''}{t!.unknownRequests>0?`${t!.unknownRequests} request(s) have no cost estimate, including calls without usage or with an interrupted connection. `:''}These are excluded from the dollar total; check OpenAI billing for final charges.</p></div>}
    <div className="usage-models">{current.models.map(model=><article key={model.kind}><span className={`usage-model-icon ${model.kind}`}>{model.kind==='desktop'?<Monitor size={20}/>:<AudioLines size={20}/>}</span><div><h2>{model.kind==='desktop'?'Desktop intelligence':'Voice understanding'}</h2><p>{model.model} · {number(model.requests)} requests</p></div><strong>{estimate(model)}</strong></article>)}</div>
    <section className="usage-history"><div className="usage-section-title"><h2>Recent API requests</h2><span>Latest 50 in this period</span></div>{current.recent.length?<div className="usage-table-scroll"><table><thead><tr><th>When</th><th>Model</th><th>Consumption</th><th>Estimated cost</th></tr></thead><tbody>{current.recent.map(entry=><tr key={entry.id}><td><time dateTime={entry.at}>{new Date(entry.at).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></td><td>{entry.model}<small>{entry.kind==='desktop'?'Desktop step':'Transcription'}</small></td><td>{entry.audioSeconds!==null?duration(entry.audioSeconds):entry.totalTokens!==null?`${number(entry.totalTokens)} tokens`:'Not reported'}</td><td>{entry.estimatedUsd===null?<span className="usage-pending">{entry.status==='pending'?'In progress':'Unavailable'}</span>:usd(entry.estimatedUsd)}</td></tr>)}</tbody></table></div>:<div className="usage-empty"><Layers3 size={24}/><b>No requests recorded in this period.</b><p>Ask Bebo to do something and its API usage will appear here.</p></div>}</section>
    <div className="usage-scope"><Info size={16}/><p>Tracking started {new Date(current.startedAt).toLocaleString([],{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})}. <b>Earlier usage is unavailable here.</b> Includes desktop, avatar and phone requests made through this Bebo profile. Clearing Activity does not clear usage.</p></div>
    <details className="usage-rates"><summary>How the estimate works <span>Rates checked {current.pricing.date}</span></summary><p>USD estimates use OpenAI’s public rates and the usage returned by each API request. They exclude taxes, credits, custom discounts and activity in other apps. Stopped or disconnected requests may still incur charges. Each request keeps the rate used when it was recorded.</p><p>Luna standard rates per million tokens: ${current.pricing.luna.input} input, ${current.pricing.luna.cached} cached reads, ${current.pricing.luna.cacheWrite} cache writes, ${current.pricing.luna.output} output. Long-context and returned processing-tier rates are applied when relevant. Cached tokens are part of input; reasoning tokens are part of output.</p><p>GPT-Transcribe: ${current.pricing.transcriptionPerMinute} per audio minute. Its duration-based responses do not provide token counts. Bebo’s local Kokoro voice replies and device dictation add no OpenAI API charge.</p><button className="text-button" onClick={()=>void openLink('pricing')}>View official pricing <ExternalLink size={13}/></button></details>
   </>}
  </>}
 </section>;
}
