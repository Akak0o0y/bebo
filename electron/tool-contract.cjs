const string = (description, maxLength = 2000) => ({ type: 'string', description, maxLength });
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const enumeration = (...values) => ({ type: 'string', enum: values });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const reason = string('Short user-facing purpose, grounded in the current request.', 300);
const definitions = [
  ['inspect_computer', 'Read open Windows windows and foreground context. Verify which app is running or visible.', { reason }],
  ['close_windows', 'Gracefully close explicitly selected windows from the latest inspect_computer result. Excludes Bebo and system surfaces, preserves save prompts, never kills processes. Use this tool instead of PowerShell or Win32 scripts for closing windows. Inspect again afterwards.', { window_ids: { type: 'array', items: string('Exact closable window ID from inspect_computer.', 30), minItems: 1, maxItems: 80 }, reason }],
  ['find_apps', 'Find installed applications by name. Use the returned app ID to open one.', { query: string('Name fragment, or empty for a bounded list.', 100), reason }],
  ['open_app', 'Open a discovered installed app by exact ID. Inspect the computer or screen afterwards to verify.', { app_id: string('An ID returned by find_apps.', 300), reason }],
  ['list_files', 'Search names and metadata inside an allowed folder. Bounded traversal; never follows symlinks. No file contents are returned.', { path: string('Absolute folder path.', 500), query: string('Case-insensitive filename fragment, or empty.', 100), depth: integer(0, 4), sort: enumeration('name', 'newest', 'largest'), reason }],
  ['file_info', 'Check whether a specific file or folder exists and read its metadata.', { path: string('Absolute path within allowed folders.', 500), reason }],
  ['read_file', 'Read a bounded UTF-8 text file and its SHA-256. Secret files are excluded.', { path: string('Absolute text file path.', 500), reason }],
  ['write_file', 'Create or update a small UTF-8 file. Existing files require their current SHA-256 from read_file. Read back verifies the write.', { path: string('Absolute path; parent directory must exist.', 500), content: string('Exact text to write.', 32000), expected_sha256: string('Empty for a NEW file; exact current SHA-256 for an existing file.', 64), reason }],
  ['open_path', 'Open a folder or ordinary document in its default app. Scripts, executables and shortcuts are excluded. Verify visually afterwards.', { path: string('Absolute discovered file/folder path.', 500), reason }],
  ['open_url', 'Open an HTTP or HTTPS URL in the default browser. Verify the page after opening.', { url: string('Full URL without credentials.', 2000), reason }],
  ['run_powershell', 'Run a bounded local PowerShell script. Output, errors and exit code are returned. Each call starts a fresh shell. Do not create background jobs. Requires separate terminal permission.', { command: string('Exact PowerShell script. Use literal paths and explicit verification; do not print secrets.', 12000), cwd: string('Absolute working directory in allowed folders. This is NOT a shell sandbox.', 500), timeout_seconds: integer(1, 120), reason }],
  ['observe_screen', 'Take a fresh screenshot of the primary display. Returns the observation ID required for the next desktop action.', { reason }],
  ['desktop_action', 'Perform ONE mouse/keyboard action grounded in the newest screenshot. Observation must be fresh. Observe again after acting.', { observation_id: string('ID from the most recent observe_screen result.', 80), action: enumeration('click', 'double_click', 'scroll', 'type', 'key'), x: integer(0, 1000), y: integer(0, 1000), text: string('Literal typing, allowed key combination, or up/down for scrolling. Empty for clicks.', 4000), reason }],
  ['remember_plan', 'Keep a short task checklist and current next step. This records intentions, not verified outcomes.', { steps: { type: 'array', items: string('A short task step.', 160), minItems: 1, maxItems: 6 }, reason }],
  ['ask_user', 'Pause for missing information, ambiguity, or a decision. Never ask for a password or API key.', { question: string('The question to display on phone, avatar, and desktop.', 2000) }],
  ['finish', 'Finish with a truthful result. Done requires IDs of successful observations supporting the claim. Opening apps/documents requires a subsequent observation. Use blocked when the outcome cannot be verified.', { outcome: enumeration('done', 'blocked'), summary: string('Concise user-facing answer, including any unfinished portion.', 2000), evidence_ids: { type: 'array', items: string('A real result ID.', 80), maxItems: 10 } }],
];
const TOOLS = definitions.map(([name, description, properties]) => ({ type: 'function', name, description, strict: true, parameters: object(properties) }));
function check(value, schema, key) {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !Object.hasOwn(schema.properties, k)) || schema.required.some(k => !Object.hasOwn(value, k))) throw Error(`Invalid ${key} fields.`);
    for (const k of schema.required) check(value[k], schema.properties[k], k);
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || value.includes('\0') || (schema.maxLength && value.length > schema.maxLength) || (schema.enum && !schema.enum.includes(value))) throw Error(`Invalid ${key}.`);
  } else if (schema.type === 'integer') {
    if (!Number.isInteger(value) || value < schema.minimum || value > schema.maximum) throw Error(`Invalid ${key}.`);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > schema.maxItems || value.length < (schema.minItems || 0)) throw Error(`Invalid ${key}.`);
    value.forEach(v => check(v, schema.items, key));
  }
}
function validateTool(name, args) {
  const tool = TOOLS.find(tool => tool.name === name);
  if (!tool) throw Error('Unknown Bebo tool.');
  check(args, tool.parameters, name); return structuredClone(args);
}
function approvalText(name, args) {
  if (name === 'close_windows') return `Request graceful closure of ${args.window_ids.length} observed window(s). Unsaved-work prompts stay open. Bebo and Windows system surfaces are excluded.`;
  if (name === 'run_powershell') return `Folder: ${args.cwd}\nTime limit: ${args.timeout_seconds}s\n\n${args.command}`;
  if (name === 'write_file') return `${args.expected_sha256 ? 'Update' : 'Create'}: ${args.path}\n\n${args.content}`;
  return args.path || args.url || args.app_id || '';
}
module.exports = { TOOLS, validateTool, approvalText };
