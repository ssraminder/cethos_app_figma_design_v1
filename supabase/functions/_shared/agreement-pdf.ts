// Server-side PDF renderer for a signed onboarding/agreement copy.
// Parses the narrow snapshot HTML (h2 / h3 / p / ul>li, with <strong>/<em>
// inline) into blocks and lays them out with pdf-lib over A4 pages, preceded by
// a prominent "Signing audit" page. Uses the WinAnsi standard fonts; characters
// outside Latin-1 (e.g. Vietnamese diacritics) are transliterated for the PDF
// while the exact name is preserved in the database signature record.

import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

export interface AuditField { label: string; value: string }
export interface AgreementPdfInput {
  docTitle: string;
  referenceCode?: string | null;
  auditFields: AuditField[];
  snapshotHtml: string;
}

type Block = { kind: "h2" | "h3" | "p" | "li"; text: string };

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&mdash;/g, "-")
    .replace(/&ndash;/g, "-").replace(/&rarr;/g, "->").replace(/&nbsp;/g, " ");
}

// Symbol cleanup + WinAnsi-safe (keep Latin-1 accents; transliterate the rest).
function clean(s: string): string {
  let t = decodeEntities(s)
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/⇄/g, " <-> ").replace(/→/g, " -> ").replace(/←/g, " <- ")
    .replace(/[—–]/g, "-").replace(/…/g, "...")
    .replace(/·/g, "-").replace(/ /g, " ")
    .replace(/<[^>]+>/g, "")          // strip any remaining inline tags
    .replace(/\s+/g, " ").trim();
  let out = "";
  for (const ch of t) {
    const c = ch.codePointAt(0)!;
    if (c <= 0xff) out += ch;          // Latin-1 (é í ó ñ ü ç ...) renders in WinAnsi
    else out += (ch.normalize("NFKD").replace(/[̀-ͯ]/g, "") || "?");
  }
  return out;
}

function parseBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const re = /<(h2|h3|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const kind = m[1].toLowerCase() as Block["kind"];
    const text = clean(m[2]);
    if (text) blocks.push({ kind, text });
  }
  return blocks;
}

export async function renderAgreementPdf(input: AgreementPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const A4: [number, number] = [595.28, 841.89];
  const SIDE = 50, TOP = 56, BOT = 56;
  const navy = rgb(0.047, 0.137, 0.251), teal = rgb(0.033, 0.463, 0.435), slate = rgb(0.4, 0.45, 0.5), ink = rgb(0.06, 0.09, 0.16);

  let page = pdf.addPage(A4);
  let y = A4[1] - TOP;
  const width = A4[0] - SIDE * 2;

  const newPage = () => { page = pdf.addPage(A4); y = A4[1] - TOP; };
  const ensure = (need: number) => { if (y - need < BOT) newPage(); };

  function wrap(text: string, f: typeof font, size: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(test, size) > width - 0.5 && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function draw(text: string, f: typeof font, size: number, color = ink, indent = 0, lh = 1.35) {
    for (const ln of wrap(clean(text), f, size)) {
      ensure(size * lh);
      page.drawText(ln, { x: SIDE + indent, y: y - size, size, font: f, color });
      y -= size * lh;
    }
  }

  // ── Audit page ──
  draw(input.docTitle, bold, 16, navy);
  y -= 4;
  draw("Signing audit", bold, 13, teal);
  y -= 6;
  for (const a of input.auditFields) {
    ensure(15);
    page.drawText(clean(a.label), { x: SIDE, y: y - 10, size: 10, font: bold, color: slate });
    for (const ln of wrap(clean(a.value), font, 10)) {
      ensure(13);
      page.drawText(ln, { x: SIDE + 130, y: y - 10, size: 10, font, color: ink });
      y -= 13;
    }
    y -= 2;
  }
  y -= 6;
  draw("This is a true copy of the agreement executed electronically by the above signatory. A countersigned record is retained by Cethos Solutions Inc.", font, 9, slate);

  // ── Agreement body ──
  newPage();
  for (const b of parseBlocks(input.snapshotHtml)) {
    if (b.kind === "h2") { y -= 8; ensure(20); draw(b.text, bold, 13, navy); y -= 2; }
    else if (b.kind === "h3") { y -= 5; ensure(16); draw(b.text, bold, 11, teal); }
    else if (b.kind === "li") {
      ensure(14);
      page.drawText("-", { x: SIDE + 6, y: y - 10, size: 10, font, color: ink });
      draw(b.text, font, 10, ink, 18);
      y -= 2;
    } else { draw(b.text, font, 10, ink); y -= 4; }
  }

  // ── Footers ──
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(`Cethos Solutions Inc.  -  Onboarding & Compliance Package`, { x: SIDE, y: 32, size: 7.5, font, color: slate });
    p.drawText(`Page ${i + 1} of ${pages.length}`, { x: A4[0] - SIDE - 60, y: 32, size: 7.5, font, color: slate });
  });

  return await pdf.save();
}
