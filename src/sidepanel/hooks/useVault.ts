import { useCallback, useEffect, useRef, useState } from "react";
import type { Profile, Resume, Settings } from "../../shared/schema";
import { KEYS, getApiKey, getProfile, getResume, getSettings, onKeyChange } from "../../shared/storage";

export interface VaultState {
  loaded: boolean;
  profile: Profile | null;
  resume: Resume | null;
  settings: Settings | null;
  hasApiKey: boolean;
}

/**
 * The saved vault, kept in sync with chrome.storage (another panel window, an
 * import, or a wipe updates every open view). Views keep their own drafts.
 */
export function useVault(): VaultState & { reload: () => Promise<void> } {
  const [state, setState] = useState<VaultState>({
    loaded: false,
    profile: null,
    resume: null,
    settings: null,
    hasApiKey: false,
  });

  // Reads can overlap (first load, then a change event). Only the newest read may land,
  // or a slow first read would overwrite fresher data with an empty vault.
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    const [profile, resume, settings, apiKey] = await Promise.all([getProfile(), getResume(), getSettings(), getApiKey()]);
    if (mine !== seq.current) return;
    setState({ loaded: true, profile, resume, settings, hasApiKey: apiKey !== "" });
  }, []);

  useEffect(() => {
    void reload();
    const offs = [KEYS.profile, KEYS.resume, KEYS.settings, KEYS.apiKey].map((k) => onKeyChange(k, () => void reload()));
    return () => offs.forEach((off) => off());
  }, [reload]);

  return { ...state, reload };
}

/** "just now", "4 min ago", "yesterday", or a date. */
export function timeAgo(iso: string, now = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  if (h < 48) return "yesterday";
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
