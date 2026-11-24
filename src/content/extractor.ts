import type { FieldDescriptor, FieldKind, PageContext } from "../shared/schema";
import type { FrameExtract } from "../shared/messages";

/**
 * Smart DOM serializer. Finds the visible, fillable controls of one frame,
 * resolves the label a person would read for each, drops anything sensitive
 * before it leaves the page, and tags each kept control with
 * data-formpilot-id so later writes never depend on fragile selectors.
 */

export const ID_ATTR = "data-formpilot-id";
const MAX_FIELDS = 150;
const MAX_OPTIONS = 200;
const MAX_TEXT = 300;

const clean = (s: string | null | undefined, max = MAX_TEXT) =>
  (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/* ───────────── sensitive and irrelevant fields ───────────── */

const SENSITIVE_AUTOCOMPLETE = /^(cc-|current-password|new-password|one-time-code)/i;
const SENSITIVE_WORDS =
  /\b(card ?number|credit ?card|debit ?card|cvv|cvc|csc|security code|expir(y|ation) date|iban|swift|routing|account ?number|sort ?code|ssn|social security|national insurance|passport|tax ?id|pan ?card|driver'?s? licen[cs]e|password|passcode|pin ?code|otp|one[- ]time|verification code|csrf|xsrf|token|nonce|captcha|recaptcha|honeypot)\b/i;
const SKIP_INPUT_TYPES = new Set(["hidden", "password", "file", "submit", "button", "reset", "image", "range", "color", "search"]);

export function isSensitive(el: Element, label: string): boolean {
  const ac = el.getAttribute("autocomplete") ?? "";
  if (SENSITIVE_AUTOCOMPLETE.test(ac)) return true;
  const hay = [label, el.getAttribute("name"), el.id, el.getAttribute("placeholder"), el.getAttribute("aria-label")]
    .filter(Boolean)
    .join(" ")
    .replace(/[_\-.[\]]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
  return SENSITIVE_WORDS.test(hay);
}

/**
 * Aadhaar is the one ID FormPilot fills, at the person's request: only from a saved
 * fact, only on this device. Such fields are marked localOnly and never sent to Claude.
 */
const LOCAL_ONLY = /\b(aadhaa?r|uidai)\b/i;

export function isLocalOnly(el: Element, label: string): boolean {
  if (SENSITIVE_AUTOCOMPLETE.test(el.getAttribute("autocomplete") ?? "")) return false;
  const hay = [label, el.getAttribute("name"), el.id, el.getAttribute("placeholder"), el.getAttribute("aria-label")]
    .filter(Boolean)
    .join(" ")
    .replace(/[_\-.[\]]+/g, " ");
  return LOCAL_ONLY.test(hay);
}

/* ───────────── visibility ───────────── */

export function isVisible(el: Element): boolean {
  const he = el as HTMLElement;
  if (he.hidden || he.closest("[hidden],[inert],[aria-hidden='true']")) return false;
  const style = getComputedStyle(he);
  const label = (he as HTMLInputElement).labels?.[0];
  const labelShows = !!label && label.getClientRects().length > 0 && getComputedStyle(label).visibility !== "hidden";
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
    // Custom checkboxes and radios often hide the native input and draw their own: keep those whose label shows.
    return labelShows;
  }
  if (!he.getClientRects().length) return labelShows;
  return true;
}

/* ───────────── label resolution ───────────── */

function textOf(el: Element | null | undefined): string {
  if (!el) return "";
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("input,select,textarea,script,style,svg,[aria-hidden='true'],option").forEach((n) => n.remove());
  return clean(clone.textContent);
}

function byIds(ids: string | null): string {
  if (!ids) return "";
  return clean(
    ids
      .split(/\s+/)
      .map((id) => textOf(document.getElementById(id)))
      .filter(Boolean)
      .join(" "),
  );
}

/** The question container around a control (Google Forms, Workday, Greenhouse, Lever and plain markup). */
function questionText(el: Element): string {
  const box = el.closest(
    "[role='listitem'],[data-automation-id*='formField' i],.field,.form-group,.form-field,.application-question,.question,[class*='question' i]",
  );
  if (!box) return "";
  const heading = box.querySelector("[role='heading'],legend,label,h1,h2,h3,h4,h5,h6,[class*='label' i],[class*='title' i]");
  return textOf(heading);
}

/** Nearest text before the control within its parent chain (last resort before placeholder). */
function precedingText(el: Element): string {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
    let sib = node.previousElementSibling;
    while (sib) {
      if (!sib.matches("input,select,textarea,button")) {
        const t = textOf(sib);
        if (t && t.length <= 200) return t;
      }
      sib = sib.previousElementSibling;
    }
  }
  return "";
}

const humanise = (s: string) =>
  clean(
    s
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_\-.[\]]+/g, " ")
      .replace(/\d+$/, ""),
  );

