import type { ApplyItem, ApplyReport } from "../shared/messages";
import { ID_ATTR, findAll, findField } from "./extractor";

/**
 * Framework-safe value injection.
 *
 * React, Vue and Angular keep their own copy of an input's value. Assigning
 * `el.value = x` updates the DOM but React's value tracker sees no change and
 * the next render puts the old value back. Calling the *prototype's* native
 * setter and then dispatching real `input` / `change` / `blur` events looks
 * exactly like typing, so every framework's state picks it up.
 *
 * Radios and checkboxes are clicked (frameworks listen to click/change), never
 * set directly. Submit buttons are never touched.
 */

/* ───────────── native setters ───────────── */

function nativeSetter(el: Element, prop: "value" | "checked"): ((v: unknown) => void) | undefined {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  return Object.getOwnPropertyDescriptor(proto, prop)?.set;
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const setter = nativeSetter(el, "value");
  if (setter) setter.call(el, value);
  else el.value = value;
}

function setChecked(el: HTMLInputElement, checked: boolean): void {
  const setter = nativeSetter(el, "checked");
  if (setter) setter.call(el, checked);
  else el.checked = checked;
}

function fire(el: Element, data?: string): void {
  el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: data ?? null }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function blur(el: Element): void {
  el.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
  el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
}

function focus(el: Element): void {
  (el as HTMLElement).focus?.({ preventScroll: true });
  el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
}

