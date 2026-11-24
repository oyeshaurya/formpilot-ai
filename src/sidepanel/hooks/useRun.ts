import { useEffect, useState } from "react";
import { runKey, type RunState } from "../../shared/messages";

/**
 * The fill run of the tab the side panel is looking at. Follows tab switches in
 * this window and re-renders whenever the worker writes new run state.
 */
export function useActiveRun(): { tabId: number | null; run: RunState | null } {
  const [tabId, setTabId] = useState<number | null>(null);
  const [run, setRun] = useState<RunState | null>(null);

  useEffect(() => {
    let windowId: number | undefined;
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
      if (t?.id !== undefined) {
        windowId = t.windowId;
        setTabId(t.id);
      }
    });
    const onActivated = (info: chrome.tabs.OnActivatedInfo) => {
      if (windowId === undefined || info.windowId === windowId) setTabId(info.tabId);
    };
    chrome.tabs.onActivated.addListener(onActivated);
    return () => chrome.tabs.onActivated.removeListener(onActivated);
  }, []);

  useEffect(() => {
    if (tabId === null) return;
    const key = runKey(tabId);
    let changed = false; // a change event beats the first read, which may land later with older data
    void chrome.storage.session.get(key).then((got) => {
      if (!changed) setRun((got[key] as RunState | undefined) ?? null);
    });
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "session" && key in changes) {
        changed = true;
        setRun((changes[key]!.newValue as RunState | undefined) ?? null);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [tabId]);

  return { tabId, run };
}
