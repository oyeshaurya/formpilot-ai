// End-to-end test: the real unpacked extension in headless Microsoft Edge, filling a React form.
//   npm run e2e            (builds dist-e2e/, serves dev/ on :5175, drives Edge over DevTools)
// The E2E build differs from the store build in two ways only: it may reach http://localhost, and
// the Claude API is a local stand-in (src/background/fake-claude.ts), so no key or network is needed.
// Set EDGE_PATH (or CHROME_PATH to a Chrome for Testing binary) if the browser is not found.
// Branded Google Chrome 137+ ignores --load-extension, so Edge is the default.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(root, "e2e-results");
const PORT = 5175;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browserPath = [
  process.env.EDGE_PATH,
  process.env.CHROME_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/microsoft-edge",
  "/usr/bin/microsoft-edge-stable",
].find((p) => p && existsSync(p));
if (!browserPath) {
  console.error("Microsoft Edge not found. Set EDGE_PATH to its executable.");
  process.exit(2);
}

/* 1 · build the test variant */
process.chdir(root);
process.env.FP_E2E = "1";
const vite = await import("vite");
await vite.build({ logLevel: "warn" });
delete process.env.FP_E2E;
const ext = path.join(root, "dist-e2e");

/* 2 · serve the test form */
const server = await vite.createServer({ configFile: path.join(root, "dev/vite.config.ts"), server: { port: PORT, strictPort: true }, logLevel: "warn" });
await server.listen();

