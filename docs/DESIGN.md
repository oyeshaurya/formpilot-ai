# FormPilot AI: design system

**Current look: Dynamic Island** (your direction, 2026-11-24). Solid black islands on a graphite canvas, after the Dynamic Island & Live Activities reference:

| Element | Treatment |
|---|---|
| Status island | A black pill at the top that morphs with the fill (width springs between states): idle = mark · FormPilot · "On device"; running = orange progress ring · step · model; done = green check · "12 filled · 1 to check · Not submitted"; error = amber "Fill stopped". It is also the live status region for screen readers. |
| Cards and tab bar | Opaque black islands, 30px corners, a faint top rim, deep shadows; no glass blur. |
| Review | Three Live-Activity ring tiles: Filled (green), To check (amber), Left for you (cyan), big tabular numbers. |
| Colours | Canvas `#1c1c1e`→`#151517` lit from above; ink `#f5f5f7`; accent orange `#ff6a3d` (dark text on it); cyan `#40c8e0`; system green `#30d158`, amber `#ffb340`, red `#ff6b6b`. Registered with the taste skill (`start.mjs brand`). |
| Type | After your reference screenshot: **Instrument Serif italic** for view titles, **JetBrains Mono** for section labels (uppercase, 0.14em tracking), status lines, numbers and the `formpilot` wordmark, **Instrument Sans** for body text and buttons. Three families is a deliberate exception to the taste skill's two-family rule, at your request. All bundled via Fontsource. |
| Checks | Taste checker at 400 and 320: contrast, button contrast, tap size, overlap PASS; the one FAIL is the known scroll-clip false positive. |

Previous look (kept below for the record): **Spatial UI** (your direction, 2026-11-23), built on the earlier dark-glass colours, with type from the **design-taste-frontend** skill's catalogue (below).

## Spatial UI

Depth is built in four layers, back to front, like a window floating in a room:

| Layer | What it is | How it is drawn |
|---|---|---|
| 1. Environment | a dim backdrop, like blurred passthrough | near-black `#080b10` with four soft colour fields (teal top right, blue left, deep cyan lower right, a warm amber glow bottom left) |
| 2. Window | the panel and its content | text sits on the environment; the scroll edge fades out top and bottom instead of cutting hard |
| 3. Glass | cards, the header chip, the tab ornament | white material at 7.5% (thin 5%, thick 12%), 30px backdrop blur at 180% saturation, a **specular rim** (gradient border lit from the top left), layered contact + ambient shadows, 28px corners |
| 4. Controls | buttons and tabs | capsules that **lift toward you** on hover (1px up, 2% larger, deeper shadow, spring easing) and **press in** on click (97%) |

| Element | Spatial treatment |
|---|---|
| Pointer highlight | a soft light follows the mouse across cards, buttons and tabs (gaze-style); `useSpatialPointer` writes `--mx/--my`, one listener, one write per frame, mouse only |
| Tab bar | a floating **ornament**: a glass capsule below the window, icon over label, the current tab a lit glass pill; arrow keys move between tabs |
| Fields | **recessed**: darker than the glass and inset; focus lights the edge aqua |
| Primary action | the most-forward object: a bright near-white capsule (`#f4f7fa`, label `#0a0e13`) with an aqua glow under the pointer |
| Save bar | a floating thick-material capsule (97% opaque) so content passing under it never shows through |
| Opening a view | the view settles into place (6px rise, 98.5% to 100%, 320ms) |
| Text | primary `#f4f7fa`, secondary white-blue at 66%, placeholders at 45% |
| Colours | accent aqua `#6fe3d3`; from your profile `#7be8b5`; drafted `#f8cf6a`; error `#ff9e9e`; no violet |
| Accessibility | `prefers-reduced-transparency` gives solid panels; `prefers-reduced-motion` stops lift, press and settle; every tab and button 44px or taller |

## Type (Instrument Sans)

Chosen from the skill's own catalogue (`start.mjs types --page software`), whose line for it is "design and productivity software; precise, friendly, calm". Tokens are exactly as `start.mjs brand --type instrument` prints them. It was not re-dealt with `deal`, because a deal re-arms the finish gate that was closed at your word.