/** A real click sequence: some custom controls listen to pointerdown or mousedown, not click. */
function press(el: Element): void {
  const opts = { bubbles: true, cancelable: true, composed: true, view: window };
  el.dispatchEvent(new PointerEvent("pointerdown", opts));
  el.dispatchEvent(new MouseEvent("mousedown", opts));
  el.dispatchEvent(new PointerEvent("pointerup", opts));
  el.dispatchEvent(new MouseEvent("mouseup", opts));
  (el as HTMLElement).click();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/* ───────────── snapshots for undo ───────────── */

type Snapshot =
  | { type: "value"; el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; prev: string }
  | { type: "multi"; el: HTMLSelectElement; prev: boolean[] }
  | { type: "checks"; els: { el: HTMLInputElement; prev: boolean }[] }
  | { type: "aria"; els: { el: Element; prev: boolean }[] }
  | { type: "html"; el: HTMLElement; prev: string };

const snapshots = new Map<string, Snapshot>();

function snapshot(id: string, s: Snapshot): void {
  // Keep the first snapshot: a second fill must still undo to what the user had.
  if (!snapshots.has(id)) snapshots.set(id, s);
}

/* ───────────── value normalising ───────────── */

function toDate(v: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fitText(el: HTMLInputElement | HTMLTextAreaElement, v: string): string {
  if (el instanceof HTMLInputElement) {
    if (el.type === "number") return v.replace(/[^\d.\-]/g, "");
    if (el.type === "date") return toDate(v);
  }
  return el.maxLength > 0 ? v.slice(0, el.maxLength) : v;
}

function matchOption<T extends { value: string; label: string }>(opts: T[], wanted: string): T | undefined {
  const w = norm(wanted);
  if (!w) return undefined;
  return (
    opts.find((o) => o.value === wanted) ||
    opts.find((o) => norm(o.value) === w || norm(o.label) === w) ||
    opts.find((o) => norm(o.label).startsWith(w) || w.startsWith(norm(o.label))) ||
    opts.find((o) => norm(o.label).includes(w))
  );
}

const truthy = (v: string) => /^(true|yes|y|checked|on|1|agree|i agree)$/i.test(v.trim());
const falsy = (v: string) => /^(false|no|n|unchecked|off|0)$/i.test(v.trim());

const labelText = (el: Element) => norm((el as HTMLInputElement).labels?.[0]?.textContent ?? el.textContent ?? "");
const radioValue = (r: HTMLInputElement) => (r.value && r.value !== "on" ? r.value : labelText(r));

/* ───────────── writers by kind ───────────── */

async function write(id: string, item: ApplyItem): Promise<string | null> {
  const els = findAll(id);
  const el = els[0];
  if (!el) return "The field is no longer on the page.";

  // Native radio group
  if (el instanceof HTMLInputElement && el.type === "radio") {
    const radios = els as HTMLInputElement[];
    const opts = radios.map((r) => ({ value: radioValue(r), label: labelText(r), r }));
    const hit = matchOption(opts, item.value);
    if (!hit) return `No option matches “${item.value}”.`;
    snapshot(id, { type: "checks", els: radios.map((r) => ({ el: r, prev: r.checked })) });
    if (!hit.r.checked) {
      press(hit.r);
      if (!hit.r.checked) {
        setChecked(hit.r, true);
        fire(hit.r);
      }
    }
    return null;
  }

  // Native checkbox, single or group
  if (el instanceof HTMLInputElement && el.type === "checkbox") {
    const boxes = els as HTMLInputElement[];
    snapshot(id, { type: "checks", els: boxes.map((b) => ({ el: b, prev: b.checked })) });
    if (boxes.length > 1 || item.values.length) {
      const wanted = item.values.length ? item.values : item.value.split(/\s*,\s*/).filter(Boolean);
      for (const b of boxes) {
        const v = b.value && b.value !== "on" ? b.value : labelText(b);
        const on = wanted.some((w) => norm(w) === norm(v) || norm(w) === labelText(b));
        if (on && !b.checked) press(b);
      }
      return null;
    }
    const want = truthy(item.value) ? true : falsy(item.value) ? false : null;
    if (want === null) return `“${item.value}” is not yes or no.`;
    if (el.checked !== want) {
      press(el);
      if (el.checked !== want) {
        setChecked(el, want);
        fire(el);
      }
    }
    return null;
  }

  // ARIA checkbox / radiogroup
  if (el.getAttribute("role") === "checkbox") {
    const want = truthy(item.value);
    const now = el.getAttribute("aria-checked") === "true";
    snapshot(id, { type: "aria", els: [{ el, prev: now }] });
    if (now !== want) press(el);
    return null;
  }
  if (el.getAttribute("role") === "radiogroup") {
    const radios = Array.from(el.querySelectorAll("[role='radio']"));
    const opts = radios.map((r) => ({ value: norm(r.textContent ?? ""), label: norm(r.getAttribute("aria-label") ?? r.textContent ?? ""), r }));
    const hit = matchOption(opts, item.value);
    if (!hit) return `No option matches “${item.value}”.`;
    snapshot(id, { type: "aria", els: radios.map((r) => ({ el: r, prev: r.getAttribute("aria-checked") === "true" })) });
    press(hit.r);
    return null;
  }

  // Select
  if (el instanceof HTMLSelectElement) {
    const opts = Array.from(el.options).map((o) => ({ value: o.value, label: o.textContent ?? "", o }));
    if (el.multiple) {
      snapshot(id, { type: "multi", el, prev: opts.map((x) => x.o.selected) });
      const wanted = item.values.length ? item.values : [item.value];
      let any = false;
      for (const w of wanted) {
        const hit = matchOption(opts, w);
        if (hit) {
          hit.o.selected = true;
          any = true;
        }
      }
      if (!any) return "No option matches.";
      focus(el);
      fire(el);
      blur(el);
      return null;
    }
    const hit = matchOption(opts, item.value);
    if (!hit) return `No option matches “${item.value}”.`;
    snapshot(id, { type: "value", el, prev: el.value });
    focus(el);
    setValue(el, hit.value);
    fire(el);
    blur(el);
    return null;
  }

  // Text inputs and textareas
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const v = fitText(el, item.value);
    if (!v && item.value) return "The value does not fit this field's format.";
    snapshot(id, { type: "value", el, prev: el.value });
    focus(el);
    setValue(el, v);
    fire(el, v);
    if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") === "list") {
      const picked = await pickFromList(el, v);
      blur(el);
      return picked ? null : "Typed the value; choose it from the list to confirm.";
    }
    blur(el);
    return null;
  }

  // Custom combobox wrapper
  if (el.getAttribute("role") === "combobox") {
    const input = el.querySelector("input");
    if (input) {
      snapshot(id, { type: "value", el: input, prev: input.value });
      focus(input);
      setValue(input, item.value);
      fire(input, item.value);
      const picked = await pickFromList(el, item.value);
      blur(input);
      return picked ? null : "Typed the value; choose it from the list to confirm.";
    }
    press(el);
    const picked = await pickFromList(el, item.value);
    return picked ? null : `Could not find “${item.value}” in the list.`;
  }

  // Rich text (contenteditable)
  if (el instanceof HTMLElement && el.isContentEditable) {
    snapshot(id, { type: "html", el, prev: el.innerHTML });
    focus(el);
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel?.removeAllRanges();
    sel?.addRange(range);
    // execCommand is deprecated but is still the one call editors (Draft, Lexical, ProseMirror, Quill) treat as typing.
    const ok = document.execCommand("insertText", false, item.value);
    if (!ok || norm(el.innerText) !== norm(item.value)) {
      el.textContent = item.value;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: item.value }));
    }
    blur(el);
    return null;
  }

  return "FormPilot cannot fill this kind of field yet.";
}

