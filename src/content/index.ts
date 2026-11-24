import type { ApplyReport, FrameExtract, PageToWorker, WorkerToPage } from "../shared/messages";
import { isMessage } from "../shared/messages";
import { extract } from "./extractor";
import { apply, filledIds, undo } from "./injector";
import { clearOutlines, flash, outline, showBar } from "./overlay";

/**
 * Page script, injected on demand (chrome.scripting.executeScript, all frames)
 * only after the user asks for a fill. Runs in the isolated world: the page's
 * own scripts cannot see it, and it never reads extension storage or the network.
 * Injecting twice is safe: the second copy finds the first and stops.
 */

declare global {
  interface Window {
    __formpilot?: { version: number };
  }
}

const VERSION = 1;

if (!window.__formpilot) {
  window.__formpilot = { version: VERSION };

  const toWorker = (msg: PageToWorker) => void chrome.runtime.sendMessage(msg).catch(() => {});

  chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    if (!isMessage(msg) || !msg.type.startsWith("FP_")) return false;
    const m = msg as WorkerToPage;
    switch (m.type) {
      case "FP_EXTRACT": {
        const res: FrameExtract = extract();
        sendResponse(res);
        return false;
      }
      case "FP_APPLY": {
        void apply(m.items, m.highlight, outline).then((r: ApplyReport) => sendResponse(r));
        return true;
      }
      case "FP_UNDO": {
        const { restored, notes } = undo(m.fieldIds);
        clearOutlines(m.fieldIds ? restored : undefined);
        sendResponse({ restored, notes, remaining: filledIds().length });
        return false;
      }
      case "FP_CLEAR": {
        clearOutlines();
        showBar(null, noop, noop);
        sendResponse({ ok: true });
        return false;
      }
      case "FP_SHOW": {
        sendResponse({ ok: flash(m.fieldId) });
        return false;
      }
      case "FP_BAR": {
        showBar(
          m.bar,
          () => toWorker({ type: "PAGE_UNDO_ALL" }),
          () => toWorker({ type: "PAGE_DISMISS" }),
        );
        sendResponse({ ok: true });
        return false;
      }
      default:
        return false;
    }
  });
}

function noop() {}

export {};
