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
    __formpilot?: { version: number; build?: string };
  }
}

const VERSION = 2;
const BUILD = typeof __FP_BUILD__ === "string" ? __FP_BUILD__ : "dev";

/**
 * Injecting the same build twice is a no-op. A different build (the extension was updated or
 * reloaded while this tab stayed open) takes over: the old copy may still be listening with old
 * rules, so this one claims the page and every copy answers only while it is the claimed build.
 */
if (window.__formpilot?.build !== BUILD) {
  window.__formpilot = { version: VERSION, build: BUILD };

  const toWorker = (msg: PageToWorker) => void chrome.runtime.sendMessage(msg).catch(() => {});

  chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    if (!isMessage(msg) || !msg.type.startsWith("FP_")) return false;
    if (window.__formpilot?.build !== BUILD) return false; // a newer copy owns this page now
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
