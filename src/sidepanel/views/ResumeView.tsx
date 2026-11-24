import { useEffect, useMemo, useRef, useState } from "react";
import { RESUME_MAX_CHARS, type Resume } from "../../shared/schema";
import { saveResume } from "../../shared/storage";
import { Button, StatusLine, TextArea, type Tone } from "../components/ui";
import { useKeptDraft } from "../hooks/useKeptDraft";
import { timeAgo } from "../hooks/useVault";
import { ACCEPT, ImportError, importResume } from "../importers";
const nf = new Intl.NumberFormat();

/** Rough token estimate (about 4 characters per token for English prose). */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);
export const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

export function ResumeView({ saved, onDirtyChange }: { saved: Resume; onDirtyChange: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState(saved.markdown);
  const [status, setStatus] = useState<{ tone: Tone; text: string } | null>(null);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = draft !== saved.markdown;
  // Adopt outside changes unless the user had edited the draft (see ProfileView).
  const baseRef = useRef(saved.markdown);
  useEffect(() => {
    const base = baseRef.current;
    baseRef.current = saved.markdown;
    setDraft((d) => (d === base ? saved.markdown : d));
  }, [saved.markdown]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  // Unsaved edits survive the popup closing (kept in session memory until saved).
  useKeptDraft("fp:draft:resume", draft, dirty, setDraft);

  const words = useMemo(() => countWords(draft), [draft]);
  const over = draft.length > RESUME_MAX_CHARS;

  async function onSave() {
    if (over) {
      setError(`Shorten the resume to ${nf.format(RESUME_MAX_CHARS)} characters or fewer; it has ${nf.format(draft.length)}.`);
      setStatus({ tone: "danger", text: "The resume is too long to save." });
      document.getElementById("resume-md")?.focus();
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      await saveResume(draft);
      setStatus({ tone: "ok", text: "Resume saved on this device." });
    } catch {
      setStatus({ tone: "danger", text: "Could not save. Your text is still here; try again." });
    } finally {
      setSaving(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setReading(true);
    setStatus({ tone: "neutral", text: `Reading ${file.name}…` });
    try {
      const md = await importResume(file);
      setDraft(md);
      setError(undefined);
      setStatus({ tone: "warn", text: `Imported ${file.name}. Check the text, then save.` });
    } catch (err) {
      setStatus({ tone: "danger", text: err instanceof ImportError ? err.message : "FormPilot could not read that file. Paste the text instead." });
    } finally {
      setReading(false);
    }
  }

  const line: { tone: Tone; text: string } =
    status ??
    (dirty
      ? { tone: "warn", text: "Unsaved changes" }
      : saved.updatedAt
        ? { tone: "neutral", text: `Saved ${timeAgo(saved.updatedAt)}` }
        : { tone: "neutral", text: "Nothing saved yet" });

  return (
    <div className="fp-view h-full min-h-[600px] max-w-[880px] grid-rows-[auto_minmax(0,1fr)]">
      <div className="fp-intro">
        <h1 className="fp-title">Resume and bio</h1>
        <p className="fp-lede">
          Import a PDF or Word resume, or paste Markdown or plain text. FormPilot reads it to answer open questions like
          “Why do you want to join?” and to fill experience fields. Files are read on this device; nothing is uploaded.
        </p>
      </div>

      {/* The editor: a glass card that fills the rest of the panel. Its actions sit in its own header and
          footer, so nothing floats over the text. */}
      <div className="fp-card flex min-h-[340px] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line py-2 pr-2 pl-4">
          <span className="fp-eyebrow">markdown</span>
          <Button onClick={() => fileRef.current?.click()} disabled={reading} className="px-4 text-[14px]">
            <svg viewBox="0 0 16 16" className="size-4 text-accent" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 10.5V2.5M5 5.5l3-3 3 3M3 10v2.5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V10" />
            </svg>
            {reading ? (
              "Reading…"
            ) : (
              <span>
                Import<span className="@max-[359px]/panel:sr-only"> PDF or Word</span>
              </span>
            )}
          </Button>
        </div>

        <TextArea
          id="resume-md"
          label="Resume in Markdown"
          labelHidden
          value={draft}
          onChange={(v) => {
            setDraft(v);
            setStatus(null);
          }}
          error={error}
          rows={12}
          spellCheck
          placeholder={"# Your name\n\n## Experience\n**Senior Engineer**, Acme (2022–now)\n- Led …"}
          className="flex min-h-0 flex-1 flex-col p-2 [&_.fp-hint]:px-2 [&_textarea]:min-h-[180px] [&_textarea]:flex-1 [&_textarea]:resize-none [&_textarea]:font-mono [&_textarea]:text-[14px] [&_textarea]:leading-relaxed"
          hint={
            <span className={`font-mono text-[12px] tabular-nums ${over ? "font-medium text-danger" : ""}`}>
              {nf.format(words)} words · about {nf.format(estimateTokens(draft))} tokens · {nf.format(draft.length)} of{" "}
              {nf.format(RESUME_MAX_CHARS)} characters
            </span>
          }
        />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-2 pr-2 pl-4">
          <div className="min-w-32 flex-1">
            <StatusLine tone={line.tone}>{line.text}</StatusLine>
          </div>
          <Button variant="primary" onClick={() => void onSave()} disabled={saving}>
            {saving ? "Saving…" : "Save resume"}
          </Button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
