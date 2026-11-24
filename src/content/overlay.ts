import type { ApplyItem, PageBarState } from "../shared/messages";
import { findAll } from "./extractor";

/**
 * On-page review layer.
 *   Outlines: green = from your profile, amber = drafted (check it); dashed when confidence is low.
 *   Bar: a small panel in a closed shadow root at the bottom right, top frame only, with
 *        "Undo all" and "Dismiss". It never covers the submit button for long: it can be dismissed.
 * Every inline style FormPilot sets is recorded and restored on clear.
 */

const GREEN = "#16a34a";
const AMBER = "#d97706";

const outlined = new Map<Element, { outline: string; offset: string; radius: string; prio: [string, string] }>();

function target(el: Element): Element {
  if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) {
    const group = el.closest("fieldset,[role='radiogroup'],[role='group']");
    if (group && el.type === "radio") return group;
    const label = el.labels?.[0];
    const hidden = getComputedStyle(el).opacity === "0" || el.getBoundingClientRect().width < 2;
    if (label && (hidden || el.type === "checkbox")) return label;
  }
  // A visually hidden native control (custom select libraries): outline its visible box.
  let t: Element | null = el;
  while (t && t.getBoundingClientRect().width < 2) t = t.parentElement;
  return t ?? el;
}

export function outline(id: string, item: ApplyItem): void {
  const els = findAll(id);
  const first = els[0];
  if (!first) return;
  const t = target(first);
  const he = t as HTMLElement;
  if (!outlined.has(t)) {
    outlined.set(t, {
      outline: he.style.getPropertyValue("outline"),
      offset: he.style.getPropertyValue("outline-offset"),
      radius: he.style.getPropertyValue("border-radius"),
      prio: [he.style.getPropertyPriority("outline"), he.style.getPropertyPriority("outline-offset")],
    });
  }
  const colour = item.source === "generated" ? AMBER : GREEN;
  const style = item.confidence === "low" ? "dashed" : "solid";
  he.style.setProperty("outline", `2px ${style} ${colour}`, "important");
  he.style.setProperty("outline-offset", "2px", "important");
}

export function clearOutlines(ids?: string[]): void {
  const only = ids ? new Set(ids.flatMap((id) => findAll(id).map(target))) : null;
  for (const [el, prev] of outlined) {
    if (only && !only.has(el)) continue;
    const he = el as HTMLElement;
    if (prev.outline) he.style.setProperty("outline", prev.outline, prev.prio[0]);
    else he.style.removeProperty("outline");
    if (prev.offset) he.style.setProperty("outline-offset", prev.offset, prev.prio[1]);
    else he.style.removeProperty("outline-offset");
    outlined.delete(el);
  }
}

export function flash(id: string): boolean {
  const el = findAll(id)[0];
  if (!el) return false;
  const t = target(el) as HTMLElement;
  t.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const prev = t.style.getPropertyValue("box-shadow");
  t.style.setProperty("box-shadow", "0 0 0 6px rgba(39, 217, 232, 0.5)", "important");
  setTimeout(() => {
    if (prev) t.style.setProperty("box-shadow", prev);
    else t.style.removeProperty("box-shadow");
  }, 1400);
  (el as HTMLElement).focus?.({ preventScroll: true });
  return true;
}

/* ───────────── the bar ───────────── */

let host: HTMLElement | null = null;

const BAR_CSS = `
:host { all: initial; }
.bar {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  display: flex; align-items: center; gap: 10px; max-width: min(420px, calc(100vw - 32px));
  padding: 8px 8px 8px 16px; border-radius: 999px;
  background: rgba(10, 15, 19, 0.86); color: #f1f5f7;
  -webkit-backdrop-filter: blur(20px) saturate(160%); backdrop-filter: blur(20px) saturate(160%);
  font: 500 14px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
  box-shadow: 0 2px 4px rgba(0,0,0,.3), 0 18px 44px -18px rgba(0,0,0,.7), inset 0 0 0 1px rgba(255,255,255,.13), inset 0 1px 0 rgba(39,217,232,.25);
}
.text { flex: 1; min-width: 0; }
.muted { color: #9aa6af; font-weight: 400; }
button {
  all: unset; box-sizing: border-box; cursor: pointer; min-height: 36px; padding: 0 14px; border-radius: 999px;
  font: 500 14px/1 system-ui, -apple-system, "Segoe UI", sans-serif; white-space: nowrap;
  background: rgba(255,255,255,.06); color: #f1f5f7; box-shadow: inset 0 0 0 1px rgba(255,255,255,.13);
  transition: background-color .2s, box-shadow .2s;
}
button:hover { background: rgba(255,255,255,.1); box-shadow: inset 0 0 0 1px rgba(39,217,232,.45); }
button:focus-visible { outline: 2px solid #27d9e8; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { button { transition: none; } }
.x { min-width: 36px; padding: 0; text-align: center; font-size: 18px; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin: 0 4px 1px 0; vertical-align: middle; }
`;

export function showBar(state: PageBarState | null, onUndo: () => void, onDismiss: () => void): void {
  if (window.top !== window) return;
  if (!state) {
    host?.remove();
    host = null;
    return;
  }
  if (!host) {
    host = document.createElement("formpilot-bar");
    host.setAttribute("data-formpilot-ui", "");
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${BAR_CSS}</style>
      <div class="bar" role="status" aria-live="polite">
        <span class="text"></span>
        <button type="button" class="undo">Undo all</button>
        <button type="button" class="x" aria-label="Dismiss FormPilot bar">×</button>
      </div>`;
    root.querySelector(".undo")!.addEventListener("click", onUndo);
    root.querySelector(".x")!.addEventListener("click", onDismiss);
    (host as HTMLElement & { _root?: ShadowRoot })._root = root;
    document.documentElement.appendChild(host);
  }
  const root = (host as HTMLElement & { _root?: ShadowRoot })._root!;
  const text = root.querySelector(".text")!;
  const parts = [
    `<span class="dot" style="background:${GREEN}"></span>FormPilot filled ${state.filled} field${state.filled === 1 ? "" : "s"}`,
  ];
  if (state.drafts) parts.push(`<span class="muted"> · <span class="dot" style="background:${AMBER}"></span>${state.drafts} to check</span>`);
  if (state.failed) parts.push(`<span class="muted"> · ${state.failed} not filled</span>`);
  text.innerHTML = parts.join("") + `<span class="muted"> · not submitted</span>`;
}
