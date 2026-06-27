// ============================================================================
// md-docx.ts
//
// Minimal-but-faithful Markdown -> .docx renderer for QMS documents (SOPs etc.).
// Renders headings, paragraphs, bullet/numbered lists, pipe tables, blockquotes,
// horizontal rules, fenced code blocks, and inline **bold** / *italic* /
// `code` / [link](url). Produces a Cethos-branded controlled-document layout:
// a cover/meta block on top and a controlled-copy footer.
//
// Used by the qms-dropbox-sync edge function to materialise each SOP version's
// content_md into a Word document for the team Dropbox QMS library.
//
// Calibri 11pt body, US Letter (12240 x 15840 DXA), 1" margins.
// ============================================================================

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "https://esm.sh/docx@8.5.0";

const FONT = "Calibri";
const SIZE = 22; // half-points -> 11pt
const CODE_FONT = "Consolas";
const LINK_COLOR = "0563C1";
const MUTED = "595959";
const RULE_COLOR = "BFBFBF";

const HEADING_SIZES: Record<number, number> = { 1: 32, 2: 28, 3: 26, 4: 24, 5: 23, 6: 22 };
const HEADING_LEVELS: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

export type SopMeta = {
  /** e.g. "SOP-001" */
  number: string;
  /** e.g. "Document Control and Records Management" */
  title: string;
  /** e.g. "v2.0" */
  versionLabel: string;
  /** e.g. "active" | "superseded" */
  status: string;
  /** ISO date string or null */
  effectiveDate: string | null;
  /** true for the SOP's current/active version */
  isCurrent: boolean;
  /** approver display name, if known */
  approvedBy?: string | null;
  /** ISO timestamp the doc was generated */
  generatedAt: string;
};

// -- Inline -----------------------------------------------------------------

// One regex matching the supported inline tokens, in priority order.
const INLINE_RE =
  /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*?)\*|_([^_\s][^_]*?)_|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/;

type InlineStyle = { bold?: boolean; italics?: boolean };

function styledRun(text: string, s: InlineStyle & { code?: boolean } = {}) {
  return new TextRun({
    text,
    bold: s.bold,
    italics: s.italics,
    font: s.code ? CODE_FONT : FONT,
    size: SIZE,
    ...(s.code ? { shading: { fill: "F2F2F2", type: "clear", color: "auto" } } : {}),
  });
}

/** Parse inline markdown in `text` into docx runs, inheriting `base` styles. */
function inlineRuns(text: string, base: InlineStyle = {}): (TextRun | ExternalHyperlink)[] {
  const out: (TextRun | ExternalHyperlink)[] = [];
  let rest = text;
  while (rest.length) {
    const m = INLINE_RE.exec(rest);
    if (!m) {
      out.push(styledRun(rest, base));
      break;
    }
    if (m.index > 0) out.push(styledRun(rest.slice(0, m.index), base));

    if (m[2] !== undefined || m[3] !== undefined) {
      // **bold** / __bold__
      out.push(...inlineRuns(m[2] ?? m[3], { ...base, bold: true }));
    } else if (m[4] !== undefined || m[5] !== undefined) {
      // *italic* / _italic_
      out.push(...inlineRuns(m[4] ?? m[5], { ...base, italics: true }));
    } else if (m[6] !== undefined) {
      // `code`
      out.push(styledRun(m[6], { ...base, code: true }));
    } else if (m[7] !== undefined && m[8] !== undefined) {
      // [text](url)
      out.push(
        new ExternalHyperlink({
          link: m[8],
          children: [
            new TextRun({
              text: m[7],
              font: FONT,
              size: SIZE,
              color: LINK_COLOR,
              underline: {},
              bold: base.bold,
              italics: base.italics,
            }),
          ],
        }),
      );
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

// -- Block helpers ----------------------------------------------------------

function isTableSep(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function tableCell(text: string, header: boolean): TableCell {
  const children = header
    ? [new TextRun({ text: stripInline(text), bold: true, font: FONT, size: SIZE })]
    : inlineRuns(text);
  return new TableCell({
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    shading: header ? { fill: "F2F2F2", type: "clear", color: "auto" } : undefined,
    children: [new Paragraph({ children })],
  });
}

function buildTable(rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (cells, i) =>
        new TableRow({
          tableHeader: i === 0,
          children: cells.map((c) => tableCell(c, i === 0)),
        }),
    ),
  });
}

function hr(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE_COLOR, space: 1 } },
    children: [],
  });
}

// -- Markdown -> blocks -----------------------------------------------------

