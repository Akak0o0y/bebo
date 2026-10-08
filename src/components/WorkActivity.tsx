import { useEffect, useState } from 'react';
import { Check, CircleHelp, FileText, Monitor, Terminal, LoaderCircle } from 'lucide-react';
import type { WorkHistory, WorkTask } from '../work-types';
import './work.css';

const usd = (amount: number) => amount > 0 && amount < .000001 ? '<$0.000001' : `$${amount.toFixed(6).replace(/0+$/, '').replace(/\.$/, '.00')}`;
function WorkCard({ task, compact }: { task: WorkTask; compact?: boolean }) {
  const running = ['running', 'waiting'].includes(task.status);
  return <article className={`work-card ${running ? 'work-active' : ''}`}>
    <div className="work-card-top"><span className={`work-status work-${task.status}`}>{task.status === 'running' ? <LoaderCircle size={12}/> : task.status === 'done' ? <Check size={12}/> : <CircleHelp size={12}/>} {task.status === 'done' ? 'Completed' : task.status === 'waiting' ? 'Your turn' : task.status}</span><time>{new Date(task.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
    <h3>{task.prompt}</h3><p className="work-phase" role={running ? 'status' : undefined}>{task.phase}</p>
    <div className="work-metrics"><span>{task.steps} / {task.maxSteps} steps</span><span>{task.stats.tokens.toLocaleString()} tokens</span><span>{usd(task.stats.estimatedUsd)} estimated{task.stats.unknownCosts > 0 ? ' + unknown' : ''}</span><span>{task.stats.screenshots} screen checks</span></div>
    <details className="work-details" open={compact ? undefined : running || undefined}>
      <summary>{compact ? 'See Bebo’s steps' : `${task.events.length} recorded steps`}</summary>
      {task.plan.length > 0 && <div className="work-plan"><b>The plan</b><ol>{task.plan.map((step, i) => <li key={i}>{step}</li>)}</ol><small>A checklist of intentions. Results appear below.</small></div>}
      <ol className="work-timeline">{task.events.map(event => <li key={event.id} data-status={event.status}><span className="work-tool-icon">{event.tool === 'run_powershell' ? <Terminal size={16}/> : ['observe_screen','desktop_action','inspect_computer'].includes(event.tool) ? <Monitor size={16}/> : <FileText size={16}/>}</span><div><div className="work-event-title"><b>{event.label}</b><span>{event.status === 'running' ? 'Working…' : `${(event.durationMs / 1000).toFixed(1)}s · ${event.status}`}</span></div><p>{event.summary}</p>{(event.details || event.output) && <details className="work-output"><summary>{event.tool === 'run_powershell' ? 'Command & output' : 'Details'}</summary>{event.details && <pre>{event.details}</pre>}{event.output && <pre className="work-terminal-output">{event.output}</pre>}</details>}</div></li>)}</ol>
      {!task.events.length && <p className="work-muted">Choosing the first tool…</p>}
    </details>
  </article>;
}
export function WorkActivity({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<WorkHistory|null>(null), [error, setError] = useState('');
  useEffect(() => {
    if (!window.bebo?.workHistory) return;
    let alive = true, version = 0;
    const refresh = () => { const epoch = ++version; void window.bebo!.workHistory!().then(value => { if (alive && epoch === version) { setData(value); setError(''); } }).catch(error => { if (alive && epoch === version) setError(String(error)); }); };
    const off = window.bebo.onWorkChanged?.(refresh); refresh();
    return () => { alive = false; off?.(); };
  }, []);
  if (compact && !data?.tasks.length) return null;
  if (!window.bebo?.workHistory) return null;
  async function clear() { try { await window.bebo!.workClear!(); } catch (error) { setError(String(error)); } }
  const tasks = compact ? data?.tasks.slice(0, 1) : data?.tasks;
  return <section className={`work-activity ${compact ? 'work-compact' : ''}`} aria-label={compact ? 'Current Bebo task' : 'Detailed task history'}>
    {!compact && <div className="section-title"><div><h2>How the work happened.</h2><p>Real steps, results, and the tools behind them.</p></div><button className="text-button" disabled={!data?.tasks.length || data.tasks.some(task => ['running','waiting'].includes(task.status))} onClick={() => void clear()}>Clear task history</button></div>}
    {error && <p role="alert">{error}</p>}{data?.warning && <p role="alert">{data.warning}</p>}
    {tasks?.map(task => <WorkCard key={task.id} task={task} compact={compact}/>)}
    {!compact && data?.tasks.length === 0 && <p className="work-muted">Your next adaptive task will appear here, step by step.</p>}
    {!compact && !!data?.tasks.length && <p className="work-history-note">Task summaries stay on this device. Raw command output and file contents are kept only for the current app session. Usage is stored separately.</p>}
  </section>;
}
