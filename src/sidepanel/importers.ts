/**
 * Resume import, entirely on this device. Nothing is uploaded.
 *   .pdf          pdf.js (bundled, loaded only when a PDF is imported; its worker ships in the package)
 *   .docx         unzipped with the browser's own DecompressionStream; word/document.xml → Markdown
 *   .md .txt      read as text
 * Each importer returns Markdown the person reviews before saving.
 */

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const ACCEPT =
  ".pdf,.docx,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain";

export class ImportError extends Error {}

export async function importResume(file: File): Promise<string> {
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError("That file is over 10 MB. Import a smaller PDF or Word file.");
  const name = file.name.toLowerCase();
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isPdf = name.endsWith(".pdf") || (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46); // %PDF
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // PK

  if (isPdf) return tidy(await pdfToMarkdown(await file.arrayBuffer()));
  if (name.endsWith(".docx")) return tidy(await docxToMarkdown(await file.arrayBuffer()));
  if (name.endsWith(".doc")) throw new ImportError("Old .doc files are not supported. Save it as .docx or PDF in Word, then import that.");
  if (isZip) throw new ImportError("That file is not a Word (.docx) document. Import a PDF, .docx, .md or .txt file.");
  if (/\.(md|markdown|txt)$/.test(name) || file.type.startsWith("text/")) return tidy((await file.text()).replace(/\r\n?/g, "\n"));
  throw new ImportError("Import a PDF, Word (.docx), Markdown or text file.");
}

/** Trim trailing spaces, collapse runs of blank lines. */
export function tidy(md: string): string {
  return md
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ───────────── PDF ───────────── */

interface Line {
  y: number;
  x: number;
  size: number;
  text: string;
}

async function pdfToMarkdown(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  // pdf.js 6 never evaluates code (no eval / new Function), so it runs under the extension's strict CSP.
  const task = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/password/i.test(msg)) throw new ImportError("That PDF is password-protected. Remove the password, then import it.");
    throw new ImportError("FormPilot could not read that PDF. Try exporting it again, or paste the text.");
  }

  const lines: Line[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 20); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let current: Line | null = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = Math.round(item.transform[5]);
      const size = Math.round(Math.hypot(item.transform[2], item.transform[3]) * 10) / 10;
      // A new line when the baseline moves; pdf.js also flags explicit line ends.
      if (!current || Math.abs(current.y - y) > Math.max(2, size * 0.4)) {
        if (current && current.text.trim()) lines.push(current);
        current = { y, x: Math.round(item.transform[4]), size, text: "" };
      }
      const needsSpace = current.text && !current.text.endsWith(" ") && item.str && !item.str.startsWith(" ");
      current.text += (needsSpace && item.str.length > 1 ? " " : "") + item.str;
      if (item.str.trim()) current.size = Math.max(current.size, size);
      if (item.hasEOL) {
        if (current.text.trim()) lines.push(current);
        current = null;
      }
    }
    if (current && current.text.trim()) lines.push(current);
    lines.push({ y: -1, x: 0, size: 0, text: "" }); // page break → blank line
    page.cleanup();
  }
  await task.destroy();

  const textLines = lines.filter((l) => l.text.trim());
  if (!textLines.length) throw new ImportError("That PDF has no text layer (it may be a scanned image). Paste the text instead.");

  // Body size = the size most text is set in; clearly larger lines become headings.
  const counts = new Map<number, number>();
  for (const l of textLines) counts.set(l.size, (counts.get(l.size) ?? 0) + l.text.length);
  const body = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  // The main left edge = where most body lines start. Many PDFs draw bullets as shapes, not text,
  // so a body line indented clearly past that edge is read as a list item.
  const edges = new Map<number, number>();
  for (const l of textLines) if (Math.abs(l.size - body) < 0.6) edges.set(l.x, (edges.get(l.x) ?? 0) + 1);
  const edge = [...edges.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

  const out: string[] = [];
  let first = true;
  for (const l of lines) {
    const t = l.text.replace(/\s+/g, " ").trim();
    if (!t) {
      out.push("");
      continue;
    }
    if (first && l.size >= body * 1.35) out.push(`# ${t}`);
    else if (l.size >= body * 1.18 && t.length < 80) out.push("", `## ${t}`);
    else if (/^[•●▪◦‣∙·\-–*]\s*/.test(t)) out.push(`- ${t.replace(/^[•●▪◦‣∙·\-–*]\s*/, "")}`);
    else if (l.x > edge + 6 && Math.abs(l.size - body) < 0.6) out.push(`- ${t}`);
    else out.push(t);
    first = false;
  }
  return out.join("\n");
}

/* ───────────── DOCX ───────────── */

/** Reads one file out of a zip using the browser's own inflate. */
export async function unzip(data: ArrayBuffer, wanted: string): Promise<Uint8Array | null> {
  const bytes = new Uint8Array(data);
  const view = new DataView(data);
  // End of central directory: search backwards for its signature.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) return null;
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = dec.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    if (name === wanted) {
      const lNameLen = view.getUint16(localOffset + 26, true);
      const lExtraLen = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const raw = bytes.slice(start, start + compSize);
      if (method === 0) return raw;
      if (method !== 8) return null;
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export async function docxToMarkdown(data: ArrayBuffer): Promise<string> {
  const xmlBytes = await unzip(data, "word/document.xml").catch(() => null);
  if (!xmlBytes) throw new ImportError("FormPilot could not read that Word file. Save it again as .docx or PDF, then import it.");
  const xml = new DOMParser().parseFromString(new TextDecoder().decode(xmlBytes), "application/xml");
  if (xml.getElementsByTagName("parsererror").length) throw new ImportError("That Word file looks damaged. Save it again, then import it.");

  const out: string[] = [];
  for (const p of Array.from(xml.getElementsByTagNameNS(W, "p"))) {
    let text = "";
    // Walk runs in document order: text, tabs and line breaks.
    const walker = xml.createTreeWalker(p, NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode() as Element | null; node; node = walker.nextNode() as Element | null) {
      if (node.namespaceURI !== W) continue;
      if (node.localName === "t") text += node.textContent ?? "";
      else if (node.localName === "tab") text += " ";
      else if (node.localName === "br" || node.localName === "cr") text += "\n";
    }
    text = text.replace(/[ \t]+/g, " ").trim();
    if (!text) {
      out.push("");
      continue;
    }
    const style = p.getElementsByTagNameNS(W, "pStyle")[0]?.getAttributeNS(W, "val") ?? "";
    const isList = p.getElementsByTagNameNS(W, "numPr").length > 0 || /list/i.test(style);
    const heading = /^heading\s*(\d)/i.exec(style.replace(/([a-z])(\d)/i, "$1 $2"));
    if (/^title$/i.test(style)) out.push(`# ${text}`);
    else if (heading) out.push("", `${"#".repeat(Math.min(6, Number(heading[1]) + 1))} ${text}`);
    else if (isList) out.push(`- ${text}`);
    else out.push(text, "");
  }
  const md = out.join("\n");
  if (!md.trim()) throw new ImportError("That Word file has no text FormPilot can read.");
  return md;
}
