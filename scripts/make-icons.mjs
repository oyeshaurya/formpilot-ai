// Renders the FormPilot logo (scripts/logo.mjs) to public/icons/icon-{16,32,48,128}.png
// with headless Microsoft Edge, on a transparent background. Run: npm run icons
// 16 and 32px use the logo's "small" detail (heavier strokes, no hairlines); 48 and 128px the full one.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { renderPages } from "./lib/edge.mjs";
import { logoPage } from "./logo.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const SIZES = [16, 32, 48, 128];

mkdirSync(OUT, { recursive: true });
const pngs = await renderPages(SIZES.map((size) => ({ html: logoPage(size), width: size, height: size, transparent: true })));
SIZES.forEach((size, i) => {
  const file = path.join(OUT, `icon-${size}.png`);
  writeFileSync(file, pngs[i]);
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
});
