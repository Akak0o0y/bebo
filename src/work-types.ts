export type WorkPreferences = { mode: 'adaptive'|'screen'; terminal: 'off'|'ask'|'auto'; autoFiles: boolean; autoApps: boolean; roots: string[]; maxSteps: number; maxMinutes: number; maxCostUsd: number };
export type WorkEvent = { id: string; tool: string; label: string; at: string; status: string; summary: string; durationMs: number; details?: string; output?: string; artifacts: string[] };
export type WorkTask = { id: string; prompt: string; status: string; phase: string; startedAt: string; endedAt: string|null; steps: number; maxSteps: number; plan: string[]; events: WorkEvent[]; stats: { requests: number; tokens: number; estimatedUsd: number; unknownCosts: number; screenshots: number; retries: number } };
export type WorkHistory = { tasks: WorkTask[]; warning: string };
export type WorkBridge = {
  workSettings?:()=>Promise<WorkPreferences>;
  workConfigure?:(patch:Partial<WorkPreferences>)=>Promise<WorkPreferences>;
  workFolder?:()=>Promise<WorkPreferences>;
  workHistory?:()=>Promise<WorkHistory>;
  workClear?:()=>Promise<void>;
  onWorkChanged?:(callback:()=>void)=>()=>void;
  onWorkSettingsChanged?:(callback:(value:WorkPreferences)=>void)=>()=>void;
};
