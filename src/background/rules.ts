import type { FieldMapping, FillResponse, Profile } from "../shared/schema";
import type { RequestField } from "./prompt";

/**
 * Basic mode: a free, offline fill with no AI. Maps fields to the profile with
 * the page's own autofill hints first, then label rules, then the person's
 * "Other facts". It never drafts text: open questions are left for the person
 * unless a saved fact answers them. Output has the same shape as Claude's, so
 * the same checks (mappings.ts), filling and review list apply.
 */

type Get = (p: Profile) => string;

const full = (p: Profile) => [p.personal.firstName, p.personal.lastName].filter(Boolean).join(" ");

/** autocomplete tokens (https://html.spec.whatwg.org/#autofill-field) → profile value */
const AUTOCOMPLETE: Record<string, [Get, string]> = {
  "given-name": [(p) => p.personal.firstName, "first name"],
  "family-name": [(p) => p.personal.lastName, "last name"],
  name: [full, "full name"],
  nickname: [(p) => p.personal.preferredName, "preferred name"],
  email: [(p) => p.personal.email, "email"],
  tel: [(p) => p.personal.phone, "phone"],
  "tel-national": [(p) => p.personal.phone, "phone"],
  "street-address": [(p) => p.address.street, "street address"],
  "address-line1": [(p) => p.address.street, "street address"],
  "address-level2": [(p) => p.address.city, "city"],
  "address-level1": [(p) => p.address.region, "state or region"],
  "postal-code": [(p) => p.address.postalCode, "postal code"],
  "country-name": [(p) => p.address.country, "country"],
  country: [(p) => p.address.country, "country"],
  organization: [(p) => p.work.currentCompany, "current company"],
  "organization-title": [(p) => p.work.currentTitle, "current title"],
  url: [(p) => p.links.website || p.links.portfolio, "website"],
};

/** Label rules, most specific first. */
const LABELS: [RegExp, Get, string][] = [
  [/\b(first|given|fore)\s*name\b/i, (p) => p.personal.firstName, "first name"],
  [/\b(last|family|sur)\s*name\b|\bsurname\b/i, (p) => p.personal.lastName, "last name"],
  [/\b(preferred|nick)\s*name\b|\bgo by\b/i, (p) => p.personal.preferredName || p.personal.firstName, "preferred name"],
  [/\bpronouns?\b/i, (p) => p.personal.pronouns, "pronouns"],
  [/\b(full\s*)?name\b/i, full, "full name"],
  [/\be-?mail\b/i, (p) => p.personal.email, "email"],
  [/\b(phone|mobile|cell|telephone|contact number|whatsapp)\b/i, (p) => p.personal.phone, "phone"],
  [/\blinked\s*in\b/i, (p) => p.links.linkedin, "LinkedIn"],
  [/\bgit\s*hub\b/i, (p) => p.links.github, "GitHub"],
  [/\bportfolio\b/i, (p) => p.links.portfolio || p.links.website, "portfolio"],
  [/\b(personal\s*)?(website|homepage|blog|url)\b/i, (p) => p.links.website || p.links.portfolio, "website"],
  [/\b(street|address line|address 1|mailing address)\b|^address$/i, (p) => p.address.street, "street address"],
  [/\b(city|town|locality)\b/i, (p) => p.address.city, "city"],
  [/\b(state|province|region|county)\b/i, (p) => p.address.region, "state or region"],
  [/\b(zip|postal|post)\s*code\b|\bpostcode\b|\bpin\s*code\b/i, (p) => p.address.postalCode, "postal code"],
  [/\bcountry\b/i, (p) => p.address.country, "country"],
  [/\b(current|present|most recent)?\s*(job\s*)?(title|position|designation|role)\b/i, (p) => p.work.currentTitle, "current title"],
  [/\b(current|present|most recent)?\s*(company|employer|organi[sz]ation)\b/i, (p) => p.work.currentCompany, "current company"],
  [/\byears\b.*\bexperience\b|\bexperience\b.*\byears\b|\byoe\b/i, (p) => p.work.yearsExperience, "years of experience"],
  [/\bnotice\s*period\b|\bavailable to start\b/i, (p) => p.work.noticePeriod, "notice period"],
  [/\b(salary|compensation|ctc|pay)\b.*\b(expect|desired)|\b(expected|desired)\s*(salary|compensation|ctc)\b/i, (p) => p.work.salaryExpectation, "salary expectation"],
  [/\bskills?\b/i, (p) => p.work.skills, "skills"],
  [/\b(school|university|college|institution|alma mater)\b/i, (p) => p.education.school, "school"],
  [/\b(field of study|major|discipline|speciali[sz]ation)\b/i, (p) => p.education.fieldOfStudy, "field of study"],
  [/\bdegree\b|\bqualification\b/i, (p) => p.education.degree, "degree"],
  [/\bgraduat(ion|ed|e)\b.*\b(year|date)\b|\byear of (graduation|passing)\b/i, (p) => p.education.graduationYear, "graduation year"],
];

