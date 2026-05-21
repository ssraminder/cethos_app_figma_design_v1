// Local Deno-free fixture for the affidavit page generator.
//
// Mirrors `supabase/functions/_shared/affidavit-docx.ts` line-for-line using
// the same `docx` npm package version (8.5.0). Output should be byte-identical
// to what the deployed edge function produces, modulo platform-specific zip
// metadata. Use this to eyeball layout against the Mahinder Kaur reference
// without round-tripping through prod data.
//
// Usage:
//   npm install --no-save docx@8.5.0
//   node scripts/render-affidavit-fixture.mjs
//   open scripts/out/affidavit-fixture.docx
//
// Fixture values match the Mahinder Kaur reference (Punjabi → English, ration
// card, Calgary / Alberta, Maria Teresa David as translator). If the rendered
// output diverges from the reference .docx, the helper has a bug.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const FONT = "Arial";
const SIZE = 24; // half-points → 12pt
const COMPANY_BLOCK_LINES = [
  "Cethos Solutions, Inc.",
  "(Corporate Member of CLIA)",
  "Toll-free: (844) 280-1313",
  "Phone: (587) 600-0786",
  "Website: www.cethos.ca",
  "E-mail: info@cethos.ca",
  "421 7th Ave SW, Floor 30,",
  "Calgary. AB. T2P 4K9. Canada.",
  "GST: 78174 1533 RT0001",
];

function run(text, { bold = false } = {}) {
  return new TextRun({ text, bold, font: FONT, size: SIZE });
}
function para(text, { bold = false, align } = {}) {
  return new Paragraph({ alignment: align, children: [run(text, { bold })] });
}
function labeledRow(label, value) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, font: FONT, size: SIZE }),
      new TextRun({ text: value, font: FONT, size: SIZE }),
    ],
  });
}
function noBorderCell(children) {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    children,
  });
}

async function buildAffidavitDocx(f) {
  const leftChildren = [];
  if (f.includeTranslatorBlock && f.translatorFullName) {
    leftChildren.push(para(f.translatorFullName, { bold: true }));
    if (f.translatorPhone) leftChildren.push(para(`Phone: ${f.translatorPhone}`));
    if (f.translatorEmail) leftChildren.push(para(`Email: ${f.translatorEmail}`));
    leftChildren.push(para(""));
  }
  if (f.includeCompanyBlock) {
    for (const line of COMPANY_BLOCK_LINES) leftChildren.push(para(line));
  }
  if (leftChildren.length === 0) leftChildren.push(para(""));

  const rightChildren = f.commissionerBlock.split(/\n/).map((line) => para(line));

  const signatureTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [noBorderCell(leftChildren), noBorderCell(rightChildren)] })],
  });

  const doc = new Document({
    creator: "Cethos Translation Services",
    title: "Affidavit",
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: f.heading, bold: true, font: FONT, size: 32 })],
          }),
          para(""),
          labeledRow(f.fieldLabels.dated, f.affidavitDate),
          labeledRow(f.fieldLabels.document_holder, f.documentHolderName),
          labeledRow(f.fieldLabels.document_translated, f.documentType),
          para(""),
          para(f.bodyParagraph),
          para(""),
          signatureTable,
        ],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  return buf;
}

// --- Fixture values: Mahinder Kaur ration card reference ---------------------
const fixture = {
  heading: "AFFIDAVIT",
  affidavitDate: "06 February 2026",
  documentHolderName: "Mahinder Kaur",
  documentType: "Ration Card",
  bodyParagraph:
    "I hereby certify that the Punjabi to English translation of the above-mentioned document(s), is accurate and true. The translated document and the photocopies of original document are attached to this affidavit.",
  translatorFullName: "Maria Teresa David",
  translatorPhone: "(587) 600-0786",
  translatorEmail: "info@cethos.ca",
  commissionerBlock:
    "AFFIRMED before me at the City of Calgary in the Province of Alberta on this 6th day of February 2026",
  includeTranslatorBlock: true,
  includeCompanyBlock: true,
  fieldLabels: {
    dated: "Dated",
    document_holder: "Name(s) on the document",
    document_translated: "Document translated",
  },
};

const outPath = join("scripts", "out", "affidavit-fixture.docx");
await mkdir(dirname(outPath), { recursive: true });
const bytes = await buildAffidavitDocx(fixture);
await writeFile(outPath, bytes);
console.log(`Wrote ${outPath} (${bytes.byteLength} bytes)`);
console.log("Open in Word and compare against:");
console.log("  C:\\Users\\RaminderShah\\Dropbox\\Projects Folder\\4Sight Immigration\\05-02-2026 Punjabi to English PUNAM BISHT\\file preparation\\Mahinder Kaur_Ration Card.docx");
