/*
 * Generic, config-driven builder for a SOP verification guide (.docx) with the
 * REAL annotated screenshots captured by capture-sop-guide.mjs.
 *
 *   node e2e/build-sop-guide.mjs <key>      e.g. sop008
 * Reads e2e/sop-configs/<key>.mjs + e2e/output/sop-verify/<key>/screenshots/*.png
 * Writes docs/guides/Cethos-<SOP>-<slug>-Verification-Guide.docx  (returns its path)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Footer,
  AlignmentType, LevelFormat, HeadingLevel, PageNumber, BorderStyle,
  Table, TableRow, TableCell, WidthType, ShadingType,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const key = process.argv[2];
if (!key) { console.error("usage: node e2e/build-sop-guide.mjs <key>"); process.exit(1); }
const cfg = (await import(pathToFileURL(path.join(__dirname, "sop-configs", `${key}.mjs`)).href)).default;

const SHOTS = path.join(__dirname, "output", "sop-verify", cfg.key, "screenshots");
const LOGO = path.join(__dirname, "..", "tmp", "doc-build", "img", "cethos-logo.png");
const slug = cfg.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const OUT = path.join(__dirname, "..", "docs", "guides", `Cethos-${cfg.sopNumber}-${slug}-Verification-Guide.docx`);

const TEAL = "0F9DA0", SLATE = "334155", GREY = "64748B", GREEN = "047857", NAVY = "0C2340";
const DOC_VERSION = "1.0", DOC_DATE = cfg.date || "26 June 2026";
const T2 = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// inline **bold** parser → TextRun[]
function runs(text, base = {}) {
  const out = [];
  text.split(/(\*\*[^*]+\*\*)/).forEach((seg) => {
    if (!seg) return;
    const m = seg.match(/^\*\*([^*]+)\*\*$/);
    out.push(new TextRun({ text: m ? m[1] : seg, bold: !!m, ...base }));
  });
  return out.length ? out : [new TextRun({ text, ...base })];
}

const IMG_W = 1440, IMG_H = 900;
function pic(file, caption, w = 600) {
  const out = [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100, after: caption ? 30 : 200 },
    children: [new ImageRun({ type: "png", data: fs.readFileSync(path.join(SHOTS, file)),
      transformation: { width: w, height: Math.round(w * IMG_H / IMG_W) },
      altText: { title: file, description: file, name: file },
      border: { color: "D5DBE2", size: 4, style: BorderStyle.SINGLE, space: 0 } })] })];
  if (caption) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 220 },
    children: [new TextRun({ text: caption, italics: true, color: GREY, size: 17 })] }));
  return out;
}
const P = (text, base = {}) => new Paragraph({ spacing: { after: 120 }, children: runs(text, base) });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const step = (text) => new Paragraph({ numbering: { reference: "steps", level: 0 }, spacing: { after: 90 }, children: runs(text) });
const gap = (after = 120) => new Paragraph({ spacing: { after }, children: [] });

function callout(label, lines, fill) {
  const bd = { style: BorderStyle.SINGLE, size: 4, color: fill };
  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: bd, bottom: bd, right: bd, left: { style: BorderStyle.SINGLE, size: 24, color: fill } },
      width: { size: 9360, type: WidthType.DXA }, shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 200, right: 160 },
      children: [new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: label, bold: true, color: fill, size: 20 })] }),
        ...lines.map((l, i) => new Paragraph({ spacing: { after: i === lines.length - 1 ? 0 : 40 }, children: runs(l, { size: 20, color: SLATE }) }))] })] })] });
}
function metaTable(rows) {
  const bd = { style: BorderStyle.SINGLE, size: 1, color: "D5DBE2" }; const bds = { top: bd, bottom: bd, left: bd, right: bd };
  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [2700, 6660],
    rows: rows.map(([k, v]) => new TableRow({ children: [
      new TableCell({ borders: bds, width: { size: 2700, type: WidthType.DXA }, shading: { fill: "F1F5F9", type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 19, color: SLATE })] })] }),
      new TableCell({ borders: bds, width: { size: 6660, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: v, size: 19, color: SLATE })] })] }),
    ] })) });
}
function resultBox() {
  const hb = { style: BorderStyle.SINGLE, size: 4, color: TEAL };
  const line = (t, o = {}) => new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: t, size: 20, color: SLATE, ...o })] });
  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: hb, bottom: hb, left: { style: BorderStyle.SINGLE, size: 24, color: TEAL }, right: hb },
      width: { size: 9360, type: WidthType.DXA }, shading: { fill: "F8FAFC", type: ShadingType.CLEAR }, margins: { top: 160, bottom: 160, left: 220, right: 180 },
      children: [new Paragraph({ spacing: { after: 90 }, children: [new TextRun({ text: "Your result (tick one)", bold: true, color: TEAL, size: 22 })] }),
        line("[  ]  Matches — the SOP describes what I saw in the system."),
        line("[  ]  Doesn't match — I found a difference (describe it below)."),
        line("[  ]  Refer to Raminder — I'm not sure / it's a technical point."),
        new Paragraph({ spacing: { before: 80, after: 80 }, children: [new TextRun({ text: "Notes (write anything that didn't match):", bold: true, size: 20, color: SLATE })] }),
        line("________________________________________________________________", { color: "B9C2CC" }),
        line("________________________________________________________________", { color: "B9C2CC" }),
        new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "Reviewed by:  ____________________      Date:  ______________", size: 20, color: SLATE })] })] })] })] });
}

const children = [
  new Paragraph({ spacing: { after: 140 }, children: [new ImageRun({ type: "png", data: fs.readFileSync(LOGO),
    transformation: { width: 188, height: Math.round(188 * 109 / 649) }, altText: { title: "Cethos", description: "Cethos logo", name: "logo" } })] }),
  new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 0, after: 60 }, children: [new TextRun(`${cfg.sopNumber} — ${cfg.title}`)] }),
  P(`Verification guide — confirm the SOP matches the live system **(portal.cethos.com/admin)**`, { color: GREY, size: 22 }),
  P(`Reviewer: Fayza El Bezzari      ·      Version ${DOC_VERSION}  ·  ${DOC_DATE}  ·  Doc ${cfg.docCode}`, { color: GREY, size: 18, bold: true }),
  P(`Use this guide to confirm that **${cfg.sopNumber} (${cfg.title})** describes what the portal actually does, ahead of the IQVIA audit. Every step has a **real screenshot of the live system** — you only read and confirm.`),
  callout("Golden rule", [cfg.golden || "**Look only — don't change anything.** You are confirming, not operating. If something doesn't match, write it in the Notes box at the end; don't try to fix it."], TEAL),
  gap(80),
  callout("What we already checked (validation summary)", cfg.summary, NAVY),
  gap(120),
  metaTable([
    ["SOP", `${cfg.sopNumber} — ${cfg.title}`],
    ["Version / status", cfg.versionLine],
    ["Where", cfg.where],
    ["Owner", cfg.owner],
    ["ISO / regulation", cfg.isoRef],
  ]),
  gap(160),
];
cfg.steps.forEach((s, i) => {
  if (i === 0) children.push(H1("Walkthrough — confirm it in the live system"));
  children.push(H2(`${i + 1}.  ${s.title}`));
  children.push(step(s.say));
  children.push(...pic(`${s.id}-${T2(s.title)}.png`, s.caption));
});
children.push(H1("Your result"));
children.push(P("If everything matched, tick **Matches**. If anything was different or missing, tick **Doesn't match** and describe it — that's the most valuable part for Raminder."));
children.push(resultBox());
children.push(new Paragraph({ spacing: { before: 220 }, children: [new TextRun({ text: "Screenshots are the live admin portal as of June 2026. Cethos is ISO 17100-aligned (not certified).", italics: true, color: GREY, size: 18 })] }));

const doc = new Document({
  styles: { default: { document: { run: { font: "Arial", size: 22, color: SLATE } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, font: "Arial", color: TEAL }, paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, font: "Arial", color: SLATE }, paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 1 } }] },
  numbering: { config: [{ reference: "steps", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 600, hanging: 320 } } } }] }] },
  sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Cethos — ${cfg.sopNumber} ${cfg.title} · Verification Guide   ·   v${DOC_VERSION} (${cfg.docCode})   ·   Page `, size: 16, color: GREY }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY })] })] }) },
    children }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("wrote", OUT, buf.length, "bytes"); });
