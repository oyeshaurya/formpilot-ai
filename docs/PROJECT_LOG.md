# FormPilot AI: project log

A running record of what was built, changed and decided. Newest entry first.

---

## 2026-11-24 (latest): toolbar popup, Resume editor, new logo

**Why:** you asked for three things: clicking the icon in Edge opened FormPilot docked in the side panel while other extensions open a popup window; the Resume view's Import and Save bar overlapped the text; and a better logo.

**Changed:**
- **Popup:** the toolbar icon opens a 400 x 600 popup (`src/sidepanel/popup.html`, set as `action.default_popup`). The worker now sets `openPanelOnActionClick: false`, because the browser kept the old setting. The side panel stays available: a button beside the status pill moves FormPilot into it, and the shortcut and the right-click menu still open it, so a review stays on screen while you work on the page.
- **Drafts:** a popup closes when you click the page and cannot show the "unsaved changes" warning, so unsaved Profile and Resume edits are kept in `chrome.storage.session` (memory only, cleared on browser close or Delete all data) and restored when FormPilot opens again (`hooks/useKeptDraft.ts`).
- **Resume:** Import moved to the editor card's header and the status line and Save to its footer; the editor fills the view and scrolls inside itself. Nothing floats over the text.
- **Readable without blur:** Edge's side panel does not draw backdrop blur, which is why text showed through the dock and the save bar. Those bars and the status pill are now 90 to 92% opaque.
- **Logo:** a new mark (see DESIGN.md): an "f" whose cyan crossbar is a form line being filled, ending in the wordmark's glowing dot, on a glass tile. One SVG source (`scripts/logo.mjs`) for the toolbar icons and the store logo, rendered with headless Edge (`scripts/lib/edge.mjs`, now shared with `store-assets.mjs`); a small cut for 16 and 32px.
- On-device AI's message when no FormPilot page is open now says to keep the popup or the side panel open.
- The dev harness takes `?popup` to show the popup frame.

