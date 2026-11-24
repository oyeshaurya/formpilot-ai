import type { ApplyItem, ApplyReport, FrameExtract, RunItem, RunState, StartResult, WorkerToPage } from "../shared/messages";
import { runKey } from "../shared/messages";
import type { FieldDescriptor, FieldMapping } from "../shared/schema";
import { getApiKey, getProfile, getResume, getSettings } from "../shared/storage";
import { FillError, requestFill } from "./claude";
import { fakeFetch } from "./fake-claude"; // test builds only: dropped when __FP_E2E__ is false
import { checkMappings } from "./mappings";
import { hasAnyData, planModel, type RequestField } from "./prompt";
import { ruleFill } from "./rules";
import { BASIC_MODEL, ON_DEVICE_MODEL } from "../shared/models";
import type { OnDeviceReply, OnDeviceRequest } from "../shared/messages";
import type { FillResponse } from "../shared/schema";
import { groundMappings, onDeviceFill } from "../shared/ondevice";

/**
 * One fill, start to finish. Stateless across worker restarts: every step is
 * written to chrome.storage.session under fp:run:<tabId>, which the side panel
 * renders. Nothing here is kept in module globals except the keep-alive timer.
 */

const CONTENT_FILE = "content.js";
const STALE_MS = 3 * 60_000;

/* ───────────── run state ───────────── */

export async function getRun(tabId: number): Promise<RunState | null> {
  const got = await chrome.storage.session.get(runKey(tabId));
  return (got[runKey(tabId)] as RunState | undefined) ?? null;
}

async function putRun(run: RunState): Promise<void> {
  await chrome.storage.session.set({ [runKey(run.tabId)]: run });
}

export async function clearRun(tabId: number): Promise<void> {
  await chrome.storage.session.remove(runKey(tabId));
}

/* ───────────── frames ───────────── */

const globalId = (frameId: number, localId: string) => `${frameId}:${localId}`;
function splitId(id: string): { frameId: number; localId: string } {
  const i = id.indexOf(":");
  return { frameId: Number(id.slice(0, i)), localId: id.slice(i + 1) };
}

function sendToFrame<T>(tabId: number, frameId: number, msg: WorkerToPage): Promise<T> {
  return chrome.tabs.sendMessage(tabId, msg, { frameId }) as Promise<T>;
}

export function sendToTab(tabId: number, msg: WorkerToPage): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, msg).catch(() => undefined);
}

/** Inject the page script into every frame we may access. */
async function inject(tabId: number): Promise<number[] | StartResult> {
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: [CONTENT_FILE] });
    const frames = [...new Set(results.map((r) => r.frameId))];
    return frames.length ? frames : { ok: false, kind: "permission", error: "FormPilot could not reach this page." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/chrome:\/\/|edge:\/\/|about:|chrome-extension:|extensions gallery|webstore|microsoftedge\.microsoft\.com|cannot be scripted|PDF/i.test(msg))
      return { ok: false, kind: "restricted", error: "Browsers do not let extensions fill their own pages, the extension stores or PDFs. Open the form on a website." };
    if (/permission|Cannot access contents|host/i.test(msg))
      return { ok: false, kind: "permission", error: "FormPilot needs your permission to read this page." };
    return { ok: false, kind: "unknown", error: `FormPilot could not open this page: ${msg.slice(0, 140)}` };
  }
}

/* ───────────── keep the worker alive during the Claude call ───────────── */

let keepAlive: ReturnType<typeof setInterval> | undefined;
function holdOpen(on: boolean) {
  if (on && !keepAlive) keepAlive = setInterval(() => void chrome.runtime.getPlatformInfo(), 20_000);
  if (!on && keepAlive) {
    clearInterval(keepAlive);
    keepAlive = undefined;
  }
}

/* ───────────── the fill ───────────── */

/**
 * Checks and injection happen before this returns, so the side panel learns at once
 * whether a fill started; the rest runs on and reports through run state.
 */
