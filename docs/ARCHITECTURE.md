# FormPilot AI: architecture

Status: v1.0.0. All milestones built: Profile Vault (M1), extractor and injector (M2), Claude fill pipeline (M3), review UX and store packaging (M4).

## 1. Runtime pieces

```
┌──────────────────────────── Browser (Chrome / Edge, MV3) ───────────────────────────┐
│                                                                                     │
│  Side panel (React)                Service worker (stateless)        Active tab      │
│  src/sidepanel/                    src/background/                    (any site)      │
│  ┌──────────────────┐   runtime    ┌───────────────────────┐ scripting ┌──────────┐ │
│  │ Fill · Profile · │──message────▶│ index.ts router       │──execute──▶│ content/ │ │
│  │ Resume · Settings│  FILL_PAGE   │  ├ injects content.js │ Script     │ extractor│ │
│  │                  │◀─────────────│  ├ calls Claude client│            │ injector │ │
│  │ reads/writes     │  progress    │  └ stores run state   │◀─tabs.send─│ highlight│ │
│  │ storage directly │  via storage │     in storage.session │  Message   └──────────┘ │
│  └────────┬─────────┘   .session   └──────────┬────────────┘   (EXTRACT / APPLY /     │
│           │                                   │                 CLEAR / UNDO)         │
│           ▼                                   ▼                                       │
│     chrome.storage.local  ◀───────────── profile, resume, settings                    │
│     chrome.storage.session ◀──────────── API key (opt-in "this session only"), runs    │
│                                               │                                       │
└───────────────────────────────────────────────┼───────────────────────────────────────┘
                                                │ HTTPS (only fixed host permission:
                                                ▼  https://api.anthropic.com/*)
                                     Anthropic Messages API
                                     (or a future proxy: same client interface)
```

### Who owns what

| Piece | Owns | Never does |
|---|---|---|
| Side panel | Profile Vault editing, settings, the Fill button, the review list (accept / undo per field) | Touch the page DOM; call Claude directly |
| Service worker | Message routing, injecting the content script, the Claude call, run state | Hold state in globals (it can be killed at any moment); read the page |
| Content script (injected on demand, isolated world) | Serialising fields, injecting values, highlights, undo snapshot | Read extension storage; talk to the network; click submit |

### Fill flow

1. User clicks **Fill this page** in the side panel, presses `Alt+Shift+F`, or right-clicks a field → "Fill this form with FormPilot" (the shortcut and the menu grant `activeTab`).
2. Service worker runs `chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["content.js"] })`. `content.js` is one self-contained IIFE bundled separately (Rolldown, see `vite.config.ts`), so it needs no web-accessible resources. Injection is idempotent (`window.__formpilot`). Every frame we may reach gets it, so same-origin iframes (Greenhouse embeds) are filled too; field ids are `"<frameId>:fp-<n>"`.
3. Service worker sends `EXTRACT`. The content script returns an `ExtractResult` (fields + page context). Sensitive fields (passwords, hidden inputs, card numbers, CSRF tokens, SSN/passport-like fields) are dropped inside the content script, before serialisation, so they never leave the page.
4. Service worker builds the Claude request: cached prefix = system rules + profile + resume; dynamic suffix = page context + fields. Structured output guarantees a `FillResponse`.
5. Service worker sends `APPLY` with the mappings. The content script snapshots each field's current value, writes values with the native prototype setter, dispatches `input` / `change` / `blur`, and outlines each field (green = from profile, amber = AI-drafted).
6. The side panel shows the review list, driven by `storage.session` run state, so a killed worker or a reopened panel loses nothing. Undo restores the snapshot. Submit is never clicked.

### Permission model (store-safe)

