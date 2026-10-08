export type AvatarMood = 'idle' | 'curious' | 'listening' | 'thinking' | 'working' | 'approval' | 'success' | 'help' | 'speaking' | 'sleeping' | 'wave' | 'boop' | 'dance';
export type AvatarEnergy = 'lively' | 'calm';
export const avatarMoods: Record<AvatarMood, { label: string; message: string; detail: string; color: string }> = {
 idle: { label: 'Ready when you are', message: 'A little curious. A lot of heart.', detail: 'Move your cursor. You have my attention.', color: '#92ad91' },
 curious: { label: 'Curious', message: 'Oh? What are we looking at?', detail: 'Following your cursor, one little glance at a time.', color: '#b6a1cd' },
 listening: { label: 'Listening', message: 'You have my full attention.', detail: 'Microphone is listening. Take your time.', color: '#e59c7f' },
 thinking: { label: 'Thinking', message: 'Let me connect a few dots…', detail: 'Considering your request and the next step.', color: '#ae98cf' },
 working: { label: 'Working', message: 'A little focus. A lot happening.', detail: 'Carrying out your approved step and checking what comes next.', color: '#7fa9b2' },
 approval: { label: 'Your turn', message: 'A little permission, please?', detail: 'Waiting for you to review the next action below.', color: '#d3a966' },
 success: { label: 'All done', message: 'We did a thing!', detail: 'Bebo has returned a completed result. Review it below.', color: '#92ad91' },
 help: { label: 'Needs a hand', message: 'A little help over here?', detail: 'Something needs your attention. Check the message below.', color: '#d79e74' },
 speaking: { label: 'Speaking', message: 'Here’s what I found.', detail: 'Reading the response aloud.', color: '#97b5a8' },
 sleeping: { label: 'A tiny breather', message: 'Dreaming in little pixels.', detail: 'Move your cursor or click Bebo to wake him.', color: '#a2a3c0' },
 wave: { label: 'Hello, human', message: 'Oh, hey. That’s my favorite human!', detail: 'A happy little bounce to say hello.', color: '#d2a378' },
 boop: { label: 'Booped!', message: 'Hey! That tickles.', detail: 'A tiny boop. A very happy Bebo.', color: '#dc9cad' },
 dance: { label: 'Little happy dance', message: 'I have absolutely no chill.', detail: 'A small dance break. No task is running.', color: '#b4a0cf' },
};
export function getTaskMood(input: { listening:boolean; speaking:boolean; busy:boolean; acting:boolean; pendingType?:string; hasError:boolean }):AvatarMood {
 if(input.listening)return 'listening';
 if(input.busy)return input.acting?'working':'thinking';
 if(input.speaking)return 'speaking';
 if(input.hasError)return 'help';
 if(input.pendingType==='done')return 'success';
 if(input.pendingType==='blocked')return 'help';
 if(input.pendingType==='ask')return 'help';
 if(input.pendingType)return 'approval';
 return 'idle';
}
