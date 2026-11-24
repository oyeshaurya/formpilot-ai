import type { FieldMapping, FillResponse } from "../shared/schema";
import type { RequestField } from "./prompt";

/**
 * Trust nothing the model returns until it is checked against what was sent.
 * Pure function: unit-tested in tests/pipeline.test.ts.
 */

const CONSENT = /\b(i agree|agree to|consent|terms|privacy (policy|notice)|certify|acknowledge|accept the|subscribe|newsletter|marketing|opt[- ]?in|signature)\b/i;
const DEMOGRAPHIC = /\b(gender|sex\b|race|ethnic|hispanic|latino|disabilit|veteran|sexual orientation|transgender|date of birth|age\b|religio)/i;

export interface CheckedMappings {
  accepted: FieldMapping[];
  unmapped: { fieldId: string; reason: string }[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function matchOption(field: RequestField, wanted: string): string | null {
  const opts = field.options ?? [];
  const w = norm(wanted);
  const hit =
    opts.find((o) => o.value === wanted) || opts.find((o) => norm(o.value) === w) || opts.find((o) => norm(o.label) === w);
  return hit ? hit.value : null;
}

export function checkMappings(fields: RequestField[], response: FillResponse): CheckedMappings {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const accepted: FieldMapping[] = [];
  const unmapped: CheckedMappings["unmapped"] = [];
  const seen = new Set<string>();

  for (const m of response.mappings) {
    const f = byId.get(m.fieldId);
    if (!f || seen.has(m.fieldId)) continue; // unknown or duplicate id: drop silently
    seen.add(m.fieldId);
    const label = `${f.label} ${f.description ?? ""}`;

    if ((f.kind === "checkbox" || f.kind === "checkbox-group") && CONSENT.test(label)) {
      unmapped.push({ fieldId: f.id, reason: "Needs your own decision" });
      continue;
    }
    if (DEMOGRAPHIC.test(label) && m.source === "generated") {
      unmapped.push({ fieldId: f.id, reason: "Personal question: answer it yourself" });
      continue;
    }

    let { value, values } = m;
    if ((f.kind === "select" || f.kind === "radio-group") && f.options?.length) {
      const v = matchOption(f, value);
      if (v === null) {
        unmapped.push({ fieldId: f.id, reason: `“${value.slice(0, 60)}” is not one of the options` });
        continue;
      }
      value = v;
    }
    if ((f.kind === "multiselect" || f.kind === "checkbox-group") && f.options?.length) {
      const wanted = values.length ? values : value.split(/\s*,\s*/).filter(Boolean);
      values = wanted.map((w) => matchOption(f, w)).filter((v): v is string => v !== null);
      if (!values.length) {
        unmapped.push({ fieldId: f.id, reason: "None of the suggested choices are options here" });
        continue;
      }
      value = "";
    }
    if (f.kind === "checkbox") {
      if (/^(checked|true|yes)$/i.test(value)) value = "checked";
      else if (/^(unchecked|false|no)$/i.test(value)) value = "unchecked";
      else {
        unmapped.push({ fieldId: f.id, reason: "Unclear whether to tick this box" });
        continue;
      }
    }
    if (!value && !values.length) {
      unmapped.push({ fieldId: f.id, reason: m.reasoning || "No value" });
      continue;
    }
    if (f.maxLength && value.length > f.maxLength) value = value.slice(0, f.maxLength);
    // Drafts are never "high": the person must read them.
    const confidence = m.source === "generated" && m.confidence === "high" ? "medium" : m.confidence;
    accepted.push({ ...m, value, values, confidence });
  }

  for (const u of response.unmapped) {
    if (byId.has(u.fieldId) && !seen.has(u.fieldId)) {
      seen.add(u.fieldId);
      unmapped.push(u);
    }
  }
  // Fields the model skipped without a word.
  for (const f of fields) if (!seen.has(f.id)) unmapped.push({ fieldId: f.id, reason: "Not answered" });
  return { accepted, unmapped };
}
