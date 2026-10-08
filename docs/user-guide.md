# Using Bebo

## Connect and speak

Open the Windows app, choose **Connect**, and enter a key with access to the
configured Luna model. Bebo validates the connection and encrypts the key in
your Windows profile using Electron safeStorage. It returns connection status,
not the key, to the UI and phone. A failed replacement preserves the previous
connection. **Forget saved key** removes that credential only.

On the desktop, click the avatar or microphone to start enhanced recording,
then click again to submit. Stop discards a recording. On the phone, press and
hold the avatar, speak, then release to submit; an interrupted gesture discards
the recording. A typed request is always available.

**Settings → Understand my voice** offers provider transcription and device
recognition. Enhanced recordings are bounded to one minute and 12 MB, held
in memory, and sent to OpenAI for transcription using the desktop connection.
Desktop transcription selects English; the phone also offers Arabic.
Device recognition depends on Windows/browser support and may use the browser
vendor's recognition service.

## Permissions and work

Adaptive mode provides file, app, window, terminal, and visual tools. Settings
also offers the earlier Screen only mode. Set allowed folders for file tools
and choose off/ask/automatic permissions for the supported actions.

File tools reject secret files, unsupported paths and symlink escapes, bound
searches, validate text encoding, and require an observed hash before editing
existing text. Writes are staged and read back. These checks are not a
transactional lock against another process editing the same file.

PowerShell defaults to **ask**, showing the exact command and working directory.
An approved command runs with your Windows account's access. Folder grants
constrain file tools and the shell's initial directory, not arbitrary shell
access. Stop and timeouts cancel the owned process tree. Work already issued
to another application or external service may have lasting effects.

Tasks default to 40 model steps, ten minutes, and a $0.50 estimated model
budget. Settings can change these limits. A call in flight can exceed an
estimated budget, and unreported usage stays unknown. Repeated failures and
identical tool calls are bounded. Completed work cites observed evidence;
the model can still misunderstand your goal.

Approvals expire after two minutes. Questions accept one answer and expire
after fifteen minutes. Both appear in the dashboard, floating question cloud,
and paired phone. Answering a question resumes the same request; it does not
itself approve a desktop action. Windows UAC and microphone permissions still
apply.

## Avatar, cursor, and Stop

**Meet desktop Bebo** opens the floating companion. Drag its grip to move it;
click the avatar to listen in place. Right-click for effects, Stop, Hide Bebo,
and Open Bebo app. **Personalize** controls appearance, voice, dust, cursor,
edge effects, and Calm mode. System reduced-motion preferences are respected.

The cursor uses black and white flowing waves with dust. During computer work,
edge particles and a top-center Cancel tab appear. They hide when work finishes
or pauses for a question/approval. Decorative effects can be disabled while
the Cancel control remains available. The preview playground performs no
desktop actions.

Cancel with the tab, app/phone Stop, or **Ctrl + Alt + Escape** on Windows.
Cancellation stops continued work where supported; it cannot undo an effect
already sent. Visual targeting uses the primary display. Dragging, background
scheduling, elevated/UAC control, and remote wake/unlock are not implemented.

## Phone controller

1. On the desktop, open **Phone → Create phone link**.
2. Scan the QR code and open the controller in your phone browser.
3. Compare the six-digit code on both screens and confirm on the desktop.
4. Hold the avatar to talk; release to send. Type instead, answer questions,
   approve a step, or Stop from the same controller.
5. Keep the laptop awake, unlocked, online, and running Bebo. Capture requires
   the phone controller to remain in the foreground.

Registration is remembered in the desktop profile and phone storage. The
temporary Cloudflare URL changes when the tunnel restarts; reopen the current
link rather than an old URL. Private browsing, cleared storage, or revocation
can require pairing again. **Forget this phone** revokes its access.

Safari can add the controller to the Home Screen from its Share menu. Physical
iPhone/Safari microphone, backgrounding, storage, and network transitions remain
acceptance checks; Chrome fixtures and HTTPS API tests do not prove them.

The link works across Wi-Fi/cellular without router configuration. Cloudflare
relays the traffic and terminates HTTPS. Authenticated phone traffic can include
requests, transcripts, task summaries, approval text, registration credentials,
and enhanced audio before transcription. The API key and desktop screenshots
are not sent to the phone server. Screenshots selected for planning go from
the desktop to the model provider. Treat pairing links and session credentials
as private.

## Voice replies

Choose **Personalize → A voice of his own** for Puck, Heart, or George. The
bundled Kokoro English model runs in a local CPU worker, requires no voice API
key, and needs no runtime model download. First synthesis takes longer while
the worker loads. Stop or a new request interrupts speech.

For Arabic, use an available device voice. On the phone, **Hear reply** requests
desktop-generated English audio over the authenticated connection; a browser
may require a user tap before playback. These are synthesized voices, not a
human operator or a clone of the user's voice.

## Activity, usage, and saved data

Activity shows plans, observed results, live command output, questions, and
task status. Thirty bounded task summaries persist; detailed raw tool output
and file contents stay in the active session. Interrupted work is marked and
is never automatically replayed. Clearing Activity does not clear Usage.

Usage shows reported input/output tokens, cached usage, transcription duration,
and estimated USD across desktop, avatar, and phone requests. Tracking starts
with versions that include the ledger; earlier spending cannot be reconstructed.
Rates are recorded per attempt. Failures, interruption, unsupported pricing,
or missing usage stay unconfirmed rather than silently free. Provider billing
remains the source for final charges, credits, taxes, and other applications.

Relevant task files, tool output, application metadata and screenshots can be
sent to OpenAI for a submitted request. Requests specify `store: false`, but
provider retention policies still apply. Credentials are encrypted locally;
task summaries and accounting remain in the Windows app profile. Avoid sharing
profile files, private transcripts, credentials, or screenshots in bug reports.