export function resolveLabel(el: Element): string {
  const input = el as HTMLInputElement;
  const fromLabels = input.labels ? clean(Array.from(input.labels).map(textOf).join(" ")) : "";
  return (
    byIds(el.getAttribute("aria-labelledby")) ||
    fromLabels ||
    clean(el.getAttribute("aria-label")) ||
    questionText(el) ||
    precedingText(el) ||
    clean(el.getAttribute("placeholder")) ||
    clean(el.getAttribute("title")) ||
    humanise(el.getAttribute("name") || el.id || "")
  );
}

function sectionOf(el: Element, headings: Element[]): string {
  const legend = el.closest("fieldset")?.querySelector(":scope > legend");
  if (legend) return textOf(legend);
  // Nearest heading above the control in document order.
  let best = "";
  for (const h of headings) {
    if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = textOf(h);
    else break;
  }
  return best;
}

/* ───────────── kinds ───────────── */

function kindOf(el: Element): FieldKind | null {
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (el instanceof HTMLSelectElement) return el.multiple ? "multiselect" : "select";
  if (el instanceof HTMLInputElement) {
    const t = (el.type || "text").toLowerCase();
    if (SKIP_INPUT_TYPES.has(t)) return null;
    if (t === "radio") return "radio-group";
    if (t === "checkbox") return "checkbox";
    if (t === "email" || t === "tel" || t === "url" || t === "number" || t === "date") return t;
    if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") === "list") return "combobox";
    return "text";
  }
  const role = el.getAttribute("role");
  if (role === "combobox") return "combobox";
  if (role === "radiogroup") return "radio-group";
  if (role === "checkbox") return "checkbox";
  if ((el as HTMLElement).isContentEditable) return "contenteditable";
  return null;
}

/* ───────────── page context ───────────── */

function pageContext(): PageContext {
  const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
    .filter(isVisible)
    .map((h) => textOf(h))
    .filter(Boolean)
    .slice(0, 8)
    .map((t) => t.slice(0, 120));
  // Visible text outside the form: usually the job or program description.
  const main = document.querySelector("main,article,[role='main']") ?? document.body;
  const clone = main.cloneNode(true) as Element;
  clone
    .querySelectorAll(
      "form,script,style,noscript,svg,nav,footer,input,select,textarea,button,[aria-hidden='true'],[data-formpilot-ui]",
    )
    .forEach((n) => n.remove());
  const excerpt = clean(clone.textContent, 4000);
  return {
    url: location.origin + location.pathname,
    title: clean(document.title, 200),
    headings,
    description: clean(document.querySelector("meta[name='description']")?.getAttribute("content"), 300) || undefined,
    lang: document.documentElement.lang || undefined,
    excerpt: excerpt || undefined,
  };
}

/* ───────────── extraction ───────────── */

let counter = 0;

function tag(el: Element): string {
  const existing = el.getAttribute(ID_ATTR);
  if (existing) return existing;
  const id = `fp-${++counter}`;
  el.setAttribute(ID_ATTR, id);
  return id;
}

function radioGroup(el: HTMLInputElement): HTMLInputElement[] {
  if (!el.name) return [el];
  const scope: ParentNode = el.form ?? document;
  return Array.from(scope.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(el.name)}"]`));
}

function groupLabel(first: HTMLInputElement, members: HTMLInputElement[]): string {
  const legend = first.closest("fieldset")?.querySelector(":scope > legend");
  if (legend) return textOf(legend);
  const group = first.closest("[role='radiogroup'],[role='group']");
  if (group) {
    const l = byIds(group.getAttribute("aria-labelledby")) || clean(group.getAttribute("aria-label"));
    if (l) return l;
  }
  // A question container's "label" may just be the first option's own label: reject that.
  const q = questionText(first);
  const firstOpt = textOf(first.labels?.[0]);
  if (q && q !== firstOpt) return q;
  return precedingText(members[0] ?? first) || humanise(first.name || "");
}

