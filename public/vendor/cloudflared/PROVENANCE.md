# Secure phone-link helper

The Windows build bundles the unmodified Cloudflare `cloudflared` 2026.2.0 amd64 executable. Copyright Cloudflare, Inc.; licensed under Apache 2.0, included in `LICENSE`.

Official release: https://github.com/cloudflare/cloudflared/releases/tag/2026.2.0

SHA-256 of `cloudflared-windows-amd64.exe` (bundled as `cloudflared.exe`):
`b3279f2186a1c3c438ad5865e802bbbec26090c5d3fdb4ac1113f1143a94837a`

The binary was copied from the installed local helper after comparing its SHA-256 against the official GitHub release asset digest. No helper source was changed. The tagged upstream repository has no root NOTICE file.

Bebo starts an outbound temporary HTTPS tunnel only when phone access is enabled. There is no inbound router port forwarding. Cloudflare relays the connection and terminates its HTTPS; this is not end-to-end encryption against the relay. Phone pairing and desktop control authorization are enforced separately by Bebo.
