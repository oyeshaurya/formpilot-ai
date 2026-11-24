import { z } from "zod";

/**
 * Single source of truth for every shape FormPilot stores or sends.
 * Storage schemas are lenient (strings default to ""), so an old or partial
 * record always loads; user-facing rules live in ./validate.ts.
 * Shapes are documented in docs/SCHEMAS.md.
 */

const str = (max = 500) => z.string().max(max).default("");
const yesNo = z.enum(["yes", "no", ""]).default("");

export const PersonalSchema = z.object({
  firstName: str(100),
  middleName: str(100),
  lastName: str(100),
  preferredName: str(100),
  pronouns: str(40),
  /** YYYY-MM-DD */
  dateOfBirth: str(10),
  gender: str(40),
  nationality: str(100),
  email: str(254),
  phone: str(40),
  alternatePhone: str(40),
  fatherName: str(150),
  motherName: str(150),
});

export const AddressSchema = z.object({
  street: str(200),
  city: str(100),
  district: str(100),
  region: str(100),
  postalCode: str(20),
  country: str(100),
});

export const LinksSchema = z.object({
  linkedin: str(300),
  github: str(300),
  portfolio: str(300),
  website: str(300),
});

export const WorkSchema = z.object({
  currentTitle: str(150),
  currentCompany: str(150),
  yearsExperience: str(10),
  skills: str(1000),
  workAuthorization: str(200),
  needsSponsorship: yesNo,
  noticePeriod: str(100),
  salaryExpectation: str(100),
  willingToRelocate: yesNo,
});

export const EducationSchema = z.object({
  school: str(200),
  degree: str(150),
  fieldOfStudy: str(150),
  graduationYear: str(10),
  highestQualification: str(100),
  /** CGPA or percentage, as the person writes it: "8.9 / 10", "86%". */
  grade: str(40),
  /** School (Class 10 and 12), asked by most Indian applications. */
  schoolName: str(200),
  class10Board: str(100),
  class10Year: str(10),
  class10Score: str(40),
  class12Board: str(100),
  class12Year: str(10),
  class12Score: str(40),
});

export const CustomFactSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().max(100),
  value: z.string().max(1000),
});

export const ProfileSchema = z.object({
  personal: PersonalSchema.default(() => PersonalSchema.parse({})),
  address: AddressSchema.default(() => AddressSchema.parse({})),
  links: LinksSchema.default(() => LinksSchema.parse({})),
  work: WorkSchema.default(() => WorkSchema.parse({})),
  education: EducationSchema.default(() => EducationSchema.parse({})),
  customFacts: z.array(CustomFactSchema).max(50).default([]),
  updatedAt: z.string().default(""),
});
export type Profile = z.infer<typeof ProfileSchema>;
export type CustomFact = z.infer<typeof CustomFactSchema>;

export const RESUME_MAX_CHARS = 60_000;
export const ResumeSchema = z.object({
  markdown: z.string().max(RESUME_MAX_CHARS).default(""),
  updatedAt: z.string().default(""),
});
export type Resume = z.infer<typeof ResumeSchema>;

export const ModelChoiceSchema = z.enum(["auto", "basic", "on-device", "fast", "balanced", "best", "sonnet-4-6"]);
export type ModelChoice = z.infer<typeof ModelChoiceSchema>;

export const SettingsSchema = z.object({
  model: ModelChoiceSchema.default("auto"),
  /** "local": key survives restarts. "session": key is forgotten when the browser closes. */
  keyStorage: z.enum(["local", "session"]).default("session"),
  highlightFields: z.boolean().default(true),
  /** Connection mode. Only BYOK ships in v1; "proxy" is reserved for a team backend. */
  connection: z
    .discriminatedUnion("mode", [
      z.object({ mode: z.literal("byok") }),
      z.object({ mode: z.literal("proxy"), baseUrl: z.url() }),
    ])
    .default({ mode: "byok" }),
});
export type Settings = z.infer<typeof SettingsSchema>;

/** Full-vault export format (no API key, ever). */
export const VaultExportSchema = z.object({
  format: z.literal("formpilot-vault"),
  version: z.literal(1),
  exportedAt: z.string(),
  profile: ProfileSchema,
  resume: ResumeSchema,
});
export type VaultExport = z.infer<typeof VaultExportSchema>;

/* ───────────────────────── Page side (Milestone 2) ───────────────────────── */

export const FieldKindSchema = z.enum([
  "text",
  "email",
  "tel",
  "url",
  "number",
  "date",
  "textarea",
  "select",
  "multiselect",
  "radio-group",
  "checkbox",
  "checkbox-group",
  "combobox",
  "contenteditable",
]);
export type FieldKind = z.infer<typeof FieldKindSchema>;

export const FieldOptionSchema = z.object({ value: z.string(), label: z.string() });

export const FieldDescriptorSchema = z.object({
  id: z.string(),
  kind: FieldKindSchema,
  label: z.string(),
  section: z.string().optional(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  name: z.string().optional(),
  autocomplete: z.string().optional(),
  required: z.boolean(),
  maxLength: z.number().int().optional(),
  options: z.array(FieldOptionSchema).optional(),
  currentValue: z.string().optional(),
  /** Filled only from a saved fact, on this device; never sent to Claude (Aadhaar). */
  localOnly: z.boolean().optional(),
});
export type FieldDescriptor = z.infer<typeof FieldDescriptorSchema>;

export const PageContextSchema = z.object({
  url: z.string(),
  title: z.string(),
  headings: z.array(z.string()),
  description: z.string().optional(),
  lang: z.string().optional(),
  /** Visible page text outside the form (the job or program description), trimmed to 4,000 characters. */
  excerpt: z.string().optional(),
});
export type PageContext = z.infer<typeof PageContextSchema>;

export const ExtractResultSchema = z.object({
  page: PageContextSchema,
  fields: z.array(FieldDescriptorSchema),
  skipped: z.object({
    sensitive: z.number(),
    hidden: z.number(),
    disabled: z.number(),
    overflow: z.number(),
  }),
});
export type ExtractResult = z.infer<typeof ExtractResultSchema>;

/* ─────────────────────── Claude structured output (Milestone 3) ─────────────────────── */

export const FieldMappingSchema = z.object({
  fieldId: z.string(),
  value: z.string().describe("Text to write, or the chosen option's value. Empty for multi-choice fields."),
  values: z
    .array(z.string())
    .describe("Option values for checkbox-group and multiselect fields; otherwise an empty array."),
  source: z
    .enum(["profile", "generated"])
    .describe("profile: copied or reformatted from the user's data. generated: drafted text."),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string().describe("One short sentence the user sees in the review list."),
});
export type FieldMapping = z.infer<typeof FieldMappingSchema>;

export const FillResponseSchema = z.object({
  mappings: z.array(FieldMappingSchema),
  unmapped: z.array(z.object({ fieldId: z.string(), reason: z.string() })),
});
export type FillResponse = z.infer<typeof FillResponseSchema>;

/* ───────────────────────── helpers ───────────────────────── */

export const emptyProfile = (): Profile => ProfileSchema.parse({});
export const emptyResume = (): Resume => ResumeSchema.parse({});
export const defaultSettings = (): Settings => SettingsSchema.parse({});
