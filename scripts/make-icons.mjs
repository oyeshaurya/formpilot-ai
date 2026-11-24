// Renders the FormPilot icon to public/icons/icon-{16,32,48,128}.png.
// No dependencies: shapes are signed-distance rounded rectangles, 4x4 supersampled,
// written with node:zlib into a minimal RGBA PNG. Run: npm run icons
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const SIZES = [16, 32, 48, 128];

// Colours: the dark glass palette: ink-blue ground, white lines, the short "filled" line in aqua.
const BG = [15, 23, 32];   // #0f1720
const FG = [255, 255, 255];
const MINT = [94, 234, 212]; // #5eead4

// Shapes in unit space (0..1). Drawn back to front.
const shapes = [
  { x: 0.0, y: 0.0, w: 1.0, h: 1.0, r: 0.22, c: BG },
  { x: 0.22, y: 0.27, w: 0.56, h: 0.12, r: 0.06, c: FG },
  { x: 0.22, y: 0.45, w: 0.56, h: 0.12, r: 0.06, c: FG },
  { x: 0.22, y: 0.63, w: 0.32, h: 0.12, r: 0.06, c: MINT },
];

function sdRoundRect(px, py, s) {
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  const qx = Math.abs(px - cx) - (s.w / 2 - s.r);
  const qy = Math.abs(py - cy) - (s.h / 2 - s.r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - s.r;
}

function render(size) {
  const SS = 4;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          let c = null;
          for (const s of shapes) if (sdRoundRect(u, v, s) <= 0) c = s.c;
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
        }
      }
      const i = (y * size + x) * 4;
      px[i] = a ? Math.round(r / a) : 0;
      px[i + 1] = a ? Math.round(g / a) : 0;
      px[i + 2] = a ? Math.round(b / a) : 0;
      px[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return px;
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  const file = path.join(OUT, `icon-${size}.png`);
  writeFileSync(file, png(size, render(size)));
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
