import { useEffect, useState, type ReactNode } from "react";
import { sendToWorker, type RunItem, type RunState } from "../../shared/messages";
import { MODELS, modelInfo } from "../../shared/models";
import type { Profile, Resume, Settings } from "../../shared/schema";
import { profileCompleteness } from "../../shared/validate";
import { useActiveRun } from "../hooks/useRun";
import { countWords } from "./ResumeView";
import type { TabId } from "../App";

const ALL_SITES = ["https://*/*", "http://*/*"];
const nf = new Intl.NumberFormat();
const modelLabel = (id?: string) => {
  if (id === "basic") return "Basic (free, no AI)";
  const m = MODELS.find((x) => x.id === id);
  return m ? m.label.replace(/^[A-Za-z]+: /, "") : (id ?? "Claude");
};

interface Problem {
  kind: string;
  message: string;
}

/**
 * Fill view: start a fill, watch it run, review every value, undo any of it.
 * Renders from the worker's run state (chrome.storage.session), so it survives
 * a closed panel or a restarted worker.
 */
export function FillView({
  profile,
  resume,
  settings,
  hasApiKey,
  goTo,
}: {
  profile: Profile;
  resume: Resume;
  settings: Settings;
  hasApiKey: boolean;
  goTo: (tab: TabId) => void;
}) {
  const { tabId, run } = useActiveRun();
  const [shortcut, setShortcut] = useState("");
  const [starting, setStarting] = useState(false);
  const [startProblem, setStartProblem] = useState<Problem | null>(null);

  useEffect(() => {
    void chrome.commands
      .getAll()
      .then((cmds) => setShortcut(cmds.find((c) => c.name === "fill-page")?.shortcut ?? ""))
      .catch(() => setShortcut(""));
  }, []);
  useEffect(() => setStartProblem(null), [tabId]);

  const { filled, total } = profileCompleteness(profile);
  const words = countWords(resume.markdown);
  const hasData = (filled > 0 || words > 0 || profile.customFacts.length > 0);
  // Without a key (or with Basic chosen) FormPilot still fills facts for free with Basic mode.
  const onDevice = settings.model === "on-device";
  const basic = settings.model === "basic" || (!hasApiKey && !onDevice);
  const ready = hasData;
  const running = run?.status === "reading" || run?.status === "drafting" || run?.status === "filling";
  const problem: Problem | null = startProblem ?? (run?.status === "error" && run.error ? { kind: run.error.kind, message: run.error.message } : null);
  const done = run?.status === "done";

  async function onFill(engine?: "basic") {
    if (tabId === null) return;
    setStarting(true);
    setStartProblem(null);
    try {
      const res = await sendToWorker({ type: "FILL_PAGE", tabId, ...(engine ? { engine } : {}) });
      if (!res.ok) setStartProblem({ kind: res.kind, message: res.error });
    } catch {
      setStartProblem({ kind: "unknown", message: "The extension's background worker did not answer. Reload the extension and try again." });
    } finally {
      setStarting(false);
    }
  }

  // Runs straight from the button's click, so the browser can show its own permission prompt.
  async function onAllow() {
    const granted = await chrome.permissions.request({ origins: ALL_SITES }).catch(() => false);
    if (granted) await onFill();
    else setStartProblem({ kind: "permission-declined", message: "Permission was not given. The shortcut and the right-click menu still work on any page." });
  }

  const key = shortcut ? (
    <kbd translate="no" className="rounded-md bg-sunken px-1.5 py-0.5 font-mono text-[13px] text-ink">
      {shortcut}
    </kbd>
  ) : null;

  return (
    <div className="px-4 py-5">
      <h1 className="text-[28px] leading-[1.1]">{done ? "Check what was filled" : "Fill the form on this page"}</h1>
      {!done && !running && (
        <p className="mt-3 text-[16px] text-ink">
          FormPilot reads the visible fields, fills them from your profile and drafts short answers. You review every
          field. It never presses Submit. Works on any web form in Chrome and Edge.
        </p>
      )}

      {running && run ? (
        <Progress run={run} />
      ) : (
        <>
          <button
            type="button"
            className={`fp-btn ${done ? "fp-btn--secondary" : "fp-btn--primary"} mt-5 w-full`}
            disabled={!ready || starting || tabId === null}
            onClick={() => void onFill()}
            aria-describedby="fill-note"
          >
            {starting ? "Opening the page…" : done ? "Fill this page again" : "Fill this page"}
          </button>
          <p id="fill-note" className="mt-2 text-[14px] text-ink">
            {ready ? (
              <>
                {onDevice ? "On-device AI: free, nothing leaves this device. " : basic ? "Basic mode: fills facts from your profile, free and offline. " : ""}Nothing is submitted.{" "}
                {key && <>Shortcut: {key}, or right-click a field.</>}
              </>
            ) : (
              <>Add your details in Profile to start.</>
            )}
          </p>
        </>
      )}

      {problem && !running && <ProblemCard problem={problem} onAllow={() => void onAllow()} onRetry={() => void onFill()} onBasic={() => void onFill("basic")} goTo={goTo} />}

      {done && run && tabId !== null && <Review run={run} tabId={tabId} />}

      {!done && !running && (
        <>
          <FillPreview profile={profile} />
          <ul className="fp-card mt-4 divide-y divide-line" aria-label="Ready to fill">
            <Check
              ok={filled >= 4}
              partial={filled > 0}
              title="Profile"
              detail={filled === 0 ? "Empty. Add at least your name and email." : `${filled} of ${total} key fields filled`}
              action={<LinkButton what="profile" onClick={() => goTo("profile")}>{filled === 0 ? "Add" : "Edit"}</LinkButton>}
            />
            <Check
              ok={words > 50}
              partial={false}
              optional
              title="Resume"
              detail={words === 0 ? "Optional. Improves drafted answers." : `${nf.format(words)} words`}
              action={<LinkButton what="resume" onClick={() => goTo("resume")}>{words === 0 ? "Add" : "Edit"}</LinkButton>}
            />
            <Check
              ok={hasApiKey}
              partial={false}
              optional
              title="Anthropic API key"
              detail={hasApiKey ? (settings.keyStorage === "local" ? "Saved on this device" : "Saved until the browser closes") : "Optional. Without it, Basic mode fills facts for free."}
              action={<LinkButton what="API key" onClick={() => goTo("settings")}>{hasApiKey ? "Change" : "Add"}</LinkButton>}
            />
            <Check
              ok
              partial={false}
              title="Model"
              detail={hasApiKey || onDevice ? modelInfo(settings.model).label : "Free: Basic (no AI) until you add a key"}
              action={<LinkButton what="model" onClick={() => goTo("settings")}>Change</LinkButton>}
            />
          </ul>
        </>
      )}
    </div>
  );
}

