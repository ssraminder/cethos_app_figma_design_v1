// Build Fayza's SOP-001 (Document Control & Records Management) VERIFICATION
// guide (.docx) with REAL annotated portal screenshots captured by
// capture-sop001-guide.mjs. Brand styling mirrors the Cethos SOP-012 guide.
// Portrait, screenshots embedded, only narrow callout/2-col tables (no overflow).
//
//   node e2e/build-sop001-guide.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Footer,
  AlignmentType, LevelFormat, HeadingLevel, PageNumber, BorderStyle,
  Table, TableRow, TableCell, WidthType, ShadingType,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Image set + output are overridable so the same builder can emit a full-res
// PNG guide (repo/archive) or a compressed JPEG guide (small enough to upload).
const SHOTS = process.env.SOP001_IMG_DIR || path.join(__dirname, "output", "sop-verify", "sop001", "screenshots");
const IMG_EXT = (process.env.SOP001_IMG_EXT || "png").toLowerCase();
const LOGO = path.join(__dirname, "..", "tmp", "doc-build", "img", "cethos-logo.png");
const OUT = process.env.SOP001_OUT || path.join(__dirname, "..", "docs", "guides", "Cethos-SOP-001-Document-Control-Verification-Guide.docx");

const TEAL = "0F9DA0", SLATE = "334155", GREY = "64748B", AMBER = "B45309", GREEN = "047857", NAVY = "0C2340";
const DOC_VERSION = "1.0", DOC_DATE = "25 June 2026", DOC_CODE = "CTH-VRF-001";

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

