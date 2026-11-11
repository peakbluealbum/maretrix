# Versions

Maretrix versions independently of upstream Sable. One active release line at a time; a new line
starts only when the current one is done or clearly trending to done.

| Line | Branch | Worktree | package.json | tauri.conf.json | State | Notes |
|---|---|---|---|---|---|---|
| 1.0.0 | main (tag) | — | — | — | shipped | fork baseline |
| 1.1.0 | main (tag) | — | 1.1.0 | 1.1.0 | shipped | native clients, Linux installable |
| 1.1.1 | release/1.1.1 | ~/maretrix-1.1.1 | 1.1.1 | **1.1.0 → must be 1.1.1** | in progress | iOS WebKit timeline fixes, macOS build script pin |
| 1.2.0 | — | — | — | — | not started | gated on 1.1.1 being done or trending correctly |

## Rules

- Both version fields move together in one commit. Drift between them blocks a release.
- Fixes land on the newest line; 1.1.1 takes only fixes, dependency security updates, and platform
  breakage — no features, no refactors.
- When 1.1.1 ships, merge it back into `main` before cutting `1.2.0` from it.
- Signing stays ad-hoc (`APPLE_SIGNING_IDENTITY='-'`). No Developer ID, no notarization.

## Branch map

- `main` — last shipped release (1.1.0)
- `release/1.1.1` — the release line for 1.1.1 (clean, tag from here)
- `1.1.1-webkit-timeline` — experimental branch the 1.1.1 work was built on; history is the raw
  iteration log, not the release history
