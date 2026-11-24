// Renders HTML pages to PNG with headless Microsoft Edge over the DevTools protocol.
// Used by make-icons.mjs (the toolbar icons) and store-assets.mjs (store images).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function findEdge() {
  return [
    process.env.EDGE_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/microsoft-edge",
  ].find((p) => p && existsSync(p));
}

/**
 * pages: [{ html, width, height, transparent?, scale? }] → PNG buffers in the same order.
 * `scale` renders at a higher device pixel ratio (the PNG is width*scale wide).
 */
export async function renderPages(pages) {
  const edge = findEdge();
  if (!edge) throw new Error("Microsoft Edge not found. Set EDGE_PATH.");
  const tmp = mkdtempSync(path.join(tmpdir(), "formpilot-render-"));
  const port = 9900 + Math.floor(Math.random() * 90);
  const browser = spawn(edge, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${tmp}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    let version;
    for (let i = 0; i < 40 && !version; i++) {
      await wait(250);
      version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null);
    }
    if (!version) throw new Error("Edge did not start.");
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let n = 0;
    const pending = new Map();
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (pending.has(d.id)) pending.get(d.id)(d), pending.delete(d.id);
    };
    const send = (method, params = {}, sessionId) =>
      new Promise((r) => {
        const id = ++n;
        pending.set(id, r);
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      });
    const out = [];
    for (const [i, p] of pages.entries()) {
      const file = path.join(tmp, `page-${i}.html`);
      writeFileSync(file, p.html);
      const { result } = await send("Target.createTarget", { url: "about:blank" });
      const { result: att } = await send("Target.attachToTarget", { targetId: result.targetId, flatten: true });
      await send("Emulation.setDeviceMetricsOverride", { width: p.width, height: p.height, deviceScaleFactor: p.scale ?? 1, mobile: false }, att.sessionId);
      if (p.transparent) await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } }, att.sessionId);
      await send("Page.navigate", { url: "file:///" + file.replace(/\\/g, "/") }, att.sessionId);
      await wait(700);
      const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: p.width, height: p.height, scale: 1 } }, att.sessionId);
      out.push(Buffer.from(shot.result.data, "base64"));
      await send("Target.closeTarget", { targetId: result.targetId });
    }
    ws.close();
    return out;
  } finally {
    browser.kill();
  }
}