/** After typing into a combobox, wait for its list and click the best option. */
async function pickFromList(box: Element, value: string): Promise<boolean> {
  for (let attempt = 0; attempt < 6; attempt++) {
    await wait(150);
    const listId = box.getAttribute("aria-controls") || box.getAttribute("aria-owns");
    const scope = (listId && document.getElementById(listId)) || document;
    const options = Array.from(scope.querySelectorAll("[role='option']")).filter((o) => (o as HTMLElement).offsetParent !== null);
    if (!options.length) continue;
    const opts = options.map((o) => ({ value: norm(o.textContent ?? ""), label: norm(o.textContent ?? ""), o }));
    const hit = matchOption(opts, value);
    if (hit) {
      press(hit.o);
      return true;
    }
  }
  return false;
}

/* ───────────── public API ───────────── */

export async function apply(items: ApplyItem[], highlight: boolean, outline: (id: string, item: ApplyItem) => void): Promise<ApplyReport> {
  const report: ApplyReport = { applied: [], failed: [] };
  for (const item of items) {
    try {
      const reason = await write(item.fieldId, item);
      if (reason) report.failed.push({ fieldId: item.fieldId, reason });
      else {
        report.applied.push(item.fieldId);
        if (highlight) outline(item.fieldId, item);
      }
    } catch (err) {
      report.failed.push({ fieldId: item.fieldId, reason: err instanceof Error ? err.message : "Could not write the value." });
    }
  }
  return report;
}

/** Restore fields to what they were before FormPilot touched them. */
/** Fields whose old state a page may not take back (a radio group that had nothing chosen). */
export const UNDO_NOTE_RADIO = "Cleared, but some sites keep a radio choice once made. Check it on the page.";

export function undo(ids?: string[]): { restored: string[]; notes: Record<string, string> } {
  const restored: string[] = [];
  const notes: Record<string, string> = {};
  for (const [id, s] of snapshots) {
    if (ids && !ids.includes(id)) continue;
    switch (s.type) {
      case "value":
        focus(s.el);
        setValue(s.el, s.prev);
        fire(s.el);
        blur(s.el);
        break;
      case "multi":
        Array.from(s.el.options).forEach((o, i) => (o.selected = s.prev[i] ?? false));
        fire(s.el);
        break;
      case "checks": {
        const radios = s.els[0]?.el.type === "radio";
        const hadChoice = s.els.some((x) => x.prev);
        if (radios && hadChoice) {
          // Re-select the option the person had: a real click, which every framework hears.
          const was = s.els.find((x) => x.prev)!.el;
          if (!was.checked) press(was);
        } else if (radios) {
          // Nothing was chosen before. No click can un-choose a radio, so clear it in the page
          // (works on plain forms) and say plainly that a framework may keep its own copy.
          for (const { el } of s.els) if (el.checked) setChecked(el, false);
          s.els.forEach(({ el }) => fire(el));
          notes[id] = UNDO_NOTE_RADIO;
        } else {
          for (const { el, prev } of s.els) {
            if (el.checked !== prev) {
              press(el);
              if (el.checked !== prev) {
                setChecked(el, prev);
                fire(el);
              }
            }
          }
        }
        break;
      }
      case "aria":
        for (const { el, prev } of s.els) if ((el.getAttribute("aria-checked") === "true") !== prev && prev) press(el);
        break;
      case "html":
        s.el.innerHTML = s.prev;
        s.el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContent" }));
        break;
    }
    snapshots.delete(id);
    restored.push(id);
  }
  return { restored, notes };
}

export function filledIds(): string[] {
  return Array.from(snapshots.keys());
}

export { ID_ATTR, findField };
