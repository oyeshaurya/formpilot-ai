/**
 * Minimal chrome.* stand-in so the side panel runs in a normal browser tab
 * (dev harness) and in Node (unit tests). Only the APIs FormPilot uses.
 * Not shipped: nothing under dev/ is part of the extension build.
 */
type Listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;

export interface MockOptions {
  /** Persist storage.local to window.localStorage (harness only). */
  persist?: boolean;
  /** Answer for TEST_API_KEY. */
  testKey?: (key: string) => unknown;
}

export function installChromeMock(opts: MockOptions = {}) {
  const listeners = new Set<Listener>();
  const LS_KEY = "formpilot-harness-local";

  function makeArea(name: "local" | "session", initial: Record<string, unknown> = {}) {
    const data: Record<string, unknown> = { ...initial };
    const save = () => {
      if (opts.persist && name === "local") localStorage.setItem(LS_KEY, JSON.stringify(data));
    };
    const emit = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (Object.keys(changes).length) listeners.forEach((l) => l(changes, name));
    };
    const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
    return {
      data,
      async get(keys?: string | string[] | null) {
        if (keys == null) return clone({ ...data });
        const list = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, clone(data[k])]));
      },
      async set(items: Record<string, unknown>) {
        const changes: Record<string, chrome.storage.StorageChange> = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { oldValue: data[k], newValue: clone(v) };
          data[k] = clone(v);
        }
        save();
        emit(changes);
      },
      async remove(keys: string | string[]) {
        const changes: Record<string, chrome.storage.StorageChange> = {};
        for (const k of Array.isArray(keys) ? keys : [keys]) {
          if (k in data) {
            changes[k] = { oldValue: data[k] };
            delete data[k];
          }
        }
        save();
        emit(changes);
      },
      async clear() {
        const changes: Record<string, chrome.storage.StorageChange> = {};
        for (const k of Object.keys(data)) {
          changes[k] = { oldValue: data[k] };
          delete data[k];
        }
        save();
        emit(changes);
      },
    };
  }

  const stored = opts.persist ? JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") : {};
  const local = makeArea("local", stored);
  const session = makeArea("session");

  const chromeMock = {
    storage: {
      local,
      session,
      onChanged: {
        addListener: (l: Listener) => listeners.add(l),
        removeListener: (l: Listener) => listeners.delete(l),
      },
    },
    runtime: {
      id: "mock-extension-id",
      getManifest: () => ({ version: "0.1.0-harness" }),
      async sendMessage(msg: { type: string; apiKey?: string; tabId?: number; fieldIds?: string[] }) {
        await new Promise((r) => setTimeout(r, 400));
        if (msg.type === "TEST_API_KEY") {
          return opts.testKey?.(msg.apiKey ?? "") ?? { ok: true, model: "Claude Haiku 5.5 (harness: not a real check)" };
        }
        if (msg.type === "PING") return { ok: true, version: "0.1.0-harness" };
        if (msg.type === "FILL_PAGE") {
          void simulateFill(session, msg.tabId ?? 1);
          return { ok: true };
        }
        if (msg.type === "UNDO" || msg.type === "CLEAR_FILL") {
          const key = `fp:run:${msg.tabId ?? 1}`;
          const run = session.data[key] as { items: { id: string; state: string }[] } | undefined;
          if (msg.type === "CLEAR_FILL") await session.remove(key);
          else if (run) {
            run.items = run.items.map((i) => (!msg.fieldIds || msg.fieldIds.includes(i.id) ? { ...i, state: "undone" } : i));
            await session.set({ [key]: run });
          }
          return msg.type === "UNDO" ? { restored: 1 } : { ok: true };
        }
        if (msg.type === "SHOW_FIELD") return { ok: true };
        return undefined;
      },
    },
    tabs: {
      async query() {
        return [{ id: 1, windowId: 1, url: "https://jobs.example/apply" }];
      },
      async getCurrent() {
        return { id: 99, windowId: 1 };
      },
      onActivated: { addListener() {}, removeListener() {} },
    },
    permissions: {
      async request() {
        return true;
      },
      async contains() {
        return true;
      },
    },
    commands: {
      async getAll() {
        return [{ name: "fill-page", shortcut: "Alt+Shift+F", description: "Fill the form on this page" }];
      },
    },
  };

  (globalThis as unknown as { chrome: unknown }).chrome = chromeMock;
  return { local: local.data, session: session.data };
}

/** Harness only: walks a fill through its states with sample results, so the review UI can be seen. */
async function simulateFill(session: { set(items: Record<string, unknown>): Promise<void> }, tabId: number) {
  const key = `fp:run:${tabId}`;
  const base = { runId: "harness", tabId, url: "https://jobs.example/apply", startedAt: new Date().toISOString(), items: [], unmapped: [] };
  const step = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await session.set({ [key]: { ...base, status: "reading" } });
  await step(700);
  await session.set({ [key]: { ...base, status: "drafting", fieldCount: 14, model: "claude-sonnet-5-5" } });
  await step(1600);
  await session.set({ [key]: { ...base, status: "filling", fieldCount: 14, model: "claude-sonnet-5-5" } });
  await step(500);
  const item = (id: string, label: string, value: string, source: "profile" | "generated", confidence: "high" | "medium" | "low", reasoning: string) => ({
    id, label, kind: "text", value, values: [], source, confidence, reasoning, state: "filled",
  });
  await session.set({
    [key]: {
      ...base,
      status: "done",
      fieldCount: 14,
      model: "claude-sonnet-5-5",
      finishedAt: new Date().toISOString(),
      items: [
        item("0:fp-1", "First name", "Ada", "profile", "high", "From your profile: first name"),
        item("0:fp-2", "Email address", "ada@example.com", "profile", "high", "From your profile: email"),
        item("0:fp-3", "Country of residence", "India", "profile", "medium", "From your profile: country"),
        item("0:fp-4", "Why do you want to join Acme Tools?", "I build accessible tools for people who fill in forms all day, and your focus on careful software is why I applied.", "generated", "medium", "Drafted from your resume and the role description"),
      ],
      unmapped: [
        { id: "0:fp-9", label: "I agree to the terms", reason: "Needs your own decision" },
        { id: "0:fp-10", label: "Gender", reason: "Personal question: answer it yourself" },
      ],
      skipped: { sensitive: 2, hidden: 1, disabled: 0, overflow: 0 },
      usage: { input: 812, output: 301, cacheRead: 2048, cacheWrite: 0 },
    },
  });
}
