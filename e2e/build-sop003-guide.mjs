// Build Fayza's SOP-003 (Vendor Qualification & Management) VERIFICATION guide
// (.docx) with REAL annotated portal screenshots captured by
// capture-sop003-guide.mjs. Brand styling mirrors the SOP-001/012 guides.
// Portrait, screenshots embedded, only narrow callout/2-col tables (no overflow).
//
//   node e2e/build-sop003-guide.mjs
// Image set + output overridable (SOP003_IMG_DIR / SOP003_IMG_EXT / SOP003_OUT).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Footer,
  AlignmentType, LevelFormat, HeadingLevel, PageNumber, BorderStyle,
  Table, TableRow, TableCell, WidthType, ShadingType,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = process.env.SOP003_IMG_DIR || path.join(__dirname, "output", "sop-verify", "sop003", "screenshots");
const IMG_EXT = (process.env.SOP003_IMG_EXT || "png").toLowerCase();
const LOGO = path.join(__dirname, "..", "tmp", "doc-build", "img", "cethos-logo.png");
const OUT = process.env.SOP003_OUT || path.join(__dirname, "..", "docs", "guides", "Cethos-SOP-003-Vendor-Qualification-Verification-Guide.docx");

const TEAL = "0F9DA0", SLATE = "334155", GREY = "64748B", GREEN = "047857", NAVY = "0C2340";
const DOC_VERSION = "1.0", DOC_DATE = "26 June 2026", DOC_CODE = "CTH-VRF-003";

const IMG_W = 1440, IMG_H = 900;
function pic(file, targetWidthPx = 600, caption) {
  const width = targetWidthPx;
  const height = Math.round(targetWidthPx * IMG_H / IMG_W);
  file = file.replace(/\.(png|jpe?g)$/i, "." + IMG_EXT);
  const out = [new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: caption ? 30 : 200 },
    children: [new ImageRun({
      type: IMG_EXT === "png" ? "png" : "jpg",
      data: fs.readFileSync(path.join(SHOTS, file)),
      transformation: { width, height },
      altText: { title: file, description: file, name: file },
      border: { color: "D5DBE2", size: 4, style: BorderStyle.SINGLE, space: 0 },
    })],
  })];
  if (caption) out.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 220 },
    children: [new TextRun({ text: caption, italics: true, color: GREY, size: 17 })],
  }));
  return out;
}

const T = (text, o = {}) => new TextRun({ text, ...o });
const P = (runs, opts = {}) => new Paragraph({ spacing: { after: 120 }, children: Array.isArray(runs) ? runs : [new TextRun(runs)], ...opts });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const step = (text) => new Paragraph({ numbering: { reference: "steps", level: 0 }, spacing: { after: 90 }, children: Array.isArray(text) ? text : [new TextRun(text)] });
const bullet = (text) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 70 }, children: Array.isArray(text) ? text : [new TextRun(text)] });
const gap = (after = 120) => new Paragraph({ spacing: { after }, children: [] });

function callout(label, lines, fill) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: fill };
  return new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: border, bottom: border, right: border, left: { style: BorderStyle.SINGLE, size: 24, color: fill } },
      width: { size: 9360, type: WidthType.DXA },
      shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 200, right: 160 },
      children: [
        new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: label, bold: true, color: fill, size: 20 })] }),
        ...lines.map((l, i) => new Paragraph({ spacing: { after: i === lines.length - 1 ? 0 : 40 }, children: Array.isArray(l) ? l : [new TextRun({ text: l, size: 20, color: SLATE })] })),
      ],
    })] })],
  });
}

function metaTable(rows) {
  const bd = { style: BorderStyle.SINGLE, size: 1, color: "D5DBE2" };
  const bds = { top: bd, bottom: bd, left: bd, right: bd };
  return new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [2700, 6660],
    rows: rows.map(([k, v]) => new TableRow({ children: [
      new TableCell({ borders: bds, width: { size: 2700, type: WidthType.DXA }, shading: { fill: "F1F5F9", type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 19, color: SLATE })] })] }),
      new TableCell({ borders: bds, width: { size: 6660, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: v, size: 19, color: SLATE })] })] }),
    ] })),
  });
}

