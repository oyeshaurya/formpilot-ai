import { isMessage, type PanelToWorker, type PageToWorker, type ResponseMap } from "../shared/messages";
import { migrate } from "../shared/storage";
import { testApiKey } from "./claude";
import { fakeFetch } from "./fake-claude"; // test builds only: dropped when __FP_E2E__ is false
import { clearRun, getRun, sendToTab, showField, startFill, undoFields } from "./fill";

/**
 * MV3 service worker. Stateless by design: every listener is registered
 * synchronously at the top level (so a cold-started worker receives the event
 * that woke it), and anything that must survive lives in chrome.storage.
 */

const MENU_ID = "formpilot-fill";

async function setup(): Promise<void> {
  // Toolbar click opens the popup (manifest default_popup), not the side panel. The browser keeps this
  // setting across updates, so it is set to false explicitly for installs that had it on.
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);
  // Right-click on a page or field: a user gesture that also grants activeTab for that tab.
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: MENU_ID, title: "Fill this form with FormPilot", contexts: ["editable", "page"] });
}

chrome.runtime.onInstalled.addListener(() => {
  void setup();
  void migrate();
});
chrome.runtime.onStartup.addListener(() => void setup());

/** Shortcut and context menu: open the panel (inside the gesture, before any await), then fill. */
function fillFromGesture(tabId: number | undefined): void {
  if (tabId === undefined) return;
  void chrome.sidePanel.open({ tabId }).catch(() => undefined);
  void startFill(tabId).then(async (res) => {
    if (!res.ok) {
      // Surface the reason in the panel through run state.
      await chrome.storage.session.set({
        [`fp:run:${tabId}`]: {
          runId: crypto.randomUUID(),
          tabId,
          url: "",
          status: "error",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          items: [],
          unmapped: [],
          error: { kind: res.kind, message: res.error },
        },
      });
    }
  });
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "fill-page") fillFromGesture(tab?.id);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) fillFromGesture(tab?.id);
});

// A page that navigates away takes its fill with it.
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "loading") void getRun(tabId).then((r) => r && r.status !== "reading" && r.status !== "drafting" ? clearRun(tabId) : undefined);
});
chrome.tabs.onRemoved.addListener((tabId) => void clearRun(tabId));

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  // Only our own extension (panel pages and our injected page script) may talk to the worker.
  if (sender.id !== chrome.runtime.id || !isMessage(msg)) return false;

  const reply = <K extends keyof ResponseMap>(p: Promise<ResponseMap[K]>) => {
    void p.then(sendResponse, (err: unknown) => sendResponse({ ok: false, kind: "unknown", error: String(err) }));
    return true;
  };

  // From the on-page bar (sender.tab is the page's tab).
  if (sender.tab?.id !== undefined && (msg.type === "PAGE_UNDO_ALL" || msg.type === "PAGE_DISMISS")) {
    const tabId = sender.tab.id;
    const m = msg as PageToWorker;
    if (m.type === "PAGE_UNDO_ALL") void undoFields(tabId);
    else void sendToTab(tabId, { type: "FP_CLEAR" });
    return false;
  }

  const m = msg as PanelToWorker;
  switch (m.type) {
    case "PING":
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
      return false;
    case "TEST_API_KEY":
      return reply<"TEST_API_KEY">(
        testApiKey(m.apiKey, __FP_E2E__ ? fakeFetch : undefined),
      );
    case "FILL_PAGE":
      return reply<"FILL_PAGE">(startFill(m.tabId, { engine: m.engine }));
    case "UNDO":
      return reply<"UNDO">(undoFields(m.tabId, m.fieldIds).then((restored) => ({ restored })));
    case "CLEAR_FILL":
      return reply<"CLEAR_FILL">(
        sendToTab(m.tabId, { type: "FP_CLEAR" })
          .then(() => clearRun(m.tabId))
          .then(() => ({ ok: true as const })),
      );
    case "SHOW_FIELD":
      return reply<"SHOW_FIELD">(showField(m.tabId, m.fieldId).then((ok) => ({ ok })));
    default:
      return false;
  }
});
