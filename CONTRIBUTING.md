# Contributing to Bebo

Thanks for helping make Bebo easier to use and more reliable. Bug reports,
reproduction steps, Windows/iPhone testing, accessibility work, documentation,
and focused pull requests are welcome.

## Start here

1. Check [existing issues](https://github.com/Akak0o0y/bebo/issues) before opening a new one.
2. Choose a [good first issue](https://github.com/Akak0o0y/bebo/labels/good%20first%20issue), or describe the change you want to make. Discuss larger architecture, model, or permission changes before implementing them.
3. Fork the repository and clone your fork. Create a branch such as `fix/phone-reconnect` or `docs/first-run`.
4. Follow [local setup and testing](docs/development.md), make a focused change, and open a pull request against the default branch.

You do not need a paid model account for backend or browser fixture tests.
Native desktop development needs Windows. UI-only work can use the browser
preview, with the native bridge mocked by the test suite.

## What makes a useful report

Use the bug or feature template. Include your Bebo version, Windows/browser
version, reproducible steps, expected behavior, and actual behavior.
State whether the issue occurs in the browser preview, source Electron app,
or packaged executable. Distinguish mocked model responses from real calls.

Remove keys, pairing links/QR codes, transcripts, private file contents,
and identifying paths from shared logs or screenshots. Report vulnerabilities
through [SECURITY.md](SECURITY.md), rather than a public issue.

## Pull request expectations

- Explain the user-visible problem and resulting behavior.
- Match the surrounding TypeScript/React and CommonJS style. Keep unrelated refactors separate.
- Include before/after screenshots for a UI change, with private information removed.
- Run `npm test` and `npm run build`. Run the relevant browser or native check when your change affects that path. Explain any check you could not run.
- Add regression coverage for a meaningful behavioral defect. Cosmetic or documentation changes do not need artificial tests.
- Keep keys and local profiles out of Git. Generated model files, builds, and raw test artifacts are ignored.

## Agent and desktop changes

Preserve validated tool arguments, approvals, cancellation, fresh observation
checks, and honest results. A checklist describes intent; successful tool
observations describe effects. Keep unknown cost distinct from zero cost.

Test file/window/input changes in disposable fixtures. Run pointer and keyboard
checks sequentially so they do not act on one another's windows. Do not run
bulk-close, file deletion, or live terminal tasks against personal data as a
routine test. Live provider requests may incur charges, and network/device
acceptance must be identified separately from controlled fixture results.

## Licensing

Your original contributions are licensed under [Bebo's ISC license](LICENSE).
By submitting a contribution, you confirm you can provide it under those terms.
Third-party material must retain its own license and attribution.

The existing avatar engine, emotion data, and visual designs have separate
[Aora / Emotion Ball terms](public/vendor/aora/PROVENANCE.md), including
noncommercial restrictions. Do not remove those notices or present those
materials as ISC. An independently designed replacement avatar is welcome;
include its source and license.

Please follow the [community guidelines](CODE_OF_CONDUCT.md). Maintainers may
request changes or decline a proposal that expands scope without sufficient
evidence or breaks the permission and recovery paths.
