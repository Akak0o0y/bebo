# Developer guide

## Local setup

Windows x64 and Node 24 are the validated desktop environment. Chrome is used
by Playwright. Install dependencies from the lockfile:

```powershell
npm ci
npm run desktop:dev
```

`desktop:dev` verifies the pinned voice and phone resources, starts Vite at
`http://127.0.0.1:5173`, and launches Electron with the native bridge.
`npm run dev` starts only the browser UI. Enter a provider key through the
connection UI only when you intend to exercise a real model account.

## Source map

| Location | Responsibility |
| --- | --- |
| `src/main.tsx`, `src/components/` | Dashboard, avatar, settings, activity, usage, voice, and questions |
| `src/phone/` | Pairing and phone controller, hold/release recording, reply playback |
| `src/vendor/aora-bot/` | Vendored avatar engine; preserve upstream notices |
| `electron/main.cjs`, `preload.cjs` | App/window lifecycle, trusted IPC, task and connection orchestration |
| `electron/agent-session.cjs`, `tool-contract.cjs`, `tool-runtime.cjs` | Bounded model loop, tool validation, permission and evidence handoffs |
| `electron/file-tools.cjs`, `terminal-runner.cjs`, `terminal.ps1`, `windows.ps1` | Scoped files, cancellable PowerShell, Windows observation and input |
| `electron/cursor-overlay.cjs`, `cursor-renderer.js`, `control-cancel.*` | Visible cursor/effects and interactive Cancel surface |
| `electron/phone-*.cjs` | HTTP access, pairing, registration, and temporary tunnel |
| `electron/credential-store.cjs`, `usage-store.cjs`, `task-journal.cjs` | Encrypted connection, estimated accounting, and bounded history |
| `electron/voice-*`, `transcription-service.cjs` | Local synthesis and provider transcription |
| `tests/`, `tests/ui/` | Backend, browser, real Windows, and delivery fixtures |
| `public/vendor/`, `scripts/prepare-*.cjs` | Licensing, resource provenance, and pinned build-time downloads |

Read [adaptive-work.md](adaptive-work.md) for the task-loop architecture and
[reliability-audit.md](reliability-audit.md) for reproduced defects and evidence.

## Checks

```powershell
npm test
npm run build
npm run test:ui
```

Backend tests use controlled provider responses. Three native backend checks
are Windows-only; they are skipped on other platforms. Browser tests mock
the native bridge and start/reuse a Vite server. They use isolated Chrome
profiles and do not establish real iPhone or model quality.

Native smoke scripts can run against the built source app:

```powershell
node tests/desktop-smoke.cjs
node tests/adaptive-native-smoke.cjs
node tests/reliability-native-smoke.cjs
node tests/overlay-recovery-native-smoke.cjs
```

For current React source without a production build, keep `npm run dev`
running and use `node --require ./tests/source-runtime.cjs tests/desktop-smoke.cjs`.
This preload is for source QA; do not use it for packaged checks.

Native scripts use temporary profiles. Pointer/keyboard tests act on disposable
fixtures and must run sequentially. Recording checks briefly capture a real
microphone locally; local voice checks synthesize and play audio. The opt-in
`tests/phone-live-smoke.cjs` opens a temporary public Cloudflare link, runs a
controlled test task, revokes its isolated registration, and closes the tunnel.
Mocked decisions do not incur provider charges.

## Packaging

```powershell
npm run package:win -- --config.directories.output=release/audited --config.win.artifactName=Bebo-1.1.1.exe
node scripts/verify-package.cjs release/audited/win-unpacked
node tests/desktop-smoke.cjs release/audited/win-unpacked/Bebo.exe
node tests/reliability-native-smoke.cjs release/audited/win-unpacked/Bebo.exe
node tests/portable-launch-smoke.cjs release/audited/Bebo-1.1.1.exe
```

The package command does not publish. Its pre-step verifies/downloads pinned
cloudflared and Kokoro resources. Generated binaries and model weights stay
out of Git. Most native automation targets `win-unpacked/Bebo.exe`; the portable
launcher test exercises the self-extracting executable itself.

In the tested electron-builder implementation, `portable.unpackDirName: true`
uses a per-launch extraction directory. Keep the actual double-launch regression:
sharing an extraction directory can delete the running session's Windows helper.

## CI and evidence

GitHub Actions runs Windows backend tests and production compilation, plus
browser fixture tests in a separate job. Pull-request jobs use read-only
repository permissions and need no provider secrets.

Keep raw local logs/profiles in ignored `artifacts/` and `test-results/`.
Publish only reviewed screenshots or aggregate evidence without private data.
The [v1.1.1 validation record](validation/v1.1.1.json) separates checked paths
from remaining real-model/device acceptance. Do not describe mocks as live
model results or an observation checklist as completed effects.
