// Preload for native source QA. Run Vite first; never rebuild or use stale dist UI.
const { _electron } = require('playwright/test');
const launch = _electron.launch.bind(_electron);
process.env.BEBO_SOURCE_QA = '1';
_electron.launch = options => launch({ ...options, args: options.args?.includes('.') && !options.args.includes('--dev') ? [...options.args, '--dev'] : options.args });
