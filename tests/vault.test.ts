import { beforeEach, describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { installChromeMock } from "../dev/chrome-mock";
import { FillResponseSchema, ProfileSchema, SettingsSchema, VaultExportSchema, emptyProfile } from "../src/shared/schema";
import {
  KEYS,
  clearApiKey,
  getApiKey,
  getProfile,
  getSettings,
  migrate,
  saveProfile,
  saveResume,
  setApiKey,
  wipeAll,
} from "../src/shared/storage";
import { apiKeyProblem, cleanProfile, normaliseUrl, profileCompleteness, validateProfile } from "../src/shared/validate";
import { timeAgo } from "../src/sidepanel/hooks/useVault";
import { countWords, estimateTokens } from "../src/sidepanel/views/ResumeView";

const GOOD_KEY = "sk-ant-api03-" + "a".repeat(80);

describe("schemas", () => {
  it("parses an empty object into a full, empty profile", () => {
    const p = ProfileSchema.parse({});
    expect(p.personal.firstName).toBe("");
    expect(p.customFacts).toEqual([]);
    expect(p.work.needsSponsorship).toBe("");
  });

  it("fills in missing groups of an older, partial record", () => {
    const p = ProfileSchema.parse({ personal: { firstName: "Ada" } });
    expect(p.personal.firstName).toBe("Ada");
    expect(p.personal.email).toBe("");
    expect(p.education.school).toBe("");
  });

  it("defaults settings to auto model, session key storage, highlights on, BYOK", () => {
    expect(SettingsSchema.parse({})).toEqual({
      model: "auto",
      keyStorage: "session",
      highlightFields: true,
      connection: { mode: "byok" },
    });
  });

  it("rejects an export that is not a FormPilot vault", () => {
    expect(VaultExportSchema.safeParse({ hello: 1 }).success).toBe(false);
  });

  it("turns FillResponse into a structured-output schema Claude accepts", () => {
    const format = zodOutputFormat(FillResponseSchema) as unknown as { type: string; schema: Record<string, unknown> };
    expect(format.type).toBe("json_schema");
    const s = JSON.stringify(format.schema);
    // Every object closed, no numeric or length constraints (structured-output rules).
    expect(s).not.toMatch(/"minimum"|"maximum"|"minLength"|"maxLength"/);
    const objects = s.match(/"type":"object"/g)?.length ?? 0;
    const closed = s.match(/"additionalProperties":false/g)?.length ?? 0;
    expect(objects).toBeGreaterThan(0);
    expect(closed).toBe(objects);
  });

  it("parses a well-formed Claude answer", () => {
    const ok = FillResponseSchema.safeParse({
      mappings: [
        { fieldId: "fp-1", value: "Ada", values: [], source: "profile", confidence: "high", reasoning: "First name." },
      ],
      unmapped: [{ fieldId: "fp-2", reason: "Not in your profile." }],
    });
    expect(ok.success).toBe(true);
  });
});

describe("validation", () => {
  it("passes an empty profile: everything is optional", () => {
    expect(validateProfile(emptyProfile())).toEqual({});
  });

  it("flags a bad email, phone, year and years of experience with plain messages", () => {
    const p = emptyProfile();
    p.personal.email = "ada.example.com";
    p.personal.phone = "call me";
    p.education.graduationYear = "24";
    p.work.yearsExperience = "five";
    const e = validateProfile(p);
    expect(Object.keys(e).sort()).toEqual(["education.graduationYear", "personal.email", "personal.phone", "work.yearsExperience"]);
    expect(e["personal.email"]).toMatch(/@/);
  });

  it("accepts bare domains for links and adds https:// when cleaning", () => {
    const p = emptyProfile();
    p.links.github = "  github.com/ada ";
    expect(validateProfile(cleanProfile(p))).toEqual({});
    expect(cleanProfile(p).links.github).toBe("https://github.com/ada");
    expect(normaliseUrl("http://x.dev")).toBe("http://x.dev");
  });

  it("rejects non-web links", () => {
    const p = emptyProfile();
    p.links.website = "javascript:alert(1)";
    expect(validateProfile(cleanProfile(p))["links.website"]).toBeDefined();
  });

  it("asks for a label on a custom fact that has an answer, and drops empty facts", () => {
    const p = emptyProfile();
    p.customFacts = [
      { id: "a", label: "", value: "M" },
      { id: "b", label: "", value: "" },
    ];
    expect(validateProfile(p)["customFacts.0.label"]).toBeDefined();
    expect(cleanProfile(p).customFacts).toHaveLength(1);
  });

  it("counts completeness over ten key fields", () => {
    const p = emptyProfile();
    p.personal.firstName = "Ada";
    p.personal.email = "ada@example.com";
    expect(profileCompleteness(p)).toEqual({ filled: 2, total: 10 });
  });

  it("explains what is wrong with an API key", () => {
    expect(apiKeyProblem("")).toMatch(/Paste/);
    expect(apiKeyProblem("sk-proj-123")).toMatch(/sk-ant-/);
    expect(apiKeyProblem("sk-ant-admin01-" + "a".repeat(60))).toMatch(/Admin/);
    expect(apiKeyProblem("sk-ant-api03-abc")).toMatch(/cut short/);
    expect(apiKeyProblem("sk-ant- api03" + "a".repeat(60))).toMatch(/space/);
    expect(apiKeyProblem(GOOD_KEY)).toBeNull();
  });
});

describe("storage", () => {
  let areas: ReturnType<typeof installChromeMock>;
  beforeEach(() => {
    areas = installChromeMock();
  });

  it("round-trips the profile and stamps updatedAt", async () => {
    const p = emptyProfile();
    p.personal.firstName = "Ada";
    await saveProfile(p);
    const got = await getProfile();
    expect(got.personal.firstName).toBe("Ada");
    expect(Date.parse(got.updatedAt)).not.toBeNaN();
  });

  it("falls back to defaults when a stored record is corrupted", async () => {
    areas.local[KEYS.settings] = { model: "gpt-9000", keyStorage: 42 };
    expect((await getSettings()).model).toBe("auto");
  });

  it("keeps the API key in exactly one area and moves it on request", async () => {
    await setApiKey(GOOD_KEY, "session");
    expect(areas.session[KEYS.apiKey]).toBe(GOOD_KEY);
    expect(areas.local[KEYS.apiKey]).toBeUndefined();
    await setApiKey(GOOD_KEY, "local");
    expect(areas.local[KEYS.apiKey]).toBe(GOOD_KEY);
    expect(areas.session[KEYS.apiKey]).toBeUndefined();
    expect(await getApiKey()).toBe(GOOD_KEY);
    await clearApiKey();
    expect(await getApiKey()).toBe("");
  });

  it("never writes the API key into settings, profile or resume", async () => {
    await setApiKey(GOOD_KEY, "local");
    await saveProfile(emptyProfile());
    await saveResume("# Ada");
    const blob = JSON.stringify({ ...areas.local, [KEYS.apiKey]: undefined });
    expect(blob).not.toContain(GOOD_KEY);
  });

  it("stamps the schema version once and wipes everything on request", async () => {
    await migrate();
    expect(areas.local[KEYS.meta]).toEqual({ schemaVersion: 1 });
    await setApiKey(GOOD_KEY, "session");
    await saveResume("# Ada");
    await wipeAll();
    expect(Object.keys(areas.local)).toEqual([KEYS.meta]);
    expect(Object.keys(areas.session)).toEqual([]);
  });
});

describe("small helpers", () => {
  it("formats relative times", () => {
    const now = Date.parse("2026-11-23T12:00:00Z");
    expect(timeAgo("2026-11-23T11:59:50Z", now)).toBe("just now");
    expect(timeAgo("2026-11-23T11:56:00Z", now)).toBe("4 min ago");
    expect(timeAgo("2026-11-22T10:00:00Z", now)).toBe("yesterday");
    expect(timeAgo("", now)).toBe("");
  });

  it("counts words and estimates tokens", () => {
    expect(countWords("  one two\nthree ")).toBe(3);
    expect(countWords("")).toBe(0);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });
});
