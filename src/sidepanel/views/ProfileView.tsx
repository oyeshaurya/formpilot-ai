import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Profile } from "../../shared/schema";
import { saveProfile } from "../../shared/storage";
import { cleanProfile, validateProfile, type FieldErrors } from "../../shared/validate";
import { ActionBar, Button, Row, Section, SelectField, StatusLine, TextArea, TextField, type Tone } from "../components/ui";
import { timeAgo } from "../hooks/useVault";

type Group = "personal" | "address" | "links" | "work" | "education";

interface FieldDef {
  group: Group;
  key: string;
  label: string;
  autoComplete?: string;
  type?: string;
  inputMode?: "text" | "email" | "tel" | "url" | "numeric" | "decimal";
  placeholder?: string;
  hint?: string;
  choice?: "yesno";
  multiline?: boolean;
}

const YES_NO = [
  { value: "", label: "Not set" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

/** Layout: each inner array is one row (one or two fields). */
const SECTIONS: { group: Group; title: string; description?: string; rows: FieldDef[][] }[] = [
  {
    group: "personal",
    title: "About you",
    description: "Used for name, contact and sign-up fields.",
    rows: [
      [
        { group: "personal", key: "firstName", label: "First name", autoComplete: "given-name" },
        { group: "personal", key: "lastName", label: "Last name", autoComplete: "family-name" },
      ],
      [
        { group: "personal", key: "preferredName", label: "Preferred name", autoComplete: "nickname" },
        { group: "personal", key: "pronouns", label: "Pronouns", placeholder: "she/her" },
      ],
      [{ group: "personal", key: "email", label: "Email", type: "email", inputMode: "email", autoComplete: "email" }],
      [{ group: "personal", key: "phone", label: "Phone", type: "tel", inputMode: "tel", autoComplete: "tel" }],
    ],
  },
  {
    group: "address",
    title: "Address",
    rows: [
      [{ group: "address", key: "street", label: "Street address", autoComplete: "street-address" }],
      [
        { group: "address", key: "city", label: "City", autoComplete: "address-level2" },
        { group: "address", key: "region", label: "State or region", autoComplete: "address-level1" },
      ],
      [
        { group: "address", key: "postalCode", label: "Postal code", autoComplete: "postal-code" },
        { group: "address", key: "country", label: "Country", autoComplete: "country-name" },
      ],
    ],
  },
  {
    group: "links",
    title: "Links",
    description: "A bare address like github.com/you is fine; https:// is added on save.",
    rows: [
      [{ group: "links", key: "linkedin", label: "LinkedIn", type: "url", inputMode: "url", placeholder: "linkedin.com/in/you" }],
      [{ group: "links", key: "github", label: "GitHub", type: "url", inputMode: "url", placeholder: "github.com/you" }],
      [{ group: "links", key: "portfolio", label: "Portfolio", type: "url", inputMode: "url" }],
      [{ group: "links", key: "website", label: "Website", type: "url", inputMode: "url", autoComplete: "url" }],
    ],
  },
  {
    group: "work",
    title: "Work",
    rows: [
      [
        { group: "work", key: "currentTitle", label: "Current title", autoComplete: "organization-title" },
        { group: "work", key: "currentCompany", label: "Current company", autoComplete: "organization" },
      ],
      [
        { group: "work", key: "yearsExperience", label: "Years of experience", inputMode: "decimal" },
        { group: "work", key: "noticePeriod", label: "Notice period", placeholder: "4 weeks" },
      ],
      [{ group: "work", key: "skills", label: "Skills", multiline: true, hint: "Comma-separated, most relevant first." }],
      [{ group: "work", key: "workAuthorization", label: "Work authorization", placeholder: "US citizen, EU work permit…" }],
      [
        { group: "work", key: "needsSponsorship", label: "Needs visa sponsorship", choice: "yesno" },
        { group: "work", key: "willingToRelocate", label: "Willing to relocate", choice: "yesno" },
      ],
      [
        {
          group: "work",
          key: "salaryExpectation",
          label: "Salary expectation",
          placeholder: "$120k–140k",
          hint: "Only used when a form asks for it.",
        },
      ],
    ],
  },
  {
    group: "education",
    title: "Education",
    description: "Your highest or most relevant degree. Add others in your resume.",
    rows: [
      [{ group: "education", key: "school", label: "School or university" }],
      [
        { group: "education", key: "degree", label: "Degree", placeholder: "BSc" },
        { group: "education", key: "fieldOfStudy", label: "Field of study" },
      ],
      [{ group: "education", key: "graduationYear", label: "Graduation year", inputMode: "numeric", placeholder: "2024" }],
    ],
  },
];

const fieldDomId = (path: string) => `f-${path.replace(/\./g, "-")}`;

export function ProfileView({ saved, onDirtyChange }: { saved: Profile; onDirtyChange: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState<Profile>(saved);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<{ tone: Tone; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  // Adopt outside changes (import, wipe, another window) unless the user had edited
  // the draft. Compare against the snapshot the draft started from, not the new value.
  const baseRef = useRef(saved);
  useEffect(() => {
    const base = JSON.stringify(baseRef.current);
    baseRef.current = saved;
    setDraft((d) => (JSON.stringify(d) === base ? saved : d));
  }, [saved]);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const edit = (fn: (d: Profile) => Profile) => {
    setDraft(fn);
    if (status?.tone !== "danger") setStatus(null);
  };
  const clearError = (path: string) =>
    setErrors((e) => {
      if (!(path in e)) return e;
      const { [path]: _gone, ...rest } = e;
      return rest;
    });
  const setField = (group: Group, key: string, value: string) => {
    clearError(`${group}.${key}`);
    edit((d) => ({ ...d, [group]: { ...d[group], [key]: value } }));
  };

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const cleaned = cleanProfile(draft);
    const errs = validateProfile(cleaned);
    setErrors(errs);
    const bad = Object.keys(errs);
    if (bad.length) {
      setStatus({ tone: "danger", text: bad.length === 1 ? "1 field needs a fix." : `${bad.length} fields need a fix.` });
      document.getElementById(fieldDomId(bad[0]!))?.focus();
      return;
    }
    setSaving(true);
    try {
      const next = await saveProfile(cleaned);
      setDraft(next);
      setStatus({ tone: "ok", text: "Profile saved on this device." });
    } catch {
      setStatus({ tone: "danger", text: "Could not save. Your changes are still here; try again." });
    } finally {
      setSaving(false);
    }
  }

  const addFact = () =>
    edit((d) => ({ ...d, customFacts: [...d.customFacts, { id: crypto.randomUUID().slice(0, 8), label: "", value: "" }] }));
  const setFact = (id: string, patch: Partial<{ label: string; value: string }>) =>
    edit((d) => ({ ...d, customFacts: d.customFacts.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  const removeFact = (id: string) => edit((d) => ({ ...d, customFacts: d.customFacts.filter((f) => f.id !== id) }));

  const statusLine: { tone: Tone; text: string } =
    status ??
    (dirty
      ? { tone: "warn", text: "Unsaved changes" }
      : saved.updatedAt
        ? { tone: "neutral", text: `Saved ${timeAgo(saved.updatedAt)}` }
        : { tone: "neutral", text: "Nothing saved yet" });

  return (
    <form onSubmit={onSave} noValidate aria-labelledby="profile-title">
      <div className="px-4 pt-5">
        <h1 id="profile-title" className="text-[28px] leading-[1.1]">
          Your profile
        </h1>
        <p className="mt-2 text-[16px] text-ink">Everything is optional. Fill in what forms usually ask you.</p>
      </div>
      {SECTIONS.map((section) => (
        <Section key={section.group} title={section.title} description={section.description}>
          {section.rows.map((row, i) => {
            const fields = row.map((f) => {
              const path = `${f.group}.${f.key}`;
              const value = (draft[f.group] as Record<string, string>)[f.key] ?? "";
              if (f.choice === "yesno")
                return (
                  <SelectField
                    key={path}
                    id={fieldDomId(path)}
                    label={f.label}
                    value={value}
                    options={YES_NO}
                    onChange={(v) => setField(f.group, f.key, v)}
                  />
                );
              if (f.multiline)
                return (
                  <TextArea
                    key={path}
                    id={fieldDomId(path)}
                    label={f.label}
                    value={value}
                    hint={f.hint}
                    rows={3}
                    error={errors[path]}
                    onChange={(v) => setField(f.group, f.key, v)}
                  />
                );
              return (
                <TextField
                  key={path}
                  id={fieldDomId(path)}
                  name={path}
                  label={f.label}
                  value={value}
                  type={f.type ?? "text"}
                  inputMode={f.inputMode}
                  autoComplete={f.autoComplete ?? "off"}
                  placeholder={f.placeholder}
                  hint={f.hint}
                  error={errors[path]}
                  onChange={(v) => setField(f.group, f.key, v)}
                />
              );
            });
            return fields.length > 1 ? <Row key={i}>{fields}</Row> : fields[0];
          })}
        </Section>
      ))}

      <Section
        title="Other facts"
        description="Anything forms ask that is not above: T-shirt size, dietary needs, how you heard about the role."
      >
        {draft.customFacts.length === 0 && <p className="text-[16px] text-muted">No extra facts yet.</p>}
        {draft.customFacts.map((f, i) => (
          <fieldset key={f.id} className="fp-inset grid gap-3 p-4">
            <legend className="sr-only">Fact {i + 1}</legend>
            <TextField
              id={fieldDomId(`customFacts.${i}.label`)}
              label="Question or topic"
              value={f.label}
              placeholder="T-shirt size"
              error={errors[`customFacts.${i}.label`]}
              onChange={(v) => {
                clearError(`customFacts.${i}.label`);
                setFact(f.id, { label: v });
              }}
            />
            <TextField label="Answer" value={f.value} placeholder="M" onChange={(v) => setFact(f.id, { value: v })} />
            <div>
              <button type="button" className="fp-link min-h-11 text-left text-[14px] [overflow-wrap:anywhere]" onClick={() => removeFact(f.id)}>
                Remove{f.label ? ` “${f.label}”` : " this fact"}
              </button>
            </div>
          </fieldset>
        ))}
        <div>
          <Button onClick={addFact} disabled={draft.customFacts.length >= 50}>
            Add a fact
          </Button>
        </div>
      </Section>

      <ActionBar status={<StatusLine tone={statusLine.tone}>{statusLine.text}</StatusLine>}>
        <button type="submit" className="fp-btn fp-btn--primary" disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </ActionBar>
    </form>
  );
}
