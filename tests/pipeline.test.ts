import { describe, expect, it } from "vitest";
import { buildParams, FillError, requestFill } from "../src/background/claude";
import { checkMappings } from "../src/background/mappings";
import { needsDrafting, planModel, profileBlock, RULES, userMessage, type RequestField } from "../src/background/prompt";
import { defaultSettings, emptyProfile, emptyResume, type FillResponse, type PageContext } from "../src/shared/schema";

const page: PageContext = { url: "https://jobs.example/apply", title: "Apply", headings: ["Senior Engineer"], excerpt: "We build tools." };

const fields: RequestField[] = [
  { id: "0:fp-1", kind: "text", label: "First name", required: true },
  { id: "0:fp-2", kind: "select", label: "Country", required: false, options: [{ value: "in", label: "India" }, { value: "de", label: "Germany" }] },
  { id: "0:fp-3", kind: "textarea", label: "Why do you want to join?", required: false, maxLength: 40 },
  { id: "0:fp-4", kind: "checkbox", label: "I agree to the terms", required: true },
  { id: "0:fp-5", kind: "select", label: "Gender", required: false, options: [{ value: "f", label: "Female" }] },
  { id: "1:fp-1", kind: "checkbox-group", label: "Skills", required: false, options: [{ value: "ts", label: "TypeScript" }, { value: "rs", label: "Rust" }] },
];

function profile() {
  const p = emptyProfile();
  p.personal.firstName = "Ada";
  p.address.country = "India";
  p.updatedAt = "2026-11-23T10:00:00Z";
  return p;
}

describe("request shape", () => {
  const plan = planModel(defaultSettings(), fields);
  const params = buildParams({ plan, profile: profile(), resume: { markdown: "# Ada", updatedAt: "" }, page, fields });

  it("puts rules first, then the cached profile block, then the page in the user turn", () => {
    expect(params.system[0]!.text).toBe(RULES);
    expect(params.system[0]).not.toHaveProperty("cache_control");
    expect(params.system[1]!.cache_control).toEqual({ type: "ephemeral" });
    expect(params.system[1]!.text).toContain('"firstName": "Ada"');
    expect(params.system[1]!.text).toContain("# Ada");
    expect(params.messages[0]!.content).toContain("<fields>");
    expect(params.messages[0]!.content).toContain("We build tools.");
  });

  it("asks for structured output with an effort level, never the deprecated output_format", () => {
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.output_config.effort).toBe("medium");
    expect(params).not.toHaveProperty("output_format");
    expect(params).not.toHaveProperty("thinking");
  });

  it("uses Sonnet 5.5 with server-side refusal fallback when the page has an open question", () => {
    expect(plan.model).toBe("claude-sonnet-5-5");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.fallbacks).toBe("default");
  });

  it("uses Haiku 5.5 at low effort and no fallback for a simple form", () => {
    const simple = fields.filter((f) => f.kind !== "textarea");
    expect(needsDrafting(simple)).toBe(false);
    const p = planModel(defaultSettings(), simple);
    expect(p).toEqual({ model: "claude-haiku-5-5", effort: "low", fallback: false });
    const built = buildParams({ plan: p, profile: profile(), resume: emptyResume(), page, fields: simple });
    expect(built).not.toHaveProperty("fallbacks");
  });

  it("keeps the cached prefix byte-stable: key order and timestamps do not change it", () => {
    const a = profile();
    const b = { ...profile(), updatedAt: "2030-01-01T00:00:00Z", personal: { ...profile().personal } };
    expect(profileBlock(a, emptyResume())).toBe(profileBlock(b, emptyResume()));
    expect(profileBlock(a, emptyResume())).not.toContain("updatedAt");
    expect(profileBlock(a, emptyResume())).not.toContain('""');
  });

  it("never sends a saved Aadhaar number to Claude", () => {
    const p = profile();
    p.customFacts = [
      { id: "a", label: "Aadhaar card number", value: "1234 5678 9012" },
      { id: "b", label: "Unlabelled ID", value: "2345-6789-0123" },
      { id: "c", label: "T-shirt size", value: "M" },
    ];
    const block = profileBlock(p, emptyResume());
    expect(block).not.toContain("1234 5678 9012");
    expect(block).not.toContain("2345-6789-0123");
    expect(block).not.toMatch(/aadhaar/i);
    expect(block).toContain("T-shirt size");
  });

  it("marks page text as untrusted in the rules", () => {
    expect(RULES).toMatch(/untrusted/);
    expect(userMessage(page, fields)).toMatch(/^<page>/);
  });
});