/** Yes/no questions answered by profile flags. */
const YES_NO: [RegExp, (p: Profile) => "yes" | "no" | "", string][] = [
  [/\bsponsor/i, (p) => p.work.needsSponsorship, "visa sponsorship"],
  [/\b(willing|open|able)\b.*\brelocat/i, (p) => p.work.willingToRelocate, "relocation"],
];

/** Fields that look like ours but ask about someone or somewhere else. */
const NOT_ABOUT_YOU =
  /\b(emergency|reference|referee|referr\w*|spouse|partner'?s|parent|guardian|father|mother|manager|supervisor|recruiter|billing|shipping|card ?holder)\b/i;
const NOT_RESIDENCE = /\b(birth|citizen\w*|nationality|passport|issu\w*|origin)\b/i;

const STOP = new Set(["the", "you", "your", "are", "for", "and", "what", "how", "with", "this", "that", "please", "our", "have", "why", "who", "did", "does"]);
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );

/** How well a saved fact's question matches a field label (0..1). */
export function factScore(factLabel: string, fieldLabel: string): number {
  const f = factLabel.toLowerCase().trim();
  if (f && fieldLabel.toLowerCase().includes(f)) return 1;
  const a = words(factLabel);
  const b = words(fieldLabel);
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / Math.max(a.size, Math.min(b.size, a.size + 2));
}

function pickOption(field: RequestField, value: string): string | null {
  const opts = field.options ?? [];
  const v = value.toLowerCase().trim();
  if (!v) return null;
  const hit =
    opts.find((o) => o.value.toLowerCase() === v || o.label.toLowerCase().trim() === v) ||
    opts.find((o) => o.label.toLowerCase().trim().startsWith(v) || v.startsWith(o.label.toLowerCase().trim())) ||
    opts.find((o) => o.label.toLowerCase().includes(v));
  return hit ? hit.value : null;
}

const isOpenQuestion = (f: RequestField) => f.kind === "textarea" || f.kind === "contenteditable" || /\?/.test(f.label);

