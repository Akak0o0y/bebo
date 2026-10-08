const cursor=document.getElementById('cursor'),label=document.getElementById('label'),pointer=document.querySelector('.pointer');
const waves=[...document.querySelectorAll('.ink-wave')];
const canvas=document.getElementById('dust'),ctx=canvas.getContext('2d');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const timing={click:600,wave:3800};
let frame=null,previous=null,previousPet=null,previousPulse=0,particles=[],animation=0,lastTime=0,lastFrameTime=0;
let vx=0,vy=0,clickTime=-Infinity,flow=0;
let width=innerWidth,height=innerHeight;
const budget=navigator.hardwareConcurrency<=4?180:650;
const edgeBudget=navigator.hardwareConcurrency<=4?1100:2400;
function size(){width=innerWidth;height=innerHeight;const ratio=Math.min(devicePixelRatio,1.5);canvas.width=width*ratio;canvas.height=height*ratio;canvas.style.width=width+'px';canvas.style.height=height+'px';ctx.setTransform(ratio,0,0,ratio,0,0);}
size();addEventListener('resize',size);
function emit(x,y,count,burst=false){
 if(!frame?.effects.dust||reduced.matches||frame.calm)return;
 for(let i=0;i<count&&particles.length<budget;i++){
  const angle=Math.random()*Math.PI*2,speed=burst?20+Math.random()*65:5+Math.random()*16;
  particles.push({x:x+(Math.random()-.5)*7,y:y+(Math.random()-.5)*7,vx:Math.cos(angle)*speed-vx*.018,vy:Math.sin(angle)*speed-vy*.018,life:0,max:.55+Math.random()*1.05,size:.6+Math.random()*1.1,seed:Math.random()*6.28});
 }
}
function trail(point,old){
 if(!point||point.x<0||point.y<0||point.x>width||point.y>height)return;
 if(old){const distance=Math.hypot(point.x-old.x,point.y-old.y);if(distance>2&&distance<500){const count=Math.min(22,Math.ceil(distance/4));for(let i=0;i<count;i++){const t=i/count;emit(old.x+(point.x-old.x)*t,old.y+(point.y-old.y)*t,3);}}}
}
function ink(t){
 // White liquid bands travel through a clipped black arrow; the tip stays exact.
 for(let i=0;i<waves.length;i++){
  const y=(i*15+t*11)%75-22,bend=Math.sin(t*1.1+i)*7,thickness=4.6+Math.sin(t*.8+i)*1.6;
  waves[i].setAttribute('d',`M-12 ${y} C1 ${y-10+bend} 10 ${y+13-bend} 25 ${y+3} S43 ${y-7+bend} 47 ${y+1} L47 ${y+thickness+1} C32 ${y+thickness-10} 22 ${y+thickness+18} 9 ${y+thickness+2} S-7 ${y+thickness-4} -12 ${y+thickness} Z`);
 }
}
function draw(time){
 animation=0;const dt=Math.min(.04,(time-lastTime)/1000||.016);lastTime=time;ctx.clearRect(0,0,width,height);if(!frame||document.hidden)return;
 const calm=reduced.matches||frame.calm;ctx.fillStyle='#141414';
 if(frame.effects.edges&&frame.engaged){
  const perimeter=2*(width+height),count=Math.min(edgeBudget,Math.floor(perimeter/2.5));
  for(let i=0;i<count;i++){
   const seed=Math.sin(i*127.1+31)*43758.54,random=seed-Math.floor(seed),p=(i/count*perimeter+(calm?0:time*.008))%perimeter;
   const inward=2+random*random*33+(calm?0:Math.sin(time*.00065+i)*1.6);let x,y;
   if(p<width){x=p;y=inward;}else if(p<width+height){x=width-inward;y=p-width;}else if(p<2*width+height){x=2*width+height-p;y=height-inward;}else{x=inward;y=perimeter-p;}
   const alpha=(calm?.78:.72+.2*Math.sin(time*.0008+i*2.4))*(1-random*.45),pixel=.85+random*1.3;
   // A fine neutral fringe preserves the black grains against dark application chrome.
   if(i%3===0){ctx.fillStyle='#efefef';ctx.globalAlpha=alpha*.3;ctx.fillRect(x-.55,y-.55,pixel+1.1,pixel+1.1);}
   ctx.fillStyle='#080808';ctx.globalAlpha=alpha;ctx.fillRect(x,y,pixel,pixel);
  }
  canvas.dataset.edgeParticles=String(count);
 }else{
  canvas.dataset.edgeParticles='0';
 }
 ctx.fillStyle='#141414';
 particles=calm||!frame.effects.dust?[]:particles.filter(p=>p.life<p.max);
 for(const p of particles){p.life+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx+=Math.sin(p.life*6+p.seed)*dt*7;p.vy-=dt*4;ctx.globalAlpha=Math.max(0,1-p.life/p.max)**2*.8;ctx.fillRect(p.x,p.y,p.size,p.size);}
 if(frame.active&&frame.effects.cursor){
  vx*=Math.pow(.88,dt*60);vy*=Math.pow(.88,dt*60);
  const speed=calm?0:Math.hypot(vx,vy),phase=time-clickTime<timing.click?'click':frame.phase;
  cursor.dataset.phase=phase;cursor.dataset.speed=speed>150?'fast':'rest';
  if(!calm)flow+=dt*(phase==='typing'||phase==='keyboard'?2.7:phase==='scroll'?2.1:1+Math.min(1.6,speed/400));
  ink(calm?0:flow);
  const age=(time-clickTime)/timing.click,press=!calm&&age>=0&&age<1?1-.19*Math.sin(age*Math.PI)*Math.exp(-age*2):1;
  const tilt=calm?0:Math.max(-7,Math.min(7,vx*.01)),stretch=calm?1:1+Math.min(.07,speed*.00006);
  pointer.style.transform=`rotate(${tilt}deg) scale(${press},${press*stretch})`;
  label.textContent=frame.label;
 }
 ctx.globalAlpha=1;canvas.dataset.particles=String(particles.length);canvas.dataset.ink='#141414';canvas.dataset.edges=String(!!(frame.effects.edges&&frame.engaged));
 if(!calm&&((frame.effects.edges&&frame.engaged)||particles.length||(frame.active&&frame.effects.cursor)))animation=requestAnimationFrame(draw);
}
window.addEventListener('bebo-cursor',({detail:next})=>{
 const now=performance.now(),elapsed=Math.max(.016,Math.min(.1,(now-lastFrameTime)/1000));lastFrameTime=now;frame=next;
 document.documentElement.style.setProperty('--bebo-color','#141414');
 document.documentElement.dataset.controlling=String(!!(frame.engaged&&frame.effects.edges));
 const onScreen=frame.x>=0&&frame.y>=0&&frame.x<width&&frame.y<height;
 cursor.style.display=frame.active&&frame.effects.cursor&&onScreen?'block':'none';cursor.style.transform=`translate(${frame.x}px,${frame.y}px)`;
 cursor.dataset.calm=String(reduced.matches||frame.calm);cursor.dataset.dust=String(frame.effects.dust);cursor.setAttribute('aria-label',frame.label);
 if(frame.active){
  if(previous){vx=vx*.3+(frame.x-previous.x)/elapsed*.7;vy=vy*.3+(frame.y-previous.y)/elapsed*.7;vx=Math.max(-1000,Math.min(1000,vx));vy=Math.max(-1000,Math.min(1000,vy));}
  trail(frame,previous);if(frame.pulse!==previousPulse){emit(frame.x,frame.y,64,true);if(frame.phase==='click')clickTime=now;}
 }
 previousPulse=frame.pulse;previous=frame.active?frame:null;trail(frame.pet,previousPet);previousPet=frame.pet;
 if(!animation)animation=requestAnimationFrame(draw);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(animation);animation=0;particles=[];previous=null;previousPet=null;ctx.clearRect(0,0,width,height);}else if(frame&&!animation)animation=requestAnimationFrame(draw);});
reduced.addEventListener('change',()=>{if(frame){cursor.dataset.calm=String(reduced.matches||frame.calm);if(!animation)animation=requestAnimationFrame(draw);}});
