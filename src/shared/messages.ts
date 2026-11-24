/**
 * Typed runtime messages. Shapes are documented in docs/SCHEMAS.md, section 5.
 *
 *   side panel  ──PanelToWorker──▶  service worker  ──WorkerToPage──▶  content script (per frame)
 *   on-page bar ──PageToWorker───▶  service worker
 *
 * Long-running state (a fill in progress, its review list) is never passed in
 * messages alone: the worker writes it to chrome.storage.session (RunState),
 * and the side panel renders from there, so a restarted worker or a reopened
 * panel loses nothing.
 */
import type { FieldDescriptor, FieldMapping, PageContext } from "./schema";

/* ───────────── side panel → worker ───────────── */

export type PanelToWorker =
  | { type: "PING" }
  | { type: "TEST_API_KEY"; apiKey: string }
  | { type: "FILL_PAGE"; tabId: number; engine?: "basic" }
  | { type: "UNDO"; tabId: number; fieldIds?: string[] }
  | { type: "CLEAR_FILL"; tabId: number }
  | { type: "SHOW_FIELD"; tabId: number; fieldId: string };

export type TestKeyResult =
  | { ok: true; model: string }
  | { ok: false; error: string; kind: "auth" | "permission" | "billing" | "rate" | "network" | "server" | "unknown" };

export type StartResult =
  | { ok: true }
  | { ok: false; kind: "permission" | "restricted" | "busy" | "no-key" | "no-profile" | "unknown"; error: string };

export interface ResponseMap {
  PING: { ok: true; version: string };
  TEST_API_KEY: TestKeyResult;
  FILL_PAGE: StartResult;
  UNDO: { restored: number };
  CLEAR_FILL: { ok: true };
  SHOW_FIELD: { ok: boolean };
}

export function sendToWorker<M extends PanelToWorker>(msg: M): Promise<ResponseMap[M["type"]]> {
  return chrome.runtime.sendMessage(msg) as Promise<ResponseMap[M["type"]]>;
}

export function isMessage(msg: unknown): msg is { type: string } {
  return typeof msg === "object" && msg !== null && typeof (msg as { type?: unknown }).type === "string";
}

/* ───────────── worker → content script ───────────── */

/** What one frame reports. Field ids are local to the frame ("fp-3"); the worker prefixes the frame. */
export interface FrameExtract {
  page: PageContext;
  fields: FieldDescriptor[];
  skipped: { sensitive: number; hidden: number; disabled: number; overflow: number };
}

export interface ApplyItem extends Pick<FieldMapping, "value" | "values" | "source" | "confidence"> {
  /** Local id within the frame ("fp-3"). */
  fieldId: string;
}

export interface ApplyReport {
  applied: string[];
  failed: { fieldId: string; reason: string }[];
}

export type WorkerToPage =
  | { type: "FP_EXTRACT" }
  | { type: "FP_APPLY"; items: ApplyItem[]; highlight: boolean }
  | { type: "FP_UNDO"; fieldIds?: string[] }
  | { type: "FP_CLEAR" }
  | { type: "FP_SHOW"; fieldId: string }
  | { type: "FP_BAR"; bar: PageBarState | null };

/** The small bar FormPilot shows on the page (top frame only). */
export interface PageBarState {
  filled: number;
  drafts: number;
  failed: number;
}

/* ───────────── on-page bar → worker ───────────── */

export type PageToWorker = { type: "PAGE_UNDO_ALL" } | { type: "PAGE_DISMISS" };

/* ───────────── run state (chrome.storage.session) ───────────── */

export type RunStatus = "reading" | "drafting" | "filling" | "done" | "error";

export interface RunItem {
  /** Global id: `${frameId}:${localId}`. */
  id: string;
  label: string;
  kind: FieldDescriptor["kind"];
  value: string;
  values: string[];
  source: FieldMapping["source"];
  confidence: FieldMapping["confidence"];
  reasoning: string;
  state: "filled" | "failed" | "undone";
  error?: string;
}

export interface RunState {
  runId: string;
  tabId: number;
  url: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  model?: string;
  fieldCount?: number;
  items: RunItem[];
  unmapped: { id: string; label: string; reason: string }[];
  skipped?: FrameExtract["skipped"];
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  error?: { kind: string; message: string };
}

export const runKey = (tabId: number) => `fp:run:${tabId}`;
