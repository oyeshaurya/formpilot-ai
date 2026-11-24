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
  const idle = !done && !running;

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
    <kbd translate="no" className="fp-kbd">
      {shortcut}
    </kbd>
  ) : null;

  /* Primary card: the view's one job. Raised glass with a soft light behind it. */
  const hero = (
    <div className="fp-hero">
      <div className="fp-card fp-card--raised p-5 @min-[760px]/panel:p-7">
        <h1 className="fp-title">{done ? "Check what was filled" : "Fill the form on this page"}</h1>
        {idle && (
          <p className="fp-lede">
            FormPilot reads the visible fields, fills them from your profile and drafts short answers. You review every
            field. It never presses Submit. Works on any web form in Chrome and Edge.
          </p>
        )}

        {running && run ? (
          <Progress run={run} />
        ) : !ready && !done ? (
          /* Nothing to fill from yet: the one useful action is to add some details. */
          <>
            <button type="button" className="fp-btn fp-btn--primary mt-6 w-full" onClick={() => goTo("profile")} aria-describedby="fill-note">
              <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="8" r="3.6" />
                <path d="M4.8 20c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6" />
              </svg>
              Add your details
            </button>
            <p id="fill-note" className="mt-3 text-[14px] leading-relaxed text-muted">
              FormPilot fills from your profile and resume, so add a few details first. Nothing is submitted.
            </p>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`fp-btn ${done ? "fp-btn--secondary" : "fp-btn--primary"} mt-6 w-full`}
              disabled={!ready || starting || tabId === null}
              onClick={() => void onFill()}
              aria-describedby="fill-note"
            >
              {!done && (
                <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 20l9.5-9.5M14.5 4.5l1-2.5 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1Z" />
                </svg>
              )}
              {starting ? "Opening the page…" : done ? "Fill this page again" : "Fill this page"}
            </button>
            <p id="fill-note" className="mt-3 text-[14px] leading-relaxed text-muted">
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
      </div>
    </div>
  );

  const problemCard = problem && !running && (
    <ProblemCard problem={problem} onAllow={() => void onAllow()} onRetry={() => void onFill()} onBasic={() => void onFill("basic")} goTo={goTo} />
  );

  if (!idle) {
    return (
      <div className="fp-view">
        {hero}
        {problemCard}
        {done && run && tabId !== null && <Review run={run} tabId={tabId} />}
      </div>
    );
  }

  return (
    <div className="fp-view fp-view--wide">
      {/* One column in a side panel; two once the panel is wide. */}
      <div className="fp-split">
        <div className="fp-stack">
          {hero}
          {problemCard}
        </div>
        <div className="fp-stack">
          <FillPreview profile={profile} />
          <section aria-labelledby="setup-title" className="fp-card">
            <h2 id="setup-title" className="fp-eyebrow px-5 pt-4 pb-1">
              Your setup
            </h2>
            <ul className="fp-rows px-2 pb-1.5">
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
          </section>
        </div>
      </div>
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
    <div className="mt-5" role="status" aria-live="polite">
      <ol className="grid gap-1">
        {steps.map((s, i) => {
          const state = i < at ? "done" : i === at ? "now" : "next";
          return (
            <li
              key={s.id}
              className={`flex min-h-12 items-center gap-3 rounded-[var(--r-md)] px-3 py-2 transition-colors duration-300 ${
                state === "now" ? "bg-[rgb(39_217_232/0.08)] shadow-[inset_0_0_0_1px_rgb(39_217_232/0.22)]" : ""
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid size-6 shrink-0 place-items-center rounded-full ${
                  state === "done" ? "bg-[rgb(39_217_232/0.14)] text-accent" : state === "now" ? "text-accent" : "bg-white/5 text-muted"
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
        <p className="mt-4 px-1 text-[14px] text-muted">
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
    <div className="fp-card fp-card--alert p-5" role="alert">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
          <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
            <path d="M7.25 4h1.5v5h-1.5V4Zm0 6.5h1.5V12h-1.5v-1.5Z" />
          </svg>
        </span>
        <p className="min-w-0 text-[16px] text-ink">{problem.message}</p>
      </div>
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
    <section aria-labelledby="review-title" className="grid gap-3">
      <h2 id="review-title" className="sr-only">
        Filled fields
      </h2>
      {/* Stat tiles: each ring shows its share of the fields FormPilot looked at. */}
      <p className="sr-only">
        {filled.length} filled, {drafts} to check, {left} left for you.
      </p>
      <div className="grid grid-cols-3 gap-2" aria-hidden="true">
        <RingStat value={filled.length} total={filled.length + left} label="Filled" colour="var(--ok)" />
        <RingStat value={drafts} total={Math.max(filled.length, 1)} label="To check" colour="var(--warn)" />
        <RingStat value={left} total={filled.length + left} label="Left for you" colour="var(--accent)" />
      </div>
      {run.notice && (
        <p className="px-1 text-[14px] text-warn" role="note">
          {run.notice}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="fp-btn fp-btn--secondary" disabled={busy || !filled.length} onClick={() => void undoAll()}>
          {busy ? "Undoing…" : "Undo all"}
        </button>
        <button type="button" className="fp-btn fp-btn--secondary" onClick={clear}>
          Done reviewing
        </button>
      </div>

      {run.items.length > 0 && (
        <ul className="fp-card fp-rows" aria-label="Filled fields">
          {run.items.map((item) => (
            <ReviewRow key={item.id} item={item} tabId={tabId} />
          ))}
        </ul>
      )}

      {left > 0 && (
        <div className="mt-2 grid gap-2">
          <h3 className="fp-eyebrow px-1">Left for you</h3>
          <ul className="fp-card fp-rows" aria-label="Fields left for you">
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

      <p className="px-1 font-mono text-[12px] leading-relaxed text-muted">
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
      ? { text: "Undone", tone: "neutral" }
      : item.state === "failed"
        ? { text: "Not filled", tone: "danger" }
        : item.source === "generated"
          ? { text: "Draft", tone: "warn" }
          : item.confidence === "low"
            ? { text: "Check", tone: "warn" }
            : { text: "Profile", tone: "ok" };
  return (
    <li className="px-4 pt-3.5 pb-1.5">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[14px] font-medium text-ink">{item.label || "Unnamed field"}</p>
        <span className={`fp-badge fp-badge--${badge.tone}`}>{badge.text}</span>
      </div>
      <p className={`mt-1.5 line-clamp-4 text-[16px] [overflow-wrap:anywhere] ${item.state === "undone" ? "text-muted line-through" : "text-ink"}`}>
        {value || "—"}
      </p>
      <p className="mt-1 text-[13px] text-muted">{item.error ?? item.reasoning}</p>
      <div className="flex gap-4">
        <ShowLink tabId={tabId} id={item.id} what={item.label} />
        {item.state === "filled" && (
          <button
            type="button"
            className="fp-link min-h-11 text-[13px] lowercase"
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
    <button type="button" className="fp-link min-h-11 shrink-0 text-[13px] lowercase" onClick={() => void sendToWorker({ type: "SHOW_FIELD", tabId, fieldId: id })}>
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
  const state = ok ? "ok" : partial ? "partial" : optional ? "optional" : "missing";
  const label = { ok: "Ready", partial: "Partly ready", optional: "Optional", missing: "Missing" }[state];
  return (
    <li className="flex min-h-14 items-center gap-3 px-3 py-3">
      <StateIcon state={state} label={label} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium leading-snug">{title}</p>
        <p className="text-[14px] leading-snug text-muted">{detail}</p>
      </div>
      {action}
    </li>
  );
}

function StateIcon({ state, label }: { state: "ok" | "partial" | "optional" | "missing"; label: string }) {
  // Every state draws the same 28px ring, so all rows start on one left edge.
  const cls = {
    ok: "border-[rgb(39_217_232/0.4)] bg-[rgb(39_217_232/0.12)] text-accent",
    partial: "border-warn/40 bg-warn-soft text-warn",
    optional: "border-line-strong bg-white/[0.03] text-muted",
    missing: "border-warn/40 bg-warn-soft text-warn",
  }[state];
  return (
    <span role="img" aria-label={label} className={`grid size-7 shrink-0 place-items-center rounded-full border ${cls}`}>
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {state === "ok" && <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />}
        {(state === "partial" || state === "optional") && <path d="M4.5 8h7" strokeLinecap="round" />}
        {state === "missing" && <circle cx="8" cy="8" r="4.5" />}
      </svg>
    </span>
  );
}

function LinkButton({ onClick, children, what }: { onClick: () => void; children: ReactNode; what: string }) {
  return (
    <button type="button" onClick={onClick} className="fp-link group min-h-11 shrink-0 px-1 text-[13px] lowercase">
      {children}
      <span className="sr-only"> {what}</span>
      {/* Goes to another tab, so it points the way (after your reference's "Claude settings →"). */}
      <span aria-hidden="true" className="ml-1 inline-block transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none">
        →
      </span>
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
      className="fp-card m-0 overflow-hidden"
    >
      {/* A browser window's top edge, so the preview reads as a page. */}
      <div aria-hidden="true" className="flex items-center gap-1.5 border-b border-line bg-white/[0.02] px-4 py-2.5">
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
        <span className="ml-2 h-2 w-24 rounded-full bg-white/[0.07]" />
      </div>
      <div className="grid gap-3 p-4">
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
      </div>
    </figure>
  );
}

function PreviewField({ label, value, tone, multiline }: { label: string; value: string; tone: "ok" | "warn"; multiline?: boolean }) {
  const ring = tone === "ok" ? "border-ok/80 shadow-[0_0_0_3px_var(--ok-soft)]" : "border-warn/80 shadow-[0_0_0_3px_var(--warn-soft)]";
  return (
    <div aria-hidden="true">
      <p className="mb-1 text-[13px] font-medium text-muted">{label}</p>
      <p
        className={`rounded-[var(--r-sm)] border-[1.5px] bg-[var(--well)] px-3 text-[14px] text-ink [overflow-wrap:anywhere] ${ring} ${
          multiline ? "py-2 leading-snug" : "flex min-h-9 items-center"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/** A stat tile: a ring with a big number in the middle and a label below. */
function RingStat({ value, total, label, colour }: { value: number; total: number; label: string; colour: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <div className="fp-card grid justify-items-center gap-1.5 px-2 pt-3.5 pb-3">
      <div className="relative grid size-[64px] place-items-center">
        <svg viewBox="0 0 64 64" className="absolute inset-0">
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="5" />
          {/* No arc at zero: a round cap alone would draw a stray dot. */}
          <circle
            opacity={share > 0 ? 1 : 0}
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke={colour}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${c * share} ${c}`}
            transform="rotate(-90 32 32)"
            style={{ transition: "stroke-dasharray 600ms var(--ease)", filter: `drop-shadow(0 0 4px ${colour})` }}
          />
        </svg>
        <span className="font-mono text-[22px] font-medium tabular-nums leading-none">{value}</span>
      </div>
      <span className="text-center text-[13px] leading-tight text-muted">{label}</span>
    </div>
  );
}
