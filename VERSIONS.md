# Versions

Maretrix versions independently of upstream Sable. One active release line at a time; a new line
starts only when the current one is done or clearly trending to done.

| Line | Branch | Worktree | Version files | State | Notes |
|---|---|---|---|---|---|
| 1.0.0 | main (tag) | — | 1.0.0 (4 of 6 — no Arch package yet) | shipped | fork baseline |
| 1.1.0 | main (tag) | — | all six at 1.1.0 | shipped | native clients, Linux installable |
| 1.1.1 | release/1.1.1 | ~/maretrix-1.1.1 | package.json 1.1.1; **five still 1.1.0** | in progress | iOS WebKit timeline + native SSO scheme fix; device pass is the gate |
| 1.2.0 | — | — | — | not started | gated on 1.1.1 being done or trending correctly |

## Rules

- **Six version-bearing files move together in one commit**, not two:
  1. `package.json` — `version`
  2. `src-tauri/tauri.conf.json` — `version`
  3. `src-tauri/Cargo.toml` — `[package] version`
  4. `src-tauri/Cargo.lock` — the `name = "maretrix"` entry's `version`
  5. `packaging/arch/PKGBUILD` — `pkgver` **and** `_gh_tag`
  6. `packaging/arch/.SRCINFO` — `pkgver`

  Drift blocks a release. The Arch pair is the quiet one: a stale `_gh_tag` ships a package whose
  source URL points at the previous tarball, and it builds cleanly. `e1e5398` ("release: 1.1.0") is
  the shape to copy. At 1.0.0 there was no Arch package, so the first four were the whole set.
- Fixes land on the newest line; 1.1.1 takes only fixes, dependency security updates, and platform
  breakage — no features, no refactors.
- When 1.1.1 ships, merge it back into `main` before cutting `1.2.0` from it.
- Signing stays ad-hoc (`APPLE_SIGNING_IDENTITY='-'`). No Developer ID, no notarization.
- CI (`build.yml`) builds native targets only — it runs no lint, typecheck or tests. The release
  checklist is the only gate those checks have.

## Branch map

- `main` — last shipped release (1.1.0), plus the forward-ported pronoun-residue fix `0fe0e5c`.
  Version fields stay at 1.1.0 until 1.1.1 merges back.
- `release/1.1.1` — the release line for 1.1.1 (clean, tag from here); pushed to origin.
- `1.1.1-webkit-timeline` — experimental branch the 1.1.1 work was built on; history is the raw
  iteration log, not the release history.
