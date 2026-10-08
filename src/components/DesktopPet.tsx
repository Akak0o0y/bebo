import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion/react';
import { GripHorizontal, Mic, MoreHorizontal, Square, X } from 'lucide-react';
import { BeboAvatar, OPENAGENTS_EDITIONS } from './BeboAvatar';
import { QuestionPrompt } from './QuestionPrompt';
import { avatarMoods } from '../avatar-state';
import type { PhoneState, ScreenEffects } from '../phone/types';
import { motionTokens, springs } from '../motion';
import { useBeboVoice } from './useBeboVoice';
import './desktop-pet.css';
import { useAssistantPreferences } from './AssistantSettings';
import { useHoldToTalk } from '../phone/useHoldToTalk';
import { transcribeOnDesktop } from '../phone/RecordedSpeech';
import { readSaved } from '../storage';

const empty: PhoneState = { prompt: '', busy: false, acting: false, pending: null, message: '', hasError: false, connected: false, mood: 'idle', color: 'ember', energy: 'lively', approvalExpires: null, sessionExpires: 0 };

export function DesktopPet() {
  const [state, setState] = useState(empty), [error, setError] = useState('');
  const [effects, setEffects] = useState<ScreenEffects>({ cursor: true, dust: true, edges: true });
  const [dismissed, setDismissed] = useState(''); const [details, setDetails] = useState(false); const [sound, setSound] = useState(() => readSaved('bebo-sound', true));
  const voice = useBeboVoice(sound), spoken = useRef(''), reduced = useReducedMotion();
  useEffect(() => {
    document.documentElement.classList.add('desktop-pet-root'); let alive = true, received = false;
    const off = window.bebo?.onTaskState?.(value => { received = true; setState(value); setError(''); });
    void window.bebo?.taskState?.().then(value => { if (alive && !received) setState(value); }).catch(() => {});
    const offMood = window.bebo?.onAvatarState?.(mood => setState(value => ({ ...value, mood })));
    const offEffects = window.bebo?.onEffectsChanged?.(setEffects);
    void window.bebo?.effectsGet?.().then(value => { if (alive) setEffects(value); }).catch(() => {});
    const syncSound = () => setSound(readSaved('bebo-sound', true)); window.addEventListener('storage', syncSound);
    return () => { alive = false; off?.(); offMood?.(); offEffects?.(); document.documentElement.classList.remove('desktop-pet-root'); window.removeEventListener('storage', syncSound); };
  }, []);
  const step = state.pending, question = step?.action.type === 'ask';
  const approval = !!step && !['ask', 'done', 'blocked'].includes(step.action.type);
  const {preferences}=useAssistantPreferences();
  const enhanced=!!window.bebo?.transcribe&&preferences.transcription==='gpt-transcribe';
  const petSpeech=useHoldToTalk({enabled:enhanced&&state.connected&&!state.busy&&!question&&!approval,language:'en-US',transcribe:transcribeOnDesktop,onSend:text=>{void act(()=>window.bebo!.plan(text));},onError:setError,onUnavailable:()=>setError('Choose Device recognition in Bebo Settings to use Windows speech recognition.')});
  useEffect(()=>window.bebo?.onStopped?.(()=>petSpeech.cancel()),[]);
  const isListening=state.listening||petSpeech.listening;
  const notice = error || (state.busy?'':state.message) || (step && ['done', 'blocked'].includes(step.action.type) ? step.action.reason : '');
  const noticeKey = `${step?.id || ''}:${notice}`;
  const showNotice = !!notice && noticeKey !== dismissed;
  const expanded = question || approval || showNotice;
  useEffect(() => { setDetails(false); }, [noticeKey]);
  const bubble = question || approval || (showNotice && details) ? 'expanded' : showNotice ? 'compact' : 'none';
  useEffect(() => { void window.bebo?.companionBubble?.(bubble).catch(() => {}); }, [bubble]);
  useEffect(() => {
    if (state.listening || state.busy) voice.stop();
    else if (state.source === 'pet' && step?.action.type === 'done' && spoken.current !== step.id) { spoken.current = step.id; void voice.speak(step.action.reason); }
  }, [step?.id, state.listening, state.busy]);
  async function act(fn?: () => Promise<unknown>) { setError(''); try { await fn?.(); } catch (e) { setError(String(e).replace(/^Error: /, '')); } }
  function stop() { petSpeech.cancel();voice.stop(); void act(() => window.bebo!.stop()); }
  const mood = petSpeech.listening?'listening':petSpeech.finishing?'thinking':voice.phase === 'speaking' ? 'speaking' : state.mood;
  const color = (OPENAGENTS_EDITIONS[state.color] || OPENAGENTS_EDITIONS.ember).color;
  const [visible,setVisible]=useState(!document.hidden);
  useEffect(()=>{const changed=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);},[]);
  const quiet = !!reduced || state.energy === 'calm' || !visible;
  return <MotionConfig reducedMotion="user"><div data-dust={effects.dust} className={`desktop-pet pet-view ${expanded ? 'has-cloud' : ''} ${bubble === 'compact' ? 'has-compact-cloud' : ''}`} style={{ '--pet-color': color } as CSSProperties} onContextMenu={event => { event.preventDefault(); void act(() => window.bebo!.companionMenu!()); }}>
    <div className="pet-cloud-space"><AnimatePresence mode="wait">
      {expanded && <motion.div key={question ? step!.id : approval ? step!.id : noticeKey} className="pet-cloud-wrap" initial={{ opacity: 0, y: quiet ? 0 : 9, scale: quiet ? 1 : .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: quiet ? 0 : 5 }} transition={quiet ? { duration: motionTokens.duration.fast } : springs.snappy}>
        {question && step ? <QuestionPrompt key={step.id} step={step} disabled={state.busy} expires={state.approvalExpires} onAnswer={(id, text) => window.bebo!.answer!(id, text).then(() => true)} onStop={stop} /> : approval && step ? <section className="question-cloud pet-approval"><div className="question-eyebrow">YOUR SAY · STEP {step.step}</div><h2>{step.action.reason}</h2>{['type', 'key', 'tool'].includes(step.action.type) && <pre>{step.action.text}</pre>}<div className="pet-cloud-actions"><button onClick={() => void act(() => window.bebo!.approve(step.id))} disabled={state.busy}>Allow this step</button><button onClick={stop}>Stop</button></div>{error&&<p className="question-error" role="alert">{error}</p>}</section> : <section className={`question-cloud pet-notice ${details ? 'notice-details' : 'notice-compact'}`} ><button className="pet-cloud-dismiss" aria-label="Dismiss Bebo message" onClick={() => setDismissed(noticeKey)}><X size={13}/></button><div className="question-eyebrow">{state.hasError || error ? 'A LITTLE HAND?' : 'FROM BEBO'}</div><h2>{notice}</h2><button className="pet-notice-more" aria-expanded={details} onClick={() => setDetails(value => !value)}>{details ? 'Less' : 'Details'}</button>{(state.hasError || error) && <button className="pet-open-settings" onClick={() => void act(() => window.bebo!.dashboard())}>Open Bebo settings</button>}</section>}
      </motion.div>}
    </AnimatePresence></div>
    <div className="pet-body-stage">
      <PetDust color={color} enabled={effects.dust && !quiet} active={['listening','thinking','working'].includes(mood)} />
      <div className="pet-hover-tools"><span className="pet-drag-handle" title="Drag Bebo anywhere"><GripHorizontal size={18}/></span><button aria-label="Bebo options" onClick={() => void act(() => window.bebo!.companionMenu!())}><MoreHorizontal size={17}/></button></div>
      <motion.div className="pet-character" animate={quiet ? { y: 0, rotate: 0 } : { y: [0, -4, 0], rotate: [0, -1.2, 0] }} transition={{ duration: motionTokens.duration.breath, repeat: quiet ? 0 : Infinity, ease: motionTokens.easing.soft }}>
        <BeboAvatar color={state.color} energy={state.energy} mood={mood} label={isListening ? (enhanced?'Send voice request':'Stop listening') : 'Talk to Bebo'} onClick={() => { voice.stop(); if (state.busy) return; if (question || approval) return; if(enhanced){if(!state.connected){setError('Connect Luna in Bebo Settings to use enhanced transcription.');return;}petSpeech.toggle();}else void act(() => window.bebo!.talk()); }}/>
      </motion.div>
      <div className="pet-ground" aria-hidden="true"/>
      <div className="pet-caption"><span className="pet-emotion" role="status">{isListening ? <Mic size={10}/> : <i/>}{avatarMoods[mood].label}</span><span className="pet-instruction">{isListening ? (enhanced?'I’m all ears. Tap to send.':'I’m all ears. Tap to stop.') : state.busy ? (state.message || 'Connecting a few dots…') : question ? 'Leave me a little answer above.' : approval ? 'A little nod before I go.' : 'tap to talk · right-click for options'}</span></div>
      {(state.busy || isListening || petSpeech.finishing) && <button className="pet-stop" aria-label="Stop Bebo" onClick={stop}><Square size={10}/></button>}
    </div>
  </div></MotionConfig>;
}

