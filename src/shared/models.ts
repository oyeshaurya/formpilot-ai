import type { ModelChoice } from "./schema";

export interface ModelInfo {
  choice: ModelChoice;
  label: string;
  /** Concrete model id, or null when the id is picked per page ("auto"). */
  id: string | null;
  detail: string;
}

export const MODELS: readonly ModelInfo[] = [
  {
    choice: "auto",
    label: "Auto",
    id: null,
    detail: "Haiku 5.5 for simple forms, Sonnet 5.5 when the page has open-ended questions.",
  },
  {
    choice: "basic",
    label: "Free: Basic (no AI)",
    id: "basic",
    detail: "Fills facts from your profile with rules. Writes no answers. Free, works offline, nothing leaves this device.",
  },
  { choice: "fast", label: "Fast: Haiku 5.5", id: "claude-haiku-5-5", detail: "Quickest and cheapest. Contact and sign-up forms." },
  {
    choice: "balanced",
    label: "Balanced: Sonnet 5.5",
    id: "claude-sonnet-5-5",
    detail: "Good short answers for job and program applications.",
  },
  { choice: "best", label: "Best: Opus 5.5", id: "claude-opus-5-5", detail: "Long essays, grant and visa portals. Slowest." },
  {
    choice: "sonnet-4-6",
    label: "Sonnet 4.6 (previous)",
    id: "claude-sonnet-4-6",
    detail: "The previous Sonnet. Sonnet 5.5 is newer and costs less.",
  },
] as const;

/** Run-state model id for the rule-based, no-AI fill. */
export const BASIC_MODEL = "basic";

export const AUTO_SIMPLE_MODEL = "claude-haiku-5-5";
export const AUTO_COMPLEX_MODEL = "claude-sonnet-5-5";

/** Model used for the "Test key" call: the cheapest current model. */
export const KEY_TEST_MODEL = "claude-haiku-5-5";

export function modelInfo(choice: ModelChoice): ModelInfo {
  return MODELS.find((m) => m.choice === choice) ?? MODELS[0]!;
}
