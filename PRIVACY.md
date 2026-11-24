# FormPilot AI privacy policy

Last updated: 23 November 2026

FormPilot AI ("FormPilot", "the extension") fills web forms from information you keep in the extension. This policy says what it handles, where it goes, and how to delete it.

## What FormPilot stores

Everything FormPilot stores stays in your browser's extension storage on your device:

- **Your profile:** the details you type in (name, contact details, address, links, work and education facts, and any extra facts you add).
- **Your resume or bio:** the text you paste, or that FormPilot extracts from a PDF or Word file you import. Files are read on your device and never uploaded; only the extracted text is kept.
- **Your settings:** model choice and display preferences.
- **Your Anthropic API key:** by default only until you close the browser; on your device if you choose "On this device". It is stored apart from your profile and is never included in exports.

FormPilot has no account system, no analytics, no advertising and no server of its own. The developer never receives your data.

## What leaves your device, and when

In **Basic mode** (no API key, or "Free: Basic" chosen in Settings) nothing leaves your device at all: fields are matched by rules inside the extension.

With an API key, only when you ask FormPilot to fill a page (the Fill button, the keyboard shortcut or the right-click menu), it sends one request **directly from your browser to Anthropic's API** (`api.anthropic.com`) using your own API key. That request contains:

- your profile and resume, so Claude can answer the form;
- the page's address (without the query string or fragment), title, headings, description and up to 4,000 characters of its visible text outside the form, so drafted answers fit the role or program;
- the form's field labels, types and options.

FormPilot **never** reads or sends: password fields, payment card fields, bank and tax fields, passport and other government ID fields, CAPTCHA or security-token fields, hidden fields, or anything you already typed into a field. It does not read pages you do not ask it to fill.

**Aadhaar is the one exception, and it stays on your device.** If you save your Aadhaar number under Profile → Other facts, FormPilot fills Aadhaar fields with it directly in the page. The number is never sent to Anthropic or anywhere else: Aadhaar fields and Aadhaar facts are removed from every request, and the review list shows the number masked (XXXX XXXX 1234). If you do not save it, Aadhaar fields stay empty.

Anthropic processes the request under its own terms and privacy policy (https://www.anthropic.com/legal/privacy). Under Anthropic's commercial terms, API inputs and outputs are not used to train its models by default.

## What FormPilot does on the page

It writes the answers into the form fields and outlines them so you can review them. It never submits a form, never clicks a submit button, and gives you an Undo for every field.

## Your choices

- Delete everything at any time: Settings → Your data → Delete all data. Removing the extension also deletes its storage.
- Export your profile and resume as a file: Settings → Your data → Export profile.
- Remove your API key: Settings → Anthropic API key → Remove key.

## Children

FormPilot is not directed at children under 13.

## Changes

If this policy changes, the new version will be published at the same address with a new date.

## Contact

Questions about this policy: [add your contact email or support page before publishing].
