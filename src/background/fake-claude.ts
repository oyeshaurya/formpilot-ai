/**
 * E2E-ONLY stand-in for api.anthropic.com. Imported only when __FP_E2E__ is true,
 * so production builds tree-shake it away. It answers like the real Messages API
 * (same JSON envelope, structured output in a text block) from simple label rules,
 * and on purpose also tries two things the safety layer must stop: ticking a
 * consent box and guessing a demographic answer.
 */

type Field = { id: string; kind: string; label: string; options?: { value: string; label: string }[] };

function between(text: string, open: string, close: string): string {
  const a = text.indexOf(open);
  const b = text.indexOf(close, a + open.length);
  return a >= 0 && b > a ? text.slice(a + open.length, b).trim() : "";
}

function answer(f: Field, p: Record<string, Record<string, string>>) {
  const L = f.label.toLowerCase();
  const prof = (v: string | undefined, why: string) =>
    v ? { fieldId: f.id, value: v, values: [], source: "profile", confidence: "high", reasoning: `From your profile: ${why}` } : null;
  const pick = (want: RegExp) => f.options?.find((o) => want.test(o.label) || want.test(o.value))?.value;
  if (/first|given/.test(L)) return prof(p.personal?.firstName, "first name");
  if (/last|family|surname/.test(L)) return prof(p.personal?.lastName, "last name");
  if (/e-?mail/.test(L)) return prof(p.personal?.email, "email");
  if (/phone|mobile/.test(L)) return prof(p.personal?.phone, "phone");
  if (/linkedin/.test(L)) return prof(p.links?.linkedin, "LinkedIn");
  if (/city/.test(L)) return prof(p.address?.city, "city");
  // Before "country": "authorized to work in this country?" is a yes/no question.
  if (/authori[sz]ed|right to work/.test(L)) {
    const v = pick(/^yes$/i);
    return v ? { fieldId: f.id, value: v, values: [], source: "profile", confidence: "medium", reasoning: "From your profile: work authorization" } : null;
  }
  if (/country/.test(L)) {
    const v = p.address?.country && pick(new RegExp(p.address.country, "i"));
    return v ? { fieldId: f.id, value: v, values: [], source: "profile", confidence: "medium", reasoning: "From your profile: country" } : null;
  }
  if (/title|role/.test(L) && f.kind !== "textarea") return prof(p.work?.currentTitle, "current title");
  if (/years/.test(L)) return prof(p.work?.yearsExperience, "years of experience");
  if (/skills/.test(L) && f.kind === "checkbox-group") {
    const vals = (f.options ?? []).filter((o) => /typescript|react/i.test(o.label)).map((o) => o.value);
    return { fieldId: f.id, value: "", values: vals, source: "profile", confidence: "medium", reasoning: "From your profile: skills" };
  }
  if (/why|tell us|about/.test(L))
    return {
      fieldId: f.id,
      value: `I build accessible tools for people who fill in forms all day, and your team's focus on careful software is why I applied.`,
      values: [],
      source: "generated",
      confidence: "medium",
      reasoning: "Drafted from your resume and the role description",
    };
  // Deliberately wrong answers the worker's checks must block:
  if (/agree|terms/.test(L)) return { fieldId: f.id, value: "checked", values: [], source: "profile", confidence: "high", reasoning: "Ticked" };
  if (/gender/.test(L)) {
    const v = f.options?.[1]?.value ?? "x";
    return { fieldId: f.id, value: v, values: [], source: "generated", confidence: "low", reasoning: "Guessed" };
  }
  return null;
}

export const fakeFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  await new Promise((r) => setTimeout(r, 600)); // feel like a network call
  if (url.includes("/v1/models/")) {
    return new Response(JSON.stringify({ id: "claude-haiku-5-5", display_name: "Claude Haiku 5.5 (E2E stand-in)", type: "model", created_at: "2026-01-01T00:00:00Z" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  const body = JSON.parse(String(init?.body ?? "{}"));
  const system = (body.system ?? []).map((b: { text: string }) => b.text).join("\n");
  const user = String(body.messages?.[0]?.content ?? "");
  const profile = JSON.parse(between(system, "<profile>", "</profile>") || "{}");
  const fields: Field[] = JSON.parse(between(user, "<fields>", "</fields>") || "[]");
  const mappings = fields.map((f) => answer(f, profile)).filter(Boolean);
  // Leak tripwire for the E2E test: local-only fields (Aadhaar) must never reach the API.
  const leaked = fields.some((f) => /aadhaa?r/i.test(f.label)) || /\d{4}\s?\d{4}\s?\d{4}/.test(user + system);
  const mapped = new Set(mappings.map((m) => m!.fieldId));
  const unmapped = fields.filter((f) => !mapped.has(f.id)).map((f) => ({ fieldId: f.id, reason: "Not in your profile" }));
  if (leaked && fields[0]) unmapped.push({ fieldId: fields[0].id, reason: "LEAK: an Aadhaar field or number reached the API" });
  const out = {
    id: "msg_e2e",
    type: "message",
    role: "assistant",
    model: body.model,
    content: [{ type: "text", text: JSON.stringify({ mappings, unmapped }) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 812, output_tokens: 301, cache_creation_input_tokens: 0, cache_read_input_tokens: 2048 },
  };
  return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
};
