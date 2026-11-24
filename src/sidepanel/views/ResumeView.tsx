import { useEffect, useMemo, useRef, useState } from "react";
import { RESUME_MAX_CHARS, type Resume } from "../../shared/schema";
import { saveResume } from "../../shared/storage";
import { ActionBar, Button, StatusLine, TextArea, type Tone } from "../components/ui";
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
    <div className="flex min-h-full flex-col">
      <div className="flex-1 px-4 py-5">
        <h1 className="text-[28px] leading-[1.1]">Resume and bio</h1>
        <p className="mt-1.5 text-[16px] text-ink">
          Import a PDF or Word resume, or paste Markdown or plain text. FormPilot reads it to answer open questions like
          “Why do you want to join?” and to fill experience fields. Files are read on this device; nothing is uploaded.
        </p>

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
          rows={18}
          spellCheck
          placeholder={"# Your name\n\n## Experience\n**Senior Engineer**, Acme (2022–now)\n- Led …"}
          className="mt-4 [&_textarea]:min-h-[50vh] [&_textarea]:font-mono [&_textarea]:text-[14px] [&_textarea]:leading-relaxed"
          hint={
            <span className={`tabular-nums ${over ? "font-medium text-danger" : ""}`}>
              {nf.format(words)} words · about {nf.format(estimateTokens(draft))} tokens · {nf.format(draft.length)} of{" "}
              {nf.format(RESUME_MAX_CHARS)} characters
            </span>
          }
        />

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

      <ActionBar status={<StatusLine tone={line.tone}>{line.text}</StatusLine>}>
        <Button onClick={() => fileRef.current?.click()} disabled={reading}>
          {reading ? "Reading…" : "Import PDF or Word"}
        </Button>
        <Button variant="primary" onClick={() => void onSave()} disabled={saving}>
          {saving ? "Saving…" : "Save resume"}
        </Button>
      </ActionBar>
    </div>
  );
}
