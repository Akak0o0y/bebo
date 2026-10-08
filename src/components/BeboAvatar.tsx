"use client";
/** Original OpenAgents renderer. Attribution: public/vendor/aora/. */
import { useEffect, useId, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'motion/react';
import { createEmotionBall, type EmotionBallInstance, type AoraShape } from '../vendor/aora-bot';
import { avatarMoods, type AvatarEnergy, type AvatarMood } from '../avatar-state';
import { motionTokens } from '../motion';
import './bebo-avatar.css';

type Props={mood?:AvatarMood;color?:string;energy?:AvatarEnergy;onClick?:()=>void;onExpressionChange?:(mood:AvatarMood)=>void;label?:string};
export const OPENAGENTS_EDITIONS:Record<string,{color:string;eyeColor:string;shape:AoraShape}>={
 ember:{color:'#D78D60',eyeColor:'#FFFFFF',shape:'blob'},
 orbit:{color:'#748CD6',eyeColor:'#FFFFFF',shape:'pebble'},
 sprout:{color:'#82A888',eyeColor:'#20342A',shape:'bean'},
 ink:{color:'#595666',eyeColor:'#EAE4CF',shape:'squircle'},
 lilac:{color:'#A092C6',eyeColor:'#FFFFFF',shape:'blob'},
 peach:{color:'#D78D60',eyeColor:'#FFFFFF',shape:'blob'},
 mint:{color:'#82A888',eyeColor:'#20342A',shape:'bean'},
};
export const BEBO_EMOTIONS:Record<AvatarMood,string>={idle:'02',curious:'03',listening:'35',thinking:'30',working:'32',approval:'11',success:'33',help:'20',speaking:'39',sleeping:'00',wave:'31',boop:'14',dance:'10'};

export function BeboAvatar({mood='idle',color='ember',energy='lively',onClick,onExpressionChange,label='Talk to Bebo'}:Props){
 const id=useId();const root=useRef<HTMLButtonElement>(null);const container=useRef<HTMLSpanElement>(null);const engine=useRef<EmotionBallInstance|null>(null);
 const reduced=useReducedMotion();const inView=useInView(root,{amount:.1});
 const [visible,setVisible]=useState(()=>document.visibilityState==='visible');
 const [hovered,setHovered]=useState(false);const [sleepy,setSleepy]=useState(false);
 const expression:AvatarMood=mood==='idle'?(sleepy?'sleeping':hovered?'curious':'idle'):mood;
 const expressionRef=useRef(expression);expressionRef.current=expression;
 const look=OPENAGENTS_EDITIONS[color]||OPENAGENTS_EDITIONS.ember;
 const active=!reduced&&energy==='lively'&&visible&&inView;
 const activeRef=useRef(active);activeRef.current=active;
 useEffect(()=>{onExpressionChange?.(expression);},[expression,onExpressionChange]);
 useEffect(()=>{const update=()=>setVisible(document.visibilityState==='visible');document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
 useEffect(()=>{
  const target=container.current;if(!target)return;target.replaceChildren();
  const ball=createEmotionBall(target,{emotion:BEBO_EMOTIONS[expressionRef.current],...look,idle:false,autostart:false,lite:false,eyeScale:1,label:'Bebo'});
  // Bebo's material finish sits above the original, unchanged expression renderer.
  const gradient=ball.ball.svg.querySelector('radialGradient');
  gradient?.setAttribute('cx','28%');gradient?.setAttribute('cy','20%');gradient?.setAttribute('r','87%');
  const shades=[`color-mix(in srgb, ${look.color} 58%, #fff8eb)`,look.color,`color-mix(in srgb, ${look.color} 65%, #442c2b)`];
  gradient?.querySelectorAll('stop').forEach((stop,index)=>{(stop as SVGStopElement).style.stopColor=shades[index];});
  ball.ball.svg.style.setProperty('--bebo-body',look.color);
  ball.ball.svg.querySelector('g:not([pointer-events])>path')?.setAttribute('class','bebo-material');
  ball.ball.svg.setAttribute('aria-hidden','true');engine.current=ball;ball.setActive(activeRef.current);
  if(!activeRef.current)ball.renderStatic();
  return()=>{ball.stopTour();ball.destroy();engine.current=null;target.replaceChildren();};
 },[look]);
 useEffect(()=>{const ball=engine.current;if(!ball)return;ball.setActive(active);if(!active){ball.clearGaze();ball.renderStatic();}},[active,look]);
 useEffect(()=>{
  const ball=engine.current;if(!ball)return;ball.setEmotion(BEBO_EMOTIONS[expression]);
  if(!activeRef.current){ball.renderStatic();return;}
  if(expression==='dance'){ball.spin(1,1);ball.burst(14);}
  if(expression==='wave'||expression==='boop')ball.bounce();
 },[expression,look]);
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>;
  const wake=()=>{setSleepy(false);clearTimeout(timer);if(mood==='idle'&&active)timer=setTimeout(()=>setSleepy(true),motionTokens.duration.idleSleep);};
  const move=(event:PointerEvent)=>{
   wake();const ball=engine.current;if(!active||!ball)return;
   const rect=root.current?.getBoundingClientRect();if(!rect)return;
   const dx=event.clientX-rect.left-rect.width/2,dy=event.clientY-rect.top-rect.height/2;
   if(Math.hypot(dx,dy)<600&&mood==='idle')ball.setGaze(Math.max(-1,Math.min(1,dx/220)),Math.max(-1,Math.min(1,dy/220)));
   else ball.clearGaze();
  };
  const leave=()=>{engine.current?.clearGaze();setHovered(false);};
  wake();window.addEventListener('pointermove',move,{passive:true});window.addEventListener('keydown',wake);document.documentElement.addEventListener('pointerleave',leave);
  return()=>{clearTimeout(timer);window.removeEventListener('pointermove',move);window.removeEventListener('keydown',wake);document.documentElement.removeEventListener('pointerleave',leave);};
 },[mood,active]);
 return <button ref={root} type="button" className="bebo-avatar bebo-openagents-avatar" aria-label={label} aria-describedby={`${id}-description`} data-mood={expression} data-emotion={BEBO_EMOTIONS[expression]} data-renderer="openagents-aora" data-motion={active?'full':'still'} onPointerEnter={()=>{setHovered(true);setSleepy(false);}} onPointerLeave={()=>setHovered(false)} onClick={()=>{setSleepy(false);if(active)engine.current?.bounce();onClick?.();}}>
  <span ref={container} className="aora-renderer" aria-hidden="true"/>
  <span id={`${id}-description`} className="avatar-sr-only">{avatarMoods[expression].label}. {avatarMoods[expression].detail}</span>
 </button>;
}
