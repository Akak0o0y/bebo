const fs = require('node:fs');
const path = require('node:path');
const text = (value, max = 20000) => typeof value === 'string' && value.length <= max;
const count = value => Number.isSafeInteger(value) && value >= 0;
const date = value => text(value, 80) && Number.isFinite(Date.parse(value));
const statuses = new Set(['running', 'waiting', 'done', 'blocked', 'stopped', 'error', 'interrupted']);
function validTask(task) {
  return task && text(task.id, 100) && text(task.prompt, 4000) && statuses.has(task.status) && text(task.phase) && date(task.startedAt)
    && (task.endedAt === null || date(task.endedAt)) && count(task.steps) && count(task.maxSteps) && task.maxSteps <= 100
    && Array.isArray(task.plan) && task.plan.length <= 20 && task.plan.every(step => text(step))
    && task.stats && ['requests', 'tokens', 'unknownCosts', 'screenshots', 'retries'].every(key => count(task.stats[key]))
    && Number.isFinite(task.stats.estimatedUsd) && task.stats.estimatedUsd >= 0
    && Array.isArray(task.events) && task.events.length <= 100 && task.events.every(event => event
      && text(event.id, 100) && text(event.tool, 100) && text(event.label) && text(event.summary) && date(event.at)
      && ['running', 'success', 'error', 'stopped', 'interrupted'].includes(event.status) && Number.isFinite(event.durationMs) && event.durationMs >= 0
      && Array.isArray(event.artifacts) && event.artifacts.length <= 100 && event.artifacts.every(item => text(item, 1000)));
}
class TaskJournal {
  constructor(root) {
    this.file = path.join(root, 'work-history.json'); this.tasks = []; this.live = new Map(); this.warning = ''; this.readFailed = false;
    try {
      if (fs.statSync(this.file).size > 16 * 1024 * 1024) throw Error('History too large');
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!Array.isArray(saved) || saved.length > 30 || saved.some(t => !validTask(t)) || new Set(saved.map(t => t.id)).size !== saved.length) throw Error('Invalid history');
      this.tasks = saved.map(t => ({ ...t,
        ...(['running', 'waiting'].includes(t.status) ? { status: 'interrupted', phase: 'Interrupted when Bebo closed' } : {}),
        events: t.events.map(({ details, output, ...event }) => event.status === 'running' ? { ...event, status: 'interrupted', summary: 'Bebo closed before this step returned a result.' } : event),
      }));
    } catch (error) { if (error.code !== 'ENOENT') { this.readFailed = true; this.warning = 'Earlier task history could not be read. Its file has been preserved.'; } }
  }
  save(task) {
    // Raw commands, file contents, terminal output and screenshots stay in memory.
    const saved = { ...task, events: task.events.map(({ details, output, ...event }) => event) };
    this.tasks = [saved, ...this.tasks.filter(t => t.id !== task.id)].slice(0, 30);
    this.live.set(task.id, structuredClone(task));
    for(const id of this.live.keys())if(!this.tasks.some(t=>t.id===id))this.live.delete(id);
    if (this.readFailed) return;
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.tasks)); fs.renameSync(this.file + '.tmp', this.file); this.warning = ''; }
    catch { this.warning = 'Task history could not be saved. Current progress is still available.'; }
  }
  snapshot(current) { const tasks=this.tasks.map(task=>this.live.get(task.id)||task);return { warning: this.warning, tasks: current ? [current, ...tasks.filter(t => t.id !== current.id)] : tasks }; }
  clear() {
    if (this.readFailed) throw Error('Unreadable history has been preserved. Remove it manually if you want to start over.');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', '[]'); fs.renameSync(this.file + '.tmp', this.file); this.tasks = [];this.live.clear();
  }
}
module.exports = { TaskJournal };
