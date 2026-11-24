# Testing FormPilot AI

## Automated

```bash
npm install
npm test            # 50 unit checks: storage, validation, request shape, caching, safety rules, Claude errors
npm run e2e         # 59 checks: the real extension in headless Microsoft Edge filling a React form and importing a PDF and a Word resume
```

`npm run e2e` builds a test-only variant (`dist-e2e/`) that may reach `http://localhost` and answers with a local stand-in for the Claude API, so it needs no key and no network. Screenshots land in `e2e-results/`. Set `EDGE_PATH` if Edge is not in its usual place. Branded Google Chrome no longer accepts `--load-extension`, so the automated run uses Edge; it is the same Chromium build.

## By hand, with your own key

1. `npm run build`
2. Load it:
   - **Chrome:** `chrome://extensions` → Developer mode on → **Load unpacked** → pick the `dist` folder.
   - **Edge:** `edge://extensions` → Developer mode on → **Load unpacked** → pick the `dist` folder.
3. Click the FormPilot icon (pin it from the puzzle-piece menu first). The side panel opens.
4. **Profile:** fill in at least name, email and city; **Save profile**. **Resume:** **Import PDF or Word** (or paste text), check it, **Save resume**. Sample files: `dev/fixtures/resume.pdf`, `dev/fixtures/resume.docx`.
5. **Optional, Settings:** with no key FormPilot fills in free **Basic mode** (facts only, no drafted answers, nothing sent anywhere). For drafted answers, paste your Anthropic API key (from https://console.anthropic.com/settings/keys), **Save key**, then **Test key**. It should say the key works.
6. Try the local test form: run `npm run harness`, open http://localhost:5174/test-form.html, then **Fill → Fill this page**.
   The first time, the panel may ask you to **Allow on websites** (one browser prompt). Or press **Alt+Shift+F** on the page, or right-click a field → **Fill this form with FormPilot**; both work without that permission.
7. Check:
   - fields from your profile are outlined green, the drafted "Why do you want to join" answer amber;
   - the password, card number, "I agree" box and gender question stay empty;
   - the panel lists every value with **Show** and **Undo**, and a "Left for you" list with reasons;
   - **Undo all** (panel or on-page bar) puts the form back; the form is never submitted.
8. Try real sites without submitting: a public Google Form, a Greenhouse or Lever job application, a hackathon sign-up page.

## Things to know

- Browsers do not let extensions run on their own pages (`chrome://`, `edge://`), on the extension stores, or inside PDF viewers. FormPilot says so instead of failing silently.
- Cross-site iframes (a form embedded from another domain) are filled only after you allow website access.
- A radio group that had nothing chosen cannot be un-chosen by any user action on React and similar sites; Undo clears it in the page and the review says to check it.
- Custom drop-downs (Workday, React-Select) are typed into and the matching option is picked when the list appears; if none matches, the review says so.
- The default key setting forgets the key when the browser closes. Choose "On this device" in Settings to keep it.