export async function startFill(tabId: number, opts: { engine?: "basic" } = {}): Promise<StartResult> {
  const existing = await getRun(tabId);
  if (existing && ["reading", "drafting", "filling"].includes(existing.status) && Date.now() - Date.parse(existing.startedAt) < STALE_MS)
    return { ok: false, kind: "busy", error: "FormPilot is already filling this page." };

  const [apiKey, profile, resume, settings] = await Promise.all([getApiKey(), getProfile(), getResume(), getSettings()]);
  // On-device AI when chosen (free, no key). Basic mode (no AI) when chosen, asked for, or with no key for Claude.
  const onDevice = settings.model === "on-device" && opts.engine !== "basic";
  const basic = !onDevice && (opts.engine === "basic" || settings.model === "basic" || !apiKey);
  if (!hasAnyData(profile, resume)) return { ok: false, kind: "no-profile", error: "Add your details in Profile first." };

  const frames = await inject(tabId);
  if (!Array.isArray(frames)) return frames;

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const run: RunState = {
    runId: crypto.randomUUID(),
    tabId,
    url: tab?.url ?? "",
    status: "reading",
    startedAt: new Date().toISOString(),
    items: [],
    unmapped: [],
  };
  await putRun(run);
  void runFill(run, frames, { apiKey, basic, onDevice, profile, resume, settings });
  return { ok: true };
}

