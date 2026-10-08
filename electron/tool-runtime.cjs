const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { FileTools } = require('./file-tools.cjs');
const { validateTool, approvalText } = require('./tool-contract.cjs');
const { validateAction } = require('./policy.cjs');
const DOCUMENTS = new Set('.txt .md .pdf .doc .docx .xls .xlsx .ppt .pptx .png .jpg .jpeg .webp .gif .csv .json .log .html .htm .svg .rtf'.split(' '));
class ToolRuntime {
  constructor({ settings, native, capture, desktopAction, terminal, shell, now = () => Date.now() }) {
    Object.assign(this, { settings, native, capture, desktopAction, terminal, shell, now });
    this.files = new FileTools(() => settings.value.roots); this.observation = null; this.apps = new Set();
  }
  describe(name, args) {
    if (name !== 'close_windows') return approvalText(name, args);
    return approvalText(name, args) + '\n\n' + args.window_ids.map(id => {
      const win = this.windowObservation?.windows.find(item => item.id === id);
      return `• ${win ? win.title.slice(0, 180) + ' (' + win.app + ')' : 'Unobserved window: ' + id}`;
    }).join('\n');
  }
  async execute(name, args, signal, onOutput) {
    validateTool(name, args); signal?.throwIfAborted();
    let data, image, verifies = false;
    if (name === 'inspect_computer') { data = await this.native({ op: 'inspect' }); this.windowObservation = { at: this.now(), windows: structuredClone(data.windows) }; verifies = true; }
    else if (name === 'close_windows') {
      const snapshot = this.windowObservation;
      if (!snapshot || this.now() - snapshot.at > 60000) throw Error('Window list is stale. Inspect the computer again before closing windows.');
      const targets = [...new Set(args.window_ids)].map(id => {
        const win = snapshot.windows.find(item => item.id === id);
        if (!win) throw Error('This window has not been observed. Inspect the computer first.');
        if (!win.closable) throw Error(`This window is protected: ${win.protectedReason || 'Bebo or Windows system surface'}`);
        return win;
      });
      this.windowObservation = null; this.observation = null;
      data = await this.native({ op: 'close-windows', windows: targets });
      signal?.throwIfAborted();
      return { status: 'success', summary: `Requested closure of ${data.requested.length} windows; skipped ${data.skipped.length}. Verify which windows remain.`, data, verifies: false, next_actions: ['Inspect the computer again. Report remaining windows or save prompts; never force-close unsaved work.'], artifacts: [] };
    }
    else if (name === 'find_apps') { data = await this.native({ op: 'apps', query: args.query }); for (const item of data.apps) this.apps.add(item.id); verifies = true; }
    else if (name === 'open_app') {
      if (!this.apps.has(args.app_id)) throw Error('Find this app first; its ID has not been observed in this task.');
      this.observation = null; data = await this.native({ op: 'open-app', appId: args.app_id });
    } else if (name === 'list_files') { data = await this.files.list(args, signal); verifies = true; }
    else if (name === 'file_info') { data = await this.files.info(args.path); verifies = true; }
    else if (name === 'read_file') { data = await this.files.read(args.path); verifies = true; }
    else if (name === 'write_file') { data = await this.files.write(args, signal); verifies = true; }
    else if (name === 'open_path') {
      const target = await this.files.resolve(args.path), s = await fs.stat(target);
      if (!s.isDirectory() && !DOCUMENTS.has(path.extname(target).toLowerCase())) throw Error('This file type cannot be opened directly. Use an approved terminal command for executable files.');
      signal?.throwIfAborted(); const error = await this.shell.openPath(target); if (error) throw Error(error);
      this.observation = null; data = { path: target, requested: true, note: 'Opening was requested. Verify the resulting window before reporting completion.' };
    } else if (name === 'open_url') {
      const url = new URL(args.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Use an HTTP or HTTPS URL without embedded credentials.');
      await this.shell.openExternal(url.href); this.observation = null; data = { url: url.href, requested: true };
    } else if (name === 'run_powershell') {
      if (this.settings.value.terminal === 'off') throw Error('Terminal tools are disabled. Use files, apps, or screen controls.');
      const cwd = await this.files.resolve(args.cwd);
      if (!(await fs.stat(cwd)).isDirectory()) throw Error('The terminal working directory must be a folder.');
      this.observation = null;
      this.windowObservation = null;
      data = await this.terminal.run({ ...args, cwd }, signal, onOutput);
      return { status: data.timedOut || data.exitCode !== 0 ? 'error' : 'success', summary: data.timedOut ? 'Command timed out; its process tree was stopped.' : `PowerShell exited with code ${data.exitCode}.`, data, verifies: data.exitCode === 0 && !data.timedOut,
        next_actions: data.exitCode === 0 && !data.timedOut ? ['Inspect the requested outcome; exit code alone does not prove the task succeeded.'] : ['Read stderr and inspect current state before changing the command. Do not repeat the same failing command.'], artifacts: [] };
    } else if (name === 'observe_screen') {
      const captured = await this.capture(); signal?.throwIfAborted();
      const { image: png, ...context } = captured; image = png;
      this.observation = { id: randomUUID(), at: this.now(), context };
      data = { observation_id: this.observation.id, capturedAt: new Date(this.observation.at).toISOString(), ...context }; verifies = true;
    } else if (name === 'desktop_action') {
      const observation = this.observation;
      if (!observation || observation.id !== args.observation_id || this.now() - observation.at > 60000) throw Error('The screenshot is stale. Observe the screen again and choose a new action.');
      const action = validateAction({ type: args.action, x: args.x, y: args.y, text: args.text, reason: args.reason });
      this.observation = null;
      await this.desktopAction(action, observation.context); data = { sent: true, note: 'Observe the screen again to check the result.' };
    } else throw Error('Unsupported execution tool.');
    signal?.throwIfAborted();
    const summary = name === 'list_files' ? `Found ${data.entries.length} matches${data.truncated ? ' (bounded search; more may exist)' : ''}.` : name === 'file_info' ? (data.exists ? `${data.kind} exists: ${data.path}` : `Path does not exist: ${data.path}`) : name === 'write_file' ? `Saved and verified ${data.bytes} bytes.` : name === 'read_file' ? `Read text${data.truncated ? ' (truncated)' : ''}.` : name === 'find_apps' ? `Found ${data.apps.length} installed apps.` : name === 'inspect_computer' ? `Observed ${data.windows.length} open windows.` : name === 'observe_screen' ? 'Fresh screen captured.' : 'Action sent. Verify the result.';
    return { status: 'success', summary, data, image, verifies, next_actions: verifies ? [] : ['Inspect the resulting state before finishing.'], artifacts: data.path ? [data.path] : [] };
  }
}
module.exports = { ToolRuntime };