/* 3 · launch Edge with the extension */
const profile = mkdtempSync(path.join(tmpdir(), "formpilot-e2e-"));
const debugPort = 9500 + Math.floor(Math.random() * 400);
const browser = spawn(
  browserPath,
  [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

let ws;
try {
  /* CDP plumbing */
  let sw;
  for (let i = 0; i < 40 && !sw; i++) {
    await wait(300);
    try {
      sw = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((t) => t.url.endsWith("/service-worker-loader.js"));
    } catch {}
  }
  if (!sw) throw new Error("the extension's service worker did not start");
  const extId = new URL(sw.url).host;
  const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let n = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    }
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((r) => {
      const id = ++n;
      pending.set(id, r);
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const open = async (url) => {
    const { result } = await send("Target.createTarget", { url });
    const { result: att } = await send("Target.attachToTarget", { targetId: result.targetId, flatten: true });
    await send("Runtime.enable", {}, att.sessionId);
    return { targetId: result.targetId, session: att.sessionId };
  };
  const evaluate = async (session, expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, session);
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  const shot = async (session, file) => {
    const r = await send("Page.captureScreenshot", { format: "png" }, session);
    if (r.result) writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, "base64"));
  };
  const runOf = (panel, tabId) => evaluate(panel.session, `chrome.storage.session.get("fp:run:${tabId}").then(r => r["fp:run:${tabId}"])`);
  const waitRun = async (panel, tabId) => {
    let run;
    for (let i = 0; i < 80; i++) {
      await wait(250);
      run = await runOf(panel, tabId);
      if (run && (run.status === "done" || run.status === "error")) break;
    }
    return run;
  };
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });

  /* 4 · the panel page, with a profile and a key in storage */
  const panel = await open(`chrome-extension://${extId}/src/sidepanel/index.html`);
  await wait(800);
  await evaluate(
    panel.session,
    `(async () => {
      window.__fpErrors = [];
      window.addEventListener("error", (e) => window.__fpErrors.push(String(e.message)));
      window.addEventListener("unhandledrejection", (e) => window.__fpErrors.push(String(e.reason)));
      await chrome.storage.local.set({ "fp:profile": {
        personal: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "+44 20 7946 0000" },
        address: { city: "London", country: "India" },
        links: { linkedin: "https://linkedin.com/in/ada" },
        work: { currentTitle: "Staff Engineer", yearsExperience: "7", skills: "TypeScript, React" },
        education: {}, customFacts: [{ id: "aad", label: "Aadhaar card number", value: "1234 5678 9012" }] } });
      await chrome.storage.local.set({ "fp:resume": { markdown: "# Ada Lovelace\\nStaff Engineer building accessible tools.", updatedAt: "" } });
      await chrome.storage.session.set({ "fp:apiKey": "sk-ant-api03-e2e-${"x".repeat(60)}" });
      return true;
    })()`,
  );

  /* 5 · fill the test form */
  const page = await open(`http://localhost:${PORT}/test-form.html`);
  await wait(1500);
  const tabId = await evaluate(panel.session, `chrome.tabs.query({ url: "http://localhost:${PORT}/*" }).then(t => t[0].id)`);
  check("test page opened", typeof tabId === "number");

  const start = await evaluate(panel.session, `chrome.runtime.sendMessage({ type: "FILL_PAGE", tabId: ${tabId} })`);
  check("fill starts", start?.ok === true, JSON.stringify(start));
  let run = await waitRun(panel, tabId);
  check("fill finishes", run?.status === "done", run?.status === "error" ? run.error?.message : run?.status);

  /* 6 · what React itself believes */
  const state = await evaluate(page.session, `JSON.parse(document.getElementById("state").textContent)`);
  check("first name in React state", state.firstName === "Ada", state.firstName);
  check("last name in React state", state.lastName === "Lovelace", state.lastName);
  check("email in React state", state.email === "ada@example.com", state.email);
  check("phone in React state", state.phone === "+44 20 7946 0000", state.phone);
  check("url field in React state", state.linkedin === "https://linkedin.com/in/ada", state.linkedin);
  check("select chose the option value", state.country === "in", state.country);
  check("number field", state.years === "7", state.years);
  check("job title", state.title === "Staff Engineer", state.title);
  check("radio group", state.authorized === "yes", state.authorized);
  // Expected: the form's skill boxes that also appear in the test profile ("TypeScript, React").
  const expectedSkills = await evaluate(page.session, `[...document.querySelectorAll("input[name=skills]")].map(b => b.value).filter(v => ["typescript", "react"].includes(v.toLowerCase())).sort()`);
  check("checkbox group", JSON.stringify([...state.skills].sort()) === JSON.stringify(expectedSkills), `${JSON.stringify(state.skills)} expected ${JSON.stringify(expectedSkills)}`);
  check("drafted open answer", typeof state.why === "string" && state.why.length > 40, `${state.why.length} chars`);
  check("consent box left unticked", state.agree === false);
  check("demographic question left empty", state.gender === "", state.gender);
  check("pre-filled field left alone", state.referral === "FRIEND-42", state.referral);

  const dom = await evaluate(
    page.session,
    `({
      city: document.getElementById("frame").contentDocument.getElementById("city").value,
      password: document.getElementById("pw").value,
      card: document.getElementById("cc").value,
      csrf: document.querySelector("[name=csrf_token]").value,
      submitted: window.__submitted === true,
      outlineFirst: document.getElementById("fn").style.outline,
      outlineWhy: document.getElementById("why").style.outline,
      bar: !!document.querySelector("formpilot-bar"),
      pwTagged: document.getElementById("pw").hasAttribute("data-formpilot-id"),
      ccTagged: document.getElementById("cc").hasAttribute("data-formpilot-id"),
    })`,
  );
  check("field inside a same-origin iframe", dom.city === "London", dom.city);
  check("password never read or filled", dom.password === "" && !dom.pwTagged);
  check("card number never read or filled", dom.card === "" && !dom.ccTagged);
  const aad = await evaluate(page.session, `({ value: document.getElementById("ad").value, tagged: document.getElementById("ad").hasAttribute("data-formpilot-id") })`);
  check("Aadhaar filled from your saved fact (React state)", aad.value === "1234 5678 9012" && state.aadhaar === "1234 5678 9012", JSON.stringify(aad));
  check("Aadhaar never sent to the API", !(run?.unmapped ?? []).some((u) => /LEAK/.test(u.reason)));
  const aadItem = (run?.items ?? []).find((i) => /aadhaar/i.test(i.label));
  check("Aadhaar masked in the review", aadItem?.value === "XXXX XXXX 9012" && /never sent/.test(aadItem?.reasoning ?? ""), aadItem?.value);
  check("hidden CSRF token untouched", dom.csrf === "abc123");
  check("form never submitted", dom.submitted === false);
  check("profile answer outlined green", /solid/.test(dom.outlineFirst) && /22, 163, 74|16a34a/i.test(dom.outlineFirst), dom.outlineFirst);
  check("drafted answer outlined amber", /217, 119, 6|d97706/i.test(dom.outlineWhy), dom.outlineWhy);
  check("on-page bar shown", dom.bar);

  const items = run?.items ?? [];
  check("review list has items", items.length >= 10, `${items.length} items`);
  check("unmapped list explains consent", (run?.unmapped ?? []).some((u) => /own decision/.test(u.reason)));
  check("unmapped list explains demographic", (run?.unmapped ?? []).some((u) => /Personal question/.test(u.reason)));
  check("sensitive fields still skipped (password, card)", (run?.skipped?.sensitive ?? 0) >= 2, JSON.stringify(run?.skipped));
  check("usage recorded", (run?.usage?.cacheRead ?? 0) > 0);
  await shot(page.session, "1-filled-page.png");

  /* 7 · the panel's review, rendered for real */
  const panelTab = await evaluate(panel.session, `chrome.tabs.getCurrent().then(t => t.id)`);
  await evaluate(panel.session, `chrome.storage.session.set({ "fp:run:${panelTab}": ${JSON.stringify(run)} })`);
  await send("Emulation.setDeviceMetricsOverride", { width: 400, height: 1600, deviceScaleFactor: 1, mobile: false }, panel.session);
  await wait(900);
  const reviewText = await evaluate(panel.session, `document.body.innerText`);
  check("panel shows the review", /Check what was filled/.test(reviewText) && /Left for you/.test(reviewText));
  check("panel knows the vault is ready", /Nothing is submitted/.test(reviewText));
  check("review shows option labels, not values", /Country of residence[\s\S]{0,40}India/.test(reviewText));
  await shot(panel.session, "2-panel-review.png");

  /* 8 · show a field, undo one, undo all */
  const email = items.find((i) => /email/i.test(i.label));
  const shown = await evaluate(panel.session, `chrome.runtime.sendMessage({ type: "SHOW_FIELD", tabId: ${tabId}, fieldId: ${JSON.stringify(email?.id)} })`);
  check("show on page", shown?.ok === true);
  await evaluate(panel.session, `chrome.runtime.sendMessage({ type: "UNDO", tabId: ${tabId}, fieldIds: [${JSON.stringify(email?.id)}] })`);
  await wait(300);
  const afterOne = await evaluate(page.session, `JSON.parse(document.getElementById("state").textContent)`);
  check("undo one field", afterOne.email === "" && afterOne.firstName === "Ada", `email="${afterOne.email}"`);
  await evaluate(panel.session, `chrome.runtime.sendMessage({ type: "UNDO", tabId: ${tabId} })`);
  await wait(600);
  const afterAll = await evaluate(page.session, `JSON.parse(document.getElementById("state").textContent)`);
  const cityAfter = await evaluate(page.session, `document.getElementById("frame").contentDocument.getElementById("city").value`);
  check(
    "undo all restores React state",
    afterAll.firstName === "" && afterAll.country === "" && afterAll.skills.length === 0 && afterAll.why === "",
    JSON.stringify({ firstName: afterAll.firstName, country: afterAll.country, authorized: afterAll.authorized, skills: afterAll.skills }),
  );
  check("undo all reaches the iframe", cityAfter === "", cityAfter);
  check("pre-filled value survives undo", afterAll.referral === "FRIEND-42");
  const runAfter = await runOf(panel, tabId);
  check("review marks items undone", runAfter.items.every((i) => i.state !== "filled"));
  // A React radio group that had nothing chosen cannot be un-chosen by any user action; the review must say so.
  const radioItem = runAfter.items.find((i) => i.kind === "radio-group");
  check("radio undo explains its limit", !!radioItem?.error && /radio choice/.test(radioItem.error), radioItem?.error);

  /* 9 · a second fill works on the same page (idempotent injection) */
  const again = await evaluate(panel.session, `chrome.runtime.sendMessage({ type: "FILL_PAGE", tabId: ${tabId} })`);
  run = await waitRun(panel, tabId);
  const state2 = await evaluate(page.session, `JSON.parse(document.getElementById("state").textContent)`);
  check("second fill on the same page", again?.ok === true && run.status === "done" && state2.firstName === "Ada", run?.error?.message);

  /* 9b · Basic mode: no API key at all, free and offline */
  await evaluate(panel.session, `chrome.runtime.sendMessage({ type: "UNDO", tabId: ${tabId} })`);
  await evaluate(panel.session, `chrome.storage.session.remove("fp:apiKey").then(() => chrome.storage.local.remove("fp:apiKey"))`);
  await wait(400);
  const basicStart = await evaluate(panel.session, `chrome.runtime.sendMessage({ type: "FILL_PAGE", tabId: ${tabId} })`);
  check("Basic mode starts without a key", basicStart?.ok === true, JSON.stringify(basicStart));
  run = await waitRun(panel, tabId);
  const basicState = await evaluate(page.session, `JSON.parse(document.getElementById("state").textContent)`);
  const basicCity = await evaluate(page.session, `document.getElementById("frame").contentDocument.getElementById("city").value`);
  check("Basic mode finishes", run?.status === "done" && run.model === "basic", `${run?.status} ${run?.model} ${run?.error?.message ?? ""}`);
  check(
    "Basic mode fills facts",
    basicState.firstName === "Ada" && basicState.email === "ada@example.com" && basicState.country === "in" && basicState.years === "7" && basicCity === "London",
    JSON.stringify({ first: basicState.firstName, email: basicState.email, country: basicState.country, years: basicState.years, city: basicCity }),
  );
  check("Basic mode ticks only your skills", JSON.stringify([...basicState.skills].sort()) === JSON.stringify(expectedSkills), `${JSON.stringify(basicState.skills)} expected ${JSON.stringify(expectedSkills)}`);
  check("Basic mode writes no open answers", basicState.why === "" && (run?.unmapped ?? []).some((u) => /does not write answers/.test(u.reason)));
  check("Basic mode leaves consent and gender", basicState.agree === false && basicState.gender === "");
  check("Basic mode fills Aadhaar from your saved fact", basicState.aadhaar === "1234 5678 9012", basicState.aadhaar);
  check("Basic mode sends nothing to Anthropic", !run?.usage);

  /* 9c · a Google Forms page (ARIA drop-downs, checkbox lists, radio groups), Basic mode */
  await evaluate(
    panel.session,
    `chrome.storage.local.set({ "fp:profile": {
      personal: { firstName: "Shaurya", lastName: "Verma", dateOfBirth: "2004-05-17", gender: "Male", nationality: "Indian",
                  phone: "+91 77038 19673", fatherName: "Rakesh Verma" },
      address: { country: "India" }, links: {},
      work: { skills: "TypeScript, Python, React" },
      education: { degree: "B.Tech", highestQualification: "Bachelor's degree", grade: "8.9" },
      customFacts: [{ id: "aad", label: "Aadhaar Card", value: "538942581375" }] } })`,
  );
  const gform = await open(`http://localhost:${PORT}/gform.html`);
  await wait(1200);
  const gTab = await evaluate(panel.session, `chrome.tabs.query({ url: "http://localhost:${PORT}/gform.html" }).then(t => t[0].id)`);
  await evaluate(panel.session, `chrome.runtime.sendMessage({ type: "FILL_PAGE", tabId: ${gTab} })`);
  run = await waitRun(panel, gTab);
  check("Google Forms page fills", run?.status === "done", `${run?.status} ${run?.error?.message ?? ""}`);
  const g = await evaluate(gform.session, `gformState()`);
  check("GF: first and last name", g.first === "Shaurya" && g.last === "Verma", `${g.first} ${g.last}`);
  check("GF: no middle name invented", g.middle === "", g.middle);
  check("GF: alternate phone not copied from main", g.alt === "" && g.phone === "+91 77038 19673", `alt="${g.alt}"`);
  check("GF: date of birth (sub-label 'Date')", g.dob === "2004-05-17", g.dob);
  check("GF: gender radio from profile", g.gender === "Male", g.gender);
  check("GF: nationality drop-down", g.nat === "Indian", g.nat);
  check("GF: country drop-down", g.country === "India", g.country);
  check("GF: highest qualification drop-down", g.hq === "Bachelor's degree", g.hq);
  check("GF: skills ticked, combined option counts", JSON.stringify(g.skills) === JSON.stringify(["JavaScript / TypeScript", "Python"]), JSON.stringify(g.skills));
  check("GF: CGPA from profile", g.cgpa === "8.9", g.cgpa);
  check("GF: Class 10 marks not given the degree CGPA", g.c10 === "", g.c10);
  check("GF: father's name, not his occupation", g.father === "Rakesh Verma" && g.focc === "", `${g.father} / ${g.focc}`);
  check("GF: declaration left for you", g.decl === false);
  check("GF: Aadhaar from a fact named Aadhaar Card", g.aad === "538942581375", g.aad);
  await shot(gform.session, "5-google-form.png");
  await evaluate(panel.session, `chrome.runtime.sendMessage({ type: "UNDO", tabId: ${gTab} })`);
  await wait(2500);
  const gu = await evaluate(gform.session, `gformState()`);
  check("GF: undo resets drop-downs and boxes", gu.nat === "" && gu.country === "" && gu.hq === "" && gu.skills.length === 0 && gu.first === "", JSON.stringify(gu));

  /* 10 · browser pages are refused with a clear reason */
  await open("edge://version");
  await wait(600);
  const internalTab = await evaluate(panel.session, `chrome.tabs.query({}).then(ts => ts.find(t => (t.url || t.pendingUrl || "").startsWith("edge://"))?.id ?? null)`);
  if (internalTab !== null) {
    const refused = await evaluate(panel.session, `chrome.runtime.sendMessage({ type: "FILL_PAGE", tabId: ${internalTab} })`);
    check("browser pages refused clearly", refused?.ok === false && (refused.kind === "restricted" || refused.kind === "permission"), `${refused?.kind}: ${refused?.error}`);
  }

  /* 10b · resume import: real PDF and Word files through the Resume tab's file picker */
  await send("Emulation.clearDeviceMetricsOverride", {}, panel.session);
  await evaluate(panel.session, `document.getElementById("tab-resume").click(), true`);
  await send("DOM.enable", {}, panel.session);
  const importFile = async (file) => {
    const { result: docRoot } = await send("DOM.getDocument", { depth: -1 }, panel.session);
    const { result: q } = await send("DOM.querySelector", { nodeId: docRoot.root.nodeId, selector: "#panel-resume input[type=file]" }, panel.session);
    await send("DOM.setFileInputFiles", { files: [path.join(root, "dev", "fixtures", file)], nodeId: q.nodeId }, panel.session);
    for (let i = 0; i < 60; i++) {
      await wait(250);
      const st = await evaluate(panel.session, `document.querySelector("#panel-resume [role=status]")?.textContent ?? ""`);
      if (/Imported|could not|not supported|no text/i.test(st)) break;
    }
    return evaluate(panel.session, `({ text: document.getElementById("resume-md").value, status: document.querySelector("#panel-resume [role=status]").textContent })`);
  };
  const pdf = await importFile("resume.pdf");
  check("PDF resume imports", /Imported resume\.pdf/.test(pdf.status), pdf.status);
  check("PDF name becomes a heading", /^# Priya Sharma/m.test(pdf.text), pdf.text.split("\n")[0]);
  check("PDF sections become subheadings", /^## Experience/m.test(pdf.text) && /^## Education/m.test(pdf.text));
  check("PDF bullets become a list", /^- Led the React and TypeScript rewrite/m.test(pdf.text));
  const docx = await importFile("resume.docx");
  check("Word resume imports", /Imported resume\.docx/.test(docx.status), docx.status);
  check("Word title, headings and list kept", /^# Priya Sharma/m.test(docx.text) && /^## Experience/m.test(docx.text) && /^- Cut form drop-off/m.test(docx.text));
  writeFileSync(path.join(SHOTS, "3-imported-pdf.md"), pdf.text);
  writeFileSync(path.join(SHOTS, "4-imported-docx.md"), docx.text);

  /* 11 · no errors in the panel */
  const panelErrors = await evaluate(panel.session, `window.__fpErrors ?? []`);
  check("panel has no uncaught errors", Array.isArray(panelErrors) && panelErrors.length === 0, JSON.stringify(panelErrors));
} catch (err) {
  check("run", false, err instanceof Error ? err.message : String(err));
} finally {
  try {
    ws?.close();
  } catch {}
  browser.kill();
  await server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Screenshots: ${path.relative(root, SHOTS)}/`);
process.exit(failed.length ? 1 : 0);
