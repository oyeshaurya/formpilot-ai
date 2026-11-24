# FormPilot AI

A privacy-first form and application auto-filler for Chrome and Edge (Manifest V3). Keep your profile and resume on your device; FormPilot fills the visible fields of any form, drafts short answers with Claude using your own API key, outlines what it filled, and never presses Submit.

**Status:** v1.0.0, all four milestones built and tested; ready to load unpacked and to submit to both stores. See [docs/PROJECT_LOG.md](docs/PROJECT_LOG.md).

## Quick start

```bash
npm install
npm run build          # typecheck + build into dist/
```

Load `dist/` in **Chrome** (`chrome://extensions`) or **Edge** (`edge://extensions`): turn on Developer mode → **Load unpacked** → pick `dist`. Click the toolbar icon to open FormPilot as a popup (its side-panel button moves it into the side panel, which stays open while you use the page), add your profile (and optionally an Anthropic API key for drafted answers; without one, free Basic mode fills facts only), then open any form and press **Fill this page** (or **Alt+Shift+F**, or right-click a field).

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Typecheck and build the extension into `dist/` |
| `npm test` | 50 unit checks |
| `npm run e2e` | 59 end-to-end checks: the real extension in headless Edge filling a React form and importing PDF and Word resumes |
| `npm run harness` | The side panel in a normal tab (with a `chrome.*` stand-in) at http://localhost:5174, and the test form at http://localhost:5174/test-form.html |
| `npm run package` | Store checks + `release/formpilot-ai-<version>.zip` for both stores |
| `npm run store-assets` | Store screenshots, promo tile and logo into `store/` (run `npm run e2e` first) |
| `npm run icons` | Regenerate the toolbar icons |

## Docs

- [Testing it yourself](docs/TESTING.md)
- [Publishing to Chrome Web Store and Edge Add-ons](docs/STORE_SUBMISSION.md) · [Privacy policy](PRIVACY.md)
- [Architecture and folder structure](docs/ARCHITECTURE.md)
- [Data and API schemas](docs/SCHEMAS.md)
- [Design system](docs/DESIGN.md)
- [Project log](docs/PROJECT_LOG.md): what was built, decided, verified and fixed