function optionValue(r: HTMLInputElement): string {
  // "on" is the browser default and means nothing; fall back to the visible label.
  return r.value && r.value !== "on" ? r.value : textOf(r.labels?.[0]) || r.id;
}

/** Options already in the DOM for a custom combobox (many render them only when opened). */
function comboboxOptions(el: Element): FieldDescriptor["options"] {
  const listId = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
  const list = listId ? document.getElementById(listId) : null;
  if (!list) return undefined;
  const opts = Array.from(list.querySelectorAll("[role='option']"))
    .slice(0, MAX_OPTIONS)
    .map((o) => ({ value: textOf(o), label: textOf(o) }))
    .filter((o) => o.label);
  return opts.length ? opts : undefined;
}

export function extract(): FrameExtract {
  const skipped = { sensitive: 0, hidden: 0, disabled: 0, overflow: 0 };
  const fields: FieldDescriptor[] = [];
  const seenGroups = new Set<string>();
  const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,legend,[role='heading']"));
  const candidates = Array.from(
    document.querySelectorAll(
      "input,textarea,select,[contenteditable='true'],[contenteditable=''],[role='combobox'],[role='radiogroup'],[role='checkbox']",
    ),
  );

  const push = (d: FieldDescriptor) => {
    if (fields.length >= MAX_FIELDS) {
      skipped.overflow++;
      return;
    }
    fields.push(d);
  };

  for (const el of candidates) {
    if (el.closest("[data-formpilot-ui]")) continue; // our own on-page bar
    if (el instanceof HTMLInputElement && el.type === "password") {
      skipped.sensitive++;
      continue;
    }
    const kind = kindOf(el);
    if (!kind) {
      if (el instanceof HTMLInputElement && el.type === "hidden") skipped.hidden++;
      continue;
    }
    // A native control inside a custom container is handled through the container.
    if (!(el instanceof HTMLInputElement) && el.getAttribute("role") === "combobox" && el.querySelector("input")) continue;
    if (el.matches("[role='radiogroup']") && el.querySelector("input[type='radio']")) continue;
    if (el instanceof HTMLElement && el.isContentEditable && el.parentElement?.isContentEditable) continue;
    if ((el as HTMLInputElement).disabled || el.getAttribute("aria-disabled") === "true" || (el as HTMLInputElement).readOnly) {
      skipped.disabled++;
      continue;
    }
    if (!isVisible(el)) {
      skipped.hidden++;
      continue;
    }

    /* native radio group: one descriptor for the whole group */
    if (kind === "radio-group" && el instanceof HTMLInputElement) {
      const key = el.name ? `name:${el.form ? "f" : "d"}:${el.name}` : `solo:${tag(el)}`;
      if (seenGroups.has(key)) continue;
      seenGroups.add(key);
      const members = radioGroup(el).filter((r) => !r.disabled && isVisible(r));
      const label = groupLabel(el, members);
      if (isSensitive(el, label)) {
        skipped.sensitive++;
        continue;
      }
      const id = tag(members[0] ?? el);
      members.forEach((m) => m.setAttribute(ID_ATTR, id));
      const checked = members.find((m) => m.checked);
      push({
        id,
        kind,
        label,
        section: sectionOf(el, headings) || undefined,
        name: el.name || undefined,
        required: members.some((m) => m.required),
        options: members.slice(0, MAX_OPTIONS).map((m) => ({ value: optionValue(m), label: textOf(m.labels?.[0]) || m.value })),
        currentValue: checked ? optionValue(checked) : undefined,
      });
      continue;
    }

    /* ARIA radiogroup with role=radio children */
    if (kind === "radio-group") {
      const radios = Array.from(el.querySelectorAll("[role='radio']")).filter(isVisible);
      const label = byIds(el.getAttribute("aria-labelledby")) || clean(el.getAttribute("aria-label")) || questionText(el);
      if (isSensitive(el, label)) {
        skipped.sensitive++;
        continue;
      }
      const name = (r: Element) => textOf(r) || clean(r.getAttribute("aria-label")) || clean(r.getAttribute("data-value"));
      push({
        id: tag(el),
        kind,
        label,
        section: sectionOf(el, headings) || undefined,
        required: el.getAttribute("aria-required") === "true",
        options: radios.slice(0, MAX_OPTIONS).map((r) => ({ value: name(r), label: name(r) })),
        currentValue: name(radios.find((r) => r.getAttribute("aria-checked") === "true") ?? document.createElement("i")) || undefined,
      });
      continue;
    }

    const label = resolveLabel(el);
    const localOnly = isLocalOnly(el, label);
    if (!localOnly && isSensitive(el, label)) {
      skipped.sensitive++;
      continue;
    }
    const d: FieldDescriptor = {
      id: "",
      kind,
      label,
      ...(localOnly ? { localOnly: true } : {}),
      section: sectionOf(el, headings) || undefined,
      description: byIds(el.getAttribute("aria-describedby")) || undefined,
      placeholder: clean(el.getAttribute("placeholder"), 120) || undefined,
      name: clean(el.getAttribute("name"), 80) || undefined,
      autocomplete: clean(el.getAttribute("autocomplete"), 40) || undefined,
      required: (el as HTMLInputElement).required || el.getAttribute("aria-required") === "true",
    };
    const max = (el as HTMLInputElement).maxLength;
    if (typeof max === "number" && max > 0 && max < 100000) d.maxLength = max;

    if (el instanceof HTMLSelectElement) {
      d.options = Array.from(el.options)
        .filter((o) => !o.disabled)
        .slice(0, MAX_OPTIONS)
        .map((o) => ({ value: o.value, label: clean(o.textContent, 120) }));
      const sel = Array.from(el.selectedOptions).filter((o) => o.value);
      if (sel.length) d.currentValue = sel.map((o) => o.value).join(", ");
    } else if (kind === "checkbox") {
      const checked = el instanceof HTMLInputElement ? el.checked : el.getAttribute("aria-checked") === "true";
      d.currentValue = checked ? "checked" : undefined;
    } else if (kind === "contenteditable") {
      d.currentValue = clean((el as HTMLElement).innerText, 500) || undefined;
    } else if (kind === "combobox") {
      const input = el instanceof HTMLInputElement ? el : el.querySelector("input");
      d.currentValue = clean(input?.value ?? textOf(el), 200) || undefined;
      d.options = comboboxOptions(el);
    } else {
      d.currentValue = clean((el as HTMLInputElement).value, 500) || undefined;
    }
    if (fields.length >= MAX_FIELDS) {
      skipped.overflow++;
      continue;
    }
    d.id = tag(el);
    fields.push(d);
    elementOf.set(d, el);
  }

  // Checkbox groups that share a name (and are not yes/no consent boxes) read better as one choice.
  return { page: pageContext(), fields: mergeCheckboxGroups(fields, elementOf), skipped };
}