function resultBox() {
  const hb = { style: BorderStyle.SINGLE, size: 4, color: TEAL };
  const innerLine = (txt, opts = {}) => new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: txt, size: 20, color: SLATE, ...opts })] });
  return new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: hb, bottom: hb, left: { style: BorderStyle.SINGLE, size: 24, color: TEAL }, right: hb },
      width: { size: 9360, type: WidthType.DXA },
      shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
      margins: { top: 160, bottom: 160, left: 220, right: 180 },
      children: [
        new Paragraph({ spacing: { after: 90 }, children: [new TextRun({ text: "Your result (tick one)", bold: true, color: TEAL, size: 22 })] }),
        innerLine("[  ]  Matches — the SOP describes what I saw in the system."),
        innerLine("[  ]  Doesn't match — I found a difference (describe it below)."),
        innerLine("[  ]  Refer to Raminder — I'm not sure / it's a technical point."),
        new Paragraph({ spacing: { before: 80, after: 80 }, children: [new TextRun({ text: "Notes (most useful part — write anything that didn't match):", bold: true, size: 20, color: SLATE })] }),
        innerLine("________________________________________________________________", { color: "B9C2CC" }),
        innerLine("________________________________________________________________", { color: "B9C2CC" }),
        new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "Reviewed by:  ____________________      Date:  ______________", size: 20, color: SLATE })] }),
      ],
    })] })],
  });
}

