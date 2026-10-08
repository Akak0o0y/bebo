import { useCallback, useEffect, useRef, useState } from 'react';
export type VoiceBridge = {
  voiceGenerate?: (text: string, voice: string) => Promise<{ audio: string }>;
  voiceStop?: () => Promise<void>;
  cursorEnabled?: (enabled: boolean) => Promise<void>;
  cursorPreview?: () => Promise<void>;
};
export const voiceOptions = [
  { id: 'am_puck', label: 'Puck · American, male' },
  { id: 'af_heart', label: 'Heart · American, female' },
  { id: 'bm_george', label: 'George · British, male' },
  { id: 'device', label: 'Device voice · includes installed languages' },
];
export function useBeboVoice(enabled: boolean) {
  const [voice, setVoice] = useState(() => { try { const value = localStorage.getItem('bebo-voice') || 'am_puck'; return voiceOptions.some(v => v.id === value) ? value : 'am_puck'; } catch { return 'am_puck'; } });
  const [phase, setPhase] = useState<'idle' | 'generating' | 'speaking'>('idle');
  const [error, setError] = useState('');
  const generation = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const objectUrl = useRef('');
  const generating = useRef(false);
  const stop = useCallback(() => {
    generation.current++; audio.current?.pause(); audio.current = null;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); objectUrl.current = '';
    window.speechSynthesis?.cancel();
    if (generating.current) void window.bebo?.voiceStop?.().catch(() => {});
    generating.current = false; setPhase('idle');
  }, []);
  useEffect(() => { try { localStorage.setItem('bebo-voice', voice); } catch {} stop(); }, [voice, stop]);
  useEffect(() => { if (!enabled) stop(); }, [enabled, stop]);
  useEffect(() => () => stop(), [stop]);
  async function speak(text: string, preview = false) {
    if (!enabled && !preview) return;
    stop(); setError(''); const epoch = generation.current;
    if (voice === 'device' || !window.bebo?.voiceGenerate) {
      if (!window.speechSynthesis) { setError('No device voice is available.'); return; }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = /\p{Script=Arabic}/u.test(text) ? 'ar-SA' : 'en-US';
      utterance.voice = speechSynthesis.getVoices().find(v => v.lang.startsWith(utterance.lang.slice(0, 2))) || null;
      utterance.onstart = () => { if (generation.current === epoch) setPhase('speaking'); };
      utterance.onend = () => { if (generation.current === epoch) setPhase('idle'); };
      utterance.onerror = () => { if (generation.current === epoch) { setPhase('idle'); setError('The device voice could not speak. Try another installed voice.'); } };
      speechSynthesis.speak(utterance); return;
    }
    setPhase('generating'); generating.current = true;
    try {
      const result = await window.bebo.voiceGenerate(text, voice);
      if (generation.current !== epoch) return;
      generating.current = false;
      const bytes = Uint8Array.from(atob(result.audio), c => c.charCodeAt(0));
      const url = objectUrl.current = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
      const player = audio.current = new Audio(url);
      player.onplaying = () => { if (generation.current === epoch) setPhase('speaking'); };
      player.onended = () => { if (generation.current === epoch) stop(); };
      player.onerror = () => { if (generation.current === epoch) { stop(); setError('Audio could not play. Check your output device.'); } };
      await player.play();
    } catch (e) { if (generation.current === epoch) { stop(); setError(String(e).replace(/^Error: /, '')); } }
  }
  return { voice, setVoice, phase, error, speak, stop };
}
