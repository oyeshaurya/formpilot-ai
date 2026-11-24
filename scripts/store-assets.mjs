// Renders store images into store/ with headless Microsoft Edge:
//   screenshot-1-filled-form.png   1280×800  (Chrome Web Store + Edge Add-ons)
//   screenshot-2-review.png        1280×800
//   promo-small-440x280.png        Chrome Web Store small promo tile (required)
//   logo-300.png                   Edge Add-ons logo (1:1, 300×300)
// Uses the real screenshots from `npm run e2e` (e2e-results/), so run that first.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findEdge, renderPages } from "./lib/edge.mjs";
import { logoPage } from "./logo.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = path.join(root, "e2e-results");
const out = path.join(root, "store");
const need = ["1-filled-page.png", "2-panel-review.png"].map((f) => path.join(shots, f));
if (!need.every(existsSync)) {
  console.error("Run `npm run e2e` first: the store screenshots are made from its real screenshots.");
  process.exit(2);
}
if (!findEdge()) {
  console.error("Microsoft Edge not found. Set EDGE_PATH.");
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const img = (f) => `data:image/png;base64,${readFileSync(path.join(shots, f)).toString("base64")}`;
// The panel's Glass look (docs/DESIGN.md): near-black ground, a cyan light top right, a teal light left, a faint glow at the foot.
const ENV = `background:#080b0e;background-image:radial-gradient(60% 55% at 100% 0%,rgba(39,217,232,.2),transparent 70%),radial-gradient(50% 55% at 0% 45%,rgba(58,166,161,.13),transparent 72%),radial-gradient(70% 45% at 40% 115%,rgba(39,217,232,.08),transparent 70%);`;
// The panel's three typefaces, embedded from the bundled packages so the images need no network:
// Manrope (text), JetBrains Mono (the wordmark), Instrument Serif italic (headlines).
const font = (rel) => readFileSync(path.join(root, "node_modules", rel)).toString("base64");
const FONT_FACE = [
  `@font-face{font-family:"Manrope";font-weight:200 800;src:url(data:font/woff2;base64,${font("@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2")}) format("woff2")}`,
  `@font-face{font-family:"JetBrains Mono";font-weight:100 800;src:url(data:font/woff2;base64,${font("@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2")}) format("woff2")}`,
  `@font-face{font-family:"Instrument Serif";font-style:italic;font-weight:400;src:url(data:font/woff2;base64,${font("@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2")}) format("woff2")}`,
].join("");
// The wordmark, as in the panel: a glowing cyan dot and the name in lowercase monospace.
const wordmark = (size) =>
  `<div style="display:flex;align-items:center;gap:${Math.round(size * 0.6)}px;font:600 ${size}px/1 'JetBrains Mono',monospace;letter-spacing:-.02em"><span style="width:${Math.round(size * 0.6)}px;height:${Math.round(size * 0.6)}px;border-radius:50%;background:#27d9e8;box-shadow:0 0 0 ${Math.round(size * 0.2)}px rgba(39,217,232,.16),0 0 ${size}px rgba(39,217,232,.65)"></span>formpilot</div>`;
const SERIF = `font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-weight:400;letter-spacing:-.01em;text-wrap:balance;`;
const FONT = `font-family:"Manrope",system-ui,sans-serif;`;
const page = (w, h, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_FACE}*{box-sizing:border-box;margin:0}html,body{width:${w}px;height:${h}px;overflow:hidden;${ENV}${FONT}color:#f1f5f7;-webkit-font-smoothing:antialiased}</style></head><body>${body}</body></html>`;

// A screenshot in a glass frame: a cyan-lit top edge and a deep, soft shadow.
const frame = (src, w, h, x, y, crop = "30% top") =>
  `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:22px;overflow:hidden;box-shadow:0 30px 70px -24px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.12),inset 0 1px 0 rgba(39,217,232,.35)"><img src="${src}" style="display:block;width:100%;height:100%;object-fit:cover;object-position:${crop}"></div>`;
const region = (src, [x0, x1], [imgW, imgH], x, w) => {
  const s = w / (x1 - x0);
  const h = Math.round(imgH * s);
  const y = Math.round((800 - h) / 2);
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:22px;overflow:hidden;box-shadow:0 30px 70px -24px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.12)"><img src="${src}" style="display:block;width:${imgW * s}px;height:${h}px;max-width:none;margin-left:${-x0 * s}px"></div>`;
};
const caption = (t, s) =>
  `<div style="position:absolute;left:56px;top:62px;width:380px">${wordmark(20)}<h1 style="margin-top:30px;font-size:52px;line-height:1.02;${SERIF}">${t}</h1><p style="margin-top:18px;font-size:18px;line-height:1.55;color:#9aa6af">${s}</p></div>`;

const pages = {
  "screenshot-1-filled-form.png": [1280, 800, page(1280, 800, caption("Fill job applications in one click.", "Your profile and resume stay on your device. FormPilot fills the form and outlines every answer. It never presses Submit.") + region(img("1-filled-page.png"), [236, 1232], [1254, 807], 470, 760))],
  "screenshot-2-review.png": [1280, 800, page(1280, 800, caption("Review every answer before you send.", "Green came from your profile, amber was drafted for you to check. Undo any field, or all of them.") + frame(img("1-filled-page.png"), 520, 690, 470, 56, "28% top") + frame(img("2-panel-review.png"), 360, 690, 870, 56, "top"))],
  "promo-small-440x280.png": [440, 280, page(440, 280, `<div style="padding:40px 34px">${wordmark(24)}<p style="margin-top:26px;font-size:34px;line-height:1.05;${SERIF}">Fill web forms from your own profile.</p><p style="margin-top:12px;font-size:15px;color:#9aa6af">You review every answer. It never submits.</p></div>`)],
  "logo-300.png": [300, 300, logoPage(300)], // the same logo as the toolbar icons (scripts/logo.mjs)
};

const entries = Object.entries(pages);
const pngs = await renderPages(entries.map(([file, [width, height, html]]) => ({ html, width, height, transparent: file === "logo-300.png" })));
entries.forEach(([file, [w, h]], i) => {
  writeFileSync(path.join(out, file), pngs[i]);
  console.log(`wrote store/${file} (${w}×${h})`);
});
