import type { Profile } from "./schema";

/**
 * User-facing checks, run when the user presses Save (never while typing).
 * Returns a map of field path ("personal.email") to a message that names the
 * field and says what to type. Empty fields always pass: everything is optional.
 */
export type FieldErrors = Record<string, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()./-]{6,}$/;
const YEAR = /^(19|20)\d{2}$/;
const NUMBER = /^\d{1,2}(\.\d)?$/;

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Adds https:// to a bare domain so "github.com/me" is accepted and stored as a URL. */
export function normaliseUrl(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
}

export function validateProfile(p: Profile): FieldErrors {
  const e: FieldErrors = {};
  const { personal, links, work, education } = p;

  if (personal.email && !EMAIL.test(personal.email.trim()))
    e["personal.email"] = "Write an email address with an @, like name@example.com.";
  if (personal.phone && !PHONE.test(personal.phone.trim()))
    e["personal.phone"] = "Write the phone number with digits only, optionally starting with +.";
  if (personal.alternatePhone && !PHONE.test(personal.alternatePhone.trim()))
    e["personal.alternatePhone"] = "Write the alternate phone number with digits only, optionally starting with +.";
  if (personal.dateOfBirth) {
    const t = Date.parse(personal.dateOfBirth);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(personal.dateOfBirth) || Number.isNaN(t) || t > Date.now())
      e["personal.dateOfBirth"] = "Pick your date of birth from the calendar.";
  }

  for (const [key, label] of [
    ["linkedin", "LinkedIn"],
    ["github", "GitHub"],
    ["portfolio", "Portfolio"],
    ["website", "Website"],
  ] as const) {
    const v = links[key];
    if (v && !isHttpUrl(normaliseUrl(v))) e[`links.${key}`] = `Write the ${label} address as a web link, like https://…`;
  }

  if (work.yearsExperience && !NUMBER.test(work.yearsExperience.trim()))
    e["work.yearsExperience"] = "Write years of experience as a number, like 4 or 4.5.";
  if (education.graduationYear && !YEAR.test(education.graduationYear.trim()))
    e["education.graduationYear"] = "Write the graduation year as four digits, like 2024.";
  for (const [key, label] of [["class10Year", "Class 10"], ["class12Year", "Class 12"]] as const)
    if (education[key] && !YEAR.test(education[key].trim())) e[`education.${key}`] = `Write the ${label} year as four digits, like 2021.`;

  p.customFacts.forEach((f, i) => {
    if (f.value.trim() && !f.label.trim()) e[`customFacts.${i}.label`] = "Name this fact so FormPilot knows when to use it.";
  });

  return e;
}

/** Trims every string and normalises link fields. Pure: returns a new object. */
export function cleanProfile(p: Profile): Profile {
  const trimAll = <T extends Record<string, unknown>>(o: T): T =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])) as T;
  const links = trimAll(p.links);
  return {
    ...p,
    personal: trimAll(p.personal),
    address: trimAll(p.address),
    links: {
      linkedin: normaliseUrl(links.linkedin),
      github: normaliseUrl(links.github),
      portfolio: normaliseUrl(links.portfolio),
      website: normaliseUrl(links.website),
    },
    work: trimAll(p.work),
    education: trimAll(p.education),
    customFacts: p.customFacts
      .map((f) => ({ ...f, label: f.label.trim(), value: f.value.trim() }))
      .filter((f) => f.label || f.value),
  };
}

/** How complete the profile is, for the Fill view's readiness check. */
export function profileCompleteness(p: Profile): { filled: number; total: number } {
  const core = [
    p.personal.firstName,
    p.personal.lastName,
    p.personal.email,
    p.personal.phone,
    p.address.city,
    p.address.country,
    p.links.linkedin,
    p.work.currentTitle,
    p.work.skills,
    p.education.school,
  ];
  return { filled: core.filter((v) => v.trim() !== "").length, total: core.length };
}

/** Plain-language API key check before any network call. */
export function apiKeyProblem(key: string): string | null {
  const k = key.trim();
  if (!k) return "Paste your Anthropic API key.";
  if (/\s/.test(k)) return "The key has a space in it. Copy it again from the Claude Console.";
  if (!k.startsWith("sk-ant-")) return "Anthropic keys start with sk-ant-. Check you copied the whole key.";
  if (k.startsWith("sk-ant-admin")) return "That is an Admin key. Create a regular API key instead.";
  if (k.length < 40) return "The key looks cut short. Copy it again from the Claude Console.";
  return null;
}
