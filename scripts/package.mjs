// Packages dist/ into release/formpilot-ai-<version>.zip for the Chrome Web Store and Edge Add-ons.
//   npm run package        (builds first, then checks and zips)
// The same zip is uploaded to both stores. Checks fail the run instead of shipping a bad package.
import { deflateRawSync } from "node:zlib";
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(path.join(dist, "manifest.json"), "utf8"));

/* ───────────── store checks ───────────── */
const problems = [];
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(full);
  }
})(dist);

if (manifest.manifest_version !== 3) problems.push("manifest_version must be 3");
if (manifest.version !== pkg.version) problems.push(`manifest version ${manifest.version} ≠ package.json ${pkg.version}`);
if (/E2E/i.test(manifest.name)) problems.push("this is the E2E test build; run npm run build");
if ((manifest.host_permissions ?? []).some((h) => /localhost|<all_urls>|\*:\/\/\*\//.test(h))) problems.push(`host_permissions too broad: ${manifest.host_permissions}`);
if (manifest.content_scripts?.length) problems.push("unexpected content_scripts: the page script must be injected on demand");
if (!manifest.icons?.["128"]) problems.push("missing 128px icon");
if (manifest.description.length > 132) problems.push(`description is ${manifest.description.length} characters; stores allow 132`);
for (const f of files) {
  const rel = path.relative(dist, f).split(path.sep).join("/");
  if (rel.endsWith(".map")) problems.push(`source map in package: ${rel}`);
  if (/\.(m?js|html)$/.test(rel)) {
    const code = readFileSync(f, "utf8");
    if (/\beval\s*\(/.test(code)) problems.push(`eval() in ${rel}`);
    if (/new Function\s*\(/.test(code)) problems.push(`new Function in ${rel}`);
    if (/<script[^>]+src=["']https?:/i.test(code) || /importScripts\(\s*["']https?:/.test(code)) problems.push(`remote script in ${rel}`);
    if (/msg_e2e|E2E stand-in/.test(code)) problems.push(`E2E stand-in code in ${rel}`);
  }
}
if (problems.length) {
  console.error("Not packaged:\n - " + problems.join("\n - "));
  process.exit(1);
}

/* ───────────── a small, dependency-free zip writer ───────────── */
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

const local = [];
const central = [];
let offset = 0;
const now = new Date();
for (const f of files.sort()) {
  const name = Buffer.from(path.relative(dist, f).split(path.sep).join("/"), "utf8");
  const data = readFileSync(f);
  const packed = deflateRawSync(data, { level: 9 });
  const useDeflate = packed.length < data.length;
  const body = useDeflate ? packed : data;
  const crc = crc32(data);
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(0x0800, 6); // UTF-8 names
  h.writeUInt16LE(useDeflate ? 8 : 0, 8);
  h.writeUInt16LE(dosTime(now), 10);
  h.writeUInt16LE(dosDate(now), 12);
  h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(body.length, 18);
  h.writeUInt32LE(data.length, 22);
  h.writeUInt16LE(name.length, 26);
  h.writeUInt16LE(0, 28);
  local.push(h, name, body);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0);
  c.writeUInt16LE(20, 4);
  c.writeUInt16LE(20, 6);
  c.writeUInt16LE(0x0800, 8);
  c.writeUInt16LE(useDeflate ? 8 : 0, 10);
  c.writeUInt16LE(dosTime(now), 12);
  c.writeUInt16LE(dosDate(now), 14);
  c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(body.length, 20);
  c.writeUInt32LE(data.length, 24);
  c.writeUInt16LE(name.length, 28);
  c.writeUInt32LE(offset, 42);
  central.push(c, name);
  offset += h.length + name.length + body.length;
}
const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);

const outDir = path.join(root, "release");
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `formpilot-ai-${pkg.version}.zip`);
writeFileSync(out, Buffer.concat([...local, centralBuf, end]));
const kb = (statSync(out).size / 1024).toFixed(0);
console.log(`Store checks passed. ${files.length} files → ${path.relative(root, out)} (${kb} KB)`);
console.log("Upload this same zip to the Chrome Web Store and to Microsoft Edge Add-ons (docs/STORE_SUBMISSION.md).");
