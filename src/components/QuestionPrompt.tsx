import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import type { PhoneStep } from '../phone/types';
import './question-prompt.css';

/** Mount per question ID so a late reply cannot clear the next question's draft. */
export function QuestionPrompt({ step, disabled = false, expires, onAnswer, onStop }: {
  step: PhoneStep; disabled?: boolean; expires?: number | null;
  onAnswer: (id: string, text: string) => Promise<boolean | void>; onStop: () => void;
}) {
  const [text, setText] = useState(''), [sending, setSending] = useState(false), [error, setError] = useState('');
  const [now, setNow] = useState(Date.now()); const id = useId(); const busy = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; const timer = setInterval(() => setNow(Date.now()), 1000); return () => { mounted.current = false; clearInterval(timer); }; }, []);
  const expired = !!expires && expires <= now;
  async function submit() {
    if (busy.current || disabled || expired || !text.trim()) return;
    busy.current = true; setSending(true); setError('');
    try { const accepted = await onAnswer(step.id, text.trim()); if (mounted.current && accepted !== false) setText(''); }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Your answer could not be sent.'); }
    finally { busy.current = false; if (mounted.current) setSending(false); }
  }
  return <section className="question-cloud" aria-label="Bebo needs a hand">
    <div className="question-eyebrow"><Sparkles size={13} /> A LITTLE HELP?</div>
    <h2 id={`${id}-question`}>{step.action.reason}</h2>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className="avatar-sr-only" htmlFor={id}>Your answer to Bebo</label>
      <div className="question-input"><input id={id} aria-describedby={`${id}-question`} value={text} onChange={e => setText(e.target.value)} maxLength={2000} placeholder="Tell me here…" autoComplete="off" disabled={disabled || sending || expired} /><button aria-label="Send answer" disabled={!text.trim() || disabled || sending || expired}><ArrowUp size={18} /></button></div>
    </form>
    <div className="question-footer"><span>{expired ? 'Question expired. Start a new request.' : sending ? 'Got it. One moment…' : 'Your answer keeps us going.'}</span><button onClick={onStop}>Stop task</button></div>
    {error && <p className="question-error" role="alert">{error}</p>}
  </section>;
}
