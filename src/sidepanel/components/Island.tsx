import type { ReactNode } from "react";
import { MODELS } from "../../shared/models";
import type { RunState } from "../../shared/messages";

/**
 * The status pill: a frosted glass capsule at the top of the panel that morphs with the fill.
 *   idle      mark · FormPilot · lock "On device"
 *   running   cyan progress ring · current step · model
 *   done      green check · "12 filled · 1 to check"
 *   error     amber mark · "Fill stopped"
 * Width animates between states (interpolate-size); reduced motion holds still.
 * It is also the panel's live status region, so screen readers hear each step.
 */

const STEP: Record<string, { label: string; progress: number }> = {
  reading: { label: "Reading the page", progress: 0.22 },
  drafting: { label: "Matching your profile", progress: 0.58 },
  filling: { label: "Filling the fields", progress: 0.86 },
};

function modelShort(id?: string): string {
  if (id === "basic") return "Basic";
  const m = MODELS.find((x) => x.id === id);
  return m ? m.label.replace(/^[A-Za-z]+: /, "").replace(/ \(previous\)$/, "") : "";
}

export function Island({ run }: { run: RunState | null }) {
  const running = !!run && (run.status === "reading" || run.status === "drafting" || run.status === "filling");
  const done = run?.status === "done";
  const failed = run?.status === "error";
  const state = running ? "running" : done ? "done" : failed ? "error" : "idle";

  let body: ReactNode;
  let spoken = "";
  if (running && run) {
    const step = STEP[run.status]!;
    const label = run.status === "drafting" && run.model !== "basic" ? "Drafting answers" : step.label;
    spoken = `${label}…`;
    body = (
      <>
        <Ring value={step.progress} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{label}…</span>
        {run.model && <span className="shrink-0 font-mono text-[12px] text-muted lowercase">{modelShort(run.model)}</span>}
      </>
    );
  } else if (done && run) {
    const filled = run.items.filter((i) => i.state === "filled");
    const check = filled.filter((i) => i.source === "generated" || i.confidence === "low").length;
    spoken = `${filled.length} fields filled${check ? `, ${check} to check` : ""}. Nothing submitted.`;
    body = (
      <>
        <span aria-hidden="true" className="grid size-[22px] shrink-0 place-items-center rounded-full bg-ok text-black">
          <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
          <span className="tabular-nums">{filled.length}</span> filled
          {check > 0 && (
            <span className="text-warn">
              {" "}
              · <span className="tabular-nums">{check}</span> to check
            </span>
          )}
        </span>
        <span className="shrink-0 font-mono text-[12px] text-muted lowercase">Not submitted</span>
      </>
    );
  } else if (failed) {
    spoken = "Fill stopped. The reason is below.";
    body = (
      <>
        <span aria-hidden="true" className="grid size-[22px] shrink-0 place-items-center rounded-full bg-warn text-[13px] font-bold text-black">
          !
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">Fill stopped</span>
        <span className="shrink-0 font-mono text-[12px] text-muted lowercase">Reason below</span>
      </>
    );
  } else {
    body = (
      <>
        {/* The wordmark: a glowing cyan dot and the name in lowercase monospace (after your reference). */}
        <span translate="no" className="fp-wordmark ml-1">
          formpilot
        </span>
        <span aria-hidden="true" className="h-3.5 w-px shrink-0 bg-line-strong" />
        <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[12px] text-muted lowercase">
          <svg viewBox="0 0 16 16" className="size-3 text-accent" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <rect x="3" y="7" width="10" height="7" rx="1.5" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          </svg>
          On device
        </span>
      </>
    );
  }

  return (
    <div className="flex w-full justify-center">
      <div className={`fp-island fp-island--${state}`}>
        {body}
        <span className="sr-only" role="status" aria-live="polite">
          {spoken}
        </span>
      </div>
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 22 22" className="size-[22px] shrink-0 drop-shadow-[0_0_6px_rgb(39_217_232/0.55)]" aria-hidden="true">
      <circle cx="11" cy="11" r={r} fill="none" stroke="rgb(255 255 255 / 0.14)" strokeWidth="3" />
      <circle
        cx="11"
        cy="11"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${c * value} ${c}`}
        transform="rotate(-90 11 11)"
        style={{ transition: "stroke-dasharray 420ms var(--ease)" }}
      />
    </svg>
  );
}
