import { useEffect, useRef, useState } from "react";
import { sendToWorker } from "../../shared/messages";
import { MODELS } from "../../shared/models";
import { VaultExportSchema, type Profile, type Resume, type Settings, type VaultExport } from "../../shared/schema";
import { clearApiKey, getApiKey, saveProfile, saveResume, saveSettings, setApiKey, wipeAll } from "../../shared/storage";
import { apiKeyProblem } from "../../shared/validate";
import { Button, Section, StatusLine, TextField, type Tone } from "../components/ui";

type Line = { tone: Tone; text: string } | null;

export function SettingsView({
  settings,
  profile,
  resume,
  hasApiKey,
}: {
  settings: Settings;
  profile: Profile;
  resume: Resume;
  hasApiKey: boolean;
}) {
  return (
    <div>
      <h1 className="px-4 pt-5 text-[28px] leading-[1.1]">Settings</h1>
      <ApiKeySection settings={settings} hasApiKey={hasApiKey} />
      <ModelSection settings={settings} />
      <PageSection settings={settings} />
      <DataSection profile={profile} resume={resume} />
    </div>
  );
}

/* ───────────────────────── API key ───────────────────────── */

function ApiKeySection({ settings, hasApiKey }: { settings: Settings; hasApiKey: boolean }) {
  const [draft, setDraft] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string>();
  const [line, setLine] = useState<Line>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [savedTail, setSavedTail] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    void getApiKey().then((k) => setSavedTail(k ? k.slice(-4) : ""));
  }, [hasApiKey]);

  async function onSave() {
    const problem = apiKeyProblem(draft);
    if (problem) {
      setError(problem);
      setLine({ tone: "danger", text: "The key was not saved." });
      document.getElementById("api-key")?.focus();
      return;
    }
    setError(undefined);
    setBusy("save");
    await setApiKey(draft.trim(), settings.keyStorage);
    setDraft("");
    setShow(false);
    setLine({ tone: "ok", text: settings.keyStorage === "local" ? "Key saved on this device." : "Key saved until you close the browser." });
    setBusy(null);
  }

  async function onTest() {
    const key = draft.trim() || (await getApiKey());
    const problem = apiKeyProblem(key);
    if (problem) {
      setError(draft ? problem : undefined);
      setLine({ tone: "danger", text: draft ? "Fix the key, then test it." : "Paste a key to test." });
      return;
    }
    setBusy("test");
    setLine({ tone: "neutral", text: "Checking the key with Anthropic…" });
    try {
      const res = await sendToWorker({ type: "TEST_API_KEY", apiKey: key });
      setLine(res.ok ? { tone: "ok", text: `The key works. ${res.model} is available.` } : { tone: "danger", text: res.error });
    } catch {
      setLine({ tone: "danger", text: "The extension's background worker did not answer. Reload the extension and try again." });
    } finally {
      setBusy(null);
    }
  }

  async function onStorageChange(mode: Settings["keyStorage"]) {
    await saveSettings({ ...settings, keyStorage: mode });
    const existing = await getApiKey();
    if (existing) await setApiKey(existing, mode);
    setLine({ tone: "ok", text: mode === "local" ? "The key is now kept on this device." : "The key will be forgotten when the browser closes." });
  }

  async function onRemove() {
    await clearApiKey();
    setConfirmRemove(false);
    setLine({ tone: "ok", text: "Key removed from this device." });
  }

  return (
    <Section
      title="Anthropic API key"
      description={
        <>
          FormPilot calls Claude with your own key. It is sent only to api.anthropic.com and never included in exports.{" "}
          <a className="fp-link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
            Get a key in the Claude Console
          </a>
        </>
      }
    >
      <p className="text-[16px]">
        {hasApiKey ? (
          <>
            <span className="font-medium text-ok">Key saved</span>{" "}
            <span className="text-muted">
              ending in <span translate="no" className="font-mono">{savedTail}</span>
              {settings.keyStorage === "local" ? ", kept on this device." : ", forgotten when the browser closes."}
            </span>
          </>
        ) : (
          <span className="text-muted">No key saved yet.</span>
        )}
      </p>

      <div>
        <div className="flex items-end gap-2">
          <TextField
            id="api-key"
            className="flex-1"
            label={hasApiKey ? "Replace the key" : "API key"}
            type={show ? "text" : "password"}
            autoComplete="off"
            placeholder="sk-ant-…"
            value={draft}
            error={undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "api-key-err" : undefined}
            onChange={(v) => {
              setDraft(v);
              setError(undefined);
            }}
          />
          <Button aria-pressed={show} onClick={() => setShow((s) => !s)} className="px-3">
            {show ? "Hide" : "Show"}
          </Button>
        </div>
        {error && (
          <p id="api-key-err" className="mt-1.5 text-[14px] font-medium text-danger">
            {error}
          </p>
        )}
      </div>

      <fieldset>
        <legend className="mb-1.5 text-[14px] font-medium">Keep the key</legend>
        <RadioRow
          name="key-storage"
          checked={settings.keyStorage === "session"}
          onChange={() => void onStorageChange("session")}
          label="Until I close the browser"
          detail="Safer on shared computers. You paste the key again after a restart."
        />
        <RadioRow
          name="key-storage"
          checked={settings.keyStorage === "local"}
          onChange={() => void onStorageChange("local")}
          label="On this device"
          detail="Stored unencrypted in this browser profile's extension storage."
        />
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => void onSave()} disabled={busy !== null}>
          {busy === "save" ? "Saving…" : "Save key"}
        </Button>
        <Button onClick={() => void onTest()} disabled={busy !== null || (!draft && !hasApiKey)}>
          {busy === "test" ? "Testing…" : "Test key"}
        </Button>
        {hasApiKey && !confirmRemove && (
          <button type="button" className="fp-link ml-auto min-h-11 text-[14px]" onClick={() => setConfirmRemove(true)}>
            Remove key
          </button>
        )}
      </div>
      {hasApiKey && confirmRemove && (
        <div className="fp-inset p-4 ring-1 ring-danger/50">
          <p className="text-[16px]">Remove the saved key? You will need to paste it again to fill pages.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" onClick={() => void onRemove()}>
              Remove key
            </Button>
            <Button onClick={() => setConfirmRemove(false)}>Keep key</Button>
          </div>
        </div>
      )}
      <StatusLine tone={line?.tone}>{line?.text}</StatusLine>
    </Section>
  );
}

