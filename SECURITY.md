# Security reporting

## Supported versions

Security fixes are made on the default branch and the current 1.1.x line.
Older experimental builds should be updated before reproducing a report.

## Report privately

Use [GitHub's private vulnerability reporting](https://github.com/Akak0o0y/bebo/security/advisories/new).
Do not publish an exploit, an API key, a phone credential, a pairing URL,
or sensitive user data in a public issue.

Include the affected version, Windows/browser version, reproduction steps,
expected boundary, observed result, and a minimal disposable fixture.
If private reporting is unavailable, ask for a private contact route in an
issue without disclosing the vulnerability details.

Relevant boundaries include Electron renderer isolation and IPC sender checks,
phone origin/authentication/pairing, credential storage, stale approvals,
file-tool roots, and cancellation of native helpers.

## Scope and expected access

An explicitly allowed PowerShell command runs with the user's Windows account
access. File-tool roots do not sandbox arbitrary shell commands. Bebo does not
bypass UAC or browser microphone permissions. Stop prevents continued work
where cancellation is supported; it cannot undo an effect already issued.

For a submitted task, the configured provider can receive relevant tool output,
file content, images, and enhanced transcription audio. Cloudflare terminates
HTTPS for the optional phone relay. These behaviors are documented in the
[user guide](docs/user-guide.md); report a bypass of the intended access or
disclosure boundaries separately from a documented authorized action.
