# Bebo reliability audit — 8 October 2026

**Source audit completed; the owner subsequently authorized packaging. Bebo 1.1.1 was built and passed nine packaged delivery checks. Live model/device acceptance remains pending.**

The reported `Object has been destroyed` failure was reproduced, repaired, and verified in real Electron. Broader testing exposed additional defects in phone replay protection, file updates, saved state, dashboard recovery, and cancellation. They now have regression coverage. This is evidence for the tested paths, not a guarantee against every future failure.

An earlier packaging process finished before the owner's instruction to test first arrived. Its `release/reliable` output was not opened or accepted. It predates later audit repairs and is not a release candidate. No further build, package, installation, taskbar change, or replacement of the owner's running Bebo was performed during this audit.

## Authorized build — 8 October 2026

Following the completed source audit, the owner authorized packaging. The fresh Windows x64 portable executable is [Bebo-1.1.1.exe](https://github.com/Akak0o0y/bebo/releases/download/v1.1.1/Bebo-1.1.1.exe), version **1.1.1**, **827,287,878 bytes**. Other local release folders remain historical. No installation or taskbar target was changed during validation.

All **129** files in the source audit manifest were unchanged when packaging ran. TypeScript and the production Vite build passed. The bundle emitted a size advisory for its 558.90 kB JavaScript chunk; this did not prevent compilation or the following delivery checks. All **55** packaged first-party application files match source byte for byte. Version, both PowerShell resources, the pinned Cloudflare binary, and all **7** local voice assets were verified in the final package.

**Nine packaged checks passed:** startup/avatar/IPC boundaries; adaptive file/terminal/screen/questions/cancellation; window closure/provider failures/key encryption and restart; destroyed overlay recovery; active-only border and Cancel; real offline voice synthesis/playback/Stop; single-instance restoration; real HTTPS phone pairing, question/approval/file task, usage, remembered registration, Stop and revocation; and two launches of the actual portable wrapper. Duplicate portable launch preserved the original process and its extracted Windows script throughout cleanup.

These checks used isolated profiles and controlled model decisions. The phone controller was served from the packaged production assets over the real HTTPS tunnel, using Chrome at phone dimensions. The expected HTTP 401 after explicit phone revocation confirms access removal. The test tunnel was closed afterward. This does not establish physical iPhone behavior or live Luna quality, and no existing user profile was migrated as part of these tests.

The reviewed [public validation record](validation/v1.1.1.json) includes check timings and package integrity. Raw local receipts and profiles remain in ignored `artifacts/` and temporary folders. The portable executable's SHA-256 is `9d5956f236eef16810053dce7e4720aadd2e6af78898d592ade0a49d13a54036`.

## Scope

Reviewed first-party task orchestration, model/tool contracts, permissions, files, terminal, Windows input/window management, overlay lifecycle, phone server/trust/tunnel, recording/transcription, local speech, history/accounting/credentials, React input/state/rendering, and distribution configuration. Third-party avatar integration, provenance, asset checksums, and installed dependency advisories were checked. Upstream libraries and model binaries were not exhaustively audited line by line.

Native checks used separate temporary profiles, disposable windows/files, and controlled model responses. A real microphone check captured approximately half a second locally; audio was not uploaded to a provider. Offline voice synthesis and playback were real. Phone API traffic crossed a real temporary Cloudflare HTTPS tunnel. Current React source was served through Vite with test forwarding of API traffic to that tunnel, without generating a production build.

## Findings and repairs

P1 denotes crash, data/control loss, duplicate effects, or loss of a normal recovery path. P2 denotes a bounded failure or stale/misleading state. Reproduced defects have high confidence; prevention based on source review is identified explicitly.

| Severity | Failure mechanism | Repair and evidence |
| --- | --- | --- |
| P1 | Closing Cancel left a destroyed window in the overlay pair; presence updates dereferenced it. | Remove the pair before destroying either member, recover both members, and guard window/web-content callbacks. `electron/cursor-overlay.cjs:19`; red then green `tests/overlay-recovery-native-smoke.cjs`. |
| P1 | Overlay close protection vetoed quit before `will-quit` cleanup could run. | Idempotent cleanup now runs in `before-quit`. `electron/main.cjs:312`; active-task shutdown in `tests/reliability-native-smoke.cjs`. |
| P1 | Generated bulk-close scripts included Cancel Bebo and assigned PowerShell's read-only `$PID`. | Native `close_windows` uses fresh observed IDs, owner/process-start/class/title checks, protected Bebo/system/dialog surfaces, graceful closure, and later verification. Normal/save-prompt/untouched fixtures pass. `electron/windows.ps1`, `electron/tool-runtime.cjs:24`. Arbitrary approved shell access remains a separate permission. |
| P1 | The API key disappeared at restart. | Windows-encrypted persistence, validated replacement, explicit Forget, stale-check cancellation, and readable storage errors. Real encryption and restart verified. `electron/credential-store.cjs`; credential and native reliability tests. |
| P1 | Phone receipts expired five minutes after dispatch, even during pending work. Retries could dispatch twice. | Pending receipts never expire; normal completed receipts remain 30 minutes. Revocation clears the old device's receipts. Regression failed with two dispatches and now passes with one. `electron/phone-server.cjs:137`. |
| P1 | Receipt saturation returned HTTP 429 for emergency Stop. | Stop has a separate bounded cache and coalesces pending cancellation. It never evicts normal operation receipts. Saturation, Stop, and replay tests pass. `tests/audit-regressions.test.cjs`. |
| P1 | An interrupted direct write truncated existing content. | Stage, flush and verify a temporary file, recheck the original hash, publish by rename or exclusive link, then read back. Disk-full and intervening-edit regressions preserve content. `electron/file-tools.cjs:67`. |
| P1 | Dashboard reload lost a waiting approval because only future events were subscribed to. | Fetch current state at mount; newer events supersede stale initial reads. Browser and real Electron reload checks restore approval without writing. `src/main.tsx:56`; `tests/audit-lifecycle-native-smoke.cjs`. |
| P2 | Malformed JSON history could crash rendering on missing plans, statistics, or events. | Bounded nested validation and quarantine preserve the original file. Interrupted events are marked; new work remains usable in memory. `electron/task-journal.cjs:7`. |
| P2 | Invalid UTF-8 was silently decoded with replacement characters. | Fatal decoding rejects unsupported encoding and preserves original bytes. `electron/file-tools.cjs:53`; encoding regression passes. |
| P2 | Full storage or damaged preferences could blank the dashboard; a redundant failed write made a registered phone appear unpaired. | Validate preferences, tolerate writes failing, retain existing registration, and fall back to session storage. `src/storage.ts`, `src/phone/PhoneController.tsx:12`; browser recovery checks pass. |
| P2 | Expired approvals/questions left backend tasks waiting after the UI reported an error. | Typed expiry errors clear the old task; forged/stale IDs cannot cancel a different valid task. Both expiry paths and a subsequent request pass in Electron. `electron/policy.cjs`, `electron/main.cjs:200`. |
| P2 | Phone control/pairing fetches could wait indefinitely. | Bounded timeouts, independent state polling, and no automatic replay of ambiguous commands. Timeout regression proves one dispatch and restored controls. `src/phone/PhoneController.tsx:53`. |
| P2 | Terminating the helper between key-down/key-up calls could leave a modifier held. | Queue down/up together for chords/clicks and reject input while a human modifier is held. Real Unicode typing, Ctrl+A, replacement, approved and automatic clicks pass. Source-review prevention; arbitrary instruction-level process death was not exhaustively injected. `electron/windows.ps1:21`. |
| P2 | Late sends/display refresh failures could reach destroyed web contents or become unhandled errors. | Guard window delivery and catch display-refresh failure. Destruction, companion closure, Stop and shutdown checks pass. `electron/window-state.cjs`, `electron/main.cjs`. |

Input queuing follows Microsoft's [SendInput contract](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput): one call inserts its events serially without interleaved input. It does not bypass Windows integrity restrictions or guarantee the target app's interpretation.

## Architecture review

| Layer | Enforced behavior and limits |
| --- | --- |
| Prompt/task intent | Original request and human clarifications retained. External content is labelled untrusted. Semantic prompt-injection resistance remains unproved. |
| History | Bounded recent call/result pairs; old image payloads discarded; summaries refer to recorded IDs. |
| Memory/persistence | Encrypted connection/registration, bounded task summaries, no automatic task replay, corrupt-state preservation, unknown costs distinguished from zero. |
| Distillation/recall | No learned long-term retrieval or background disk index. The notebook uses recorded task observations. |
| Tool selection | Strict argument schemas and one function call per response. Terminal-off is enforced again by the runtime. |
| Execution | Scoped file tools, stale hashes, approvals, one-use observations, protected close targets, cancellable Windows process tree. Approved shell commands still use the user's Windows access. |
| Observation interpretation | Timestamped results and explicit errors; truncated searches disclosed; native launch/close requests do not claim completed effects. Shell exit describes execution. |
| Answer construction | Done needs real successful evidence IDs, with later observation after visual effects. This verifies provenance, not complete semantic correctness. |
| Rendering | State restored after reload, malformed persisted state rejected, stale responses ignored, small result bubbles and recoverable overlay pairs. |
| Repair | Bounded repeat/failure/step/time/cost limits; Stop; deadline cancellation; expiry cleanup. No unlimited or silent paid-call retry. |

## Source audit validation results (before packaging)

| Check | Result |
| --- | --- |
| Node unit/integration | **47 passed**, including real Windows awareness and PowerShell output, nonzero exit, timeout and child cancellation. Final phone-cache refinements also passed all 16 affected phone/audit cases. |
| Browser UI | **45 distinct cases validated**: clean full run of 44, then all four recovery cases including the added network-timeout case. The cursor test records transitions instead of racing one transient frame. |
| Windows/Electron | **16 scenarios passed** across 15 scripts. Final overlay/reliability reruns passed after lifecycle/input changes. |
| TypeScript | `npx tsc --noEmit` passed. No production bundle generated. |
| Electron syntax | All **27** JavaScript/CommonJS files parsed. |
| Resources | All configured native resources exist; Cloudflare binary and **7** Kokoro assets match pinned checksums. No download performed. |
| Dependencies | `npm audit --json`: **0 known vulnerabilities** across 421 dependencies. This is the registry advisory result, not proof of no vulnerabilities. |

Native scenarios: startup/no-key/sender boundary; adaptive file/terminal/screen/question loop; graceful close/key/restart/failure recovery; overlay destruction; active-only border/Cancel; companion question/menu/effects; usage persistence; phone registration/native microphone cancellation; real microphone transport; offline voice/playback/Stop; single-instance behavior; Unicode input fixture; approved click; automatic click; real HTTPS phone workflow; dashboard reload/expiry/recovery.

Model decisions and transcription text were controlled fixtures. No paid inference/transcription request was made. Test screenshots stayed local. HTTPS used only isolated registration and test-task data; registration was revoked and the tunnel closed afterward.

## Reproduce without building

From the repository root:

```powershell
npm test
npx tsc --noEmit
npx playwright test --workers=2
```

Start `npm run dev` in one terminal. Run native checks sequentially in another:

```powershell
$checks = @(
  'desktop-smoke.cjs', 'adaptive-native-smoke.cjs',
  'reliability-native-smoke.cjs', 'overlay-recovery-native-smoke.cjs',
  'control-border-native-smoke.cjs', 'companion-native-smoke.cjs',
  'usage-native-smoke.cjs', 'phone-mic-native-smoke.cjs',
  'recording-native-smoke.cjs', 'voice-native-smoke.cjs',
  'single-instance-native-smoke.cjs', 'audit-lifecycle-native-smoke.cjs'
)
foreach ($check in $checks) {
  node --require ./tests/source-runtime.cjs "tests/$check"
  if ($LASTEXITCODE -ne 0) { throw "Failed: $check" }
}
node tests/native-input.cjs
node --require ./tests/source-runtime.cjs tests/cursor-live-smoke.cjs
node --require ./tests/source-runtime.cjs tests/cursor-live-smoke.cjs --auto
```

Recording briefly uses the real microphone; pointer/input checks target disposable fixtures. Do not run native input tests concurrently. The opt-in HTTPS test starts a temporary public tunnel, uses isolated registration and a disposable file, then shuts down:

```powershell
node --require ./tests/source-runtime.cjs tests/phone-live-smoke.cjs
```

## Remaining acceptance checks

1. **Live Luna accuracy.** Enter a real key in Bebo's connection UI, never in chat. Run the matched tasks in `adaptive-work.md`: open an app, find/read/create a file, recover from a failed command, clarify a target, cancel work. Independently verify results, latency, usage/cost and inappropriate actions. Fixtures cannot establish real model/account availability, quality, or prompt-injection resistance.
2. **Physical iPhone Safari.** Check first microphone permission, hold/release with the owner's English speech, interruptions, lock/background behavior, Safari/Home Screen storage, restart reconnect, and Wi-Fi/cellular transitions. Chrome and HTTPS API checks do not prove these device behaviors.
3. **Installed upgrade and taskbar.** Fresh packaging, archive/resource comparison, isolated packaged launch, saved-key restart, duplicate portable launch and Stop now pass as recorded above. Migration of an existing user installation and its taskbar shortcut was not exercised. The portable package is delivered for the owner's use; the earlier stale artifact must not be used for validation.

Known boundaries: visual targeting uses the primary display; multiple physical monitors were not tested. No drag tool, full accessibility tree, scheduler, remote wake/unlock, or UAC bypass exists. Free tunnel URLs change on restart. Normal command deduplication covers the live server session and 30 minutes after completion, not durable exactly-once execution across restarts. Accounting has not received a months-long soak test. File replacement narrows the stale-write window but is not transactional compare-and-swap against other processes; adversarial concurrent file/symlink changes remain a limitation. Abrupt OS/process death can interrupt an already-issued effect, including temporary clipboard contents; Stop cannot undo it. These limits remain explicit instead of being labelled a “100% complete” system.