/* ───────────────────────── Model ───────────────────────── */

function ModelSection({ settings }: { settings: Settings }) {
  const [line, setLine] = useState<Line>(null);
  async function choose(choice: Settings["model"]) {
    await saveSettings({ ...settings, model: choice });
    setLine({ tone: "ok", text: "Model saved." });
  }
  return (
    <Section title="Model" description="Which Claude model drafts your answers. You pay Anthropic per use with your key.">
      <fieldset>
        <legend className="sr-only">Model</legend>
        {MODELS.map((m) => (
          <RadioRow
            key={m.choice}
            name="model"
            checked={settings.model === m.choice}
            onChange={() => void choose(m.choice)}
            label={m.label}
            detail={m.detail}
          />
        ))}
      </fieldset>
      <StatusLine tone={line?.tone}>{line?.text}</StatusLine>
    </Section>
  );
}

/* ───────────────────────── Page behaviour ───────────────────────── */

function PageSection({ settings }: { settings: Settings }) {
  const [line, setLine] = useState<Line>(null);
  async function toggle(on: boolean) {
    await saveSettings({ ...settings, highlightFields: on });
    setLine({ tone: "ok", text: on ? "Filled fields will be outlined." : "Filled fields will not be outlined." });
  }
  return (
    <Section title="On the page" description="FormPilot fills fields and stops. It never presses Submit.">
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-[18px] shrink-0 accent-[var(--action)]"
          checked={settings.highlightFields}
          onChange={(e) => void toggle(e.target.checked)}
        />
        <span>
          <span className="block text-[16px] font-medium">Outline filled fields</span>
          <span className="block text-[14px] text-muted">
            Green for answers from your profile, amber for drafted answers to check.
          </span>
        </span>
      </label>
      <StatusLine tone={line?.tone}>{line?.text}</StatusLine>
    </Section>
  );
}

/* ───────────────────────── Data ───────────────────────── */

function DataSection({ profile, resume }: { profile: Profile; resume: Resume }) {
  const [line, setLine] = useState<Line>(null);
  const [pendingImport, setPendingImport] = useState<{ name: string; data: VaultExport } | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function onExport() {
    const data: VaultExport = {
      format: "formpilot-vault",
      version: 1,
      exportedAt: new Date().toISOString(),
      profile,
      resume,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `formpilot-vault-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setLine({ tone: "ok", text: "Exported your profile and resume. The API key is not in the file." });
  }

  async function onPick(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    try {
      const parsed = VaultExportSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) {
        setLine({ tone: "danger", text: "That file is not a FormPilot export." });
        return;
      }
      setPendingImport({ name: file.name, data: parsed.data });
      setLine(null);
    } catch {
      setLine({ tone: "danger", text: "That file is not valid JSON." });
    }
  }

  async function onConfirmImport() {
    if (!pendingImport) return;
    await saveProfile(pendingImport.data.profile);
    await saveResume(pendingImport.data.resume.markdown);
    setLine({ tone: "ok", text: `Imported ${pendingImport.name}.` });
    setPendingImport(null);
  }

  async function onWipe() {
    await wipeAll();
    setConfirmWipe(false);
    setLine({ tone: "ok", text: "Everything FormPilot stored on this device is deleted." });
  }

  return (
    <Section title="Your data" description="Everything stays in this browser profile. Nothing syncs to other devices.">
      <div className="flex flex-wrap gap-2">
        <Button onClick={onExport}>Export profile</Button>
        <Button onClick={() => fileRef.current?.click()}>Import profile</Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
      </div>

      {pendingImport && (
        <div className="fp-inset p-4 ring-1 ring-warn/50">
          <p className="text-[16px]">
            Replace your profile and resume with <span className="font-medium">{pendingImport.name}</span>?
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={() => void onConfirmImport()}>
              Replace profile
            </Button>
            <Button onClick={() => setPendingImport(null)}>Keep current</Button>
          </div>
        </div>
      )}

      <div className="border-t border-line pt-4">
        {!confirmWipe ? (
          <Button variant="danger" onClick={() => setConfirmWipe(true)}>
            Delete all data
          </Button>
        ) : (
          <div className="fp-inset p-4 ring-1 ring-danger/50">
            <p className="text-[16px]">
              Delete your profile, resume, API key and settings from this device? This cannot be undone.
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="danger" onClick={() => void onWipe()}>
                Delete everything
              </Button>
              <Button onClick={() => setConfirmWipe(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
      <StatusLine tone={line?.tone}>{line?.text}</StatusLine>
    </Section>
  );
}

/* ───────────────────────── shared ───────────────────────── */

function RadioRow({
  name,
  checked,
  onChange,
  label,
  detail,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  detail?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-1 size-[18px] shrink-0 accent-[var(--action)]"
      />
      <span>
        <span className="block text-[16px] font-medium">{label}</span>
        {detail && <span className="block text-[14px] text-muted">{detail}</span>}
      </span>
    </label>
  );
}
