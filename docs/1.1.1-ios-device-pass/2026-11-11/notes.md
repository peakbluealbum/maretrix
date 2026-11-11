# 1.1.1 device pass — iOS WebKit, 2026-11-11

Build under test: `446ab78` (virtua 0.54.2, pronoun cleanup; workaround stack untouched), deployed to
`app.daiwascarlet.com` at **2026-11-11T05:16:21Z**, image `sha256:8dc0afbd6d0f340044cc7372c5f2e19711a871fe7d1621008efcd332a203a258`.
Edge chunk `assets/page-CxHAT_fx.js`, sourcemap resolves `virtua@0.54.2`.

About string on the tested device: **`v1.1.1-dev`** — expected. `v1.1.0` voids any run.

**Verdict: not fixed → fallback #4** (bounded plain list on WebKit) opens.

## Observed by the tester

- Every room/channel change leaves the **entire timeline blank** until the user touches the page.
  The 1.1.0 behaviour was blank *minus the latest message*; this is a small change for the worse.
- Flinging to the bottom still produces a brief gap that corrects itself, but only occasionally.
- **Scrolling up jumped days-to-weeks instead of a few messages**, in a channel busy enough to show
  it. This is the observation the capture was taken for.
- With Web Inspector attached, **every scroll** emits `ResizeObserver loop completed with
  undelivered notifications`, up to 23 repeats in one block. On 1.1.0 the loop was a mount-time
  event; it now fires on scroll.

## Artifacts

| File | Source |
|---|---|
| `sampler.json` | `copy(__maretrixTL.report())` in the Web Inspector console, before any relaunch |
| `console.txt` | Web Inspector console transcript, save button, around one room switch |
| `raw/*.rtf` | the files as exported (TextEdit wrote RTF); the two above are `textutil`-normalized, contents otherwise untouched |

## What the sampler says

396 records: `arrive` 151, `scroll` 73, `frame` 102, `mount` 6, `stall` 27, `latch-start`/`latch-end`
11 each (`settled` 7, `cancelled` 4).

Every mount record has **`ss` = `vp` = 635** — virtua's `scrollSize` equals its viewport height:

| vlist mount | wrap | par | vp | ss | rend first→last | scrollTop |
|---|---|---|---|---|---|---|
| 1 | 683 | 683 | 635 | **635** | **0 → 0** | 0 → 0 |
| 2 | 683 | 683 | 635 | **635** | 1 → 1 | 0 → 0 |
| 3 | 683 | 683 | 635 | **635** | 1 → 1 | 0 → 0 |

Live DOM at the end of the capture: `rows` 12, `domClient` 683, **`domScroll` 33370**, `domSt` 32687.
So virtua thinks the list is 635 px tall while the scroller is 33,370 px — a factor of ~50. Every
index it scrolls to is derived from a scroll size that never left the viewport height, which is the
mechanism behind "scrolling up flew days-to-weeks" and behind the blank: mount 1 rendered **zero**
rows for the whole trace window, mounts 2 and 3 rendered **one**.

Main-thread stalls: `[103, 85, 211, 686, 1092, 982, 1019, 127]` ms — three of them ~1 s, which is the
"blank until input" feel.

## What the console says

- **21** `ResizeObserver loop completed with undelivered notifications` entries, repeat counters up to
  `x23`.
- **16** `GET …/rooms/<id>/messages` pagination requests across two rooms in one short capture.
- **15** events rejected by the SDK — the second lead, and not something virtua explains:

  ```
  EventTimelineSet.addEventToTimeline: Ignoring event=$VvqeocMqchX_I0NCujt717LIdGkav0UNKrrWTmQH0Zw
  that does not belong in timeline=!ZG7pqxPRJjbmGfyf08:daiwascarlet.com:2026-11-11T08:12:38.567Z
  ```

  The timeline id carries a **creation timestamp** (`08:12:38.567Z`, another at `08:13:00.285Z`), so
  paginated events are landing in a timeline instance that is not the one being rendered. 13 of the
  15 are for `!aycuKSqEffxkYTqGYg`. If the fetch attaches to the wrong timeline, the rendered
  window never receives what was paginated — which is worth ruling out before the plain-list
  reducer is anchored on event indices.

## Rows

| # | Scenario | About | Deploy | rendered range | RO error | Verdict |
|---|---|---|---|---|---|---|
| 1 | cold open a room | v1.1.1-dev | 05:16:21Z | 0 rows (mount 1: `rend [0,0]`) | yes | fail |
| 2 | switch rooms repeatedly | v1.1.1-dev | 05:16:21Z | 1 row per mount (`rend [1,1]`), blank until input | yes | fail |
| 3 | leave and return | v1.1.1-dev | 05:16:21Z | 1 row per mount | yes | fail |
| 4 | empty room that grows | v1.1.1-dev | 05:16:21Z | not captured in this run | — | unmeasured |
| 5 | fling while scrolled up | v1.1.1-dev | 05:16:21Z | 12 live rows, 32,687 of 33,370; jumps weeks | yes | fail |
| 6 | live message while scrolled up | v1.1.1-dev | 05:16:21Z | 12 rows, 151 `arrive` records | yes | fail |
| 7 | PWA vs native app | — | — | PWA only | — | native not built |