// narrow 2-column Field/Value table (fits portrait — never overflows)
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
  // ── Cover ──
  new Paragraph({ spacing: { after: 140 }, children: [new ImageRun({
    type: "png", data: fs.readFileSync(LOGO),
    transformation: { width: 188, height: Math.round(188 * 109 / 649) },
    altText: { title: "Cethos", description: "Cethos logo", name: "logo" },
  })] }),
  new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 0, after: 60 }, children: [new TextRun("SOP-001 — Document Control & Records Management")] }),
  P([T("Verification guide — confirm the SOP matches the live system  ", { color: GREY, size: 22 }), T("(portal.cethos.com/admin)", { color: GREY, size: 22, bold: true })]),
  P([T(`Reviewer: Fayza El Bezzari      ·      Version ${DOC_VERSION}  ·  ${DOC_DATE}  ·  Doc ${DOC_CODE}`, { color: GREY, size: 18, bold: true })]),

  P([T("Use this guide to confirm that "), T("SOP-001 (Document Control & Records Management)", { bold: true }),
     T(" describes what the portal actually does, ahead of the IQVIA audit. Every step below already has a "),
     T("real screenshot of the live system", { bold: true }),
     T(" — you only read, click along, and confirm. It takes about 5 minutes.")]),

  callout("Golden rule", [
    [T("Don't change anything", { bold: true, size: 20, color: SLATE }), T(" — you are only checking. The screenshots are already taken for you, so you never need to capture your own. If something doesn't match, ", { size: 20, color: SLATE }), T("write it in the Notes box at the end", { bold: true, size: 20, color: SLATE }), T("; don't try to fix it.", { size: 20, color: SLATE })],
  ], TEAL),
  gap(80),

  callout("What we already checked and fixed (validation summary)", [
    [T("This SOP was validated end-to-end on the live portal. The document-control controls it describes all work: numbered, versioned documents; a control block with approval signatures; approved versions frozen by the database; audience-based publishing; and append-only, tamper-evident records.", { size: 20, color: SLATE })],
    [T("Two issues were found during validation and ", { size: 20, color: SLATE }), T("have already been fixed and re-checked", { bold: true, size: 20, color: GREEN }), T(":", { size: 20, color: SLATE })],
    [T("1)  ", { bold: true, size: 20, color: SLATE }), T("Older SOP versions were still labelled “active” instead of “superseded” (10 SOPs) — corrected, so the previous version now reads superseded.", { size: 20, color: SLATE })],
    [T("2)  ", { bold: true, size: 20, color: SLATE }), T("Approved records had no delete-protection — a database guard was added so a recorded version can no longer be deleted.", { size: 20, color: SLATE })],
    [T("Result: ", { bold: true, size: 20, color: SLATE }), T("PASS", { bold: true, size: 20, color: GREEN }), T(" — the system now matches the SOP. Your walkthrough below will show the corrected behaviour.", { size: 20, color: SLATE })],
  ], NAVY),
  gap(120),

  metaTable([
    ["SOP", "SOP-001 — Document Control & Records Management"],
    ["Version / status", "v1.0 — active (effective 24 June 2026)"],
    ["Where", "Portal → QUALITY → SOPs  (and  Documents & Manuals)"],
    ["Owner", "Acting Quality Manager"],
    ["ISO / regulation", "ISO 9001 §7.5; ISO 17100 §4.2; 21 CFR Part 11"],
  ]),
  gap(160),

  // ════════ PART 1 ════════
  H1("Part 1 — Read what SOP-001 says"),

  H2("1.  Open the SOPs registry"),
  step([T("Log in to "), T("portal.cethos.com", { bold: true }), T(" with your own account. In the left menu, scroll to the "), T("QUALITY", { bold: true }), T(" section and click "), T("SOPs", { bold: true }), T(".")]),
  step([T("You'll see every Standard Operating Procedure, grouped by department, each with a version, ISO reference, status and effective date.")]),
  ...pic("s1-open-the-sops-registry.png", 600, "Left menu → QUALITY → SOPs — the Standard Operating Procedures registry."),

  H2("2.  Find SOP-001 — Document Control & Records Management"),
  step([T("Scroll to the "), T("QUALITY ASSURANCE", { bold: true }), T(" group. Find "), T("SOP-001 — Document Control and Records Management", { bold: true }), T(".")]),
  step([T("Confirm it shows a "), T("version badge", { bold: true }), T(" ("), T("v1 active", { italics: true }), T(") and an "), T("effective date", { bold: true }), T(" ("), T("June 24, 2026", { italics: true }), T(").")]),
  ...pic("s2-find-sop-001-document-control.png", 600, "The Quality Assurance group — SOP-001, v1 active."),

  H2("3.  Open it and read the control block"),
  step([T("Click the row to open the SOP. At the top is its "), T("control block", { bold: true }), T(" — document number, version, effective date, owner, and the "), T("Prepared / Reviewed / Approved", { bold: true }), T(" signatures.")]),
  bullet([T("On the right, the "), T("Version history", { bold: true }), T(" panel says "), T("“Approved versions are frozen — the database refuses edits.”", { italics: true }), T(" That is document control working — an approved procedure can't be quietly changed.")]),
  ...pic("s3-read-the-sop-and-its-control-block.png", 600, "SOP-001 open — control block (number, version, signatures) and the frozen, version-controlled record."),

  // ════════ PART 2 ════════
  new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [new TextRun("Part 2 — See the controls working")] }),
  P([T("Now confirm the document-control behaviours the SOP describes are real in the system.")]),

  H2("4.  Controlled export"),
  step([T("On the SOP, click "), T("Export", { bold: true }), T(". Confirm the controlled output formats — "), T("Word (.docx)", { bold: true }), T(" and "), T("PDF", { bold: true }), T(". (You don't need to download anything.)")]),
  ...pic("s4-controlled-export.png", 600, "Export → Word (.docx) / PDF — controlled distribution of the approved document."),

  H2("5.  A change always makes a NEW version"),
  step([T("Click "), T("Edit (new version)", { bold: true }), T(". An editor opens with a "), T("“What changed and why”", { bold: true }), T(" box and a "), T("Save draft", { bold: true }), T(" button — a change creates a "), T("new", { italics: true }), T(" version, it never edits the approved one. "), T("Click Cancel — don't save.", { bold: true })]),
  ...pic("s5-a-change-makes-a-new-version.png", 600, "Editing opens a new draft version with a change note — the approved version stays frozen."),

  H2("6.  Old versions are clearly marked superseded"),
  step([T("Go back to "), T("All SOPs", { bold: true }), T(" and open "), T("SOP-011 — Corrective and Preventive Actions", { bold: true }), T(" (it has a version 2).")]),
  step([T("In the "), T("Version history", { bold: true }), T(" panel, confirm "), T("v2 active", { bold: true }), T(" (green) and "), T("v1 superseded", { bold: true }), T(" (grey). Only the current approved version is in use; older ones are kept but clearly marked.")]),
  ...pic("s6-old-versions-are-marked-superseded.png", 600, "SOP-011 — v2 active (green), v1 superseded (grey). This is the corrected behaviour."),

  H2("7.  The Documents & Manuals library"),
  step([T("Back in the left menu under "), T("QUALITY", { bold: true }), T(", click "), T("Documents & Manuals", { bold: true }), T(" — the controlled library where manuals, policies and records live, each tagged with an "), T("audience", { bold: true }), T(" and "), T("Published", { bold: true }), T(".")]),
  ...pic("d1-open-documents-and-manuals.png", 600, "Documents & Manuals — the controlled library (audience + Published per item)."),

  H2("8.  Superseded documents are withdrawn and marked"),
  step([T("Scroll to the "), T("POLICIES", { bold: true }), T(" group. The old backup policy is titled "), T("[SUPERSEDED → SOP-016]", { bold: true }), T(" and is "), T("not", { italics: true }), T(" published — obsolete documents are kept for history but clearly marked and withdrawn from use.")]),
  ...pic("d2-superseded-documents-are-clearly-marked.png", 600, "Policies — old document marked [SUPERSEDED → SOP-016] and unpublished."),

  H2("9.  New procedures start as a draft"),
  step([T("Back on "), T("SOPs", { bold: true }), T(", click "), T("New SOP", { bold: true }), T(". Notice there is "), T("no box to type a number", { bold: true }), T(" — the system assigns SOP-### automatically. A new procedure starts as a "), T("draft", { bold: true }), T(" and only becomes official once approved and activated. "), T("Click Cancel — don't create one.", { bold: true })]),
  ...pic("s7-new-procedures-start-as-a-draft.png", 600, "New SOP — starts as a draft; the number is assigned automatically."),

  // ════════ RESULT ════════
  H1("Your result"),
  P([T("If everything above matched what you saw, tick "), T("Matches", { bold: true }), T(". If anything was different or missing, tick "), T("Doesn't match", { bold: true }), T(" and describe it — that's the most valuable part for Raminder.")]),
  resultBox(),
  new Paragraph({ spacing: { before: 220 }, children: [new TextRun({ text: "Screenshots are the live admin portal as of 25 June 2026. Cethos is ISO 17100-aligned (not certified).", italics: true, color: GREY, size: 18 })] }),
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
      children: [new TextRun({ text: `Cethos — SOP-001 Document Control · Verification Guide   ·   v${DOC_VERSION} (${DOC_CODE})   ·   Page `, size: 16, color: GREY }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY })],
    })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("wrote", OUT, buf.length, "bytes");
});
