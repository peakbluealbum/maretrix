# 1.1.1 device pass — iOS WebKit, 2026-11-11

Build under test: `446ab78` (virtua 0.54.2, pronoun cleanup; workaround stack untouched), deployed to
`app.daiwascarlet.com` at **2026-11-11T05:16:21Z**, image `sha256:8dc0afbd6d0f340044cc7372c5f2e19711a871fe7d1621008efcd332a203a258`.
Edge chunk `assets/page-CxHAT_fx.js`, sourcemap resolves `virtua@0.54.2`.

About string on the tested device: **`v1.1.1-dev`** — expected. `v1.1.0` voids any run.

**Verdict: not fixed → fallback #4** (bounded plain list on WebKit) opens.

## Observed before the measurements were captured

- Every room/channel change leaves the **entire timeline blank** until the user touches the page.
  The 1.1.0 behaviour was blank *minus the latest message*; this is a small change for the worse.
- Flinging to the bottom still produces a brief gap that corrects itself, but only occasionally.
- With Web Inspector attached, **every scroll** emits `ResizeObserver loop completed with
  undelivered notifications`, repeating up to 18 times in a row. On 1.1.0 the loop was a mount-time
  event; it now fires on scroll, which points at the app-side observers rather than at virtua.

## Artifacts

| File | Source |
|---|---|
| `sampler.json` | `copy(__maretrixTL.report())` in the Web Inspector console on the device, before any relaunch |
| `console.txt` | Web Inspector console → save transcript (or ⌘A ⌘C), during a 20–30 s capture around one room switch |

Clear the sampler between scenarios (`__maretrixTL.clear()`); do not relaunch the PWA between the
run and the read — `dump()` prefers the in-memory ring and only falls back to the last flushed
session.

## Rows

| # | Scenario | About | Deploy | rendered range | RO error | Verdict |
|---|---|---|---|---|---|---|
| 1 | cold open a room | | 05:16:21Z | | | |
| 2 | switch rooms repeatedly | | 05:16:21Z | | | |
| 3 | leave and return | | 05:16:21Z | | | |
| 4 | empty room that grows | | 05:16:21Z | | | |
| 5 | fling while scrolled up | | 05:16:21Z | | | |
| 6 | live message while scrolled up | | 05:16:21Z | | | |
| 7 | PWA vs native app | | 05:16:21Z | | | |
