import { useEffect, useRef, useState } from 'react';
import { Volume2, Square } from 'lucide-react';
import type { PhoneStep } from './types';

export function PhoneReplyVoice({ token, online, step, onSpeaking }: { token: string; online: boolean; step: PhoneStep; onSpeaking: (value: boolean) => void }) {
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const player = useRef<HTMLAudioElement | null>(null);
  const controller = useRef<AbortController | null>(null);
  const url = useRef('');
  const epoch = useRef(0);
  function stop() {
    epoch.current++; controller.current?.abort(); player.current?.pause(); player.current = null;
    window.speechSynthesis?.cancel(); if (url.current) URL.revokeObjectURL(url.current); url.current = '';
    setPhase('idle'); onSpeaking(false);
  }
  useEffect(() => { if (!online) stop(); }, [online]);
  useEffect(() => () => stop(), [token, step.id]);
  async function play() {
    stop(); setError(''); const generation = epoch.current;
    if (/\p{Script=Arabic}/u.test(step.action.reason)) {
      if (!window.speechSynthesis) { setError('An Arabic device voice is unavailable.'); return; }
      const utterance = new SpeechSynthesisUtterance(step.action.reason); utterance.lang = 'ar-SA';
      const voice = speechSynthesis.getVoices().find(v => v.lang.startsWith('ar'));
      if (!voice) { setError('Install an Arabic device voice to hear this reply.'); return; }
      utterance.voice = voice;
      utterance.onstart = () => { if (generation === epoch.current) { setPhase('playing'); onSpeaking(true); } };
      utterance.onend = () => { if (generation === epoch.current) stop(); };
      utterance.onerror = () => { if (generation === epoch.current) { stop(); setError('Your device voice could not play.'); } };
      speechSynthesis.speak(utterance); return;
    }
    setPhase('generating'); controller.current = new AbortController();
    try {
      const response = await fetch('/api/voice', { method: 'POST', cache: 'no-store', signal: controller.current.signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ stepId: step.id, voice: 'am_puck' }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Bebo’s voice is unavailable. Try again.'); }
      const blob = await response.blob(); if (generation !== epoch.current) return;
      url.current = URL.createObjectURL(blob); const audio = player.current = new Audio(url.current);
      audio.onplaying = () => { if (generation === epoch.current) { setPhase('playing'); onSpeaking(true); } };
      audio.onended = () => { if (generation === epoch.current) stop(); };
      audio.onerror = () => { if (generation === epoch.current) { stop(); setError('The reply could not play. Check your audio output.'); } };
      // Safari may require a second tap after asynchronous voice generation.
      await audio.play().catch(() => { if (generation === epoch.current) setPhase('ready'); });
    } catch (e) { if (generation === epoch.current) { stop(); setError(e instanceof Error ? e.message : 'Voice connection interrupted.'); } }
  }
  return <div className="phone-reply-voice"><button className="text-button" disabled={!online} onClick={() => phase === 'ready' ? void player.current?.play().catch(() => setError('Safari could not play audio. Check sound permissions.')) : phase === 'idle' ? void play() : stop()}>{['playing','generating'].includes(phase) ? <Square size={14} /> : <Volume2 size={15} />}{phase === 'generating' ? 'Preparing voice…' : phase === 'playing' ? 'Stop voice' : 'Hear reply'}</button>{error && <p className="phone-error" role="alert">{error}</p>}</div>;
}
