import { useEffect, useState } from 'react';
import type { AssistantPreferences } from '../phone/types';

export function useAssistantPreferences(){
  const [preferences,setPreferences]=useState<AssistantPreferences>({transcription:'gpt-transcribe',autoActions:[]});
  useEffect(()=>{let alive=true,received=false;const off=window.bebo?.onAssistantChanged?.(value=>{received=true;setPreferences(value);});void window.bebo?.assistantGet?.().then(value=>{if(alive&&!received)setPreferences(value);}).catch(()=>{});return()=>{alive=false;off?.();};},[]);
  return{preferences,setPreferences};
}
const groups=[{label:'Mouse movement and clicks',types:['click','double_click','scroll']},{label:'Typing text',types:['type']},{label:'Keyboard shortcuts',types:['key']}];
export function AssistantSettings(){
  const {preferences,setPreferences}=useAssistantPreferences();const [error,setError]=useState(''),[saving,setSaving]=useState(false);
  async function update(patch:Partial<AssistantPreferences>){setSaving(true);setError('');try{if(!window.bebo?.assistantSet)throw Error('Open the Windows app to change these settings.');setPreferences(await window.bebo.assistantSet(patch));}catch(error){setError(error instanceof Error?error.message:String(error));}finally{setSaving(false);}}
  const all=groups.flatMap(group=>group.types);
  return <section className="assistant-settings">
    <label htmlFor="transcription-model"><b>Understand my voice</b></label>
    <select id="transcription-model" value={preferences.transcription} disabled={saving||!window.bebo?.assistantSet} onChange={event=>void update({transcription:event.target.value as AssistantPreferences['transcription']})}>
      <option value="gpt-transcribe">GPT-Transcribe · enhanced accuracy</option><option value="device">Device recognition · free</option>
    </select>
    <p>{preferences.transcription==='gpt-transcribe'?'Recorded audio is sent to OpenAI using your connected API account. API charges apply. English is selected on desktop; your phone also supports Arabic.':'Use Windows speech recognition on desktop and browser speech recognition on your phone.'}</p>
    <div className="setting-row"><div><b>Allow automatically</b><p>Carry out my requests without asking at every step.</p></div><button className={`toggle ${preferences.autoActions.length===all.length?'on':''}`} role="switch" aria-checked={preferences.autoActions.length===all.length} aria-label="Allow all supported actions automatically" disabled={saving||!window.bebo?.assistantSet} onClick={()=>void update({autoActions:preferences.autoActions.length===all.length?[]:all})}><span/></button></div>
    {groups.map(group=><label className="automatic-action" key={group.label}><input type="checkbox" checked={group.types.every(type=>preferences.autoActions.includes(type))} disabled={saving||!window.bebo?.assistantSet} onChange={event=>void update({autoActions:event.target.checked?[...new Set([...preferences.autoActions,...group.types])]:preferences.autoActions.filter(type=>!group.types.includes(type))})}/><span>{group.label}</span></label>)}
    <p>{preferences.autoActions.length?'Enabled actions run automatically within your request. Changing these choices stops the current task.':'Bebo asks before each desktop action.'} Questions still pause for your answer. Windows permissions remain in place.</p>
    <small>Stop anytime: Ctrl + Alt + Escape.</small>{error&&<p role="alert" className="voice-error">{error}</p>}
  </section>;
}