**Verified:** typecheck clean; `npm test` 74 / 74; `npm run e2e` 87 / 87 in Edge (adds: popup page marked, its side-panel button, four tabs, 400 x 600 frame); `npm run package`: store checks pass (popup in the manifest); store images re-rendered with the new logo. Resume checked in the harness at 460px with a 40-line resume: no overlap. Not checked here: the side-panel button in a real popup (it needs a click inside Edge's own popup), and how Edge's side panel draws the more opaque bars.

---

## 2026-11-24 (latest): Glass redesign, cyan on near-black

**Why:** you asked for a dark, minimal, premium glassmorphism UI with cyan accents (`#27D9E8` on `#080B0E`), applied to the existing panel with every feature kept. The reference screenshot did not come through, so the work follows your written brief.

**Changed:**
- `src/styles/app.css` rewritten as the Glass system (spec in [DESIGN.md](DESIGN.md)): lit near-black ground, three glass tiers (raised hero, cards, insets), floating bars with progressive blur, cyan pill buttons, glass fields, drawn radios, checkboxes and a switch, option rows, badges, a meter, container-query layouts.
- Type: Manrope + JetBrains Mono (the skill's `manrope` pairing). Instrument Sans and Instrument Serif removed (one font package fewer).
- `App.tsx`: one scroll area under a frosted top bar and a frosted dock; a sliding cyan indicator on the open tab; Up and Down arrows move between tabs too; on wide panels (760px+) the dock becomes a sidebar.
- Fill view: a raised hero card with a soft cyan light behind it; progress shows inside the hero; on 1000px+ the idle view has two columns; "Your setup" list with a heading; badges for review rows; stat rings with no stray dot at zero. With nothing in the vault, the hero's button is "Add your details" (opens Profile) instead of a disabled Fill button.
- Settings: model and key-storage choices are option rows that light cyan; "Outline filled fields" is a switch; key status is a small pane with a dot; confirmations are tinted insets; download progress uses `Intl` percent and a transform-driven meter.
- Profile and Resume: intros match the other views; the Markdown editor sits in a glass card that grows with the panel; at under 360px the import button reads "Import" (its accessible name keeps "PDF or Word").
- Empty status lines take no room (the live region stays in the page).
- On-page bar (`overlay.ts`): frosted, cyan focus ring and hover edge; the "Show" flash is cyan. Green and amber outlines unchanged.
- Toolbar icon recoloured (charcoal, off-white, cyan); `theme-color` `#080b0e`; the dev harness takes `?w=600` or `?w=full`.

**Verified:** typecheck clean; `npm test` 74 / 74; `npm run e2e` 83 / 83 in Edge (fills, review in the real panel, undo, PDF and Word import, on-device paths, no panel errors); build clean, fonts bundled, no remote font URLs; harness checked at 320, 400 and full width: no sideways scroll at 320, every control outside running text 44px or taller (radios and switch sit inside full-row labels); taste checker 3 FAIL, all the dock floating over content by design (see DESIGN.md); copy-lint 0 FAIL.

**Then, at your request, type after your reference snippets** ("tally", "No Claude conversation found", "license help diagnostics … Claude settings →"): view titles and empty states in Instrument Serif italic; the wordmark becomes `formpilot` in lowercase JetBrains Mono after a glowing cyan dot (the logo tile leaves the status pill); tab labels, small labels, links and the pill's details in lowercase mono; links to other tabs end in "→". Manrope stays for body, labels and buttons. Three families, as you asked.

**Store images** re-rendered in the new look (`npm run store-assets`): the Glass ground, the dot wordmark, serif headlines, the panel's own fonts embedded; screenshot 1 now shows the whole form column and the on-page bar uncut; the 300px logo lost its stray scrollbars.

---

## 2026-11-24 (latest): typefaces after your reference

**Changed:** titles in Instrument Serif italic; section labels in JetBrains Mono, uppercase and spaced; status lines, ring numbers and the `formpilot` wordmark in JetBrains Mono; body and buttons stay Instrument Sans. DM Mono removed. Three families is a deliberate exception to the taste skill's two-family rule, because you asked for this look. Store screenshots re-rendered.

**Verified:** taste checker `font-load`, `heading-scale`, `body-size`, `contrast`, `text-contrast` PASS at 400 and 320 (one known scroll-clip false positive); 50 unit and 59 / 59 end-to-end checks; store checks pass (zip 944 KB with the extra fonts).

---

## 2026-11-24: Dynamic Island redesign

**Why:** you asked for a UI like the Dynamic Island & Live Activities reference.

**Changed:** `src/styles/app.css` tokens rewritten (black islands on graphite, orange accent, cyan second colour, system green/amber); new `src/sidepanel/components/Island.tsx` (the morphing status island, replaces the header, live status region); `RingStat` tiles in the review (`FillView.tsx`); store screenshots re-rendered. Full spec in DESIGN.md.

**Note:** the test form's Skills options are now AWS, React, Rust (edited in `dev/test-form.tsx`); the e2e skills checks now derive the expected boxes from the form instead of hard-coding TypeScript.

**Verified:** 50 unit checks; 59 / 59 end-to-end in Edge; taste checker contrast and tap-size pass at 400 and 320; store checks pass.

---

## 2026-11-24: Aadhaar fields filled from your saved fact, on device only

**Why:** you asked for an Aadhaar section in the test form, and then for FormPilot to fill Aadhaar (it had been blocked with other government IDs).

**Changed:**
- Test form: an "Identity verification" section with an Aadhaar card number field (`dev/test-form.tsx`).
- Extractor: Aadhaar fields are kept as **local-only** (`localOnly: true`) instead of skipped. They were also caught by the payment "card number" rule, so the Aadhaar check runs first. Passport, PAN, SSN, card, bank and tax fields stay blocked.
- Fill: local-only fields are split off before the Claude request and filled from a matching saved fact by the local rules, in both Claude and Basic modes. With no saved fact they stay empty with the reason "Save your Aadhaar number in Profile → Other facts".
- **Privacy fix found while testing:** saved facts travel to Claude in the profile block, so an Aadhaar fact would have been sent. `profileBlock` now drops Aadhaar facts (by question, or by a 12-digit value).
- Review list shows the number masked: `XXXX XXXX 9012`, reason "filled on this device, never sent".
- Privacy policy and store description updated to say so.

**Verified:** 50 unit checks (3 new); `npm run e2e` 59 / 59 in Edge: Aadhaar fills React state in both modes, the review masks it, and a tripwire in the API stand-in that inspects the whole request (system and page) confirms the number never reaches the API; password and card fields are still skipped; store checks pass.

---

## 2026-11-24: free Basic mode (no AI, no key, no cost)

**Why:** your Anthropic account had no credits, and you asked for a way to use FormPilot without spending money, testing on Microsoft Edge first.

**Checked first:** Edge 157 on this machine exposes no built-in on-device AI (`LanguageModel`, `Summarizer` and `Writer` are all undefined), so an on-device AI option could not work for you yet and was not built.

**Changed:**
- New `src/background/rules.ts`: **Basic mode**. Fills from your profile using the page's autofill hints (`given-name`, `email`, `postal-code`…), then label rules, then your saved answers in Profile → Other facts. Answers yes/no questions from profile flags (sponsorship, relocation), picks dropdown options, ticks only the skills you list. Never writes text: open questions are left for you unless a saved answer matches. Skips fields about other people (emergency contact, referee, manager) and country of birth or citizenship. Runs in the extension; nothing is sent anywhere.
- Basic mode runs when you choose **Free: Basic (no AI)** in Settings → Model, when no API key is saved, or from **Fill with Basic instead** on a credits, key or rate-limit error. Same checks, outlines, review list and Undo as Claude.
- Fill tab: the key is now optional; the note and checklist say Basic mode is in use.
- **Bug fixed (found by the new test):** on a second fill of the same page, every box of a checkbox group was read as the first box (they share the group's id after the first fill), so only one skill was ticked. The extractor now keeps each box's own element.
- Credits error: plain message, "Add credits" button, unit test for it.

**Verified:** 47 unit checks (11 new for Basic mode and credits); `npm run e2e` 55 / 55 in Edge, including a full Basic-mode fill with no key; store checks pass.

---

## 2026-11-24: PDF and Word resume import; Fill page shows your own name

**Why:** you could not import a PDF or Word resume, and the Fill page preview showed a name that was not yours.

**Changed:**
- New `src/sidepanel/importers.ts`. **PDF** through pdf.js 6 (bundled, loaded only when a PDF is imported; its worker ships inside the extension; it never evaluates code). Lines are rebuilt from text positions; the largest first line becomes `#`, clearly larger lines `##`, bullet glyphs and indented body lines `- ` (Chrome and many tools draw bullets as shapes, not text). Scanned PDFs without a text layer and password-protected PDFs get a plain message. **Word (.docx)** with no library: the zip is read with the browser's own `DecompressionStream`, `word/document.xml` is parsed, and Title, Heading 1–5 and list paragraphs become Markdown. Old `.doc` gets a "save as .docx or PDF" message. Limit 10 MB. Nothing is uploaded.
- Resume tab: button "Import PDF or Word", "Reading…" while it works, the imported text lands in the editor to check before saving.
- Fill page: the preview shows **your** saved name and email (placeholders until you add them) instead of a sample person; the note under a disabled Fill button says exactly what is missing (details, API key, or both).
- Packager now also scans `.mjs` files (pdf.js's worker): no eval, no `new Function`, no remote code.

**Verified:** `npm run e2e` 48 / 48 in Edge, including a real PDF (printed by Edge, with headings and drawn bullets) and a real .docx pushed through the Resume tab's file picker in the built extension; 36 unit checks; store checks pass (zip 833 KB, up from 331 KB because of pdf.js).

---

## 2026-11-23: Milestones 2, 3 and 4: the full extension, v1.0.0

**Why:** you asked to complete the project so you can test it and publish it on Microsoft Edge and Chrome.

### Built

| Milestone | Files | What it does |
|---|---|---|
| M2 extractor | `src/content/extractor.ts` | Finds visible, fillable controls (inputs, textareas, selects, radio and checkbox groups, ARIA comboboxes, radiogroups and checkboxes, contenteditable); resolves real labels (label, aria-labelledby, aria-label, question containers for Google Forms/Workday/Greenhouse, preceding text, placeholder, name); drops password, card, bank, ID, CAPTCHA, token and hidden fields before anything leaves the page; tags fields with `data-formpilot-id`; collects page context and a 4,000-character excerpt for drafting. |
| M2 injector | `src/content/injector.ts` | Writes through native prototype setters, then `input` / `change` / `blur`, so React, Vue and Angular state updates; clicks radios and checkboxes; matches options by value or label; types into custom comboboxes and picks the option; contenteditable via `insertText`; snapshots every field for Undo. Never touches submit. |
| M2 overlay | `src/content/overlay.ts`, `src/content/index.ts` | Green / amber outlines (dashed when low confidence), restored exactly on clear; an on-page bar in a closed shadow root with Undo all and Dismiss; Show-on-page flash. |
| M3 pipeline | `src/background/fill.ts`, `claude.ts`, `prompt.ts`, `mappings.ts`, `index.ts` | Inject into all frames → read → skip already-filled fields → plan model (Auto: Haiku 5.5 low effort for simple forms, Sonnet 5.5 medium for open questions) → one request with structured output and a cached profile block → stop-reason check → zod validation → safety checks → fill frame by frame → run state in `storage.session`. Keep-alive during the call. Shortcut, right-click menu, optional-permission fallback, navigation clears state. |
| M4 review UX | `src/sidepanel/views/FillView.tsx`, `hooks/useRun.ts` | Live three-step progress; plain-language problems with the one action that fixes each (Allow on websites, Open Settings, Try again); review list with labels as shown on the page, Profile/Draft/Check badges, reasoning, Show and Undo per field, "Left for you" with reasons, tokens and cache use. |
| M4 release | `scripts/package.mjs`, `scripts/store-assets.mjs`, `store/`, `PRIVACY.md`, `docs/STORE_SUBMISSION.md`, `docs/TESTING.md` | Store checks + zip (`release/formpilot-ai-1.0.0.zip`, 331 KB); store screenshots, promo tile and logo rendered from real e2e screenshots; privacy policy; step-by-step submission with permission justifications, data disclosures, listing copy and reviewer notes. |
| Tests | `tests/pipeline.test.ts`, `scripts/e2e.mjs`, `dev/test-form*.html/tsx`, `src/background/fake-claude.ts` | 16 new unit checks (36 total); 42 end-to-end checks in real headless Edge against a React-controlled form with an iframe and traps. |

### Decisions

- **`create()` + zod, not `parse()`**: `parse()` validates before the stop reason can be read, so a refusal surfaced as "unknown". Now the stop reason is checked first (refusal, max_tokens), then the JSON is validated with the same `FillResponseSchema`.
- **Server-side refusal fallback** (`fallbacks: "default"`) on Sonnet 5.5 and Opus 5.5 only; Haiku 5.5 has none.
- **No thinking parameter**: these models think adaptively by default; effort is the speed control (low for mapping, medium for drafting).
- **Hard safety checks after the model**, whatever it answers: consent boxes are never ticked; demographic questions are never answered from a draft; options must exist; text is trimmed to `maxLength`.
- **Page text is untrusted**: the rules tell the model never to follow instructions from the page.
- **Content script as its own IIFE** (Rolldown): `executeScript({ files })` needs one classic script; no web-accessible resources are exposed.
- **`contextMenus` permission added** (no install warning): right-click → fill grants `activeTab`.
- **`_execute_action` has no default key** (Alt+Shift+P clashed in Edge).
- **Version 1.0.0.**

### Bugs found by the tests and fixed

- A dynamic `import()` in the service worker pulled in Vite's preload helper, which uses `window` (no window in a worker): every fill failed. Now a static import guarded by `__FP_E2E__`, tree-shaken out of store builds (checked by the packager).
- Refusals reported as "unknown" (see `create()` above).
- Undo of a radio group that had no prior choice cannot work on React (no user action un-chooses a radio); Undo now clears it in the page and the review says to check it, instead of claiming success.
- The review showed select values ("in") instead of labels ("India").
- `useVault` and `useActiveRun` could let a slow first read overwrite newer data; both now ignore stale reads.

### Verified

- `npm test`: 36 / 36. `npm run e2e`: 42 / 42 in Microsoft Edge 157 (React state for text, email, tel, url, number, select, radio, checkbox group, textarea; same-origin iframe; password, card, CSRF, consent, demographic and pre-filled fields untouched; never submitted; outlines and bar; review in the real panel; Show; Undo one; Undo all including the iframe; second fill; browser pages refused; no panel errors).
- `npm run package`: store checks pass (MV3, version, no localhost or broad host permissions, no content_scripts, no eval / new Function / remote scripts / source maps / E2E code).
- Production build loads in Edge with no exceptions.

### Not verified here (needs your key)

- A fill against the **real** Claude API. Every part around it is tested (request shape, headers, caching block, structured output, errors) through a stand-in network, but no call was made to api.anthropic.com with a real key. Run it once with your key before submitting (docs/TESTING.md).
- Loading in Google Chrome: done by hand (branded Chrome blocks automated extension loading); same Chromium build as Edge.

---

## 2026-11-23: type redone with the taste skill (Instrument Sans)

**Why:** you said the fonts made it look like AI slop and asked for the taste skill to pick better ones.

**Found:** the Funnel setup broke two of the skill's type rules: three families (never three) and 600-weight buttons and links (text at 400 and 500 only).

**Changed:**
- Type is now the skill's **instrument** pairing: Instrument Sans for everything, with DM Mono only for keys and the Markdown editor. Picked from `start.mjs types --page software` ("design and productivity software"); tokens from `start.mjs brand --type instrument`. Not re-dealt, because `deal` would re-arm the closed gate.
- Headings at 500, 96% width, −2.8% tracking; body 16 on 26; scale 28 / 20 / 16 / 14 / 13; buttons and links at 500.
- Funnel packages removed; font files down from 8 to 4.

**Verified:** checker at 400 and 320: `font-load`, `heading-scale`, `body-size`, `contrast`, `text-contrast` PASS; the one FAIL is the measured scroll-clip false positive; copy-lint 0 / 0; 20 / 20 tests; build clean; real extension in Edge with no errors.

---

## 2026-11-23: Spatial UI redesign

**Why:** you asked for a Spatial UI redesign.

**Changed:**
- `src/styles/app.css` rewritten as a four-layer spatial system: environment backdrop, window, floating glass (specular rims, layered depth shadows, heavy blur), and capsule controls that lift on hover and press on click. Fields are recessed. Full spec in [DESIGN.md](DESIGN.md).
- New `src/sidepanel/hooks/useSpatialPointer.ts`: a gaze-style light follows the mouse across cards, buttons and tabs.
- `App.tsx`: compact header with an "On this device" glass chip; the tabs became a floating ornament at the bottom with icons; views settle in when opened; the scroll edge fades.
- The save bar is a floating thick-material capsule. It first let text show through (backdrop blur does not apply inside the masked scroll area), so it was made 97% opaque.
- The primary button is a bright near-white capsule, the most-forward object in each view.

**Verified:** taste skill checker at 400 and 320: 1 FAIL judged false (scroll clip, measured), 5 WARN, no sideways scroll; 20 / 20 tests; build clean; real extension in headless Edge renders the spatial UI with no exceptions or console errors.

---

## 2026-11-23: dark glassmorphism redesign

**Why:** you did not like the dealt putty and olive palette and asked for a dark, glassmorphic, aesthetic panel.

**Changed:**
- `src/styles/app.css` rewritten as dark glass: ink-blue ground with aurora lights on the panel root, frosted glass cards (blur, hairline, highlight), dark glass fields with an aqua focus glow, an aqua primary button with glow, glass secondary buttons, a glass segmented tab control, an aqua-to-blue lit wordmark, and thin scrollbars. Dark only (`color-scheme: dark`).
- Colours registered with the taste skill as client colours (`start.mjs brand`); fonts, radius and button shape kept from the deal.
- Header and the sticky action bar are frosted bars; every form section is its own glass card; the custom-fact rows are inset panes inside their card.
- Accessibility: `prefers-reduced-transparency` falls back to solid surfaces; dark `<option>` colours for Windows; tabs kept at 44px.
- Toolbar icon recoloured (ink-blue tile, white lines, aqua short line); theme-color `#0b1016`.

**Verified:** the taste skill's checker at 400 and 320: 0 FAIL (contrast measured on rendered pixels over the aurora); 20 / 20 tests; build clean; real extension in headless Edge: worker, storage, API error mapping, glass renders, no exceptions or console errors; no sideways scroll at 320.

**Taste gate:** closed at your word ("Close the gate"): `GATE: DONE` after round 2 of 3, with the 12 landing-page FAILs left open (listed in DESIGN.md).

---

## 2026-11-23 (later): UI redone with the design-taste-frontend skill

**Why:** the first pass loaded the skill and applied a few of its rules, but did not deal the palette or type or run its checks; the accent and font were my own choices. You pointed out it did not look like the skill's work, which was fair.

**Changed:**
- Dealt and applied the skill's system: palette moss-sand, type funnel (bundled locally via Fontsource), radius round, solid buttons, wordmark. Full record in [DESIGN.md](DESIGN.md). `src/styles/app.css` rewritten on the kit's tokens and component rules.
- Headings: a 24px h1 view title per tab ("Fill the form on this page", "Your profile", "Resume and bio", "Settings"), 18px section h2s; the wordmark is no longer a heading.
- Fill view: main button first, a small preview of a filled form (also the green/amber legend), checklist rows on one left edge, no truncated text, platform fact ("Chrome and Edge") in the intro, notes in ink.
- Skip link to the content, `<main id="content">`; page description and theme-color in `index.html`.
- Toolbar icon recoloured to the palette (olive, white, putty).
- Section dividers removed (sections part by space).

**Verified:** copy-lint 0 FAIL / 0 WARN; consistency checker 0 FAIL at 400 and 320; 20 / 20 tests; build clean, no remote font URLs; real extension in headless Edge: worker, storage, API error mapping, no exceptions or console errors.

**Open:** the skill's finish gate reports 12 FAILs, all landing-page structure rules (one-screen hero, full-screen sections, `.wrap` margins at 1440, an award-site moment) that a 400px side panel cannot meet without becoming a website. Not waived; listed in DESIGN.md. Close the build with `gate.mjs --done "<your words>"` if you accept that.

---

## 2026-11-23: Step 1 (architecture), Step 2 (schemas), Milestone 1 (manifest, build, Profile Vault)

### Built

| Area | Files |
|---|---|
| Architecture and folder plan | `docs/ARCHITECTURE.md` |
| Data and API schemas (stored data, extractor output, Claude request layout, structured output, messages, models) | `docs/SCHEMAS.md`, `src/shared/schema.ts` |
| MV3 manifest (typed) | `manifest.config.ts` → `dist/manifest.json` |
| Build | `package.json`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts` |
| Service worker: panel-on-click, `Alt+Shift+F` command, migration on install, typed message router, API-key test | `src/background/index.ts`, `src/background/claude.ts` |
| Storage layer: validated reads, versioned schema, API key kept apart, wipe | `src/shared/storage.ts` |
| Validation and helpers | `src/shared/validate.ts`, `src/shared/models.ts`, `src/shared/messages.ts` |
| Side panel (Profile Vault): Fill (readiness), Profile, Resume, Settings (key, model, highlights, export/import/delete) | `src/sidepanel/**`, `src/styles/app.css` |
| Icons 16/32/48/128, dependency-free generator | `scripts/make-icons.mjs`, `public/icons/` |
| Browser harness: the real panel with a `chrome.*` mock | `dev/` (`npm run harness`, port 5174) |
| Unit tests (20) | `tests/vault.test.ts` |

### Decisions and changes from the brief

1. **Stack kept, versions current:** Vite 8, `@crxjs/vite-plugin` 3, React 19, Tailwind 4, TypeScript 7, zod 4, `@anthropic-ai/sdk` 1.12. WXT was considered and not chosen (see ARCHITECTURE §3). React stays in the side panel only; the page script (Milestone 2) is dependency-free TypeScript.
2. **Default model is "Auto"**: Haiku 5.5 for simple forms, Sonnet 5.5 when the page has open-ended questions. The brief's `claude-sonnet-4-6` is kept as a selectable option; Sonnet 5.5 is newer and costs less ($2 / $10 vs $3 / $15 per million tokens). Opus 5.5 offered as "Best".
3. **`confidence` is an enum (`high | medium | low`)**, not a 0–1 number: structured outputs do not support `minimum` / `maximum`. Added `source` (`profile | generated`) to drive the green / amber highlight, `values` for multi-choice fields, and `unmapped` with reasons. Verified by a test that `zodOutputFormat(FillResponseSchema)` yields closed objects and no unsupported constraints.
4. **API key defaults to session-only storage** (`chrome.storage.session`, forgotten when the browser closes), with an opt-in "On this device" (`storage.local`). The key never sits in settings and is never exported. The UI says plainly that local storage is unencrypted.
5. **Optional host permissions** (`http(s)://*/*`, requested for one site at a time) added as a fallback for clicks inside the side panel, which may not grant `activeTab`. Nothing broad is granted at install. To confirm in Milestone 2.
6. **Key test uses `models.retrieve`**: checks the key and model access without spending tokens.
7. **Sensitive data is out of scope by design**: the profile has no fields for government IDs, card or bank data, passwords or date of birth.
8. **Design**: one accent (blue, never violet), warm neutrals, light and dark themes, system font (no remote fonts), 16px inputs, 44px targets, visible labels, errors under fields on save, one live status line per form, buttons step on hover and press on click, reduced motion respected.

### Verification

- `tsc --noEmit`: clean. `vitest`: 20 / 20 pass.
- Bundle scan: no `eval`, no `new Function`, no remote script URLs. The Anthropic SDK is only in the service-worker bundle, not the side panel.
- Browser harness (light and dark, 320px and 400px wide): profile validation (error under field, focus moves to it, status counts errors, error clears on edit), save, URL normalisation, unsaved-tab marker, key validation and save, session-key forgetting on reload, key removal confirmation, resume counts, no sideways scroll, no interactive target under 44px outside running text.
- **Real extension in headless Microsoft Edge 157** (unpacked `dist/`): service worker starts, install migration ran (`schemaVersion: 1`), `PING` round trip, `TEST_API_KEY` against the live API with a fake key returns the mapped auth error, panel renders from real `chrome.storage`, no exceptions or console errors.
- Google Chrome 157 ignores `--load-extension` (branded builds removed it), so Chrome was not driven automatically. Load `dist/` by hand via `chrome://extensions` → Developer mode → Load unpacked.
- **Web Interface Guidelines review** run on all side-panel files; fixed: unsaved-changes warning on close, `translate="no"` on brand and shortcut, sticky bar no longer covers focused fields (`scroll-padding-bottom`), submit buttons stay live, key removal asks first, inputs named, long fact labels wrap, `text-balance` on headings, tabular numbers on counts, tap highlight set. Kept on purpose: sentence case (not Title Case), and the disabled "Fill this page" button until Milestone 2.

### Bugs found and fixed during verification

- Tailwind did not scan `src/` when the harness ran from `dev/` → `@source ".."` in `app.css`.
- At 320px the action bar squeezed the status text → the bar wraps its buttons to a second row.
- A focused invalid field lost its red border → invalid border wins over the focus border.
- **Draft sync bug (found in Edge):** when storage changed from outside (import, another window), the Profile and Resume views ignored the new data and showed "unsaved changes". The views now compare the draft against the snapshot it started from.

### Known gaps / next

- The Fill button is disabled until Milestone 2 (extractor + injector) and 3 (Claude fill request).
- The `Alt+Shift+P` "open panel" shortcut was not assigned in headless Edge (likely a conflict); users can set it at `edge://extensions/shortcuts` or `chrome://extensions/shortcuts`. `Alt+Shift+F` was assigned.
- Prompt caching only takes effect once the profile + resume prefix passes the model's minimum cacheable length (512 to 4,096 tokens).
