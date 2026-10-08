// A contained visual playground. It has no desktop-control bridge.
(() => {
 const query=new URLSearchParams(location.search);if(!query.has('demo'))return;
 document.documentElement.classList.add('cursor-demo');
 const color='#141414';
 let phase='moving',pulse=0,point={x:innerWidth*.57,y:innerHeight*.52},timer,inside=true;
 const calm=query.get('calm')==='true',dust=query.get('dust')!=='false',controlDemo=query.has('control');let controlling=controlDemo;
 document.body.insertAdjacentHTML('afterbegin','<main class="cursor-playground"><div class="demo-heading"><span>INK IN MOTION</span><span>INTERACTIVE PREVIEW</span></div><h1>A little flow.<br><em>In every move.</em></h1><p>Black ink. White waves. A little dust.</p><div class="demo-targets"><button data-phase="click"><span>✦</span> Give a little click</button><button data-phase="scroll"><span>↕</span> Try a scroll</button></div><label class="demo-type"><span>LEAVE A NOTE</span><input aria-label="Type in the cursor playground" placeholder="Hello, little Bebo…" maxlength="120" autocomplete="off"></label><span class="demo-footnote">A preview only. Your desktop stays as it is.</span></main>');
 if(controlDemo){
  document.documentElement.classList.add('control-demo');if(query.has('dark'))document.documentElement.classList.add('demo-dark');
  document.querySelector('.cursor-playground h1').innerHTML='A quiet edge.<br><em>A clear way out.</em>';
  document.querySelector('.cursor-playground p').textContent='Black dust, a soft shadow, and one touch to cancel.';
  document.body.insertAdjacentHTML('beforeend','<button class="cancel-tab demo-cancel" aria-label="Cancel Bebo\'s computer task"><span class="stop-mark" aria-hidden="true"></span><span>Cancel</span><span class="cancel-cross" aria-hidden="true">×</span></button>');
  document.querySelector('.demo-cancel').addEventListener('click',event=>{event.stopPropagation();controlling=false;event.currentTarget.hidden=true;document.querySelector('.demo-footnote').textContent='Cancelled. The border disappears as soon as Bebo stops.';send();});
 }
 function send(){window.dispatchEvent(new CustomEvent('bebo-cursor',{detail:{...point,color,calm,preview:true,active:inside,engaged:controlling,effects:{cursor:true,dust,edges:controlDemo},phase,pulse,label:'Bebo · cursor preview',pet:null}}));}
 function react(next){phase=next;if(next==='click'||next==='scroll')pulse++;clearTimeout(timer);send();timer=setTimeout(()=>{phase='moving';send();},next==='typing'?1100:800);}
 document.addEventListener('pointermove',e=>{inside=true;point={x:e.clientX,y:e.clientY};send();},{passive:true});
 document.documentElement.addEventListener('pointerleave',()=>{inside=false;send();});
 document.addEventListener('click',e=>{const button=e.target.closest('button');react(button?.dataset.phase||'click');});
 document.addEventListener('input',()=>react('typing'));
 document.addEventListener('wheel',()=>react('scroll'),{passive:true});
 document.addEventListener('keydown',e=>{if(e.key==='Tab')react('keyboard');});
 document.querySelectorAll('button,input').forEach(el=>el.addEventListener('focus',()=>{const box=el.getBoundingClientRect();point={x:box.x+box.width*.65,y:box.y+box.height*.5};inside=true;send();}));
 document.documentElement.style.setProperty('--bebo-color',color);send();
})();