/** Convert a markdown string into an array of docx blocks (Paragraph | Table). */
export function markdownToBlocks(md: string): (Paragraph | Table)[] {
  const lines = (md ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks: (Paragraph | Table)[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line -> small spacer
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block
    const fence = line.match(/^\s*```/);
    if (fence) {
      i++;
      const code: string[] = [];
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++; // closing fence
      for (const c of code) {
        blocks.push(
          new Paragraph({
            shading: { fill: "F2F2F2", type: "clear", color: "auto" },
            spacing: { after: 0 },
            children: [new TextRun({ text: c || " ", font: CODE_FONT, size: SIZE - 2 })],
          }),
        );
      }
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      blocks.push(
        new Paragraph({
          heading: HEADING_LEVELS[level],
          spacing: { before: 200, after: 80 },
          children: [
            new TextRun({ text: stripInline(h[2].trim()), bold: true, size: HEADING_SIZES[level], font: FONT }),
          ],
        }),
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(hr());
      i++;
      continue;
    }

    // Table (current line has a pipe and next line is a separator)
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const rows: string[][] = [splitRow(line)];
      i += 2; // skip header + separator
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push(buildTable(rows));
      blocks.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
      continue;
    }

    // Blockquote
    const bq = line.match(/^\s*>\s?(.*)$/);
    if (bq) {
      const quote: string[] = [bq[1]];
      i++;
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(
        new Paragraph({
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: RULE_COLOR, space: 12 } },
          indent: { left: 240 },
          spacing: { after: 80 },
          children: inlineRuns(quote.join(" ").trim(), { italics: true }),
        }),
      );
      continue;
    }

    // List (bullet or numbered) — consume the contiguous block
    const listM = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (listM) {
      while (i < lines.length) {
        const lm = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!lm) break;
        const indent = Math.floor(lm[1].replace(/\t/g, "    ").length / 2);
        const ordered = /\d/.test(lm[2]);
        blocks.push(
          new Paragraph({
            spacing: { after: 40 },
            ...(ordered
              ? { numbering: { reference: "qms-ol", level: Math.min(indent, 2) } }
              : { bullet: { level: Math.min(indent, 2) } }),
            children: inlineRuns(lm[3].trim()),
          }),
        );
        i++;
      }
      continue;
    }

    // Plain paragraph — gather wrapped lines until blank/structural
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push(
      new Paragraph({ spacing: { after: 120 }, children: inlineRuns(buf.join(" ").trim()) }),
    );
  }

  return blocks;
}

/** Strip inline markdown markers, leaving plain text (used for headings). */
function stripInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1");
}

// -- Cover + document -------------------------------------------------------

function metaRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 28, type: WidthType.PERCENTAGE },
        margins: { top: 40, bottom: 40, left: 100, right: 100 },
        borders: noBorders(),
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, font: FONT, size: SIZE - 2, color: MUTED })] })],
      }),
      new TableCell({
        width: { size: 72, type: WidthType.PERCENTAGE },
        margins: { top: 40, bottom: 40, left: 100, right: 100 },
        borders: noBorders(),
        children: [new Paragraph({ children: [new TextRun({ text: value, font: FONT, size: SIZE - 2 })] })],
      }),
    ],
  });
}

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return { top: none, bottom: none, left: none, right: none };
}

/** Render a SOP version into a controlled .docx. */
export async function renderSopDocx(meta: SopMeta, markdown: string): Promise<Uint8Array> {
  const cover: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: meta.number, bold: true, font: FONT, size: 28, color: MUTED })],
    }),
    new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: meta.title, bold: true, font: FONT, size: 40 })],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        metaRow("Version", `${meta.versionLabel}${meta.isCurrent ? "  (current / effective)" : "  (superseded)"}`),
        metaRow("Status", meta.status),
        metaRow("Effective date", meta.effectiveDate ?? "—"),
        ...(meta.approvedBy ? [metaRow("Approved by", meta.approvedBy)] : []),
      ],
    }),
    hr(),
    new Paragraph({ spacing: { after: 160 }, children: [] }),
  ];

  const body = markdownToBlocks(markdown);

  const doc = new Document({
    creator: "Cethos QMS (portal.cethos.com)",
    title: `${meta.number} ${meta.versionLabel} — ${meta.title}`,
    description: "Controlled QMS document — auto-generated from the Cethos portal.",
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    numbering: {
      config: [
        {
          reference: "qms-ol",
          levels: [0, 1, 2].map((l) => ({
            level: l,
            format: l === 1 ? "lowerLetter" : l === 2 ? "lowerRoman" : "decimal",
            text: l === 1 ? "%2." : l === 2 ? "%3." : "%1.",
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 360 * (l + 1), hanging: 260 } } },
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE_COLOR, space: 4 } },
                children: [
                  new TextRun({
                    text:
                      `Controlled copy — source of truth is the Cethos portal (portal.cethos.com). ` +
                      `${meta.number} ${meta.versionLabel} · ${meta.status} · generated ${meta.generatedAt}`,
                    font: FONT,
                    size: 16,
                    color: MUTED,
                  }),
                ],
              }),
            ],
          }),
        },
        children: [...cover, ...body],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}