const children = [
  new Paragraph({ spacing: { after: 140 }, children: [new ImageRun({
    type: "png", data: fs.readFileSync(LOGO),
    transformation: { width: 188, height: Math.round(188 * 109 / 649) },
    altText: { title: "Cethos", description: "Cethos logo", name: "logo" },
  })] }),
  new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 0, after: 60 }, children: [new TextRun("SOP-003 — Vendor Qualification & Management")] }),
  P([T("Verification guide — confirm the SOP matches the live system  ", { color: GREY, size: 22 }), T("(portal.cethos.com/admin)", { color: GREY, size: 22, bold: true })]),
  P([T(`Reviewer: Fayza El Bezzari      ·      Version ${DOC_VERSION}  ·  ${DOC_DATE}  ·  Doc ${DOC_CODE}`, { color: GREY, size: 18, bold: true })]),

  P([T("Use this guide to confirm that "), T("SOP-003 (Vendor Qualification & Management)", { bold: true }),
     T(" describes what the portal actually does, ahead of the IQVIA audit. Every step has a "),
     T("real screenshot of the live system", { bold: true }),
     T(" — you only read and confirm. It takes about 5 minutes.")]),

  callout("Golden rule", [
    [T("Look only — don't change anything", { bold: true, size: 20, color: SLATE }), T(". Qualifying a vendor is permanent, so this guide only has you ", { size: 20, color: SLATE }), T("open an already-qualified vendor and confirm the record", { bold: true, size: 20, color: SLATE }), T(". Never click Add qualification, Add document, or approve anyone. If something doesn't match, write it in the Notes box at the end.", { size: 20, color: SLATE })],
  ], TEAL),
  gap(80),

  callout("What we already checked (validation summary)", [
    [T("This SOP was validated on the live portal against a real qualified vendor. The system implements it: an NDA on file before work; the §3.1.4 competence basis recorded; documented, verified evidence with tamper-evident file hashes; a 12-month re-qualification date; and an append-only record that is never deleted.", { size: 20, color: SLATE })],
    [T("One issue was found and ", { size: 20, color: SLATE }), T("already fixed", { bold: true, size: 20, color: GREEN }), T(": the Qualification Queue page and its server-side gate referenced the old SOP number — corrected to point at SOP-003. ", { size: 20, color: SLATE }), T("Result: PASS", { bold: true, size: 20, color: GREEN }), T(".", { size: 20, color: SLATE })],
  ], NAVY),
  gap(120),

  metaTable([
    ["SOP", "SOP-003 — Vendor Qualification & Management"],
    ["Version / status", "v2 active (doc v5.0; effective 24 June 2026)"],
    ["Where", "Portal → QUALITY → SOPs;  vendor record → QMS tab"],
    ["Owner", "Acting Quality Manager / Life Sciences Manager"],
    ["ISO / regulation", "ISO 17100 §3.1, §4.3; ISO 9001 §8.4; IQVIA Supplier Mgmt; ICH GCP"],
  ]),
  gap(160),

  // ════════ PART 1 ════════
  H1("Part 1 — Read what SOP-003 says"),
  H2("1.  Open SOP-003 and read the control block"),
  step([T("Log in to "), T("portal.cethos.com", { bold: true }), T(". In the left menu under "), T("QUALITY", { bold: true }), T(", open "), T("SOPs", { bold: true }), T(", then in the "), T("HUMAN RESOURCES", { bold: true }), T(" group open "), T("SOP-003 — Vendor Qualification and Management", { bold: true }), T(".")]),
  step([T("Read the "), T("control block", { bold: true }), T(" (number, version, owner, approver) and "), T("§4", { bold: true }), T(" — the three §3.1.4 competence routes (translation degree; any degree + 2 years; or 5 years' experience), all needing documented proof. The right-hand panel shows the approved version is frozen.")]),
  ...pic("s1-open-sop-003-and-read-the-control-block.png", 600, "SOP-003 open — control block and the frozen, version-controlled record."),

  // ════════ PART 2 ════════
  new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [new TextRun("Part 2 — Confirm a real qualified vendor")] }),
  P([T("Open any "), T("already-qualified", { bold: true }), T(" vendor and click the "), T("QMS", { bold: true }), T(" tab. We use one as the worked example. You are only "), T("looking", { bold: true }), T(".")]),

  H2("2.  An NDA is on file before any work (§9)"),
  step([T("Confirm the "), T("NDA on file", { bold: true }), T(" — it must be "), T("Active", { bold: true }), T(" and signed before any materials are shared.")]),
  ...pic("s2-an-nda-is-on-file-before-any-work.png", 600, "NDA on file — Active and signed, with a version (§9)."),

  H2("3.  The qualification records the §3.1.4 basis (§4 / §6 / §7)"),
  step([T("Find the "), T("role qualification", { bold: true }), T(". Confirm it shows the "), T("role", { bold: true }), T(" (e.g. Translator), the "), T("§3.1.4 basis", { bold: true }), T(" (e.g. “Recognized degree in translation”), a "), T("Verified", { bold: true }), T(" badge, the qualified date, and a "), T("12-month re-qualification due date", { bold: true }), T(". The qualified language pairs are listed underneath.")]),
  ...pic("s3-the-qualification-records-the-3-1-4-basis.png", 600, "Qualified · §3.1.4 basis · Verified · 12-month re-qualification due · language pairs."),

  H2("4.  Every piece of evidence is documented and verified (§4 / §5 / §11)"),
  step([T("Scroll to "), T("Evidence / proof", { bold: true }), T(". Confirm each item shows a "), T("Verified", { bold: true }), T(" badge, a "), T("sha-256", { bold: true }), T(" file hash (tamper-evident), and "), T("View document", { bold: true }), T(". This is the documented, on-file proof — not self-report.")]),
  ...pic("s4-every-piece-of-evidence-is-documented-and-verified.png", 600, "Evidence / proof — each item Verified, sha-256 hash, View document."),

  // ════════ RESULT ════════
  H1("Your result"),
  P([T("If everything matched, tick "), T("Matches", { bold: true }), T(". If anything was different or missing, tick "), T("Doesn't match", { bold: true }), T(" and describe it — that's the most valuable part for Raminder.")]),
  resultBox(),
  new Paragraph({ spacing: { before: 220 }, children: [new TextRun({ text: "Screenshots are the live admin portal as of June 2026. Cethos is ISO 17100-aligned (not certified).", italics: true, color: GREY, size: 18 })] }),
];

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22, color: SLATE } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Arial", color: TEAL },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: SLATE },
        paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: "steps", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 600, hanging: 320 } } } }] },
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 600, hanging: 320 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Cethos — SOP-003 Vendor Qualification · Verification Guide   ·   v${DOC_VERSION} (${DOC_CODE})   ·   Page `, size: 16, color: GREY }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY })],
    })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("wrote", OUT, buf.length, "bytes");
});
