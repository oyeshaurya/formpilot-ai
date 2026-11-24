import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { TestKeyResult } from "../shared/messages";
import { KEY_TEST_MODEL } from "../shared/models";
import { FillResponseSchema, type FillResponse, type PageContext, type Profile, type Resume } from "../shared/schema";
import { RULES, profileBlock, userMessage, type ModelPlan, type RequestField } from "./prompt";

/**
 * Claude client. BYOK: the key goes only to api.anthropic.com. The client is
 * built in one place so a team proxy can later swap `baseURL` (and drop the
 * key) without touching callers. `fetchImpl` lets tests and the E2E build
 * stand in for the network.
 */
export function createClient(apiKey: string, fetchImpl?: typeof fetch, timeoutMs = 20_000): Anthropic {
  return new Anthropic({
    apiKey,
    // Sends `anthropic-dangerous-direct-browser-access: true`, needed for BYOK calls from an extension.
    dangerouslyAllowBrowser: true,
    maxRetries: 2, // the SDK retries 408/409/429/5xx and connection errors with backoff
    timeout: timeoutMs,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}

/** Checks a key without spending tokens: reading a model's metadata needs a valid key and access. */
export async function testApiKey(apiKey: string, fetchImpl?: typeof fetch): Promise<TestKeyResult> {
  try {
    const model = await createClient(apiKey, fetchImpl).models.retrieve(KEY_TEST_MODEL);
    return { ok: true, model: model.display_name ?? model.id };
  } catch (err) {
    return describeError(err);
  }
}

export type FillErrorKind = "auth" | "permission" | "billing" | "rate" | "network" | "server" | "refusal" | "truncated" | "invalid" | "unknown";

export class FillError extends Error {
  constructor(
    public kind: FillErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export function describeError(err: unknown): Extract<TestKeyResult, { ok: false }> {
  if (err instanceof Anthropic.AuthenticationError)
    return { ok: false, kind: "auth", error: "Anthropic did not accept this key. Check it in Settings." };
  if (err instanceof Anthropic.PermissionDeniedError)
    return { ok: false, kind: "permission", error: "This key cannot use the model. Check your workspace's model access." };
  if (err instanceof Anthropic.RateLimitError)
    return { ok: false, kind: "rate", error: "Rate limit reached. Wait a minute and try again." };
  if (err instanceof Anthropic.APIConnectionTimeoutError)
    return { ok: false, kind: "network", error: "Anthropic took too long to answer. Try again, or pick a faster model." };
  if (err instanceof Anthropic.APIConnectionError)
    return { ok: false, kind: "network", error: "Could not reach api.anthropic.com. Check your connection." };
  if (err instanceof Anthropic.InternalServerError)
    return { ok: false, kind: "server", error: "Anthropic is having trouble right now. Try again shortly." };
  // An account with no credits gets a 400 whose message says so: say it plainly.
  if (err instanceof Anthropic.APIError && /credit balance|billing/i.test(err.message))
    return { ok: false, kind: "billing", error: "Your Anthropic account has no credits left. Add credits in the Claude Console, then try again." };
  if (err instanceof Anthropic.BadRequestError)
    return { ok: false, kind: "unknown", error: `Anthropic rejected the request: ${err.message.slice(0, 160)}` };
  if (err instanceof Anthropic.APIError)
    return { ok: false, kind: "unknown", error: `Anthropic returned an error (${err.status ?? "no status"}).` };
  return { ok: false, kind: "unknown", error: "Something went wrong while talking to Anthropic." };
}

export interface FillRequest {
  apiKey: string;
  plan: ModelPlan;
  profile: Profile;
  resume: Resume;
  page: PageContext;
  fields: RequestField[];
  fetchImpl?: typeof fetch;
}

export interface FillResult {
  response: FillResponse;
  model: string;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

/** The request body, built separately so tests can assert its exact shape. */
export function buildParams(req: Omit<FillRequest, "apiKey" | "fetchImpl">) {
  const { plan } = req;
  return {
    model: plan.model,
    max_tokens: 16_000,
    system: [
      { type: "text" as const, text: RULES },
      // Cache breakpoint: rules + profile + resume are reused on every later fill.
      { type: "text" as const, text: profileBlock(req.profile, req.resume), cache_control: { type: "ephemeral" as const } },
    ],
    messages: [{ role: "user" as const, content: userMessage(req.page, req.fields) }],
    output_config: { format: betaZodOutputFormat(FillResponseSchema), effort: plan.effort },
    ...(plan.fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
}

export async function requestFill(req: FillRequest): Promise<FillResult> {
  const client = createClient(req.apiKey, req.fetchImpl, 120_000);
  let msg;
  try {
    // create(), not parse(): the stop reason must be read before the JSON is trusted,
    // because a refused or cut-off answer is not valid against the schema.
    msg = await client.beta.messages.create(buildParams(req));
  } catch (err) {
    const d = describeError(err);
    throw new FillError(d.kind, d.error);
  }
  if (msg.stop_reason === "refusal")
    throw new FillError("refusal", "Claude declined to fill this page. Fill it by hand, or try another model.");
  if (msg.stop_reason === "max_tokens")
    throw new FillError("truncated", "The page has more fields than one answer can hold. Fill part of it by hand and try again.");
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let parsed: FillResponse | null = null;
  try {
    const checked = FillResponseSchema.safeParse(JSON.parse(text));
    if (checked.success) parsed = checked.data;
  } catch {
    parsed = null;
  }
  if (!parsed) throw new FillError("invalid", "Claude's answer was not in the expected shape. Try again.");
  const u = msg.usage;
  return {
    response: parsed,
    model: msg.model,
    usage: {
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
    },
  };
}
