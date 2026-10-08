"use client";
import { useEffect, useRef, useState } from 'react';
import { Hand, Heart, Music2, Sparkles } from 'lucide-react';
import { BeboAvatar } from './BeboAvatar';
import { avatarMoods, type AvatarEnergy, type AvatarMood } from '../avatar-state';
import { motionTokens } from '../motion';

export function AvatarCompanion({mood,color,energy,onTalk}:{mood:AvatarMood;color:string;energy:AvatarEnergy;onTalk:()=>void}){
 const [reaction,setReaction]=useState<AvatarMood|null>(null);
 const [expression,setExpression]=useState<AvatarMood>('idle');
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 useEffect(()=>{setReaction(null);if(timer.current)clearTimeout(timer.current);},[mood]);
 const play=(next:AvatarMood)=>{if(mood!=='idle')return;if(timer.current)clearTimeout(timer.current);setReaction(next);timer.current=setTimeout(()=>setReaction(null),motionTokens.duration.reaction);};
 const selected=mood==='idle'&&reaction?reaction:mood;
 const info=avatarMoods[mood==='idle'?expression:mood];
 return <div className="avatar-presence">
  <div className="avatar-theater">
   <div className="theater-orbit orbit-back"/><div className="theater-orbit orbit-front"/>
   <BeboAvatar mood={selected} color={color} energy={energy} onClick={onTalk} onExpressionChange={setExpression}/>
   <div className="avatar-state-tag" style={{'--state-color':info.color} as React.CSSProperties}><span/>{info.label}</div>
  </div>
  <div className="avatar-readout" aria-live="polite"><h2>{info.message}</h2><p>{mood==='idle'&&!reaction?'Eyes that follow. A heart that’s here for you.':info.detail}</p></div>
  <div className="avatar-play"><span>GET TO KNOW ME</span><div>{[{mood:'wave' as const,label:'Say hi',icon:Hand},{mood:'boop' as const,label:'Boop',icon:Heart},{mood:'dance' as const,label:'Dance',icon:Music2}].map(({mood:next,label,icon:Icon})=><button key={next} type="button" disabled={mood!=='idle'} aria-pressed={reaction===next} onClick={()=>play(next)}><Icon size={14}/>{label}</button>)}</div></div>
 </div>;
}

export function ExpressionStudio({color,energy,onEnergyChange}:{color:string;energy:AvatarEnergy;onEnergyChange:(energy:AvatarEnergy)=>void}){
 const [preview,setPreview]=useState<AvatarMood>('idle');
 const [expression,setExpression]=useState<AvatarMood>('idle');
 const info=avatarMoods[preview==='idle'?expression:preview];
 const moods:AvatarMood[]=['idle','listening','thinking','working','approval','success','help','speaking','sleeping','wave','boop','dance'];
 return <section className="expression-studio" aria-label="Bebo expression studio">
  <div className="studio-preview"><div className="studio-preview-top"><span><Sparkles size={13}/> EXPRESSION STUDIO</span><span className="preview-label">Preview only</span></div><div className="studio-avatar-stage"><div className="studio-orbit"/><BeboAvatar mood={preview} color={color} energy={energy} onExpressionChange={setExpression} label="Boop Bebo preview" onClick={()=>setPreview('boop')}/></div><div className="studio-expression-caption" aria-live="polite"><h2>{info.message}</h2><p>{info.label} · Expression preview</p></div></div>
  <div className="studio-controls"><div className="eyebrow">A FACE FOR EVERY LITTLE MOMENT</div><h2>You’ll know what’s on his mind.</h2><p>From a curious glance to a tiny victory dance.<br/>Try an expression and watch Bebo come to life.</p><div className="expression-grid">{moods.map(m=><button key={m} onClick={()=>setPreview(m)} aria-pressed={preview===m} aria-label={`Preview ${avatarMoods[m].label.toLowerCase()}`}><span style={{background:avatarMoods[m].color}}/>{avatarMoods[m].label}</button>)}</div><div className="motion-choice"><div><b>A little energy setting</b><span>Pick the pace that feels right.</span></div><div role="group" aria-label="Animation energy"><button aria-pressed={energy==='lively'} onClick={()=>onEnergyChange('lively')}>Full of life</button><button aria-pressed={energy==='calm'} onClick={()=>onEnergyChange('calm')}>Calm</button></div></div><p className="studio-footnote">Expressions here are previews. During a task, Bebo follows his actual state.</p></div>
 </section>;
}
