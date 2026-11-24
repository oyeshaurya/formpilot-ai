import { profileBlock, RULES, userMessage, type RequestField } from "../background/prompt";
import type { FieldMapping, FillResponse, PageContext, Profile, Resume } from "./schema";

/**
 * On-device AI: the browser's built-in language model (Gemini Nano in Chrome, through the
 * Prompt API). Free, no key, and nothing leaves the computer. Small models have small
 * context windows and invent more readily than Claude, so this engine:
 *   - sends fields in small batches against one cached system prompt (rules + profile),
 *   - constrains every answer to a JSON schema listing only that batch's field ids,
 *   - and keeps a "profile" value only if it really appears in the profile or resume.
 * The result has Claude's shape, so the worker's usual checks (mappings.ts) still apply.
 */

/* ───────────── the API surface we use (not yet in TypeScript's DOM types) ───────────── */

type Availability = "unavailable" | "downloadable" | "downloading" | "available";
interface LMSession {
  prompt(input: string, options?: { responseConstraint?: object; signal?: AbortSignal }): Promise<string>;
  clone(options?: { signal?: AbortSignal }): Promise<LMSession>;
  destroy(): void;
}
interface LMCreateOptions {
  initialPrompts?: { role: "system" | "user" | "assistant"; content: string }[];
  expectedInputs?: { type: "text"; languages: string[] }[];
  expectedOutputs?: { type: "text"; languages: string[] }[];
  monitor?: (m: EventTarget) => void;
  signal?: AbortSignal;
}
interface LMStatic {
  availability(options?: LMCreateOptions): Promise<Availability>;
  create(options?: LMCreateOptions): Promise<LMSession>;
}

const LANGS: LMCreateOptions = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

const api = (): LMStatic | undefined => (globalThis as { LanguageModel?: LMStatic }).LanguageModel;

export type OnDeviceStatus = Availability | "unsupported";

/** Whether this browser has a built-in model, and whether it is downloaded yet. */
export async function onDeviceStatus(): Promise<OnDeviceStatus> {
  const lm = api();
  if (!lm) return "unsupported";
  try {
    return await lm.availability(LANGS);
  } catch {
    return "unavailable";
  }
}

/** Download the model. Call from a click: the browser needs a user gesture to start it. */
export async function downloadOnDeviceModel(onProgress: (fraction: number) => void): Promise<void> {
  const lm = api();
  if (!lm) throw new Error("This browser has no built-in AI model.");
  const s = await lm.create({
    ...LANGS,
    monitor: (m) => m.addEventListener("downloadprogress", (e) => onProgress((e as Event & { loaded: number }).loaded)),
  });
  s.destroy();
}

/* ───────────── the fill ───────────── */

const BATCH = 10;
const RESUME_CHARS = 6000;

const ON_DEVICE_RULES = `${RULES}

On this device
- You run on a small model. When unsure, put the field in "unmapped" rather than guess.
- Copy profile values exactly as written. Do not combine or reword them unless the field asks for it.`;

function schemaFor(ids: string[]): object {
  return {
    type: "object",
    properties: {
      mappings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            fieldId: { type: "string", enum: ids },
            value: { type: "string" },
            values: { type: "array", items: { type: "string" } },
            source: { type: "string", enum: ["profile", "generated"] },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            reasoning: { type: "string" },
          },
          required: ["fieldId", "value", "values", "source", "confidence", "reasoning"],
          additionalProperties: false,
        },
      },
      unmapped: {
        type: "array",
        items: {
          type: "object",
          properties: { fieldId: { type: "string", enum: ids }, reason: { type: "string" } },
          required: ["fieldId", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["mappings", "unmapped"],
    additionalProperties: false,
  };
}

const isQuota = (e: unknown) => e instanceof Error && (e.name === "QuotaExceededError" || /quota|too large|context/i.test(e.message));

async function baseSession(lm: LMStatic, profile: Profile, resume: Resume): Promise<LMSession> {
  const system = (md: string) => `${ON_DEVICE_RULES}\n\n${profileBlock(profile, { ...resume, markdown: md })}`;
  try {
    return await lm.create({ ...LANGS, initialPrompts: [{ role: "system", content: system(resume.markdown.slice(0, RESUME_CHARS)) }] });
  } catch (e) {
    if (!isQuota(e)) throw e;
    // The resume does not fit next to the rules: fill from the profile alone.
    return lm.create({ ...LANGS, initialPrompts: [{ role: "system", content: system("") }] });
  }
}

export async function onDeviceFill(args: { profile: Profile; resume: Resume; page: PageContext; fields: RequestField[] }): Promise<FillResponse> {
  const lm = api();
  if (!lm || (await onDeviceStatus()) !== "available") throw new Error("the browser's model is not downloaded or not supported here");
  const base = await baseSession(lm, args.profile, args.resume);
  // The job description helps drafts but costs context: keep a short excerpt.
  const page: PageContext = { ...args.page, excerpt: args.page.excerpt?.slice(0, 800) };
  const out: FillResponse = { mappings: [], unmapped: [] };

  const run = async (batch: RequestField[]): Promise<void> => {
    const s = await base.clone();
    try {
      const raw = await s.prompt(userMessage(page, batch), { responseConstraint: schemaFor(batch.map((f) => f.id)) });
      const got = JSON.parse(raw) as FillResponse;
      out.mappings.push(...(got.mappings ?? []));
      out.unmapped.push(...(got.unmapped ?? []));
    } catch (e) {
      if (isQuota(e) && batch.length > 1) {
        const half = Math.ceil(batch.length / 2);
        await run(batch.slice(0, half));
        await run(batch.slice(half));
      } else {
        for (const f of batch) out.unmapped.push({ fieldId: f.id, reason: "The on-device model could not answer this one" });
      }
    } finally {
      s.destroy();
    }
  };

  try {
    for (let i = 0; i < args.fields.length; i += BATCH) await run(args.fields.slice(i, i + BATCH));
  } finally {
    base.destroy();
  }
  return out;
}

/* ───────────── keep only what is really in your data ───────────── */

const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9@]+/g, "");
const FREE_TEXT = new Set(["text", "email", "tel", "url", "number", "combobox"]);

/**
 * A small model sometimes "fills" a field with a plausible value that is not yours.
 * A value marked as copied from the profile must appear in the profile, resume or saved
 * answers (ignoring spaces and punctuation); otherwise it goes back to the person.
 */
export function groundMappings(fields: RequestField[], res: FillResponse, profile: Profile, resume: Resume): FillResponse {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const hay = flat(`${JSON.stringify(profile)} ${resume.markdown}`);
  const mappings: FieldMapping[] = [];
  const unmapped = [...res.unmapped];
  for (const m of res.mappings) {
    const f = byId.get(m.fieldId);
    if (!f) continue;
    const v = flat(m.value);
    if (m.source === "profile" && FREE_TEXT.has(f.kind) && !f.options?.length && v && !hay.includes(v)) {
      unmapped.push({ fieldId: m.fieldId, reason: "Not found in your profile or resume" });
      continue;
    }
    mappings.push(m);
  }
  return { mappings, unmapped };
}
