# Maretrix

**Maretrix, an uncucked fork of [Sable](https://github.com/SableClient/Sable) — a Matrix web client —
running at <https://app.daiwascarlet.com>.**

Sable is fine. Sable v2 is a full rewrite in Rust and SvelteKit, which is a lot of machinery for a chat
client. This fork stays on the v1 codebase — Cinny/React, upstream `98416a9`, the last commit before the
rewrite — and fixes what I didn't like about it.

Published to satisfy AGPL §13. That's the whole obligation. No support. No PRs. No roadmap. Fork it if you
want something else. It's my client; the source is public because the licence says it has to be.

## What's different

- **Branding** — new name, logo, icons. Upstream's `TRADEMARKS.md` explicitly allows forks to do this.
- **Theme** — navy and scarlet, with scarlet accents on the action icons.
- **Default homeserver** — mine, not a demo.
- **Deleted** — pronouns, "animal identity" cosmetics, PluralKit. Gone, not hidden behind a flag.
- **Versioning** — independent of upstream, starting at 1.0.0.

> Leave `moe.sable.*` and `--sable-*` alone. They're upstream contracts, not cruft.
> [`docs/upstream-contracts.md`](docs/upstream-contracts.md) explains why.

## Configuration

`config.json` is committed empty on purpose — no homeserver, no API keys, no push gateway. Real
deployments merge `config.secrets.json` at build time (gitignored, mode 600, never committed). CI builds
now do this automatically, so a release build is configured out of the box.

## Building

```sh
docker build -t maretrix .
docker run -p 8080:8080 maretrix
```

Base image is `node:24.18.0-alpine` — upstream pins 24.13.1, which can't satisfy the `jsdom@30.0.1` their
lockfile resolves.

## Licensing

AGPL-3.0. Upstream notices and third-party credits are intact. Section 13 applies: publishing this source
*is* the offer.
