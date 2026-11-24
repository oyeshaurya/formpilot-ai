// Renders store images into store/ with headless Microsoft Edge:
//   screenshot-1-filled-form.png   1280×800  (Chrome Web Store + Edge Add-ons)
//   screenshot-2-review.png        1280×800
//   promo-small-440x280.png        Chrome Web Store small promo tile (required)
//   logo-300.png                   Edge Add-ons logo (1:1, 300×300)
// Uses the real screenshots from `npm run e2e` (e2e-results/), so run that first.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = path.join(root, "e2e-results");
const out = path.join(root, "store");
const need = ["1-filled-page.png", "2-panel-review.png"].map((f) => path.join(shots, f));
if (!need.every(existsSync)) {
  console.error("Run `npm run e2e` first: the store screenshots are made from its real screenshots.");
  process.exit(2);
}
const edge = [process.env.EDGE_PATH, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/usr/bin/microsoft-edge"].find(
  (p) => p && existsSync(p),
);
if (!edge) {
  console.error("Microsoft Edge not found. Set EDGE_PATH.");
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const img = (f) => `data:image/png;base64,${readFileSync(path.join(shots, f)).toString("base64")}`;
const ENV = `background:#080b10;background-image:radial-gradient(70% 60% at 100% 0%,rgba(54,160,170,.55),transparent 65%),radial-gradient(60% 60% at 0% 40%,rgba(46,92,170,.5),transparent 65%),radial-gradient(60% 50% at 20% 110%,rgba(176,112,72,.32),transparent 65%);`;
const FONT = `font-family:"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;`;
const logo = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><rect width="24" height="24" rx="5.3" fill="#0f1720"/><rect x="5.3" y="6.5" width="13.4" height="2.9" rx="1.45" fill="#fff"/><rect x="5.3" y="10.8" width="13.4" height="2.9" rx="1.45" fill="#fff"/><rect x="5.3" y="15.1" width="7.7" height="2.9" rx="1.45" fill="#5eead4"/></svg>`;
const page = (w, h, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0}html,body{width:${w}px;height:${h}px;overflow:hidden;${ENV}${FONT}color:#f4f7fa}</style></head><body>${body}</body></html>`;

const frame = (src, w, h, x, y, crop = "30% top") =>
  `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:20px;overflow:hidden;box-shadow:0 30px 70px -20px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.14)"><img src="${src}" style="display:block;width:100%;height:100%;object-fit:cover;object-position:${crop}"></div>`;
const caption = (t, s) =>
  `<div style="position:absolute;left:56px;top:56px;width:380px"><div style="display:flex;align-items:center;gap:12px;font-size:20px;font-weight:600">${logo(32)}FormPilot AI</div><h1 style="margin-top:28px;font-size:40px;line-height:1.08;font-weight:600;letter-spacing:-.02em">${t}</h1><p style="margin-top:16px;font-size:18px;line-height:1.5;color:rgba(226,233,240,.75)">${s}</p></div>`;

const pages = {
  "screenshot-1-filled-form.png": [1280, 800, page(1280, 800, caption("Fill job applications in one click.", "Your profile and resume stay on your device. FormPilot fills the form and outlines every answer. It never presses Submit.") + frame(img("1-filled-page.png"), 760, 690, 470, 56))],
  "screenshot-2-review.png": [1280, 800, page(1280, 800, caption("Review every answer before you send.", "Green came from your profile, amber was drafted for you to check. Undo any field, or all of them.") + frame(img("1-filled-page.png"), 520, 690, 470, 56, "28% top") + frame(img("2-panel-review.png"), 360, 690, 870, 56, "top"))],
  "promo-small-440x280.png": [440, 280, page(440, 280, `<div style="padding:36px 32px"><div style="display:flex;align-items:center;gap:14px">${logo(48)}<span style="font-size:28px;font-weight:600;letter-spacing:-.02em">FormPilot AI</span></div><p style="margin-top:22px;font-size:20px;line-height:1.35;font-weight:500">Fill web forms from your own profile.</p><p style="margin-top:8px;font-size:15px;color:rgba(226,233,240,.75)">You review every answer. It never submits.</p></div>`)],
  "logo-300.png": [300, 300, `<!doctype html><html><head><style>html,body{margin:0;width:300px;height:300px;background:transparent}</style></head><body>${logo(300)}</body></html>`],
};

const tmp = mkdtempSync(path.join(tmpdir(), "formpilot-store-"));
const port = 9900 + Math.floor(Math.random() * 90);
const browser = spawn(edge, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${tmp}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let version;
  for (let i = 0; i < 40 && !version; i++) {
    await wait(250);
    version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null);
  }
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let n = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (pending.has(d.id)) pending.get(d.id)(d), pending.delete(d.id);
  };
  const send = (method, params = {}, sessionId) => new Promise((r) => { const id = ++n; pending.set(id, r); ws.send(JSON.stringify({ id, method, params, sessionId })); });
  for (const [file, [w, h, html]] of Object.entries(pages)) {
    const htmlPath = path.join(tmp, file + ".html");
    writeFileSync(htmlPath, html);
    const { result } = await send("Target.createTarget", { url: "about:blank" });
    const { result: att } = await send("Target.attachToTarget", { targetId: result.targetId, flatten: true });
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false }, att.sessionId);
    if (file === "logo-300.png") await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } }, att.sessionId);
    await send("Page.navigate", { url: "file:///" + htmlPath.replace(/\\/g, "/") }, att.sessionId);
    await wait(700);
    const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: w, height: h, scale: 1 } }, att.sessionId);
    writeFileSync(path.join(out, file), Buffer.from(shot.result.data, "base64"));
    console.log(`wrote store/${file} (${w}×${h})`);
  }
  ws.close();
} finally {
  browser.kill();
}
