import { useId, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes, type ButtonHTMLAttributes } from "react";

/* Shared form primitives. Every control has a visible <label>, errors sit under
   their field (aria-describedby + aria-invalid), and text is 16px so nothing zooms. */

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: string;
  /** DOM id; also used by the Save flow to focus the first invalid field. */
  id?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "id">;

export function TextField({ label, value, onChange, error, hint, id, className, ...rest }: FieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errId = error ? `${fieldId}-err` : undefined;
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="fp-label">
        {label}
      </label>
      <input
        id={fieldId}
        className="fp-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined}
        spellCheck={false}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="mt-1.5 text-[14px] text-muted">
          {hint}
        </p>
      )}
      <FieldError id={errId} message={error} />
    </div>
  );
}

type AreaProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: ReactNode;
  id?: string;
  labelHidden?: boolean;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "id">;

export function TextArea({ label, value, onChange, error, hint, id, labelHidden, className, ...rest }: AreaProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errId = error ? `${fieldId}-err` : undefined;
  return (
    <div className={className}>
      <label htmlFor={fieldId} className={labelHidden ? "sr-only" : "fp-label"}>
        {label}
      </label>
      <textarea
        id={fieldId}
        className="fp-input block resize-y"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined}
        {...rest}
      />
      {hint && (
        <div id={hintId} className="mt-1.5 text-[14px] text-muted">
          {hint}
        </div>
      )}
      <FieldError id={errId} message={error} />
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  id,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  id?: string;
  className?: string;
}) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="fp-label">
        {label}
      </label>
      <select id={fieldId} className="fp-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FieldError({ id, message }: { id: string | undefined; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 flex gap-1.5 text-[14px] font-medium text-danger">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-[3px] size-3.5 shrink-0" fill="currentColor">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm-.75 3.5h1.5v4.5h-1.5V4.5Zm0 6h1.5V12h-1.5v-1.5Z" />
      </svg>
      {message}
    </p>
  );
}

export function Button({
  variant = "secondary",
  className = "",
  ...rest
}: { variant?: "primary" | "secondary" | "danger" } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`fp-btn fp-btn--${variant} ${className}`} {...rest} />;
}

export function Section({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  const headingId = useId();
  return (
    <section id={id} aria-labelledby={headingId} className="fp-card mx-3 mt-3 p-5 last:mb-4">
      <h2 id={headingId} className="fp-eyebrow text-ink">
        {title}
      </h2>
      {description && <p className="mt-1.5 text-[14px] leading-normal text-muted">{description}</p>}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

/** Two fields side by side when the panel is wide enough, stacked otherwise. */
export function Row({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 min-[380px]:grid-cols-2">{children}</div>;
}

export type Tone = "neutral" | "ok" | "warn" | "danger";

/** The one live status line of a view. Screen readers hear every change. */
export function StatusLine({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const colour = { neutral: "text-muted", ok: "text-ok", warn: "text-warn", danger: "text-danger" }[tone];
  return (
    <p role="status" aria-live="polite" className={`min-h-5 font-mono text-[13px] font-medium ${colour}`}>
      {children}
    </p>
  );
}

/** Sticky action bar at the foot of a view: status on the left, the view's buttons on the right. */
export function ActionBar({ status, children }: { status: ReactNode; children: ReactNode }) {
  return (
    <div className="fp-card fp-thick sticky bottom-3 z-10 mx-3 mt-3 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 !rounded-[var(--r-card)] py-2 pr-2 pl-5">
      {/* At narrow panel widths the buttons drop to their own row instead of squeezing the status. */}
      <div className="min-w-32 flex-1">{status}</div>
      <div className="ml-auto flex shrink-0 gap-2">{children}</div>
    </div>
  );
}
