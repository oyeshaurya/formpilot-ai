import { afterEach, describe, expect, it } from "vitest";
import type { RequestField } from "../src/background/prompt";
import { groundMappings, onDeviceFill, onDeviceStatus } from "../src/shared/ondevice";
import { emptyProfile, emptyResume, type FillResponse } from "../src/shared/schema";

const page = { url: "https://jobs.example/apply", title: "Apply", headings: [] };
const f = (id: string, label: string, kind: RequestField["kind"] = "text"): RequestField => ({ id, kind, label, required: false });

function profile() {
  const p = emptyProfile();
  p.personal.firstName = "Shaurya";
  p.work.currentTitle = "Software Engineer";
  return p;
}

/** A stand-in for Chrome's LanguageModel: answers every field with `answer(label)`, and can refuse big batches. */
function fakeModel(answer: (label: string) => string | null, opts: { maxBatch?: number; status?: string } = {}) {
  const calls: { ids: string[]; schemaIds: string[] }[] = [];
  const session = {
    async prompt(input: string, o?: { responseConstraint?: { properties: { mappings: { items: { properties: { fieldId: { enum: string[] } } } } } } }) {
      const fields = JSON.parse(input.slice(input.indexOf("<fields>") + 8, input.indexOf("</fields>"))) as RequestField[];
      calls.push({ ids: fields.map((x) => x.id), schemaIds: o?.responseConstraint?.properties.mappings.items.properties.fieldId.enum ?? [] });
      if (opts.maxBatch && fields.length > opts.maxBatch) throw Object.assign(new Error("too big"), { name: "QuotaExceededError" });
      const out: FillResponse = { mappings: [], unmapped: [] };
      for (const x of fields) {
        const v = answer(x.label);
        if (v === null) out.unmapped.push({ fieldId: x.id, reason: "Not in your profile" });
        else out.mappings.push({ fieldId: x.id, value: v, values: [], source: "profile", confidence: "medium", reasoning: "From your profile" });
      }
      return JSON.stringify(out);
    },
    async clone() {
      return session;
    },
    destroy() {},
  };
  (globalThis as { LanguageModel?: unknown }).LanguageModel = {
    availability: async () => opts.status ?? "available",
    create: async () => session,
  };
  return calls;
}

afterEach(() => {
  delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
});

describe("on-device engine", () => {
  it("reports a browser without built-in AI", async () => {
    expect(await onDeviceStatus()).toBe("unsupported");
  });

  it("refuses to run before the model is downloaded", async () => {
    fakeModel(() => "x", { status: "downloadable" });
    await expect(onDeviceFill({ profile: profile(), resume: emptyResume(), page, fields: [f("1", "Role")] })).rejects.toThrow(/not downloaded/);
  });

  it("sends fields in small batches, each constrained to its own field ids", async () => {
    const calls = fakeModel(() => "Software Engineer");
    const fields = Array.from({ length: 23 }, (_, i) => f(String(i), `Field ${i}`));
    const res = await onDeviceFill({ profile: profile(), resume: emptyResume(), page, fields });
    expect(calls.map((c) => c.ids.length)).toEqual([10, 10, 3]);
    expect(calls.every((c) => JSON.stringify(c.ids) === JSON.stringify(c.schemaIds))).toBe(true);
    expect(res.mappings).toHaveLength(23);
  });

  it("splits a batch the model's context cannot hold", async () => {
    const calls = fakeModel(() => "Software Engineer", { maxBatch: 3 });
    const fields = Array.from({ length: 10 }, (_, i) => f(String(i), `Field ${i}`));
    const res = await onDeviceFill({ profile: profile(), resume: emptyResume(), page, fields });
    expect(res.mappings).toHaveLength(10);
    expect(calls.filter((c) => c.ids.length <= 3).length).toBeGreaterThan(0);
  });
});

describe("grounding", () => {
  const fields = [f("a", "Current role"), f("b", "Native place"), f("c", "Why join?", "textarea")];
  const res: FillResponse = {
    mappings: [
      { fieldId: "a", value: "software engineer", values: [], source: "profile", confidence: "medium", reasoning: "" },
      { fieldId: "b", value: "Mumbai", values: [], source: "profile", confidence: "medium", reasoning: "" },
      { fieldId: "c", value: "I like it.", values: [], source: "generated", confidence: "medium", reasoning: "" },
    ],
    unmapped: [],
  };
  it("keeps values found in your data and drafts, and returns invented ones to you", () => {
    const out = groundMappings(fields, res, profile(), emptyResume());
    expect(out.mappings.map((m) => m.fieldId)).toEqual(["a", "c"]);
    expect(out.unmapped).toEqual([{ fieldId: "b", reason: "Not found in your profile or resume" }]);
  });
  it("accepts a value that is only in the resume", () => {
    const out = groundMappings(fields, res, profile(), { markdown: "Grew up in Mumbai.", updatedAt: "" });
    expect(out.mappings.map((m) => m.fieldId)).toContain("b");
  });
});
