const fs = require('node:fs');
const path = require('node:path');

function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid work settings.');
  const keys = ['mode', 'terminal', 'autoFiles', 'autoApps', 'roots', 'maxSteps', 'maxMinutes', 'maxCostUsd'];
  if (Object.keys(value).some(key => !keys.includes(key))) throw Error('Unknown work setting.');
  if ('mode' in value && !['adaptive', 'screen'].includes(value.mode)) throw Error('Unknown work mode.');
  if ('terminal' in value && !['off', 'ask', 'auto'].includes(value.terminal)) throw Error('Unknown terminal permission.');
  for (const key of ['autoFiles', 'autoApps']) if (key in value && typeof value[key] !== 'boolean') throw Error('Invalid automatic permission.');
  if ('roots' in value && (!Array.isArray(value.roots) || value.roots.length > 20 || value.roots.some(root => typeof root !== 'string' || !path.isAbsolute(root) || root.length > 500))) throw Error('Choose up to 20 absolute folder paths.');
  for (const [key, min, max] of [['maxSteps', 5, 100], ['maxMinutes', 1, 30]]) if (key in value && (!Number.isInteger(value[key]) || value[key] < min || value[key] > max)) throw Error(`Invalid ${key} limit.`);
  if ('maxCostUsd' in value && (!Number.isFinite(value.maxCostUsd) || value.maxCostUsd < .01 || value.maxCostUsd > 20)) throw Error('Choose a task budget between $0.01 and $20.');
}
class WorkSettings {
  constructor(root, folders = []) {
    this.file = path.join(root, 'work-settings.json');
    this.value = { mode: 'adaptive', terminal: 'ask', autoFiles: false, autoApps: true, roots: [...new Set(folders)], maxSteps: 40, maxMinutes: 10, maxCostUsd: .5 };
    try { const saved = JSON.parse(fs.readFileSync(this.file, 'utf8')); validate(saved); this.value = { ...this.value, ...saved }; } catch {}
  }
  update(patch) {
    validate(patch);
    const next = { ...this.value, ...patch };
    if ('roots' in patch) next.roots = [...new Set(patch.roots.map(folder => {
      const real = fs.realpathSync(folder);
      if (!fs.statSync(real).isDirectory()) throw Error('Choose a folder, not a file.');
      return real;
    }))];
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(next)); fs.renameSync(this.file + '.tmp', this.file);
    this.value = next; return structuredClone(next);
  }
  allows(name) {
    if (name === 'run_powershell') return this.value.terminal === 'auto';
    if (name === 'write_file') return this.value.autoFiles;
    if (['open_app', 'open_path', 'open_url'].includes(name)) return this.value.autoApps;
    return !['close_windows', 'desktop_action', 'ask_user', 'finish'].includes(name);
  }
}
module.exports = { WorkSettings };
