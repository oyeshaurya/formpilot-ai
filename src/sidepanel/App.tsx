import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Island } from "./components/Island";
import { useActiveRun } from "./hooks/useRun";
import { useSpatialPointer } from "./hooks/useSpatialPointer";
import { useVault } from "./hooks/useVault";
import { FillView } from "./views/FillView";
import { ProfileView } from "./views/ProfileView";
import { ResumeView } from "./views/ResumeView";
import { SettingsView } from "./views/SettingsView";

export type TabId = "fill" | "profile" | "resume" | "settings";
const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  {
    id: "fill",
    label: "Fill",
    icon: (
      <path d="M4 20l9.5-9.5M14.5 4.5l1-2.5 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1ZM19 12l.6 1.4L21 14l-1.4.6L19 16l-.6-1.4L17 14l1.4-.6L19 12ZM11 2.5l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5.5-1Z" />
    ),
  },
  {
    id: "profile",
    label: "Profile",
    icon: (
      <>
        <circle cx="12" cy="8" r="3.6" />
        <path d="M4.8 20c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6" />
      </>
    ),
  },
  {
    id: "resume",
    label: "Resume",
    icon: (
      <>
        <path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8l-5-5Z" />
        <path d="M14 3v5h5M8.5 13h7M8.5 16.5h5" />
      </>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <>
        <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
        <circle cx="15" cy="7" r="2.2" />
        <circle cx="9" cy="17" r="2.2" />
      </>
    ),
  },
];

/** The toolbar popup loads popup.html, which marks <html class="fp-popup">; the side panel does not. */
const IN_POPUP = document.documentElement.classList.contains("fp-popup");

export function App() {
  const vault = useVault();
  const { run } = useActiveRun();
  useSpatialPointer();
  const [tab, setTab] = useState<TabId>("fill");
  const [dirty, setDirty] = useState<Record<TabId, boolean>>({ fill: false, profile: false, resume: false, settings: false });
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ fill: null, profile: null, resume: null, settings: null });
  const panelRef = useRef<HTMLElement>(null);

  const markProfile = useCallback((d: boolean) => setDirty((s) => (s.profile === d ? s : { ...s, profile: d })), []);
  const markResume = useCallback((d: boolean) => setDirty((s) => (s.resume === d ? s : { ...s, resume: d })), []);

  // Warn before the panel closes with unsaved drafts.
  const anyDirty = dirty.profile || dirty.resume;
  useEffect(() => {
    if (!anyDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  const select = (id: TabId, focus = false) => {
    setTab(id);
    panelRef.current?.scrollTo({ top: 0 });
    if (focus) tabRefs.current[id]?.focus();
  };

  // Arrow keys move between tabs (WAI-ARIA tabs pattern, automatic activation).
  // Up and Down work too, for the vertical sidebar on wide panels.
  const onTabKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = (
      { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: TABS.length - 1 } as Record<string, number>
    )[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(TABS[(next + TABS.length) % TABS.length]!.id, true);
  };

  const index = TABS.findIndex((t) => t.id === tab);

  // In the popup: a button that moves FormPilot into the side panel, which stays open while you use the page.
  const windowRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (IN_POPUP) void chrome.windows?.getCurrent().then((w) => (windowRef.current = w.id)).catch(() => undefined);
  }, []);
  const openSidePanel = () => {
    const windowId = windowRef.current;
    if (windowId === undefined || !chrome.sidePanel) return;
    // Called straight from the click: the browser opens a side panel only inside a user gesture.
    void chrome.sidePanel
      .open({ windowId })
      .then(() => window.close())
      .catch(() => undefined);
  };

  return (
    <div className="fp-shell">
      {/* The lit ground: two soft lights and a faint grid, behind every glass surface. */}
      <div className="fp-ambient" aria-hidden="true" />
      <a
        href="#content"
        className="sr-only z-30 rounded-[var(--r-sm)] bg-action px-4 py-3 font-medium text-action-ink focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <div className="fp-stage">
        {/* The top bar floats over the content; what scrolls under it blurs and fades. */}
        <header className={IN_POPUP ? "fp-top fp-top--popup" : "fp-top"}>
          {/* In the popup the pill sits between an empty slot and the side panel button, so it stays centred. */}
          {IN_POPUP && <span aria-hidden="true" />}
          <Island run={run} />
          {IN_POPUP && (
            <button type="button" className="fp-iconbtn" onClick={openSidePanel} aria-label="Open in side panel" title="Open in side panel">
              <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
                <path d="M14.5 4.5v15M17 8.5h1M17 11.5h1" />
              </svg>
            </button>
          )}
        </header>

        <main id="content" tabIndex={-1} ref={panelRef} className="fp-main">
          {!vault.loaded || !vault.profile || !vault.resume || !vault.settings ? (
            <p className="fp-view text-[16px] text-muted" role="status">
              Loading your vault…
            </p>
          ) : (
            <>
              {/* Views stay mounted so drafts survive switching tabs. */}
              <TabPanel id="fill" active={tab}>
                <FillView
                  profile={vault.profile}
                  resume={vault.resume}
                  settings={vault.settings}
                  hasApiKey={vault.hasApiKey}
                  goTo={(id) => select(id, true)}
                />
              </TabPanel>
              <TabPanel id="profile" active={tab}>
                <ProfileView saved={vault.profile} onDirtyChange={markProfile} />
              </TabPanel>
              <TabPanel id="resume" active={tab} fill>
                <ResumeView saved={vault.resume} onDirtyChange={markResume} />
              </TabPanel>
              <TabPanel id="settings" active={tab}>
                <SettingsView settings={vault.settings} profile={vault.profile} resume={vault.resume} hasApiKey={vault.hasApiKey} />
              </TabPanel>
            </>
          )}
        </main>
      </div>

      {/* The dock: floats over the foot of a narrow panel, becomes a sidebar on a wide one. */}
      <nav aria-label="FormPilot" className="fp-dock">
        <div
          role="tablist"
          aria-label="FormPilot sections"
          className="fp-tablist"
          style={{ "--i": index } as CSSProperties}
          onKeyDown={onTabKey}
        >
          {/* One cyan glass indicator slides to the open tab. */}
          <span className="fp-tab-indicator" aria-hidden="true" />
          {TABS.map((t) => {
            const selected = t.id === tab;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(t.id)}
                className="fp-tab"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {t.icon}
                </svg>
                <span>
                  {t.label}
                  {dirty[t.id] && (
                    <>
                      <span aria-hidden="true" className="ml-1 inline-block size-1.5 -translate-y-0.5 rounded-full bg-warn" />
                      <span className="sr-only">, unsaved changes</span>
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function TabPanel({ id, active, fill, children }: { id: TabId; active: TabId; fill?: boolean; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={id !== active}
      className={fill ? "fp-settle h-full" : "fp-settle"}
    >
      {children}
    </div>
  );
}
