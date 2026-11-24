# Publishing FormPilot AI to Chrome Web Store and Microsoft Edge Add-ons

One build, one zip, both stores.

## 0. Before you submit

| Step | Command / action | Result |
|---|---|---|
| Tests | `npm test` and `npm run e2e` | 50 unit checks and 59 end-to-end checks pass |
| Package | `npm run package` | `release/formpilot-ai-1.0.0.zip`, store checks passed |
| Images | `npm run store-assets` (after `npm run e2e`) | `store/` screenshots, promo tile, logo |
| Privacy policy | Publish `PRIVACY.md` at a public URL (GitHub Pages, a Gist, or your site) and fill in its contact line | A URL both stores ask for |
| Manual check | Load `dist/` unpacked in Chrome and in Edge; fill one real form with your key ([TESTING.md](TESTING.md)) | Seen working with the real API |

Bump `version` in `package.json` for every later upload; the stores reject a version they already have.

## 1. Chrome Web Store

1. Register at https://chrome.google.com/webstore/devconsole (one-time fee of US$5).
2. **New item** → upload `release/formpilot-ai-1.0.0.zip`.
3. **Store listing**
   - Name: FormPilot AI
   - Summary (132 max): `Fill job applications and web forms from a profile kept on your device. Review every answer; it never submits.`
   - Description: the text in section 4.
   - Category: Productivity (Workflow & Planning). Language: English.
   - Icon: taken from the package (128×128).
   - Screenshots: `store/screenshot-1-filled-form.png`, `store/screenshot-2-review.png` (1280×800).
   - Small promo tile: `store/promo-small-440x280.png`.
4. **Privacy practices**
   - Single purpose: `Fill web forms the user chooses, using details the user stores in the extension, and let the user review and undo every answer.`
   - Permission justifications: section 3.
   - Remote code: **No, I am not using remote code.** All code is in the package; there is no eval and no remotely hosted script.
   - Data usage: tick **Personally identifiable information** (name, email, address and phone the user enters) and **Website content** (form labels and visible page text sent to the AI model when the user asks for a fill). Certify the three statements: not sold to third parties, not used for unrelated purposes, not used for creditworthiness or lending.
   - Privacy policy URL: your published `PRIVACY.md`.
5. **Distribution:** Public (or Unlisted to try it with a few people first), all regions.
6. **Submit for review.** `activeTab` plus optional host permissions usually avoid the extended review that `<all_urls>` triggers.

## 2. Microsoft Edge Add-ons

1. Register at https://partner.microsoft.com/dashboard/microsoftedge (free).
2. **Create new extension** → upload the same zip.
3. **Availability:** Public, all markets.
4. **Properties:** category Productivity; privacy policy URL (required, the extension handles personal information): your published `PRIVACY.md`; website and support URL if you have them.
5. **Store listing (English):** description from section 4; logo `store/logo-300.png`; small promotional tile `store/promo-small-440x280.png`; screenshots from `store/`; search terms: autofill, job application, form filler, AI, resume.
6. **Notes for certification** (seen by reviewers only): section 5.
7. **Publish.** Review usually takes up to 7 business days.

## 3. Permission justifications (paste into both stores)

| Permission | Justification |
|---|---|
| `activeTab` | Gives FormPilot access to the current tab only after the user clicks the toolbar button, presses the shortcut or uses the right-click menu, so it can read the form the user asked to fill. |
| `scripting` | Injects FormPilot's own bundled script into that tab, on demand, to read the form fields and write the answers. Nothing is injected on pages the user has not asked to fill. |
| `storage` | Keeps the user's profile, resume and settings on the device, and the progress of a fill so the side panel can show it. |
| `sidePanel` | The toolbar popup can move FormPilot into the side panel, which stays open while the user works on the page; the shortcut and the right-click menu also open it, so the user can review each answer as the form fills. |
| `contextMenus` | Adds "Fill this form with FormPilot" to the right-click menu on pages and form fields. |
| Host `https://api.anthropic.com/*` | The only server the extension contacts: Anthropic's API, called with the user's own API key to map their details onto the form and draft short answers. |
| Optional hosts `https://*/*`, `http://*/*` | Requested at run time, only if the user clicks "Allow on websites" after a fill started from the side panel could not reach the page (a click inside the side panel does not always grant activeTab). Not granted at install. |

## 4. Store description

> **Fill job applications and web forms in one click, from a profile you keep on your own device.**
>
> FormPilot AI reads the visible fields of the form you are on, fills them from your saved profile and resume, and drafts short answers to open questions like "Why do you want to join?". Every value is outlined on the page and listed in the side panel so you can review it. It never presses Submit.
>
> • Your profile, resume and settings stay in your browser. No account, no tracking, no server of ours.
> • Free Basic mode fills your details with no AI, no account and no cost, entirely on your device.
> • Add your own Anthropic API key to have Claude draft answers to open questions; you pay Anthropic directly per use.
> • Works with sites built on React, Angular and Vue, plus Google Forms, Greenhouse-style application pages and plain HTML forms, including forms inside same-site frames.
> • Green outline: from your profile. Amber outline: drafted for you to check.
> • Undo any field, or all of them.
> • Skips passwords, payment cards, bank and passport numbers, CAPTCHAs and hidden fields. Fills an Aadhaar number only if you saved it, on your device; it is never sent anywhere. Leaves consent boxes and personal demographic questions to you.
> • Shortcut Alt+Shift+F, or right-click a field → "Fill this form with FormPilot".

## 5. Notes for reviewers (Edge "Notes for certification")

```
FormPilot fills forms with the user's own Anthropic API key (BYOK). To test:
1. Click the FormPilot toolbar icon (it opens a popup). Profile tab: enter a name and email, Save profile.
2. Settings tab: paste this test key, Save key, then Test key:  <paste a key with a low monthly spend limit>
3. Open any job application or sign-up form (for example a public Google Form), then Fill tab → Fill this page.
   If asked, click "Allow on websites" (optional permission), or press Alt+Shift+F on the page.
4. Fields are outlined and listed for review; "Undo all" restores them. The extension never submits forms.
```

Create a separate key for reviewers in the Claude Console with a small spend limit, and delete it after approval.