/** Checkboxes sharing a name inside one fieldset become a checkbox-group with options. */
/**
 * Each field's own element, kept during extraction. After a first fill, every box of a
 * checkbox group shares the group's id, so looking a box up by id again would always
 * return the first box: a repeat fill must use the element itself.
 */
const elementOf = new WeakMap<FieldDescriptor, Element>();

function mergeCheckboxGroups(fields: FieldDescriptor[], elements: WeakMap<FieldDescriptor, Element>): FieldDescriptor[] {
  const out: FieldDescriptor[] = [];
  const groups = new Map<string, FieldDescriptor>();
  for (const f of fields) {
    if (f.kind !== "checkbox" || !f.name) {
      out.push(f);
      continue;
    }
    const el = (elements.get(f) ?? findField(f.id)) as HTMLInputElement | null;
    const fieldset = el?.closest("fieldset");
    const legend = fieldset?.querySelector(":scope > legend");
    const siblings = fieldset ? fieldset.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(f.name)}"]`).length : 0;
    if (!el || !legend || siblings < 2) {
      out.push(f);
      continue;
    }
    const key = `${f.name}`;
    let g = groups.get(key);
    if (!g) {
      g = { id: f.id, kind: "checkbox-group", label: textOf(legend), section: f.section, name: f.name, required: f.required, options: [] };
      groups.set(key, g);
      out.push(g);
    }
    el.setAttribute(ID_ATTR, g.id);
    const value = el.value && el.value !== "on" ? el.value : f.label;
    g.options!.push({ value, label: f.label });
    if (el.checked) g.currentValue = g.currentValue ? `${g.currentValue}, ${value}` : value;
  }
  return out;
}

/** Find a tagged element again. */
export function findField(id: string): Element | null {
  return document.querySelector(`[${ID_ATTR}="${CSS.escape(id)}"]`);
}

export function findAll(id: string): Element[] {
  return Array.from(document.querySelectorAll(`[${ID_ATTR}="${CSS.escape(id)}"]`));
}