| Role | Setting |
|---|---|
| Family | **Instrument Sans** (variable: weight 400–700, width 75–100%), bundled via `@fontsource-variable/instrument-sans` |
| Mono | DM Mono 400, only for the keyboard shortcut and the Markdown editor |
| Headings | weight 500 (the skill's tech weight), width 96%, tracking −2.8% |
| Scale | view title 28 / section title 20 / body 16 on 26 / small 14 / labels and tab names 13 at 500; each step at least 1.2× the next |
| Weights | text 400, labels and buttons 500; nothing at 600 or above |
| Files | 4 woff2 files (Latin + Latin Ext for each face), the skill's maximum |

What changed from Funnel, and why it looked generic: three families (Funnel Display + Funnel Sans + DM Mono) broke the skill's "never three" rule, and buttons and links at 600 broke its "text at 400 and 500 only" rule. One family at two weights, with the headings carried by width and tracking rather than boldness, reads calmer and more deliberate.

## The original deal (kept for the record)

| Item | Dealt | How |
|---|---|---|
| Kind | software (`page type software`, `site-kind software`) | A browser extension sold as software |
| Palette | ~~moss-sand~~ (putty `#ddd6c6`, olive `#4f6238`): replaced by your dark glass colours | `start.mjs deal --page software` |
| Type | ~~funnel~~ (Funnel Display + Funnel Sans + DM Mono): replaced by Instrument Sans | first pairing taken |
| Radius | **round**: 12 / 16 / 22px, buttons pill | the skill's rule for consumer apps |
| Buttons | **solid** | dealt by the one-liner |
| Mark | **wordmark**: the name in the display face, no icon mark in the panel | dealt by the one-liner |

Fonts are bundled from Fontsource packages (`@fontsource-variable/funnel-display`, `@fontsource-variable/funnel-sans`, `@fontsource/dm-mono`, all OFL). The extension makes no request to Google Fonts, as the privacy-first brief requires.

## Rules carried over from the kit (`system.css`, `system.md`)

- Fields sit on the ground with a 1px strong line; a failed field gets a **2px** error border and the reason in words under it.
- Labels 14px / 500 above every field; reading text 16px in ink (7:1); muted only for meta and hints.
- One button pair: solid primary in the action colour, outlined secondary; hover steps up 1px and mixes 14% ink, press moves down 1px and scales to 0.985.
- One card style: the spatial glass card. Each form section is its own card; confirmations and custom facts are recessed panes inside it.
- Tabs: a floating glass ornament at the bottom, with icons.
- Headings in the display face, one size per level: view title h1 24px, section h2 18px.
- One live status line per form; errors only on Save; focus moves to the first failed field.
- Focus ring 2px aqua, never animated; fields show focus as an aqua edge and glow. Reduced motion stops every transition.
- The product's own UI is the visual: the Fill view shows a small filled form with the real on-page outlines (green = from your profile, amber = drafted), which is also their legend.

## Checks run

| Check | Result |
|---|---|
| `copy-lint.mjs --kind software` on all four views (rendered) | **0 FAIL, 0 WARN** (462 words) |
| `consistency.mjs` at 400 and 320 (Spatial UI) | **1 FAIL judged false** (`overlap-text`: the scroll area clips a text box that runs past its edge; measured: the scroll area ends 8px above the ornament and the ornament is topmost at every sampled point), 5 WARN (selected tab drawn as a glass pill; the "Fill" verb; no moment; share tags). No sideways scroll at 320.
| `consistency.mjs` at 400 and 320 (dark glass) | **0 FAIL**, 3 WARN.
| `consistency.mjs` at 400 and 320 (earlier putty pass) | first round 8 FAIL, fixed (heading scale, row stagger, note contrast, cut text at 320, first-screen fact, no visual, main action below the fold) → **0 FAIL** at 400 and 320 |
| `gate.mjs` (fixed at 1440 and 390) | **GATE: FAIL 12, round 1 of 3, left open**: all 12 are landing-page structure rules (below) |

### Open gate findings (website rules that do not fit a side panel)

The gate checks every page as a company website at 1440px. These FAILs ask for structure a 400px browser side panel does not have; fixing them would mean turning the panel into a landing page:

- `hero-screen`, `section-height`, `one-section`: the first block must be exactly one 100svh screen, and every part of `<main>` a full-screen `<section>`.
- `container-edges` (7) and `container`: content inside a `.wrap` with 64–120px margins at 1440px, built as `header.nav` / sections / `footer.closing`.
- `moment-none`: a dealt award-site scroll moment.

They were not waived (the gate allows 5 waivers at most and forbids gaming the checker). **GATE: DONE**: closed on 2026-11-23 at your word ("Close the gate") after round 2 of 3, with these 12 FAILs open.

WARNs kept: `copy-buttons` ("Fill this page": "Fill" is the verb; the checker's list lacks it), `share-meta` (an extension page is never shared as a link), `copy-length`.
