# FormPilot AI: data and API schemas

The source of truth is [`src/shared/schema.ts`](../src/shared/schema.ts) (zod). This file explains the shapes and why they look this way.

## 1. Stored data (`chrome.storage.local`)

| Key | Shape | Notes |
|---|---|---|
| `fp:profile` | `Profile` | Structured fields. Every field optional; empty strings are stripped before they reach Claude. |
| `fp:resume` | `{ markdown: string, updatedAt: string }` | Markdown resume / bio, max 60,000 characters. |
| `fp:settings` | `Settings` | Model, key-storage mode, highlight preference. **No API key in here.** |
| `fp:apiKey` | `string` | In `storage.local` when "Remember on this device" is on; otherwise in `storage.session` (cleared when the browser closes). |
| `fp:meta` | `{ schemaVersion: 1 }` | Lets `storage.ts` migrate old shapes. |

Run state lives in `chrome.storage.session` under `fp:run:<tabId>` (section 5).

### Profile

```jsonc
{
  "personal":     { "firstName", "lastName", "preferredName", "pronouns", "email", "phone" },
  "address":      { "street", "city", "region", "postalCode", "country" },
  "links":        { "linkedin", "github", "portfolio", "website" },
  "work":         { "currentTitle", "currentCompany", "yearsExperience", "skills",
                    "workAuthorization", "needsSponsorship": "yes" | "no" | "",
                    "noticePeriod", "salaryExpectation", "willingToRelocate": "yes" | "no" | "" },
  "education":    { "school", "degree", "fieldOfStudy", "graduationYear" },
  "customFacts":  [{ "id", "label", "value" }],   // "How did you hear about us?: A friend", "CGPA: 8.7"
  "updatedAt":    "ISO date"
}
```

Deliberately absent: government IDs, passport numbers, bank or card data, passwords, date of birth. The extractor also refuses to fill such fields on a page (section 2).

## 2. DOM field extractor output (content script → service worker)

```jsonc
// ExtractResult
{
  "page": {
    "url": "https://boards.example/jobs/123",  // origin + path only: no query, no hash
    "title": "Senior Engineer — Apply",
    "headings": ["Senior Engineer", "Your application"], // first h1–h3, max 8, each ≤ 120 chars
    "description": "We build …",               // meta description, ≤ 300 chars
    "lang": "en",
    "excerpt": "Acme builds …"               // visible text outside the form, ≤ 4,000 chars
  },
  "fields": [ /* FieldDescriptor[], max 150, document order */ ],
  "skipped": { "sensitive": 2, "hidden": 5, "disabled": 1, "overflow": 0 }
}
```

```jsonc
// FieldDescriptor
{
  "id": "fp-7",                    // also written to the element as data-formpilot-id="fp-7"
  "kind": "text",                  // text | email | tel | url | number | date | textarea | select
                                   // | multiselect | radio-group | checkbox | checkbox-group
                                   // | combobox | contenteditable
  "label": "Why do you want to join?",   // resolved: label[for] → wrapping label → aria-labelledby
                                         // → aria-label → question container → placeholder → name
  "section": "Short answers",      // nearest legend / heading / [role=group] name
  "description": "Max 300 words",  // aria-describedby / help text
  "placeholder": "",
  "name": "q_why",                 // the element's name, a weak hint
  "autocomplete": "",              // the page's own autocomplete token: a strong hint ("given-name")
  "required": true,
  "maxLength": 1500,               // when the page declares one
  "options": [{ "value": "us", "label": "United States" }],  // select, radio, checkbox, combobox (≤ 200)
  "currentValue": ""               // so Claude does not overwrite what the user typed
}
```

