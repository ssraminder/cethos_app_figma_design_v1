// ============================================================================
// affidavit-docx.ts
//
// Builds the affidavit page as a standalone .docx file using docx-js.
// Layout matches the Mahinder Kaur reference: centered AFFIDAVIT heading,
// three labelled rows (Dated / Name(s) on the document / Document translated),
// the certification paragraph, then a two-column table with the translator/
// company block on the left and the commissioner block on the right.
//
// Arial 12pt, US Letter (12240 × 15840 DXA), 1" margins.
// ============================================================================

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
} from "https://esm.sh/docx@8.5.0";

export type AffidavitFields = {
  heading: string;
  affidavitDate: string;              // e.g. "06 February 2026"
  documentHolderName: string;
  documentType: string;
  bodyParagraph: string;              // already-rendered from body_template
  translatorFullName: string | null;
  translatorPhone: string | null;
  translatorEmail: string | null;
  commissionerBlock: string;          // already-rendered from commissioner_block_template
  includeTranslatorBlock: boolean;
  includeCompanyBlock: boolean;
  fieldLabels: { dated: string; document_holder: string; document_translated: string };
};

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

function run(text: string, opts: { bold?: boolean } = {}) {
  return new TextRun({ text, bold: opts.bold ?? false, font: FONT, size: SIZE });
}

function para(text: string, opts: { bold?: boolean; align?: AlignmentType } = {}) {
  return new Paragraph({
    alignment: opts.align,
    children: [run(text, { bold: opts.bold })],
  });
}

function labeledRow(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, font: FONT, size: SIZE }),
      new TextRun({ text: value, font: FONT, size: SIZE }),
    ],
  });
}

function noBorderCell(children: Paragraph[]): TableCell {
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

export async function buildAffidavitDocx(f: AffidavitFields): Promise<Uint8Array> {
  // Left cell: translator name + contact, then company block.
  const leftChildren: Paragraph[] = [];
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

  // Right cell: commissioner block, lines split on " " to wrap naturally.
  const rightChildren: Paragraph[] = f.commissionerBlock
    .split(/\n/)
    .map((line) => para(line));

  const signatureTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [noBorderCell(leftChildren), noBorderCell(rightChildren)],
      }),
    ],
  });

  const doc = new Document({
    creator: "Cethos Translation Services",
    title: "Affidavit",
    styles: {
      default: {
        document: { run: { font: FONT, size: SIZE } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 }, // US Letter, DXA
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1"
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: f.heading, bold: true, font: FONT, size: 32 })], // 16pt
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

  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}
