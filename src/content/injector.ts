import type { ApplyItem, ApplyReport } from "../shared/messages";
import { ID_ATTR, ariaName, findAll, findField, listboxOptions } from "./extractor";

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
  /** toggle: checkboxes, which a click turns off again; radios only ever re-select the old choice. */
  | { type: "aria"; toggle?: boolean; els: { el: Element; prev: boolean }[] }
  | { type: "listbox"; el: Element; prev: string }
  | { type: "html"; el: HTMLElement; prev: string };

const snapshots = new Map<string, Snapshot>();
let listboxUndo: Promise<boolean> = Promise.resolve(true);

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

  // ARIA checkbox, single or a group sharing one id (Google Forms)
  if (el.getAttribute("role") === "checkbox") {
    const isOn = (b: Element) => b.getAttribute("aria-checked") === "true";
    snapshot(id, { type: "aria", toggle: true, els: els.map((b) => ({ el: b, prev: isOn(b) })) });
    if (els.length > 1 || item.values.length) {
      const wanted = (item.values.length ? item.values : item.value.split(/\s*,\s*/)).map(norm).filter(Boolean);
      let missed = 0;
      for (const b of els) {
        const names = [ariaName(b), b.getAttribute("aria-label") ?? "", b.textContent ?? ""].map(norm);
        if (wanted.some((w) => names.includes(w)) && !isOn(b)) {
          press(b);
          if (!isOn(b)) missed++;
        }
      }
      return missed ? "Some boxes did not take the tick. Check them on the page." : null;
    }
    const want = truthy(item.value);
    if (isOn(el) !== want) press(el);
    return null;
  }
  if (el.getAttribute("role") === "radiogroup") {
    const radios = Array.from(el.querySelectorAll("[role='radio']"));
    const opts = radios.map((r) => ({
      value: norm(r.getAttribute("data-value") || r.textContent || ""),
      label: norm(r.getAttribute("aria-label") || r.textContent || ""),
      r,
    }));
    const hit = matchOption(
      opts.filter((o) => o.value || o.label),
      item.value,
    );
    if (!hit) return `No option matches “${item.value}”.`;
    snapshot(id, { type: "aria", els: radios.map((r) => ({ el: r, prev: r.getAttribute("aria-checked") === "true" })) });
    press(hit.r);
    return null;
  }

  // ARIA drop-down (Google Forms): open it, then click the option
  if (el.getAttribute("role") === "listbox") {
    const opts = listboxOptions(el);
    const hit = matchOption(opts, item.value);
    if (!hit) return `No option matches “${item.value}”.`;
    const before = opts.find((o) => o.el.getAttribute("aria-selected") === "true")?.value ?? "";
    snapshot(id, { type: "listbox", el, prev: before });
    return (await pickListbox(el, hit.value)) ? null : `Could not choose “${hit.label}”. Pick it on the page.`;
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
const shown = (e: Element) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";

/**
 * Choose an option of an ARIA listbox by its data value ("" is the empty "Choose" entry).
 * Google Forms opens a pop-up copy of the options on click and takes the choice from that
 * copy, so: open, wait for a visible option with the value, click it, then confirm.
 */
async function pickListbox(box: Element, value: string): Promise<boolean> {
  const selected = () => box.querySelector("[role='option'][aria-selected='true']")?.getAttribute("data-value") ?? "";
  if (selected() === value) return true;
  const byValue = () =>
    Array.from(document.querySelectorAll("[role='option']")).filter(
      (o) => (o.getAttribute("data-value") ?? norm(o.textContent ?? "")) === value && (box.contains(o) || box.getAttribute("aria-expanded") === "true"),
    );
  press(box);
  for (let attempt = 0; attempt < 8; attempt++) {
    await wait(120);
    const target = byValue().filter(shown).pop(); // the pop-up copy is the last one in the DOM
    if (!target) continue;
    press(target);
    await wait(250);
    if (selected() === value) return true;
  }
  // No pop-up appeared: some lists take a click on the hidden option itself.
  const hidden = byValue()[0];
  if (hidden) {
    press(hidden);
    await wait(250);
  }
  if (box.getAttribute("aria-expanded") === "true") box.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  return selected() === value;
}

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
        for (const { el, prev } of s.els)
          if ((el.getAttribute("aria-checked") === "true") !== prev && (prev || s.toggle)) press(el);
        break;
      case "listbox": {
        // Drop-downs open a pop-up each, so restore them one after another.
        const { el, prev } = s;
        listboxUndo = listboxUndo.then(() => pickListbox(el, prev)).catch(() => false);
        break;
      }
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