A `radio-group` or `checkbox-group` is one descriptor for the whole group (the id sits on the group's first input; the injector resolves the rest by `name` / `role=radiogroup`).

Dropped before serialisation, counted in `skipped.sensitive`: `type=password|hidden|file`, `autocomplete` starting `cc-` or `current-password|new-password|one-time-code`, and names, ids or labels matching card number, CVV/CVC, IBAN, routing/account number, SSN, national insurance, passport, tax ID, CSRF/token/nonce/captcha.

## 3. Claude request layout (service worker)

```
system: [
  { text: RULES (static, versioned)                                        },
  { text: "<profile>…</profile>\n<resume>…</resume>", cache_control: ephemeral }   ← cache breakpoint
]
messages: [
  { role: "user", content: "<page>…</page>\n<fields>…JSON…</fields>" }             ← changes every page
]
output_config: { format: betaZodOutputFormat(FillResponse), effort: "low" | "medium" }
// Sonnet 5.5 / Opus 5.5 only: betas ["server-side-fallback-2026-07-01"], fallbacks: "default"
// Sent with client.beta.messages.create(); stop_reason is checked before the JSON is parsed and validated.
```

Everything before the breakpoint is byte-stable between pages (profile JSON is serialised with sorted keys, no timestamps), so the second and later fills read the prefix from cache. Caching only starts once the prefix is long enough for the model's minimum (from 512 up to 4,096 tokens); a short profile with no resume simply runs uncached.

## 4. Claude structured output (`FillResponse`)

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["mappings", "unmapped"],
  "properties": {
    "mappings": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["fieldId", "value", "values", "source", "confidence", "reasoning"],
        "properties": {
          "fieldId":    { "type": "string" },
          "value":      { "type": "string", "description": "Text to write, or the chosen option's value. Empty for multi-choice." },
          "values":     { "type": "array", "items": { "type": "string" }, "description": "Option values for checkbox-group / multiselect; else []" },
          "source":     { "enum": ["profile", "generated"] },
          "confidence": { "enum": ["high", "medium", "low"] },
          "reasoning":  { "type": "string", "description": "One short sentence, shown in the review list" }
        }
      }
    },
    "unmapped": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["fieldId", "reason"],
        "properties": { "fieldId": { "type": "string" }, "reason": { "type": "string" } }
      }
    }
  }
}
```

Changes from the brief, and why:

- **`confidence` is an enum, not a 0–1 number.** Structured outputs do not support `minimum` / `maximum`, and the UI only needs three states (green / amber / ask). An enum is also more honest than a fake-precise float.
- **`source` was added.** Highlight colour follows where the value came from: `profile` → green, `generated` (open-ended drafts) → amber, regardless of confidence. Low confidence on either adds a "check this" tag.
- **`values` was added** for multi-choice fields, so `value` never has to encode a list.
- **`unmapped` was added**, so the review list can say why a field was left empty ("Not in your profile: visa expiry date").

After parsing, the service worker drops any mapping whose `fieldId` was not in the request, or whose option value is not in that field's `options`.

## 5. Messages and run state

Source of truth: [`src/shared/messages.ts`](../src/shared/messages.ts).

```ts
// side panel → service worker
{ type: "PING" }                                   → { ok, version }
{ type: "TEST_API_KEY", apiKey }                   → { ok: true, model } | { ok: false, kind, error }
{ type: "FILL_PAGE", tabId }                       → { ok: true } | { ok: false, kind: "permission"|"restricted"|"busy"|"no-key"|"no-profile"|"unknown", error }
{ type: "UNDO", tabId, fieldIds? }                 → { restored }
{ type: "CLEAR_FILL", tabId }                      → { ok: true }
{ type: "SHOW_FIELD", tabId, fieldId }             → { ok }

// service worker → content script (chrome.tabs.sendMessage, per frameId)
{ type: "FP_EXTRACT" }                             → FrameExtract { page, fields, skipped }
{ type: "FP_APPLY", items: ApplyItem[], highlight } → { applied: string[], failed: { fieldId, reason }[] }
{ type: "FP_UNDO", fieldIds? }                     → { restored: string[], notes: Record<id, string> }
{ type: "FP_CLEAR" } · { type: "FP_SHOW", fieldId } · { type: "FP_BAR", bar }

// on-page bar → service worker
{ type: "PAGE_UNDO_ALL" } · { type: "PAGE_DISMISS" }
```

**Run state** (`chrome.storage.session`, key `fp:run:<tabId>`): `{ runId, tabId, url, status: "reading"|"drafting"|"filling"|"done"|"error", model, fieldCount, items: RunItem[], unmapped, skipped, usage: { input, output, cacheRead, cacheWrite }, error }`. A `RunItem` is `{ id, label, kind, value (as shown on the page), values, source, confidence, reasoning, state: "filled"|"failed"|"undone", error? }`. The side panel renders only from this, so a closed panel or a restarted worker loses nothing; navigation clears it.

**Checks on every answer** (`src/background/mappings.ts`): unknown ids are dropped; select and radio answers must be an option (label answers are mapped to the option value); checkbox groups keep only real options; text is trimmed to `maxLength`; drafts are never "high" confidence; consent boxes are never ticked; demographic questions are never answered from a draft.

## 6. Models

| Setting | Model id | Use |
|---|---|---|
| Auto (default) | Haiku 5.5 when no open-ended question is found, else Sonnet 5.5 | Fast simple forms, better drafts |
| Fast | `claude-haiku-5-5` | Contact and sign-up forms |
| Balanced | `claude-sonnet-5-5` | Applications with short answers |
| Best | `claude-opus-5-5` | Long essays, visa and grant portals |
| Sonnet 4.6 | `claude-sonnet-4-6` | Kept because the brief names it; Sonnet 5.5 is newer and cheaper ($2 / $10 vs $3 / $15 per million tokens) |