| Permission | Why |
|---|---|
| `activeTab` | Touch the page only after a user gesture (toolbar, shortcut). |
| `scripting` | Inject the bundled content script into that tab on demand. No `content_scripts` in the manifest: nothing runs on pages the user never asks to fill. |
| `storage` | Profile, resume and settings in `chrome.storage.local`; run state in `chrome.storage.session`. |
| `sidePanel` | The Profile Vault and review UI. |
| `contextMenus` | "Fill this form with FormPilot" on right-click: a user gesture that also grants `activeTab`. |
| host `https://api.anthropic.com/*` | BYOK calls from the service worker. One fixed origin, not `<all_urls>`. |
| optional host `http://*/*`, `https://*/*` | Requested **for one origin at a time, when the user clicks Fill in the side panel**, and only if `activeTab` was not granted (a click inside the side panel may not count as an `activeTab` gesture). The user sees the browser's own prompt naming that one site. Optional permissions are not granted at install. |

No remote code, no `eval`, no `new Function`; the CSP is the MV3 default (`script-src 'self'`).

## 2. Folder structure

```
FormPilot AI/
├─ manifest.config.ts          # MV3 manifest, typed (CRXJS defineManifest)
├─ vite.config.ts              # CRXJS + React + Tailwind v4
├─ vitest.config.ts
├─ package.json / tsconfig.json
├─ public/icons/               # 16/32/48/128 PNG (generated by scripts/make-icons.mjs)
├─ scripts/make-icons.mjs      # dependency-free PNG icon renderer
├─ src/
│  ├─ background/
│  │  ├─ index.ts              # SW entry: panel, shortcut, context menu, message router
│  │  ├─ fill.ts               # one fill: inject → read frames → Claude → check → write → review state
│  │  ├─ claude.ts             # client, structured output request, typed errors
│  │  ├─ prompt.ts             # rules, cached profile block, page message, model plan
│  │  ├─ mappings.ts           # checks every answer against what was sent (consent, demographics, options)
│  │  └─ fake-claude.ts        # E2E-only stand-in for the API (tree-shaken out of store builds)
│  ├─ content/                 # extractor.ts, injector.ts, overlay.ts (outlines + on-page bar), index.ts
│  ├─ sidepanel/
│  │  ├─ index.html, main.tsx, App.tsx
│  │  ├─ views/                # FillView, ProfileView, ResumeView, SettingsView
│  │  ├─ components/           # form controls, section, status line
│  │  └─ hooks/                # storage-backed state with change subscription
│  ├─ shared/
│  │  ├─ schema.ts             # zod: Profile, Settings, FieldDescriptor, FillResponse
│  │  ├─ storage.ts            # typed, validated, versioned storage access
│  │  ├─ messages.ts           # typed message union + send helper
│  │  └─ models.ts             # model catalogue
│  └─ styles/app.css           # Tailwind v4 + the Spatial UI design system
├─ dev/                        # harness (panel + chrome.* stand-in) and the React test form
├─ scripts/                    # icons, e2e, package (zip + store checks), store-assets
├─ store/                      # store screenshots, promo tile, logo
├─ PRIVACY.md                  # privacy policy for both store listings
├─ tests/                      # vitest unit tests
└─ docs/                       # ARCHITECTURE.md, SCHEMAS.md, PROJECT_LOG.md
```

## 3. Stack decisions

| Choice | Why |
|---|---|
| Vite 8 + `@crxjs/vite-plugin` 3 | Reads a typed manifest, bundles every entry (SW, side panel, on-demand content script), HMR in dev. One Chromium build serves Chrome and Edge. WXT was considered; CRXJS keeps the build closer to plain Vite and to the brief. |
| React 19 for the side panel only | Forms with validation, dirty tracking and lists. The content script injected into third-party pages is plain TypeScript with zero dependencies, so it stays small and framework-free. |
| Tailwind v4 (`@tailwindcss/vite`) | Tokens in CSS (`@theme`), no config file, no runtime. |
| zod 4 | One schema for storage validation, import validation and (M3) the Claude structured-output schema via `zodOutputFormat`. |
| `@anthropic-ai/sdk` in the service worker | Typed errors (`RateLimitError` …), retries, `messages.parse()` with structured outputs. `dangerouslyAllowBrowser: true` sends `anthropic-dangerous-direct-browser-access: true`. |
| Manrope (+ JetBrains Mono for labels, numbers and keys), bundled | From the design-taste-frontend skill's catalogue (docs/DESIGN.md); shipped inside the extension via Fontsource, so no remote font requests. |