async function runFill(
  run: RunState,
  frames: number[],
  ctx: { apiKey: string; basic: boolean; onDevice: boolean; profile: Awaited<ReturnType<typeof getProfile>>; resume: Awaited<ReturnType<typeof getResume>>; settings: Awaited<ReturnType<typeof getSettings>> },
): Promise<void> {
  holdOpen(true);
  try {
    /* 1 · read every frame */
    const extracts = await Promise.all(
      frames.map((frameId) =>
        sendToFrame<FrameExtract>(run.tabId, frameId, { type: "FP_EXTRACT" })
          .then((x) => ({ frameId, x }))
          .catch(() => null),
      ),
    );
    const fields: (FieldDescriptor & { id: string })[] = [];
    const skipped = { sensitive: 0, hidden: 0, disabled: 0, overflow: 0 };
    let page = extracts.find((e) => e?.frameId === 0)?.x.page;
    for (const e of extracts) {
      if (!e) continue;
      page ??= e.x.page;
      for (const k of Object.keys(skipped) as (keyof typeof skipped)[]) skipped[k] += e.x.skipped[k];
      for (const f of e.x.fields) fields.push({ ...f, id: globalId(e.frameId, f.id) });
    }
    run.skipped = skipped;
    run.fieldCount = fields.length;

    // Fields the person already filled stay untouched and are not sent.
    const empty = fields.filter((f) => !f.currentValue);
    if (!page || !empty.length) {
      throw new FillError(
        "invalid",
        fields.length ? "Every field on this page already has a value. Nothing to fill." : "No form fields found on this page.",
      );
    }
    const requestFields: RequestField[] = empty.map(({ currentValue: _c, ...rest }) => rest);

    /* 2 · match the fields: Claude, or Basic mode's rules (free, offline, nothing sent anywhere) */
    run.status = "drafting";
    // Local-only fields (Aadhaar) are filled from saved facts on this device and never sent to Claude.
    const localFields = requestFields.filter((f) => f.localOnly);
    const remoteFields = requestFields.filter((f) => !f.localOnly);
    let response;
    if (ctx.onDevice) {
      // Rules first (exact and instant), then the built-in model only for what the rules could not place.
      const rules = ruleFill(ctx.profile, requestFields, ctx.resume);
      const gapIds = new Set(rules.unmapped.filter((u) => ON_DEVICE_GAP.test(u.reason)).map((u) => u.fieldId));
      const gaps = remoteFields.filter((f) => gapIds.has(f.id));
      run.model = ON_DEVICE_MODEL;
      await putRun(run);
      let ai: FillResponse = { mappings: [], unmapped: [] };
      if (gaps.length) {
        try {
          ai = groundMappings(gaps, await askOnDevice({ profile: ctx.profile, resume: ctx.resume, page, fields: gaps }), ctx.profile, ctx.resume);
        } catch (err) {
          run.model = BASIC_MODEL;
          run.notice = `On-device AI was not used (${err instanceof Error ? err.message : "not available"}). Filled with Basic rules.`;
        }
      }
      const answered = new Set([...ai.mappings, ...ai.unmapped].map((x) => x.fieldId));
      response = {
        mappings: [...rules.mappings, ...ai.mappings],
        unmapped: [...rules.unmapped.filter((u) => !answered.has(u.fieldId)), ...ai.unmapped],
      };
    } else if (ctx.basic || !remoteFields.length) {
      run.model = ctx.basic ? BASIC_MODEL : run.model ?? BASIC_MODEL;
      await putRun(run);
      response = ruleFill(ctx.profile, requestFields, ctx.resume);
    } else {
      const plan = planModel(ctx.settings, remoteFields);
      run.model = plan.model;
      await putRun(run);
      const fetchImpl = __FP_E2E__ ? fakeFetch : undefined;
      const result = await requestFill({ apiKey: ctx.apiKey, plan, profile: ctx.profile, resume: ctx.resume, page, fields: remoteFields, fetchImpl });
      run.model = result.model;
      run.usage = result.usage;
      const local = ruleFill(ctx.profile, localFields, ctx.resume);
      response = { mappings: [...result.response.mappings, ...local.mappings], unmapped: [...result.response.unmapped, ...local.unmapped] };
    }

    /* 3 · check, then fill frame by frame */
    const { accepted, unmapped } = checkMappings(requestFields, response);
    const byId = new Map(requestFields.map((f) => [f.id, f]));
    run.status = "filling";
    run.unmapped = unmapped.map((u) => ({ id: u.fieldId, label: byId.get(u.fieldId)?.label ?? u.fieldId, reason: u.reason }));
    await putRun(run);

    const perFrame = new Map<number, FieldMapping[]>();
    for (const m of accepted) {
      const { frameId } = splitId(m.fieldId);
      perFrame.set(frameId, [...(perFrame.get(frameId) ?? []), m]);
    }
    const items: RunItem[] = [];
    for (const [frameId, maps] of perFrame) {
      const applyItems: ApplyItem[] = maps.map((m) => ({
        fieldId: splitId(m.fieldId).localId,
        value: m.value,
        values: m.values,
        source: m.source,
        confidence: m.confidence,
      }));
      const report = await sendToFrame<ApplyReport>(run.tabId, frameId, {
        type: "FP_APPLY",
        items: applyItems,
        highlight: ctx.settings.highlightFields,
      }).catch(() => ({ applied: [], failed: applyItems.map((a) => ({ fieldId: a.fieldId, reason: "The page changed before FormPilot could fill it." })) }));
      const failed = new Map(report.failed.map((f) => [f.fieldId, f.reason]));
      for (const m of maps) {
        const local = splitId(m.fieldId).localId;
        const f = byId.get(m.fieldId)!;
        const error = failed.get(local);
        // Show what the person sees on the page: an option's label, not its internal value.
        const labelOf = (v: string) => f.options?.find((o) => o.value === v)?.label || v;
        items.push({
          id: m.fieldId,
          label: f.label,
          kind: f.kind,
          // Aadhaar shows masked in the review: only the last 4 digits.
          value: f.localOnly ? maskId(m.value) : f.options?.length && m.value ? labelOf(m.value) : m.value,
          values: f.options?.length ? m.values.map(labelOf) : m.values,
          source: m.source,
          confidence: m.confidence,
          reasoning: m.reasoning,
          state: error ? "failed" : "filled",
          ...(error ? { error } : {}),
        });
      }
    }
    // Keep the page's order.
    const order = new Map(requestFields.map((f, i) => [f.id, i]));
    items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    run.items = items;
    run.status = "done";
    run.finishedAt = new Date().toISOString();
    await putRun(run);
    await updateBar(run);
  } catch (err) {
    run.status = "error";
    run.finishedAt = new Date().toISOString();
    run.error =
      err instanceof FillError
        ? { kind: err.kind, message: err.message }
        : { kind: "unknown", message: err instanceof Error ? err.message : "Something went wrong." };
    await putRun(run);
  } finally {
    holdOpen(false);
  }
}