export function ruleFill(profile: Profile, fields: RequestField[]): FillResponse {
  const mappings: FieldMapping[] = [];
  const unmapped: FillResponse["unmapped"] = [];
  const map = (f: RequestField, value: string, confidence: FieldMapping["confidence"], why: string) =>
    mappings.push({ fieldId: f.id, value, values: [], source: "profile", confidence, reasoning: `From your profile: ${why}` });

  for (const f of fields) {
    const label = f.label.trim() || (f.placeholder ?? "");
    const about = `${label} ${f.name ?? ""}`;

    // 1 · a saved answer whose question matches: the only way Basic mode answers open questions
    const fact = profile.customFacts
      .filter((x) => x.label.trim() && x.value.trim())
      .map((x) => ({ x, score: factScore(x.label, label) }))
      .sort((a, b) => b.score - a.score)[0];
    if (fact && fact.score >= 0.6) {
      const v = f.options?.length ? pickOption(f, fact.x.value) : fact.x.value;
      if (v) {
        mappings.push({
          fieldId: f.id,
          value: v,
          values: [],
          source: "profile",
          confidence: fact.score === 1 ? "high" : "medium",
          reasoning: f.localOnly ? `From your saved answer: ${fact.x.label} (filled on this device, never sent)` : `From your saved answer: ${fact.x.label}`,
        });
        continue;
      }
    }

    // Local-only IDs (Aadhaar) come only from a saved fact: never from rules or a guess.
    if (f.localOnly) {
      unmapped.push({ fieldId: f.id, reason: "Save your Aadhaar number in Profile → Other facts to fill it" });
      continue;
    }

    if (NOT_ABOUT_YOU.test(about)) {
      unmapped.push({ fieldId: f.id, reason: "About someone else: fill it yourself" });
      continue;
    }

    // 2 · checkbox groups and multi-selects of skills
    if ((f.kind === "checkbox-group" || f.kind === "multiselect") && /\b(skills?|technolog\w*|languages?|tools?)\b/i.test(label)) {
      const mine = profile.work.skills.split(/[,;\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
      const values = (f.options ?? []).filter((o) => mine.includes(o.label.toLowerCase().trim())).map((o) => o.value);
      if (values.length) mappings.push({ fieldId: f.id, value: "", values, source: "profile", confidence: "medium", reasoning: "From your profile: skills" });
      else unmapped.push({ fieldId: f.id, reason: "None of your skills are listed here" });
      continue;
    }

    // 3 · yes/no questions the profile answers
    const yn = YES_NO.find(([re]) => re.test(label));
    if (yn) {
      const answer = yn[1](profile);
      const v = answer && (f.options?.length ? pickOption(f, answer) : answer === "yes" ? "Yes" : "No");
      if (v) map(f, v, "high", yn[2]);
      else unmapped.push({ fieldId: f.id, reason: `Not in your profile: ${yn[2]}` });
      continue;
    }

    // Open questions with no saved answer: Basic mode never writes text.
    if (isOpenQuestion(f) && f.kind !== "select" && f.kind !== "radio-group") {
      unmapped.push({ fieldId: f.id, reason: "Basic mode does not write answers. Write it yourself, or save one in Profile → Other facts." });
      continue;
    }

    // 4 · the page's autofill hint, then label rules
    const token = (f.autocomplete ?? "").toLowerCase().split(/\s+/).find((t) => t in AUTOCOMPLETE);
    let hit: [Get, string] | undefined = token ? AUTOCOMPLETE[token] : undefined;
    let confidence: FieldMapping["confidence"] = "high";
    if (!hit) {
      const rule = LABELS.find(([re]) => re.test(label));
      if (rule) {
        hit = [rule[1], rule[2]];
        confidence = "medium";
      }
    }
    if (hit && hit[1] === "country" && NOT_RESIDENCE.test(label)) hit = undefined;

    if (!hit) {
      unmapped.push({ fieldId: f.id, reason: "No match in your profile" });
      continue;
    }
    const raw = hit[0](profile).trim();
    if (!raw) {
      unmapped.push({ fieldId: f.id, reason: `Not in your profile: ${hit[1]}` });
      continue;
    }
    if (f.options?.length) {
      const v = pickOption(f, raw);
      if (v) map(f, v, "medium", hit[1]);
      else unmapped.push({ fieldId: f.id, reason: `Your ${hit[1]} “${raw}” is not one of the options` });
      continue;
    }
    map(f, f.kind === "number" ? raw.replace(/[^\d.]/g, "") : raw, confidence, hit[1]);
  }
  return { mappings, unmapped };
}