/* ───────────── running ───────────── */

function Progress({ run }: { run: RunState }) {
  const steps: { id: RunState["status"]; label: string }[] = [
    { id: "reading", label: run.fieldCount ? `Read ${run.fieldCount} fields on the page` : "Reading the page" },
    { id: "drafting", label: run.model === "basic" ? "Matching fields to your profile" : run.model === "on-device" ? "Matching fields on this device" : `Drafting answers with ${modelLabel(run.model)}` },
    { id: "filling", label: "Filling the fields" },
  ];
  const at = steps.findIndex((s) => s.id === run.status);
  return (
    <div className="fp-card mt-5 p-5" role="status" aria-live="polite">
      <ol className="grid gap-3">
        {steps.map((s, i) => {
          const state = i < at ? "done" : i === at ? "now" : "next";
          return (
            <li key={s.id} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`grid size-6 shrink-0 place-items-center rounded-full ${
                  state === "done" ? "bg-ok-soft text-ok" : state === "now" ? "text-accent" : "bg-sunken text-muted"
                }`}
              >
                {state === "done" ? (
                  <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : state === "now" ? (
                  <span className="fp-spin size-5 rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <span className="size-1.5 rounded-full bg-current" />
                )}
              </span>
              <span className={`text-[16px] ${state === "next" ? "text-muted" : "text-ink"}`}>
                {s.label}
                {state === "now" && "…"}
              </span>
            </li>
          );
        })}
      </ol>
      {run.status === "drafting" && run.model !== "basic" && (
        <p className="mt-4 text-[14px] text-muted">
          {run.model === "on-device" ? "The model runs on your computer. A long form can take a minute." : "This usually takes 5 to 20 seconds."}
        </p>
      )}
    </div>
  );
}

