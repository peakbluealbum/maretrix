# Maretrix

A personal, opinionated fork of [Sable](https://github.com/SableClient/Sable) — a Matrix web client —
running at <https://app.daiwascarlet.com>.

Based on upstream commit `98416a9` (*chore: prepare release 1.22.11*, 2026-09-30), the last build of the
v1 (Cinny/React) codebase before the Sable v2 (Rust + SvelteKit) rewrite.

This is a personal fork, published to satisfy AGPL section 13. There is no support and pull requests are
not accepted.

> **Renaming note:** the fork deliberately keeps the `moe.sable.*` Matrix namespace and the
> `--sable-*` CSS theme variables unchanged. See [`docs/upstream-contracts.md`](docs/upstream-contracts.md)
> before "cleaning up" any remaining `sable` reference.

## What this fork changes

- **Branding** — name, logo, icons and favicons replaced; upstream's `TRADEMARKS.md` permits this.
- **Theme** — the built-in dark theme repainted to a navy/scarlet palette, plus a scarlet accent and halo
  on the interactive action icons (composer triggers, call buttons, room-header actions, sidebar tabs).
- **Default homeserver** — pointed at the operator's own server.
- **Removed** — pronouns, the "animal identity" cosmetics, and PluralKit.
- **Own version line** — this fork versions independently of upstream, starting at 1.0.0.

## Configuration

`config.json` is committed as an **empty template**: no homeserver, no API keys, no push gateway. Fill in
your own.

Everything deployment-specific is kept **out of the repository**. The real values live in
`config.secrets.json` — gitignored, never committed, mode 600, kept only on the build host — and are merged
into `config.json` at build time by `scripts/apply-config-secrets.py`. A fresh clone builds fine without
that file; GIF search and push notifications are simply disabled until you supply your own keys.

## Building

This uses the repo's own Dockerfile, with the Node base bumped: upstream pins `node:24.13.1-alpine`, but its
lockfile now resolves `jsdom@30.0.1`, which requires `>=24.15`. `node:24.18.0-alpine` satisfies both that and
the repo's own `devEngines: ^24.18.0`.

```sh
python3 scripts/apply-config-secrets.py   # optional: merge local secrets
docker build -t maretrix .
docker run -p 8080:8080 maretrix
```

`scripts/dws-branding.py` regenerates the logo, icon and favicon set from a source image.

## Licensing

AGPL-3.0 — see `LICENSE`. Upstream copyright and licence notices, and the third-party credits shown in the
in-app About page, are preserved. Because this fork is offered to users over a network, AGPL section 13
applies: publishing this source *is* the offer.