/**
 * Basic-mode outcomes the on-device model may still answer: no rule matched, an open
 * question, an option name that differs, or education and work facts that may be in the
 * resume. Deliberate refusals ("About someone else", "Needs your own decision", an empty
 * middle name) never go to the model.
 */
const ON_DEVICE_GAP =
  /No match in your profile|does not write answers|is not one of the options|None of your skills|Not in your profile: (Class|school name|CGPA|graduation|degree|school|field of study|highest|current|years|skills|notice)/;

/** Run the built-in model here if the worker has it, otherwise in the open side panel. */
async function askOnDevice(req: Omit<OnDeviceRequest, "type">): Promise<FillResponse> {
  if ((globalThis as { LanguageModel?: unknown }).LanguageModel) return onDeviceFill(req);
  const reply = (await chrome.runtime.sendMessage({ type: "FP_ONDEVICE_FILL", ...req } satisfies OnDeviceRequest).catch(() => null)) as OnDeviceReply | null;
  if (!reply) throw new Error("open the FormPilot side panel to use it");
  if (!reply.ok) throw new Error(reply.error);
  return reply.response;
}

/** "1234 5678 9012" → "XXXX XXXX 9012" */
export const maskId = (v: string) => v.replace(/\d(?=(?:\D*\d){4})/g, "X");

/* ───────────── after the fill ───────────── */

export async function updateBar(run: RunState): Promise<void> {
  const filled = run.items.filter((i) => i.state === "filled");
  const bar = filled.length
    ? { filled: filled.length, drafts: filled.filter((i) => i.source === "generated" || i.confidence === "low").length, failed: run.items.filter((i) => i.state === "failed").length }
    : null;
  await sendToFrame(run.tabId, 0, { type: "FP_BAR", bar }).catch(() => undefined);
}

export async function undoFields(tabId: number, ids?: string[]): Promise<number> {
  const run = await getRun(tabId);
  type UndoReply = { restored: string[]; notes?: Record<string, string> };
  const replies: { frameId: number; r: UndoReply }[] = [];
  if (ids?.length) {
    const perFrame = new Map<number, string[]>();
    for (const id of ids) {
      const { frameId, localId } = splitId(id);
      perFrame.set(frameId, [...(perFrame.get(frameId) ?? []), localId]);
    }
    for (const [frameId, local] of perFrame) {
      const r = await sendToFrame<UndoReply>(tabId, frameId, { type: "FP_UNDO", fieldIds: local }).catch(() => ({ restored: [] }));
      replies.push({ frameId, r });
    }
  } else {
    // Every frame holds its own snapshots.
    const frames = await chrome.scripting
      .executeScript({ target: { tabId, allFrames: true }, func: () => true })
      .then((res) => res.map((x) => x.frameId))
      .catch(() => [0]);
    for (const frameId of frames) {
      const r = await sendToFrame<UndoReply>(tabId, frameId, { type: "FP_UNDO" }).catch(() => ({ restored: [] }));
      replies.push({ frameId, r });
    }
  }
  const notes = new Map<string, string>();
  for (const { frameId, r } of replies) for (const [local, note] of Object.entries(r.notes ?? {})) notes.set(globalId(frameId, local), note);
  const restored = replies.reduce((n, x) => n + x.r.restored.length, 0);
  if (run) {
    const set = ids ? new Set(ids) : null;
    run.items = run.items.map((i) =>
      i.state === "filled" && (!set || set.has(i.id))
        ? { ...i, state: "undone" as const, ...(notes.has(i.id) ? { error: notes.get(i.id)! } : {}) }
        : i,
    );
    await putRun(run);
    await updateBar(run);
  }
  return restored;
}

export async function showField(tabId: number, id: string): Promise<boolean> {
  const { frameId, localId } = splitId(id);
  const r = await sendToFrame<{ ok: boolean }>(tabId, frameId, { type: "FP_SHOW", fieldId: localId }).catch(() => ({ ok: false }));
  return r.ok;
}
