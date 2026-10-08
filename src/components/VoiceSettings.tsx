import { useEffect, useState } from 'react';
import { Play, Square, MousePointer2, Volume2 } from 'lucide-react';
import { voiceOptions, useBeboVoice } from './useBeboVoice';
import './voice-settings.css';
import type { ScreenEffects } from '../phone/types';

export function VoiceSettings({ voice }: { voice: ReturnType<typeof useBeboVoice> }) {
  return <div className="bebo-voice-settings">
    <label htmlFor="bebo-voice"><Volume2 size={16} /> A voice of his own</label>
    <p>{window.bebo?.voiceGenerate ? 'Free, natural English voices. Generated on your laptop.' : 'Device voice preview. Open the Windows app for free natural voices.'}</p>
    <div className="voice-select-row"><select id="bebo-voice" value={voice.voice} onChange={event => voice.setVoice(event.target.value)}>{voiceOptions.map(option => <option key={option.id} value={option.id} disabled={option.id !== 'device' && !window.bebo?.voiceGenerate}>{option.label}</option>)}</select><button className="text-button" onClick={() => voice.phase === 'idle' ? void voice.speak('Hey, I’m Bebo. Your little sidekick. Tell me what you need, and we’ll take it one step at a time.', true) : voice.stop()}>{voice.phase === 'idle' ? <Play size={14} /> : <Square size={14} />}{voice.phase === 'generating' ? 'Preparing…' : voice.phase === 'speaking' ? 'Stop voice' : 'Hear Bebo'}</button></div>
    <small>No subscription or voice API key. Choose Device voice for Arabic.</small>
    {voice.error && <p role="alert" className="voice-error">{voice.error}</p>}
  </div>;
}

export function CursorSettings({color='ember',calm=false}:{color?:string;calm?:boolean}) {
  const [effects, setEffects] = useState<ScreenEffects>({cursor:true,dust:true,edges:true});
  const [error, setError] = useState('');
  useEffect(() => { let alive=true,received=false;const off=window.bebo?.onEffectsChanged?.(value=>{received=true;setEffects(value);});void window.bebo?.effectsGet?.().then(value=>{if(alive&&!received)setEffects(value);}).catch(e=>setError(e.message));return()=>{alive=false;off?.();}; }, []);
  async function update(patch:Partial<ScreenEffects>){setError('');try{if(window.bebo?.effectsSet)setEffects(await window.bebo.effectsSet(patch));else setEffects(value=>({...value,...patch}));}catch(e){setError(String(e));}}
  return <div className="bebo-cursor-settings"><b><MousePointer2 size={16}/> A little presence</b><p>Flowing black-and-white ink inside a precise pointer. Fine black dust follows each move and scatters with a click.</p><iframe className="cursor-playground-frame" title="Interactive Bebo cursor playground" src={`./cursor-preview/cursor.html?demo=1&color=${encodeURIComponent(color)}&calm=${calm}&dust=${effects.dust}`} /><p className="cursor-playground-note">Try him here. On your desktop, he follows Bebo’s real actions.</p>{([{key:'cursor',label:'Visible Bebo cursor',detail:'Follow his pointer while he works.'},{key:'dust',label:'Tiny dust particles',detail:'A trail behind Bebo and his cursor.'},{key:'edges',label:'Screen-edge dust',detail:'Black dust and a soft shadow only while Bebo controls your computer.'}] as const).map(item=><div className="setting-row" key={item.key}><div><b>{item.label}</b><p>{item.detail}</p></div><button className={`toggle ${effects[item.key]?'on':''}`} role="switch" aria-checked={effects[item.key]} aria-label={item.label} onClick={()=>void update({[item.key]:!effects[item.key]})}><span/></button></div>)}<button className="text-button" disabled={!window.bebo?.cursorPreview||!Object.values(effects).some(Boolean)} onClick={async () => { setError(''); try { await window.bebo?.cursorPreview?.(); } catch (e) { setError(String(e)); } }}>Preview cursor for 5 seconds</button><button className="text-button" onClick={()=>void update({cursor:false,dust:false,edges:false})}>Turn off all screen effects</button>{error && <p role="alert" className="voice-error">{error}</p>}</div>;
}
