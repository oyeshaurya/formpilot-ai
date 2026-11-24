import {
  ProfileSchema,
  ResumeSchema,
  SettingsSchema,
  emptyProfile,
  emptyResume,
  defaultSettings,
  type Profile,
  type Resume,
  type Settings,
} from "./schema";

/**
 * Typed, validated access to extension storage. Every read is parsed with zod,
 * so a corrupted or older record falls back to defaults instead of crashing a view.
 * The service worker and the side panel both use this module; neither keeps
 * its own in-memory copy (MV3 workers can be killed at any moment).
 */

export const KEYS = {
  profile: "fp:profile",
  resume: "fp:resume",
  settings: "fp:settings",
  apiKey: "fp:apiKey",
  meta: "fp:meta",
} as const;

export const SCHEMA_VERSION = 1;

type Area = chrome.storage.StorageArea;
const local = (): Area => chrome.storage.local;
const session = (): Area => chrome.storage.session;

async function readParsed<T>(area: Area, key: string, parse: (v: unknown) => T, fallback: () => T): Promise<T> {
  const got = await area.get(key);
  const raw = got[key];
  if (raw === undefined) return fallback();
  try {
    return parse(raw);
  } catch (err) {
    console.warn(`[FormPilot] ${key} failed validation; using defaults`, err);
    return fallback();
  }
}

export const getProfile = (): Promise<Profile> =>
  readParsed(local(), KEYS.profile, (v) => ProfileSchema.parse(v), emptyProfile);

export const getResume = (): Promise<Resume> =>
  readParsed(local(), KEYS.resume, (v) => ResumeSchema.parse(v), emptyResume);

export const getSettings = (): Promise<Settings> =>
  readParsed(local(), KEYS.settings, (v) => SettingsSchema.parse(v), defaultSettings);

export async function saveProfile(profile: Profile): Promise<Profile> {
  const next = ProfileSchema.parse({ ...profile, updatedAt: new Date().toISOString() });
  await local().set({ [KEYS.profile]: next });
  return next;
}

export async function saveResume(markdown: string): Promise<Resume> {
  const next = ResumeSchema.parse({ markdown, updatedAt: new Date().toISOString() });
  await local().set({ [KEYS.resume]: next });
  return next;
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const next = SettingsSchema.parse(settings);
  await local().set({ [KEYS.settings]: next });
  return next;
}

/* ───────────── API key: kept apart from settings so it is never exported ───────────── */

export async function getApiKey(): Promise<string> {
  const fromSession = (await session().get(KEYS.apiKey))[KEYS.apiKey];
  if (typeof fromSession === "string" && fromSession) return fromSession;
  const fromLocal = (await local().get(KEYS.apiKey))[KEYS.apiKey];
  return typeof fromLocal === "string" ? fromLocal : "";
}

/** Writes the key to exactly one area and removes it from the other. */
export async function setApiKey(apiKey: string, where: Settings["keyStorage"]): Promise<void> {
  const keep = where === "local" ? local() : session();
  const drop = where === "local" ? session() : local();
  await drop.remove(KEYS.apiKey);
  if (apiKey) await keep.set({ [KEYS.apiKey]: apiKey });
  else await keep.remove(KEYS.apiKey);
}

export async function clearApiKey(): Promise<void> {
  await Promise.all([local().remove(KEYS.apiKey), session().remove(KEYS.apiKey)]);
}

/* ───────────── lifecycle ───────────── */

/** Called on install/update: stamps the schema version and runs migrations. */
export async function migrate(): Promise<void> {
  const meta = (await local().get(KEYS.meta))[KEYS.meta] as { schemaVersion?: number } | undefined;
  const from = meta?.schemaVersion ?? 0;
  if (from >= SCHEMA_VERSION) return;
  // v0 → v1: nothing stored yet; future migrations go here, one `if (from < n)` block each.
  await local().set({ [KEYS.meta]: { schemaVersion: SCHEMA_VERSION } });
}

/** Deletes everything FormPilot stored on this device. */
export async function wipeAll(): Promise<void> {
  await Promise.all([local().clear(), session().clear()]);
  await local().set({ [KEYS.meta]: { schemaVersion: SCHEMA_VERSION } });
}

/** Subscribe to changes of one key in any area. Returns an unsubscribe function. */
export function onKeyChange(key: string, cb: () => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (key in changes) cb();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
