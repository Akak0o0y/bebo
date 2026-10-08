import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type MouseEvent } from 'react';
import { RecordedSpeech, type Transcribe } from './RecordedSpeech';

type SpeechSession = { speech: any; held: boolean; words: string; prefix: string; ended: boolean; timer?: ReturnType<typeof setTimeout>; deadline?: ReturnType<typeof setTimeout> };

/** A press owns the utterance. Only release commits it; interruption discards it. */
export function useHoldToTalk({ enabled, language, onSend, onError, onUnavailable, transcribe }: {
  enabled: boolean; language: string; onSend: (text: string) => void;
  onError: (message: string) => void; onUnavailable: () => void; transcribe?: Transcribe;
}) {
  const [listening, setListening] = useState(false), [finishing, setFinishing] = useState(false), [transcript, setTranscript] = useState('');
  const latest = useRef({ enabled, language, onSend, onError, onUnavailable, transcribe }); latest.current = { enabled, language, onSend, onError, onUnavailable, transcribe };
  const session = useRef<SpeechSession | null>(null);
  const pointerId = useRef<number | null>(null);

  function cancel() {
    const current = session.current; session.current = null; pointerId.current = null;
    if (current) { clearTimeout(current.timer); clearTimeout(current.deadline); try { current.speech?.abort(); } catch {} }
    setListening(false); setFinishing(false); setTranscript('');
  }
  function finish(current: SpeechSession) {
    if (session.current !== current || current.held) return;
    const words = `${current.prefix} ${current.words}`.trim();
    session.current = null; clearTimeout(current.timer); clearTimeout(current.deadline); try { current.speech?.abort(); } catch {}
    setListening(false); setFinishing(false);
    if (words && latest.current.enabled) latest.current.onSend(words);
    else if (latest.current.enabled) latest.current.onError('I didn’t hear a request. Hold Bebo, speak, then release.');
  }
  function start() {
    if (session.current || !latest.current.enabled) return;
    const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!window.isSecureContext || (!latest.current.transcribe && !Speech)) {
      latest.current.onUnavailable(); latest.current.onError(!window.isSecureContext ? 'Open Bebo’s secure phone link to use your microphone.' : 'Voice recognition is unavailable here. Open in Safari, or use your keyboard’s dictation button.'); return;
    }
    const current = { speech: null as any, held: true, words: '', prefix: '', ended: false } as SpeechSession;
    session.current = current; setTranscript(''); setListening(true); latest.current.onError('');
    function recognize() {
      if (session.current !== current || !current.held) return;
      const speech = latest.current.transcribe ? new RecordedSpeech(latest.current.transcribe) : new Speech(); current.speech = speech; current.ended = false;
      speech.lang = latest.current.language; speech.continuous = true; speech.interimResults = true;
      speech.onresult = (event: any) => {
        if (session.current !== current || current.speech !== speech) return;
        current.words = Array.from(event.results as any[]).map((result: any) => result[0].transcript).join(' ');
        setTranscript(`${current.prefix} ${current.words}`.trim());
      };
      speech.onerror = (event: any) => {
        if (session.current !== current || current.speech !== speech) return;
        if (event.error === 'no-speech') return;
        cancel();
        if (event.error !== 'aborted') latest.current.onError(event.message || (event.error === 'not-allowed' ? 'Allow microphone and speech recognition for Bebo in Safari, then hold Bebo again.' : 'The microphone was interrupted. Hold Bebo to try again, or type your request.'));
      };
      speech.onend = () => {
        if (session.current !== current || current.speech !== speech) return;
        current.ended = true;
        if (!current.held) { finish(current); return; }
        // Safari can end a segment on silence even with continuous recognition.
        current.prefix = `${current.prefix} ${current.words}`.trim(); current.words = '';
        current.timer = setTimeout(recognize, 150);
      };
      try { speech.start(); } catch { cancel(); latest.current.onError('The microphone could not start. Check Safari permissions, or type your request.'); }
    }
    recognize();
    if (session.current === current) current.deadline = setTimeout(cancel, 60000);
  }
  function release() {
    const current = session.current; pointerId.current = null;
    if (!current || !current.held) return;
    current.held = false; clearTimeout(current.timer); clearTimeout(current.deadline);
    setListening(false); setFinishing(true);
    if (current.ended) { finish(current); return; }
    // stop() finalizes captured audio; abort() would discard the last words.
    current.timer = setTimeout(() => finish(current), current.speech instanceof RecordedSpeech ? 60000 : 2500);
    try { current.speech.stop(); } catch { finish(current); }
  }
  useEffect(() => {
    const hide = () => { if (document.hidden) cancel(); }, blur = () => cancel();
    document.addEventListener('visibilitychange', hide); window.addEventListener('blur', blur);
    return () => { cancel(); document.removeEventListener('visibilitychange', hide); window.removeEventListener('blur', blur); };
  }, []);
  useEffect(() => { if (!enabled) cancel(); }, [enabled]);
  useEffect(() => { cancel(); }, [!!transcribe]);
  return { listening, finishing, transcript, cancel, toggle: () => { if (session.current?.held) release(); else if(session.current) cancel(); else start(); }, handlers: {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (!event.isPrimary || event.button !== 0 || !(event.target as HTMLElement).closest('.bebo-avatar') || session.current) return;
      event.preventDefault(); start();
      if (session.current) { pointerId.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); }
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) { if (event.pointerId === pointerId.current) { event.preventDefault(); release(); } },
    onPointerCancel: cancel,
    onLostPointerCapture() { if (pointerId.current !== null) cancel(); },
    onContextMenu(event: MouseEvent) { event.preventDefault(); },
    onKeyDown(event: KeyboardEvent) { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); if (!event.repeat) start(); } else if (event.key === 'Escape') cancel(); },
    onKeyUp(event: KeyboardEvent) { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); release(); } },
    onClick(event: MouseEvent) { if (event.detail === 0) { session.current?.held ? release() : start(); } },
  } };
}
