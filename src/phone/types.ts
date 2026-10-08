import type { AvatarEnergy, AvatarMood } from '../avatar-state';

export type PhoneStep = { id: string; step: number; action: { type: string; reason: string; text: string; x: number; y: number } };
export type RemoteTask = { source?: 'desktop' | 'pet' | 'phone'; prompt: string; busy: boolean; acting: boolean; listening?: boolean; pending: PhoneStep | null; message: string; hasError: boolean; work?: {phase:string;steps:number;maxSteps:number}|null };
export type PhoneState = RemoteTask & { connected: boolean; mood: AvatarMood; color: string; energy: AvatarEnergy; approvalExpires: number | null; sessionExpires: number | null; transcription?: 'gpt-transcribe'|'device'; autoActions?: string[] };
export type AssistantPreferences = { transcription: 'gpt-transcribe'|'device'; autoActions: string[] };
export type PhoneConnection = { starting: boolean; enabled: boolean; url: string; error: string;
  invite: { token: string; code: string; expires: number } | null; request: { id: string; code: string; name: string } | null;
  device: { id: string; name: string; expires: number | null } | null; reconnectToken?: string };
export type PhoneBridge = {
  assistantGet?:()=>Promise<AssistantPreferences>; assistantSet?:(patch:Partial<AssistantPreferences>)=>Promise<AssistantPreferences>;
  onAssistantChanged?:(callback:(value:AssistantPreferences)=>void)=>()=>void;
  transcribe?:(bytes:Uint8Array,mime:string,language:string)=>Promise<string>; transcriptionStop?:()=>Promise<void>;
  taskState?: () => Promise<PhoneState>; answer?: (id: string, text: string) => Promise<PhoneStep>;
  onTaskState?: (callback: (state: PhoneState) => void) => () => void;
  companionMenu?: () => Promise<void>;
  companionBubble?: (open: boolean | 'none' | 'compact' | 'expanded') => Promise<void>;
  effectsGet?: () => Promise<ScreenEffects>;
  effectsSet?: (patch: Partial<ScreenEffects>) => Promise<ScreenEffects>;
  onEffectsChanged?: (callback: (effects: ScreenEffects) => void) => () => void;
  phoneStart?: () => Promise<PhoneConnection>; phoneStop?: () => Promise<void>; phoneStatus?: () => Promise<PhoneConnection>;
  phoneRefresh?: () => Promise<PhoneConnection>; phoneDecide?: (id: string, allow: boolean) => Promise<PhoneConnection>;
  phoneRevoke?: () => Promise<PhoneConnection>; phoneAppearance?: (value: { color: string; energy: AvatarEnergy }) => Promise<void>;
  onPhoneChanged?: (callback: (state: PhoneConnection) => void) => () => void;
  onRemoteTask?: (callback: (state: RemoteTask) => void) => () => void;
};
export type ScreenEffects = { cursor: boolean; dust: boolean; edges: boolean };