/* ───────────── problems ───────────── */

function ProblemCard({
  problem,
  onAllow,
  onRetry,
  onBasic,
  goTo,
}: {
  problem: Problem;
  onAllow: () => void;
  onRetry: () => void;
  onBasic: () => void;
  goTo: (tab: TabId) => void;
}) {
  const action: ReactNode =
    problem.kind === "permission" ? (
      <>
        <button type="button" className="fp-btn fp-btn--secondary" onClick={onAllow}>
          Allow on websites
        </button>
        <p className="mt-3 text-[14px] text-muted">
          Your browser asks once. FormPilot still reads a page only when you ask it to fill one.
        </p>
      </>
    ) : problem.kind === "billing" || problem.kind === "auth" || problem.kind === "rate" ? (
      <div className="flex flex-wrap gap-2">
        <button type="button" className="fp-btn fp-btn--secondary" onClick={onBasic}>
          Fill with Basic instead
        </button>
        {problem.kind === "billing" ? (
          <a className="fp-btn fp-btn--secondary" href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer">
            Add credits
          </a>
        ) : problem.kind === "auth" ? (
          <button type="button" className="fp-btn fp-btn--secondary" onClick={() => goTo("settings")}>
            Open Settings
          </button>
        ) : null}
        <p className="w-full text-[14px] text-muted">Basic mode is free: it fills facts from your profile and writes no answers.</p>
      </div>
    ) : problem.kind === "no-key" || problem.kind === "permission-model" ? (
      <button type="button" className="fp-btn fp-btn--secondary" onClick={() => goTo("settings")}>
        Open Settings
      </button>
    ) : problem.kind === "no-profile" ? (
      <button type="button" className="fp-btn fp-btn--secondary" onClick={() => goTo("profile")}>
        Open Profile
      </button>
    ) : problem.kind === "restricted" || problem.kind === "permission-declined" || problem.kind === "busy" ? null : (
      <button type="button" className="fp-btn fp-btn--secondary" onClick={onRetry}>
        Try again
      </button>
    );
  return (
    <div className="fp-card mt-4 p-5 ring-1 ring-danger/40" role="alert">
      <p className="text-[16px] text-ink">{problem.message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ───────────── review ───────────── */

function Review({ run, tabId }: { run: RunState; tabId: number }) {
  const [busy, setBusy] = useState(false);
  const filled = run.items.filter((i) => i.state === "filled");
  const drafts = filled.filter((i) => i.source === "generated" || i.confidence === "low").length;
  const failed = run.items.filter((i) => i.state === "failed");
  const left = run.unmapped.length + failed.length;

  const undoAll = async () => {
    setBusy(true);
    await sendToWorker({ type: "UNDO", tabId }).catch(() => undefined);
    setBusy(false);
  };
  const clear = () => void sendToWorker({ type: "CLEAR_FILL", tabId }).catch(() => undefined);

  return (
    <section aria-labelledby="review-title" className="mt-5">
      <h2 id="review-title" className="sr-only">
        Filled fields
      </h2>
      {/* Live-activity tiles: each ring shows its share of the fields FormPilot looked at. */}
      <p className="sr-only">
        {filled.length} filled, {drafts} to check, {left} left for you.
      </p>
      <div className="grid grid-cols-3 gap-2" aria-hidden="true">
        <RingStat value={filled.length} total={filled.length + left} label="Filled" colour="var(--ok)" />
        <RingStat value={drafts} total={Math.max(filled.length, 1)} label="To check" colour="var(--warn)" />
        <RingStat value={left} total={filled.length + left} label="Left for you" colour="var(--accent-2)" />
      </div>
      {run.notice && (
        <p className="mt-3 text-[14px] text-warn" role="note">
          {run.notice}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="fp-btn fp-btn--secondary" disabled={busy || !filled.length} onClick={() => void undoAll()}>
          {busy ? "Undoing…" : "Undo all"}
        </button>
        <button type="button" className="fp-btn fp-btn--secondary" onClick={clear}>
          Done reviewing
        </button>
      </div>

      {run.items.length > 0 && (
        <ul className="fp-card mt-4 divide-y divide-line" aria-label="Filled fields">
          {run.items.map((item) => (
            <ReviewRow key={item.id} item={item} tabId={tabId} />
          ))}
        </ul>
      )}

      {left > 0 && (
        <div className="mt-4">
          <h3 className="fp-eyebrow text-ink">Left for you</h3>
          <ul className="fp-card mt-3 divide-y divide-line" aria-label="Fields left for you">
            {[...failed.map((f) => ({ id: f.id, label: f.label, reason: f.error ?? "Could not fill" })), ...run.unmapped].map((u) => (
              <li key={u.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-ink">{u.label || "Unnamed field"}</p>
                  <p className="text-[14px] text-muted">{u.reason}</p>
                </div>
                <ShowLink tabId={tabId} id={u.id} what={u.label} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-[13px] text-muted">
        {modelLabel(run.model)}
        {run.usage && (
          <>
            {" "}
            · {nf.format(run.usage.input + run.usage.cacheRead + run.usage.cacheWrite)} tokens in, {nf.format(run.usage.output)} out
            {run.usage.cacheRead > 0 && <> · {nf.format(run.usage.cacheRead)} from cache</>}
          </>
        )}
        {run.skipped && run.skipped.sensitive > 0 && <> · {run.skipped.sensitive} sensitive fields skipped</>}
      </p>
    </section>
  );
}

function ReviewRow({ item, tabId }: { item: RunItem; tabId: number }) {
  const value = item.values.length ? item.values.join(", ") : item.value;
  const badge =
    item.state === "undone"
      ? { text: "Undone", cls: "bg-sunken text-muted" }
      : item.state === "failed"
        ? { text: "Not filled", cls: "bg-danger-soft text-danger" }
        : item.source === "generated"
          ? { text: "Draft", cls: "bg-warn-soft text-warn" }
          : item.confidence === "low"
            ? { text: "Check", cls: "bg-warn-soft text-warn" }
            : { text: "Profile", cls: "bg-ok-soft text-ok" };
  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[14px] font-medium text-ink">{item.label || "Unnamed field"}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[13px] font-medium ${badge.cls}`}>{badge.text}</span>
      </div>
      <p className={`mt-1 line-clamp-4 text-[16px] [overflow-wrap:anywhere] ${item.state === "undone" ? "text-muted line-through" : "text-ink"}`}>
        {value || "—"}
      </p>
      <p className="mt-1 text-[13px] text-muted">{item.error ?? item.reasoning}</p>
      <div className="mt-1 flex gap-4">
        <ShowLink tabId={tabId} id={item.id} what={item.label} />
        {item.state === "filled" && (
          <button
            type="button"
            className="fp-link min-h-11 text-[14px]"
            onClick={() => void sendToWorker({ type: "UNDO", tabId, fieldIds: [item.id] })}
          >
            Undo<span className="sr-only"> {item.label}</span>
          </button>
        )}
      </div>
    </li>
  );
}

function ShowLink({ tabId, id, what }: { tabId: number; id: string; what: string }) {
  return (
    <button type="button" className="fp-link min-h-11 shrink-0 text-[14px]" onClick={() => void sendToWorker({ type: "SHOW_FIELD", tabId, fieldId: id })}>
      Show<span className="sr-only"> {what} on the page</span>
    </button>
  );
}

/* ───────────── readiness ───────────── */

function Check({
  ok,
  partial,
  optional,
  title,
  detail,
  action,
}: {
  ok: boolean;
  partial: boolean;
  optional?: boolean;
  title: string;
  detail: string;
  action: ReactNode;
}) {
  const state = ok ? "ok" : partial || optional ? "partial" : "missing";
  const label = { ok: "Ready", partial: optional ? "Optional" : "Partly ready", missing: "Missing" }[state];
  return (
    <li className="flex min-h-14 items-center gap-3 px-3 py-2.5">
      <StateIcon state={state} label={label} />
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-medium">{title}</p>
        <p className="text-[14px] text-muted">{detail}</p>
      </div>
      {action}
    </li>
  );
}

function StateIcon({ state, label }: { state: "ok" | "partial" | "missing"; label: string }) {
  // Every state draws the same 28px ring, so all rows start on one left edge.
  const cls = {
    ok: "border-ok/40 bg-ok-soft text-ok",
    partial: "border-warn/40 bg-warn-soft text-warn",
    missing: "border-line-strong bg-sunken text-muted",
  }[state];
  return (
    <span role="img" aria-label={label} className={`grid size-7 shrink-0 place-items-center rounded-full border ${cls}`}>
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {state === "ok" && <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />}
        {state === "partial" && <path d="M4 8h8" strokeLinecap="round" />}
        {state === "missing" && <circle cx="8" cy="8" r="4.5" />}
      </svg>
    </span>
  );
}

function LinkButton({ onClick, children, what }: { onClick: () => void; children: ReactNode; what: string }) {
  return (
    <button type="button" onClick={onClick} className="fp-link min-h-11 shrink-0 px-1 text-[14px]">
      {children}
      <span className="sr-only"> {what}</span>
    </button>
  );
}

/**
 * The product's own UI, small: how a filled page looks. Also the legend for the
 * on-page outlines (green = from your profile, amber = drafted, check it).
 */
function FillPreview({ profile }: { profile: Profile }) {
  // The person's own saved details, so the preview never shows someone else's name.
  const name = [profile.personal.firstName, profile.personal.lastName].filter(Boolean).join(" ") || "Your name";
  const email = profile.personal.email || "you@example.com";
  const role = profile.work.currentTitle;
  return (
    <figure
      role="img"
      aria-label="Preview of a filled form: answers from your profile are outlined green, drafted answers are outlined amber for you to check."
      className="fp-card mt-6 grid gap-3 p-4"
    >
      <PreviewField label="Full name" value={name} tone="ok" />
      <PreviewField label="Email" value={email} tone="ok" />
      <PreviewField
        label="Why do you want to join?"
        value={role ? `As a ${role}, I would bring…` : "A short answer drafted from your resume and the role…"}
        tone="warn"
        multiline
      />
      <div aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[13px] font-medium">
        <span className="inline-flex items-center gap-1.5 text-ok">
          <span className="size-2.5 rounded-full border-2 border-ok" /> From your profile
        </span>
        <span className="inline-flex items-center gap-1.5 text-warn">
          <span className="size-2.5 rounded-full border-2 border-warn" /> Drafted: check it
        </span>
      </div>
    </figure>
  );
}

function PreviewField({ label, value, tone, multiline }: { label: string; value: string; tone: "ok" | "warn"; multiline?: boolean }) {
  const ring = tone === "ok" ? "border-ok shadow-[0_0_0_3px_var(--ok-soft)]" : "border-warn shadow-[0_0_0_3px_var(--warn-soft)]";
  return (
    <div aria-hidden="true">
      <p className="mb-1 text-[13px] font-medium text-ink">{label}</p>
      <p className={`rounded-[var(--r-field)] border-2 bg-sunken px-3 text-[14px] text-ink ${ring} ${multiline ? "py-2 leading-snug" : "flex min-h-9 items-center"}`}>
        {value}
      </p>
    </div>
  );
}

/** A Live-Activity style tile: a ring with a big number in the middle and a label below. */
function RingStat({ value, total, label, colour }: { value: number; total: number; label: string; colour: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <div className="fp-card grid justify-items-center gap-1 px-2 pt-3 pb-3">
      <div className="relative grid size-[64px] place-items-center">
        <svg viewBox="0 0 64 64" className="absolute inset-0">
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="6" />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke={colour}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${c * share} ${c}`}
            transform="rotate(-90 32 32)"
            style={{ transition: "stroke-dasharray 600ms var(--ease)" }}
          />
        </svg>
        <span className="font-mono text-[22px] font-medium tabular-nums leading-none">{value}</span>
      </div>
      <span className="text-[13px] text-muted">{label}</span>
    </div>
  );
}