describe("checking Claude's answer", () => {
  const response: FillResponse = {
    mappings: [
      { fieldId: "0:fp-1", value: "Ada", values: [], source: "profile", confidence: "high", reasoning: "First name" },
      { fieldId: "0:fp-2", value: "India", values: [], source: "profile", confidence: "medium", reasoning: "Country" },
      { fieldId: "0:fp-3", value: "x".repeat(100), values: [], source: "generated", confidence: "high", reasoning: "Draft" },
      { fieldId: "0:fp-4", value: "checked", values: [], source: "profile", confidence: "high", reasoning: "Ticked" },
      { fieldId: "0:fp-5", value: "f", values: [], source: "generated", confidence: "low", reasoning: "Guess" },
      { fieldId: "1:fp-1", value: "", values: ["TypeScript", "Go"], source: "profile", confidence: "medium", reasoning: "Skills" },
      { fieldId: "9:fp-9", value: "sneaky", values: [], source: "profile", confidence: "high", reasoning: "Not a field" },
    ],
    unmapped: [],
  };
  const { accepted, unmapped } = checkMappings(fields, response);
  const byId = Object.fromEntries(accepted.map((m) => [m.fieldId, m]));

  it("maps a select answer given by label onto the option's value", () => {
    expect(byId["0:fp-2"]!.value).toBe("in");
  });
  it("trims drafts to maxLength and never lets a draft be high confidence", () => {
    expect(byId["0:fp-3"]!.value).toHaveLength(40);
    expect(byId["0:fp-3"]!.confidence).toBe("medium");
  });
  it("never ticks consent boxes, whatever the model says", () => {
    expect(byId["0:fp-4"]).toBeUndefined();
    expect(unmapped).toContainEqual({ fieldId: "0:fp-4", reason: "Needs your own decision" });
  });
  it("never fills a demographic question with a drafted guess", () => {
    expect(byId["0:fp-5"]).toBeUndefined();
    expect(unmapped.find((u) => u.fieldId === "0:fp-5")?.reason).toMatch(/Personal question/);
  });
  it("keeps only real options in a checkbox group", () => {
    expect(byId["1:fp-1"]!.values).toEqual(["ts"]);
  });
  it("drops ids that were never sent", () => {
    expect(byId["9:fp-9"]).toBeUndefined();
    expect(unmapped.find((u) => u.fieldId === "9:fp-9")).toBeUndefined();
  });
});

describe("requestFill over a stand-in network", () => {
  const reply = (body: object, status = 200) =>
    (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
  const message = (content: object, stop = "end_turn") => ({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: [{ type: "text", text: JSON.stringify(content) }],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
  });
  const base = {
    apiKey: "sk-ant-api03-" + "x".repeat(80),
    plan: { model: "claude-haiku-5-5", effort: "low" as const, fallback: false },
    profile: profile(),
    resume: emptyResume(),
    page,
    fields,
  };

  it("sends the BYOK browser header and the cached system block, and parses the answer", async () => {
    let sent: { headers: Headers; body: Record<string, unknown> } | null = null;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = { headers: new Headers(init.headers), body: JSON.parse(String(init.body)) };
      return new Response(
        JSON.stringify(message({ mappings: [{ fieldId: "0:fp-1", value: "Ada", values: [], source: "profile", confidence: "high", reasoning: "r" }], unmapped: [] })),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const res = await requestFill({ ...base, fetchImpl });
    expect(res.response.mappings[0]!.value).toBe("Ada");
    expect(res.usage.cacheRead).toBe(900);
    expect(sent!.headers.get("anthropic-dangerous-direct-browser-access")).toBe("true");
    expect((sent!.body.system as { cache_control?: unknown }[])[1]!.cache_control).toEqual({ type: "ephemeral" });
    expect((sent!.body.output_config as { format: { type: string } }).format.type).toBe("json_schema");
  });

  it("turns a refusal into a clear error", async () => {
    await expect(requestFill({ ...base, fetchImpl: reply(message({}, "refusal")) })).rejects.toMatchObject({ kind: "refusal" });
  });

  it("turns a cut-off answer into a clear error", async () => {
    await expect(requestFill({ ...base, fetchImpl: reply(message({ mappings: [] }, "max_tokens")) })).rejects.toBeInstanceOf(FillError);
  });

  it("explains an account with no credits in plain words", async () => {
    const broke = reply(
      { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." } },
      400,
    );
    await expect(requestFill({ ...base, fetchImpl: broke })).rejects.toMatchObject({ kind: "billing", message: expect.stringMatching(/no credits/) });
  });

  it("maps a bad key to an auth error", async () => {
    const bad = reply({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401);
    await expect(requestFill({ ...base, fetchImpl: bad })).rejects.toMatchObject({ kind: "auth" });
  });
});