function PetDust({ color, enabled, active }: { color: string; enabled: boolean; active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current, ctx = target?.getContext('2d'); if (!target || !ctx) return;
    const ratio = Math.min(devicePixelRatio || 1, 2); target.width = 340 * ratio; target.height = 280 * ratio; ctx.scale(ratio, ratio);
    let frame = 0, time = 0, previous = 0;
    const points = Array.from({ length: 105 }, (_, i) => ({ angle: i * 2.39996, radius: 83 + (i * 31 % 47), speed: .035 + (i % 7) * .009, size: .5 + (i % 5) * .17 }));
    function draw(now: number) {
      if (!ctx) return; ctx.clearRect(0, 0, 340, 280); if (!enabled || document.hidden) return;
      time += Math.min((now - previous) / 1000 || 0, .06); previous = now; ctx.fillStyle = color;
      for (const [i, p] of points.entries()) {
        const angle = p.angle + time * p.speed * (active ? 2 : 1), radius = p.radius + Math.sin(time * .8 + i) * 3;
        const x = 170 + Math.cos(angle) * radius, y = 121 + Math.sin(angle) * radius * .78;
        ctx.globalAlpha = (.2 + .5 * (Math.sin(time * 1.3 + i) * .5 + .5)) * (active ? 1 : .7); ctx.fillRect(x, y, p.size, p.size);
      }
      frame = requestAnimationFrame(draw);
    }
    const resume = () => { cancelAnimationFrame(frame); previous = 0; frame = requestAnimationFrame(draw); };
    resume(); document.addEventListener('visibilitychange', resume);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', resume); ctx.clearRect(0, 0, 340, 280); };
  }, [color, enabled, active]);
  return <canvas ref={canvas} className="pet-local-dust" aria-hidden="true"/>;
}
