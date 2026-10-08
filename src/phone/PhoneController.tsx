import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Keyboard, Loader2, Mic, Monitor, Send, ShieldCheck, Square, Unplug, WifiOff, X } from 'lucide-react';
import { BeboAvatar } from '../components/BeboAvatar';
import { avatarMoods, type AvatarMood } from '../avatar-state';
import type { PhoneState } from './types';
import './phone.css';
import { QuestionPrompt } from '../components/QuestionPrompt';
import { PhoneReplyVoice } from './PhoneReplyVoice';
import { useHoldToTalk } from './useHoldToTalk';

const storageKey = 'bebo-phone-session';
const readSession = () => {
  try { const saved = localStorage.getItem(storageKey); if (saved) return saved; } catch {}
  let token = ''; try { token = sessionStorage.getItem(storageKey) || ''; } catch {}
  if (token) { try { localStorage.setItem(storageKey, token); } catch {} }
  return token;
};
const requestId = () => crypto.randomUUID().replaceAll('-', '');
class PhoneError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }

export function PhoneController() {
  const [token, setToken] = useState(readSession);
  const [state, setState] = useState<PhoneState | null>(null);
  const [online, setOnline] = useState(false);
  const [pairing, setPairing] = useState<{ ticket: string; code: string } | null>(null);
  const [pairBusy, setPairBusy] = useState(false);
  const [pairCode, setPairCode] = useState('');
  const [error, setError] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [sending, setSending] = useState(false);
  const [typed, setTyped] = useState(false);
  const [text, setText] = useState('');
  const [language, setLanguage] = useState(navigator.language.startsWith('ar') ? 'ar-SA' : 'en-US');
  const [now, setNow] = useState(Date.now());
  const commandBusy = useRef(false);
  const commandGeneration = useRef(0);
  const mounted = useRef(true);
  const pairPromise = useRef<Promise<any> | null>(null);
  const latest = useRef({ token, online, state }); latest.current = { token, online, state };
  const currentToken = useRef(token); currentToken.current = token;
  const needsAnswer = state?.pending?.action.type === 'ask';
  const awaitingApproval = !!state?.pending && !['done', 'blocked', 'ask'].includes(state.pending.action.type);
  const speech = useHoldToTalk({ enabled: online && !!state?.connected && !sending && !state.busy && !awaitingApproval && !needsAnswer,
    language, onSend: words => { void command('request', words); }, onError: setError, onUnavailable: () => setTyped(true),
    transcribe: state?.transcription==='gpt-transcribe' ? async(audio,language,signal)=>{
      const response=await fetch('/api/transcribe',{method:'POST',headers:{Authorization:`Bearer ${currentToken.current}`,'Content-Type':audio.type,'X-Bebo-Language':language},body:audio,signal});
      const value=await response.json();if(!response.ok)throw Error(value.error||'Transcription failed. Try again.');return value.text;
    }:undefined });
  const { listening, finishing, transcript } = speech;
  const abortSpeech = speech.cancel;

  const api = useCallback(async (route: string, auth: string, body?: object, signal?: AbortSignal) => {
    const timeout = AbortSignal.timeout(route === 'control' ? 90000 : 8000);
    const response = await fetch(`/api/${route}`, { method: body ? 'POST' : 'GET', cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new PhoneError(payload.error || 'Bebo’s desktop is unavailable.', response.status);
    return payload;
  }, []);
  function saveToken(value: string) {
    let persistent = false;
    try { value ? localStorage.setItem(storageKey, value) : localStorage.removeItem(storageKey); persistent = true; } catch {}
    try { value && !persistent ? sessionStorage.setItem(storageKey, value) : sessionStorage.removeItem(storageKey); } catch {}
    commandGeneration.current++; commandBusy.current = false; setSending(false); currentToken.current = value; setToken(value);
  }
  async function pairByCode() {
    if(pairBusy)return;setPairBusy(true);setError('');
    try{setPairing(await api('pair','',{token:pairCode,name:/iPhone/.test(navigator.userAgent)?'My iPhone':'My phone',nonce:requestId()}));}
    catch(e){setError(e instanceof Error?e.message:'Pairing did not complete.');}finally{setPairBusy(false);}
  }

  useEffect(() => {
    mounted.current = true;
    const onHide = () => { if (document.hidden) abortSpeech(); };
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey) { abortSpeech(); saveToken(event.newValue || ''); } };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('storage', onStorage);
    return () => { mounted.current = false; abortSpeech(); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('storage', onStorage); };
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(location.hash.slice(1));
    const resume = params.get('resume');
    if (resume) { history.replaceState(null, '', location.pathname + '?phone=1'); saveToken(resume); setError(''); return; }
    const invitation = params.get('pair');
    if (!invitation && !pairPromise.current) return;
    let active = true;
    if (!pairPromise.current) {
      history.replaceState(null, '', `${location.pathname}?phone=1`);
      saveToken(''); setPairBusy(true);
      pairPromise.current = api('pair', '', { token: invitation, name: /iPhone/.test(navigator.userAgent) ? 'My iPhone' : 'My phone', nonce: requestId() });
    }
    pairPromise.current.then(result => { if (active) { setPairing(result); setError(''); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setPairBusy(false); });
    return () => { active = false; };
  }, [api]);
  useEffect(() => {
    if (!pairing) return;
    let active = true, timer: ReturnType<typeof setTimeout>; const controller = new AbortController();
    const poll = async () => {
      try {
        const result = await api('pair-status', pairing.ticket, undefined, controller.signal);
        if (!active) return;
        if (result.status === 'approved') { saveToken(result.token); setPairing(null); setError(''); return; }
        if (result.status === 'rejected') { setPairing(null); setError('Pairing was declined on your desktop. Scan a new link to try again.'); return; }
      } catch (e) { if (active && e instanceof PhoneError && e.status === 401) { setPairing(null); setError(e.message); return; } }
      if (active) timer = setTimeout(poll, 1500);
    };
    void poll(); return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [api, pairing]);
  useEffect(() => {
    if (!token) { setOnline(false); setState(null); return; }
    let active = true, timer: ReturnType<typeof setTimeout>; const controller = new AbortController();
    const poll = async () => {
      try {
        const value = await api('state', token, undefined, AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]));
        if (active) { setState(value); setOnline(true); setNow(Date.now()); }
      } catch (e) {
        if (active) { setOnline(false); abortSpeech(); if (e instanceof PhoneError && e.status === 401) { saveToken(''); setError(e.message); } }
      }
      if (active) timer = setTimeout(poll, document.hidden ? 5000 : 1000);
    };
    void poll(); return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [api, token]);

  async function command(op: 'request' | 'approve' | 'stop' | 'answer', value?: string, stepId?: string) {
    if (op !== 'stop' && commandBusy.current) return false;
    const session = latest.current;
    if (!session.online || !session.token) { setError('Reconnect to your desktop before sending a request.'); return false; }
    const generation = ++commandGeneration.current;
    const isCurrent = () => mounted.current && currentToken.current === session.token && generation === commandGeneration.current;
    commandBusy.current = true; setSending(true); setError('');
    const id = requestId();
    try {
      await api('control', session.token, { id, op, ...(op === 'request' ? { text: value } : op === 'approve' ? { stepId: value } : op === 'answer' ? { text: value, stepId } : {}) });
      if (!isCurrent()) return false;
      const next = await api('state', session.token);
      if (isCurrent()) { setState(next); if (op === 'request') { setText(''); setTyped(false); } }
      return isCurrent();
    } catch (e) { if (isCurrent()) setError(e instanceof PhoneError ? e.message : 'Connection interrupted. Check Bebo’s status before sending the request again.'); return false; }
    finally { if (isCurrent()) { commandBusy.current = false; setSending(false); } }
  }
  const approvalExpired = awaitingApproval && !!state?.approvalExpires && state.approvalExpires <= now;
  const mood: AvatarMood = listening ? 'listening' : !online ? 'idle' : speaking ? 'speaking' : sending && !state?.busy ? 'thinking' : state?.mood || 'idle';
  const connected = !!token && online;
  const headline = listening ? 'I’m all ears.' : finishing ? 'Sending your words…' : !token ? 'Your little remote.' : !online ? 'Finding your desktop…' : !state?.connected ? 'Let’s connect my brain.' : needsAnswer ? 'A little help over here?' : awaitingApproval ? 'A little nod from you?' : state?.busy ? avatarMoods[mood].message : state?.pending ? avatarMoods[mood].message : 'Hold. Speak. Release.';
  return <div className="phone-controller">
    <header className="phone-topbar"><a className="phone-wordmark" href="?phone=1" aria-label="Bebo phone home">bebo<span>.</span></a><span className={`phone-connection-pill ${connected ? 'connected' : ''}`}><span />{connected ? 'Desktop connected' : token ? 'Reconnecting' : 'Not paired'}</span></header>
    <main className="phone-main"><div className="phone-intro"><span className="eyebrow">LITTLE FRIEND. LONG REACH.</span><h1>{headline}</h1></div>
      <div className={`phone-avatar-stage ${listening ? 'phone-is-listening' : ''}`} {...speech.handlers}><div className="phone-orbit orbit-a" /><div className="phone-orbit orbit-b" /><BeboAvatar mood={mood} color={state?.color || 'ember'} energy={state?.energy || 'lively'} label={listening ? 'Release to send to Bebo' : 'Hold Bebo to speak'} /><span className="phone-touch-indicator">{listening ? <><AudioBars /> Release to send</> : <><Mic size={14} /> {connected && state?.connected ? (needsAnswer?'A little answer below':awaitingApproval?'Review the step below':state.busy||sending?'On your desktop…':'Hold to talk · release to send') : 'Your voice goes here'}</>}</span></div>
      <div className="phone-live-copy" aria-live="polite">{listening ? <p className="phone-transcript">{transcript || 'Go on. Tell me what to do on your desktop.'}</p> : connected && state?.connected ? <p>{state.busy ? (state.message || 'Working on your laptop.') : awaitingApproval ? 'Review my next step below.' : state.pending ? state.pending.action.reason : 'Your voice here. A little magic on your laptop.'}</p> : token ? <p>{online ? 'Connect Luna once in the Bebo desktop app.' : 'Keep Bebo open and your laptop awake. A running task may still be in progress.'}</p> : <p>Bring Bebo along. Your laptop does the work.</p>}</div>
      {pairBusy ? <div className="phone-inline-card"><Loader2 size={18} className="phone-spin" /><p>Introducing your phone…</p></div> : pairing ? <div className="phone-inline-card pairing-confirm"><ShieldCheck size={21} /><h2>A quick hello on your desktop.</h2><p>Confirm this matching number in Bebo’s Phone page.</p><strong className="pair-match-code">{pairing.code}</strong><span>Waiting for your desktop…</span></div> : !token ? <div className="phone-inline-card phone-unpaired"><Monitor size={21} /><h2>Let’s meet your desktop.</h2><p>In the Windows app, open <b>Phone</b>, create a phone link, and scan its QR code.</p><form className="phone-code-form" onSubmit={event=>{event.preventDefault();void pairByCode();}}><label htmlFor="pair-code">Or enter the code shown on your desktop</label><div><input id="pair-code" value={pairCode} maxLength={11} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABCDE-12345" onChange={event=>setPairCode(event.target.value.toUpperCase())}/><button disabled={pairCode.replace(/[-\s]/g,'').length!==10||pairBusy}>Pair</button></div></form></div> : null}
      {error && <div className="phone-error phone-inline-error" role="alert"><p>{error}</p><button aria-label="Dismiss phone message" onClick={() => setError('')}><X size={15} /></button></div>}
      {state?.message && connected && <p className="phone-error" role="status">{state.message}</p>}
      {needsAnswer && state?.pending && <QuestionPrompt key={state.pending.id} step={state.pending} expires={state.approvalExpires} disabled={!online || sending || state.busy} onAnswer={(id, text) => command('answer', text, id)} onStop={() => { abortSpeech(); void command('stop'); }}/> }
      {awaitingApproval && state?.pending && <section className="phone-approval"><div><ShieldCheck size={16} /><span>STEP {state.pending.step} · {state.pending.action.type.replace('_', ' ')}</span></div><h2>{state.pending.action.reason}</h2>{['type', 'key', 'tool'].includes(state.pending.action.type) && <pre>{state.pending.action.text}</pre>}{['click', 'double_click', 'scroll'].includes(state.pending.action.type) && <p>Desktop position: {state.pending.action.x}, {state.pending.action.y}{state.pending.action.type === 'scroll' ? ` · ${state.pending.action.text}` : ''}</p>}<button className="phone-allow" disabled={!online || sending || approvalExpired} onClick={() => command('approve', state.pending!.id)}><Check size={18} />{approvalExpired ? 'Step expired — start again' : sending ? 'One moment…' : 'Allow this step'}</button></section>}
      {token && <div className="phone-tools">{(state?.busy || awaitingApproval || needsAnswer || sending || listening || finishing) ? <button className="phone-stop" onClick={() => { abortSpeech(); void command('stop'); }} disabled={!online}><Square size={14} /> Stop</button> : <button disabled={!online || !state?.connected} onClick={() => setTyped(value => !value)}><Keyboard size={17} /> Type instead</button>}<label className="phone-language"><span className="avatar-sr-only">Voice language</span><select value={language} onChange={event => setLanguage(event.target.value)} disabled={listening}><option value="en-US">English</option><option value="ar-SA">العربية</option></select><ChevronDown size={12} /></label></div>}
      {typed && token && <form className="phone-type-form" onSubmit={event => { event.preventDefault(); if (text.trim()) void command('request', text.trim()); }}><label htmlFor="phone-request">A little request for your desktop</label><div><input id="phone-request" placeholder="Open Chrome…" maxLength={4000} value={text} onChange={event => setText(event.target.value)} /><button aria-label="Send phone request" disabled={!text.trim() || !online || !state?.connected || sending || state.busy || awaitingApproval || needsAnswer}><Send size={18} /></button></div></form>}
      {!!token && !online && <span className="phone-offline"><WifiOff size={13} /> Waiting for a connection</span>}
      {token && state?.pending && ['done','blocked'].includes(state.pending.action.type) && !listening && !finishing && !sending && <PhoneReplyVoice token={token} online={online} step={state.pending} onSpeaking={setSpeaking} />}
    </main><footer className="phone-footer"><span><ShieldCheck size={12} /> Your laptop. Your say.</span>{token && <button onClick={() => { abortSpeech(); saveToken(''); setError('This phone has been forgotten here. Revoke its registration from the desktop Phone page.'); }}><Unplug size={12} /> Forget this phone</button>}<p>Safari → Share → Add to Home Screen<br />for a little place of his own.</p></footer>
  </div>;
}
function AudioBars() { return <span className="phone-audio-bars" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i key={i} style={{ animationDelay: `${i * .12}s` }} />)}</span>; }
