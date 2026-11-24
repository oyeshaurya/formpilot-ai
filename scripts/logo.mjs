// The FormPilot logo, one source for the toolbar icons (make-icons.mjs) and the store logo (store-assets.mjs).
//
// The mark: a lowercase "f" (the wordmark's first letter, in the same mono-geometric spirit) whose
// crossbar is a cyan form line being filled, ending in the glowing dot from the wordmark: the cursor
// where FormPilot is writing. The crossbar passes behind the stem with a small cut on each side.
// The tile is the panel's glass: near-black lit from the top right, a faint drafting grid, a fine rim.
//
// Two levels of detail: "full" (48px and up: glow, grid, highlights, shadow) and "small" (16 and 32px:
// heavier strokes, a wider line and dot, no hairlines that would turn to mush at toolbar size).

const CYAN = "#27d9e8";
const TEAL = "#3aa6a1";

export function logoSvg(size, detail = size >= 48 ? "full" : "small") {
  const full = detail === "full";
  const grid = full && size >= 128;
  const sw = full ? 15 : 19; // stroke of the f, in 128 units
  const bw = full ? 12 : 19; // stroke of the cyan line: a touch slimmer than the f at full detail
  const stemX = full ? 50 : 48;
  const barY = full ? 61 : 62;
  const stem = `M${stemX} 104 V${full ? 54 : 56} C${stemX} 37 ${stemX + 9} 28 ${stemX + 24} 28 H${stemX + (full ? 31 : 30)}`;
  const barX = full ? [27, 75] : [28, 74];
  const bar = `M${barX[0]} ${barY} H${barX[1]}`;
  const dot = full ? { cx: 94, r: 9.5 } : { cx: 96, r: 12.5 };
  const cut = sw / 2 + 3; // half-width of the gap where the line passes behind the stem (full detail only)
  const id = (n) => `fp${size}${n}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128" style="display:block">
<defs>
  <linearGradient id="${id("tile")}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1b2830"/><stop offset="0.55" stop-color="#0d1418"/><stop offset="1" stop-color="#06090b"/>
  </linearGradient>
  <radialGradient id="${id("light")}" cx="0.86" cy="0.02" r="0.78">
    <stop offset="0" stop-color="${CYAN}" stop-opacity="${full ? 0.34 : 0.26}"/><stop offset="0.55" stop-color="${CYAN}" stop-opacity="0.06"/><stop offset="1" stop-color="${CYAN}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="${id("rim")}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/><stop offset="0.35" stop-color="#ffffff" stop-opacity="0.07"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.12"/>
  </linearGradient>
  <linearGradient id="${id("ink")}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfd9de"/>
  </linearGradient>
  <!-- userSpaceOnUse: a straight line has a zero-height box, which would hide a box-relative gradient or filter. -->
  <linearGradient id="${id("line")}" gradientUnits="userSpaceOnUse" x1="${barX[0]}" y1="0" x2="${dot.cx}" y2="0">
    <stop offset="0" stop-color="${TEAL}"/><stop offset="1" stop-color="${CYAN}"/>
  </linearGradient>
  <radialGradient id="${id("dot")}" cx="0.4" cy="0.38" r="0.7">
    <stop offset="0" stop-color="#d9fdff"/><stop offset="0.45" stop-color="#7df0f8"/><stop offset="1" stop-color="${CYAN}"/>
  </radialGradient>
  <radialGradient id="${id("halo")}">
    <stop offset="0" stop-color="${CYAN}" stop-opacity="0.55"/><stop offset="1" stop-color="${CYAN}" stop-opacity="0"/>
  </radialGradient>
  <clipPath id="${id("clip")}"><rect width="128" height="128" rx="28"/></clipPath>
  <mask id="${id("cut")}" maskUnits="userSpaceOnUse" x="0" y="0" width="128" height="128">
    <rect width="128" height="128" fill="#fff"/><rect x="${stemX - cut}" y="0" width="${cut * 2}" height="128" fill="#000"/>
  </mask>
  ${full ? `<filter id="${id("glow")}" filterUnits="userSpaceOnUse" x="0" y="0" width="128" height="128"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="${id("shadow")}" x="-30%" y="-20%" width="160%" height="150%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.5" flood-color="#000" flood-opacity="0.55"/></filter>` : ""}
  ${grid ? `<pattern id="${id("grid")}" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#fff" stroke-opacity="0.05" stroke-width="1"/></pattern>
  <radialGradient id="${id("gridfade")}" cx="0.75" cy="0.05" r="0.8"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <mask id="${id("gridmask")}"><rect width="128" height="128" fill="url(#${id("gridfade")})"/></mask>` : ""}
</defs>
<g clip-path="url(#${id("clip")})">
  <rect width="128" height="128" fill="url(#${id("tile")})"/>
  <rect width="128" height="128" fill="url(#${id("light")})"/>
  ${grid ? `<rect width="128" height="128" fill="url(#${id("grid")})" mask="url(#${id("gridmask")})"/>` : ""}
  ${full ? `<path d="M0 0H128V40C96 30 40 30 0 46Z" fill="#fff" fill-opacity="0.035"/>` : ""}
</g>
<rect x="0.75" y="0.75" width="126.5" height="126.5" rx="27.25" fill="none" stroke="url(#${id("rim")})" stroke-width="1.5"/>
${full ? `<path d="M${barX[0] + 30} ${barY} H${dot.cx}" stroke="${CYAN}" stroke-width="${bw}" stroke-linecap="round" opacity="0.5" filter="url(#${id("glow")})" mask="url(#${id("cut")})"/>
<circle cx="${dot.cx}" cy="${barY}" r="${dot.r * 2.4}" fill="url(#${id("halo")})"/>` : ""}
<path d="${bar}" stroke="url(#${id("line")})" stroke-width="${bw}" stroke-linecap="round" fill="none"${full ? ` mask="url(#${id("cut")})"` : ""}/>
<circle cx="${dot.cx}" cy="${barY}" r="${dot.r}" fill="url(#${id("dot")})"/>
<path d="${stem}" stroke="url(#${id("ink")})" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"${full ? ` filter="url(#${id("shadow")})"` : ""}/>
</svg>`;
}

/** A page that holds just the logo, for rendering it to PNG on a transparent background. */
export function logoPage(size, detail) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}</style></head><body>${logoSvg(size, detail)}</body></html>`;
}
