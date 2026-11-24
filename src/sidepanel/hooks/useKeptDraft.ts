import { useEffect, useRef } from "react";

/**
 * Keeps an unsaved draft in chrome.storage.session (memory only, this browser session),
 * so closing the popup (a click on the page closes it) does not lose your edits.
 * On open, a kept draft is handed to `restore`; while the draft differs from what is
 * saved it is written back (debounced); once it matches again, it is removed.
 */
export function useKeptDraft<T>(key: string, draft: T, dirty: boolean, restore: (kept: T) => void): void {
  const ready = useRef(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  useEffect(() => {
    void chrome.storage.session
      .get(key)
      .then((got) => {
        const kept = got[key] as T | undefined;
        if (kept !== undefined) restoreRef.current(kept);
      })
      .catch(() => undefined)
      .finally(() => (ready.current = true));
  }, [key]);

  useEffect(() => {
    if (!ready.current) return;
    const t = setTimeout(() => {
      void (dirty ? chrome.storage.session.set({ [key]: draft }) : chrome.storage.session.remove(key)).catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [key, draft, dirty]);
}
