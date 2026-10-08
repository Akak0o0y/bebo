import { useEffect, useState } from 'react';
import { FolderPlus, Terminal, X } from 'lucide-react';
import type { WorkPreferences } from '../work-types';
import './work.css';

export function WorkSettings() {
  const [value, setValue] = useState<WorkPreferences|null>(null), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  useEffect(() => { let alive = true, received = false; const off = window.bebo?.onWorkSettingsChanged?.(data => { received = true; setValue(data); }); void window.bebo?.workSettings?.().then(data => { if (alive && !received) setValue(data); }).catch(error => { if (alive) setError(String(error)); }); return () => { alive = false; off?.(); }; }, []);
  async function save(patch: Partial<WorkPreferences>) {
    setSaving(true); setError('');
    try { setValue(await window.bebo!.workConfigure!(patch)); } catch (error) { setError(String(error).replace(/^Error: /, '')); } finally { setSaving(false); }
  }
  async function addFolder() { setSaving(true); setError(''); try { setValue(await window.bebo!.workFolder!()); } catch (error) { setError(String(error)); } finally { setSaving(false); } }
  return <section className="work-settings" aria-label="How Bebo works">
    <div className="work-section-heading"><Terminal size={19}/><div><h3>A little more capable.</h3><p>Files, apps, terminal, and a pair of eyes.</p></div></div>
    {!value ? <p>{error || (window.bebo?.workSettings ? 'Loading work preferences…' : 'Open the Windows app to configure Bebo’s tools.')}</p> : <>
      <label htmlFor="work-mode">How to work</label><select id="work-mode" value={value.mode} disabled={saving} onChange={e => void save({ mode: e.target.value as WorkPreferences['mode'] })}><option value="adaptive">Adaptive · choose the right tool</option><option value="screen">Screen only · mouse and keyboard</option></select>
      <p>Adaptive work uses files and apps directly, then checks the screen when the task needs it. Luna 6 stays in charge of planning.</p>
      <label htmlFor="work-terminal">Terminal access</label><select id="work-terminal" value={value.terminal} disabled={saving} onChange={e => void save({ terminal: e.target.value as WorkPreferences['terminal'] })}><option value="ask">Show me the command first</option><option value="auto">Allow commands within my requests</option><option value="off">Terminal off</option></select>
      <p>{value.terminal === 'auto' ? 'Commands run automatically within your request, using your Windows account. They can access files beyond the folders below.' : value.terminal === 'ask' ? 'Review the exact command and folder on your desktop, avatar, or phone. A command uses your Windows account and can access files beyond the folders below.' : 'Bebo will use file, app, and screen tools.'}</p>
      <label className="automatic-action"><input type="checkbox" checked={value.autoApps} disabled={saving} onChange={e => void save({ autoApps: e.target.checked })}/><span>Open apps, documents, and websites automatically</span></label>
      <label className="automatic-action"><input type="checkbox" checked={value.autoFiles} disabled={saving} onChange={e => void save({ autoFiles: e.target.checked })}/><span>Create and update text files automatically</span></label>
      <p>Reading allowed files and inspecting apps do not need a separate approval. Existing mouse and keyboard choices still apply.</p>
      <div className="work-folder-heading"><b>Folders for file tools</b><button className="text-button" disabled={saving || value.roots.length >= 20} onClick={() => void addFolder()}><FolderPlus size={14}/>Add folder</button></div>
      <ul className="work-folders">{value.roots.map(root => <li key={root}><span title={root}>{root}</span><button disabled={saving} aria-label={`Remove allowed folder ${root}`} onClick={() => void save({ roots: value.roots.filter(folder => folder !== root) })}><X size={13}/></button></li>)}</ul>
      {!value.roots.length && <p>No folders allowed yet. Add a folder for file and terminal work.</p>}
      <div className="work-limits">
        <label>Steps per task<select aria-label="Steps per task" disabled={saving} value={value.maxSteps} onChange={e => void save({ maxSteps: Number(e.target.value) })}>{[20,40,60,100].map(n => <option key={n} value={n}>{n} steps</option>)}</select></label>
        <label>Time per task<select aria-label="Time per task" disabled={saving} value={value.maxMinutes} onChange={e => void save({ maxMinutes: Number(e.target.value) })}>{[5,10,20,30].map(n => <option key={n} value={n}>{n} minutes</option>)}</select></label>
        <label>Estimated budget<select aria-label="Estimated task budget" disabled={saving} value={value.maxCostUsd} onChange={e => void save({ maxCostUsd: Number(e.target.value) })}>{[.05,.1,.5,1,5].map(n => <option key={n} value={n}>${n.toFixed(2)} / task</option>)}</select></label>
      </div>
      <p>The estimate is checked between model calls; a call in progress can exceed it. Missing pricing stays marked unknown. Steps and time still limit the task.</p>
      <small>Changing work permissions stops the current task. Ctrl + Alt + Escape also stops terminal commands.</small>
      {error && <p role="alert" className="voice-error">{error}</p>}
    </>}
  </section>;
}
