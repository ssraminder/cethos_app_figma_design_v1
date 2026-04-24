// supabase/functions/pdf-to-word-mistral/index.ts
//
// AI-powered PDF → DOCX with preserved layout for multilingual + handwritten
// documents. Pipeline: Mistral OCR (auto-detects language incl. Devanagari,
// handles mixed scripts) → optional Pixtral vision correction pass →
// markdown → DOCX reconstruction via the `docx` library.
//
// Mirrors pdf-to-word-convert's response shape so the client handler can
// switch engines by just flipping the invoke target.
//
// Request body:
//   {
//     jobId, storagePath, filename,
//     sourceLanguages: string[]          // ["Hindi", "English"]
//     qualityMode: "fast" | "thorough"
//     autoRotate: boolean
//     formatting: "preserve" | "clean"
//     pageSize: "source" | "letter" | "a4" | "legal"
//   }
//
// Secrets required:
//   MISTRAL_API_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  PageOrientation,
  convertInchesToTwip,
  convertMillimetersToTwip,
  BorderStyle,
} from "https://esm.sh/docx@8.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "pdf-to-word";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;
const MISTRAL_OCR_URL = "https://api.mistral.ai/v1/ocr";
const MISTRAL_CHAT_URL = "https://api.mistral.ai/v1/chat/completions";
const MISTRAL_OCR_MODEL = "mistral-ocr-latest";
const PIXTRAL_MODEL = "pixtral-large-latest";
const MISTRAL_SIGNED_URL_TTL = 600;

type QualityMode = "fast" | "thorough";
type Formatting = "preserve" | "clean";
type PageSize = "source" | "letter" | "a4" | "legal";

interface RequestBody {
  jobId: string;
  storagePath: string;
  filename: string;
  sourceLanguages: string[];
  qualityMode: QualityMode;
  autoRotate: boolean;
  formatting: Formatting;
  pageSize: PageSize;
}

interface MistralPage {
  index: number;
  markdown: string;
  image_base64?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const mistralKey = Deno.env.get("MISTRAL_API_KEY") ?? "";

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    if (!mistralKey) throw new Error("MISTRAL_API_KEY not configured");

    const body = (await req.json().catch(() => ({}))) as Partial<RequestBody>;
    const jobId = body.jobId;
    const storagePath = body.storagePath;
    const filename = body.filename || "document.pdf";
    const sourceLanguages = body.sourceLanguages?.filter(Boolean) || [];
    const qualityMode: QualityMode = body.qualityMode === "fast" ? "fast" : "thorough";
    const autoRotate = body.autoRotate !== false;
    const formatting: Formatting = body.formatting === "clean" ? "clean" : "preserve";
    const pageSize: PageSize = (["source", "letter", "a4", "legal"] as PageSize[])
      .includes(body.pageSize as PageSize)
      ? (body.pageSize as PageSize)
      : "source";

    if (!jobId || !storagePath) {
      return jsonResponse(400, {
        success: false,
        error: "jobId and storagePath are required",
      });
    }

    console.log(
      `📄 PDF→Word (Mistral) — job ${jobId} (${filename}) langs=[${sourceLanguages.join(",")}] quality=${qualityMode} autoRotate=${autoRotate} formatting=${formatting} pageSize=${pageSize}`,
    );

    // 1. Sign the input PDF so Mistral can fetch it
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, MISTRAL_SIGNED_URL_TTL);
    if (signErr || !signed?.signedUrl) {
      throw new Error(`Failed to sign input URL: ${signErr?.message || "no URL"}`);
    }

    // 2. Run Mistral OCR
    const includeImages = qualityMode === "thorough";
    const ocrResult = await callMistralOcr({
      mistralKey,
      documentUrl: signed.signedUrl,
      includeImageBase64: includeImages,
    });
    const ocrPages = ocrResult.pages;
    console.log(`  ↳ Mistral OCR done: ${ocrPages.length} pages`);

    // 3. Optional Pixtral correction pass (thorough mode)
    let finalPages: Array<{ index: number; markdown: string }> = ocrPages.map((p) => ({
      index: p.index,
      markdown: p.markdown || "",
    }));

    if (qualityMode === "thorough") {
      console.log(`  ↳ Running Pixtral correction pass on ${ocrPages.length} pages`);
      const corrected: typeof finalPages = [];
      for (const page of ocrPages) {
        try {
          const improved = await correctWithPixtral({
            mistralKey,
            imageBase64: page.image_base64 || null,
            rawMarkdown: page.markdown || "",
            languages: sourceLanguages,
            formatting,
            autoRotate,
          });
          corrected.push({ index: page.index, markdown: improved });
        } catch (pixErr) {
          console.warn(`  ↳ Pixtral failed for page ${page.index}:`, pixErr);
          corrected.push({ index: page.index, markdown: page.markdown || "" });
        }
      }
      finalPages = corrected;
    }

    // 4. Combine pages — page breaks between them
    const pagesMarkdown = finalPages
      .sort((a, b) => a.index - b.index)
      .map((p) => p.markdown.trim());

    // 5. Build DOCX
    const docxBytes = await buildDocx({
      pagesMarkdown,
      pageSize,
      formatting,
    });

    // 6. Upload DOCX
    const outputPath = `output/${jobId}.docx`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(outputPath, docxBytes, {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
    if (uploadErr) throw new Error(`Failed to store DOCX: ${uploadErr.message}`);

    // 7. Signed URL for download
    const { data: downloadSigned, error: dlSignErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(outputPath, SIGNED_URL_TTL_SECONDS);
    if (dlSignErr || !downloadSigned?.signedUrl) {
      throw new Error(
        `Failed to sign output URL: ${dlSignErr?.message || "no URL"}`,
      );
    }

    console.log(`✅ PDF→Word (Mistral) done: ${outputPath} (${docxBytes.byteLength} bytes)`);

    return jsonResponse(200, {
      success: true,
      jobId,
      outputPath,
      signedUrl: downloadSigned.signedUrl,
      sizeBytes: docxBytes.byteLength,
      pages: finalPages.length,
      engine: "mistral",
      qualityMode,
    });
  } catch (error: unknown) {
    const msg = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    console.error("❌ pdf-to-word-mistral error:", msg);
    return jsonResponse(500, { success: false, error: msg });
  }
});

// ============================================================================
// Mistral OCR
// ============================================================================

async function callMistralOcr(args: {
  mistralKey: string;
  documentUrl: string;
  includeImageBase64: boolean;
}): Promise<{ pages: MistralPage[] }> {
  const resp = await fetch(MISTRAL_OCR_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.mistralKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MISTRAL_OCR_MODEL,
      document: { type: "document_url", document_url: args.documentUrl },
      include_image_base64: args.includeImageBase64,
    }),
  });

  if (!resp.ok) {
    throw new Error(
      `Mistral OCR failed: ${resp.status} ${await resp.text().catch(() => "")}`,
    );
  }

  const data = await resp.json();
  const pages: MistralPage[] = (data.pages || []).map((p: any, i: number) => {
    // Mistral returns page images in the `images` array at the page level with
    // `image_base64` when include_image_base64=true. For our purposes we take
    // the first image per page (the full rendered page).
    const firstImg = Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null;
    return {
      index: typeof p.index === "number" ? p.index : i,
      markdown: p.markdown || "",
      image_base64: firstImg?.image_base64 || undefined,
    };
  });

  return { pages };
}

// ============================================================================
// Pixtral correction pass
// ============================================================================

async function correctWithPixtral(args: {
  mistralKey: string;
  imageBase64: string | null;
  rawMarkdown: string;
  languages: string[];
  formatting: Formatting;
  autoRotate: boolean;
}): Promise<string> {
  if (!args.imageBase64) {
    // No page image available — fall back to OCR output unchanged.
    return args.rawMarkdown;
  }

  const langHint =
    args.languages.length > 0
      ? `This document contains the following languages: ${args.languages.join(", ")}. Preserve each language's script faithfully.`
      : "Detect and preserve the original language(s). Do not translate.";

  const formatHint =
    args.formatting === "preserve"
      ? "Preserve the original layout (headings, tables, lists, blank-line separators). Represent tables as markdown pipe tables."
      : "Flatten into simple paragraphs and headings. No tables or columns — produce clean, easily-editable text.";

  const rotateHint = args.autoRotate
    ? "If the page image is rotated, mentally rotate it upright before transcribing."
    : "";

  const systemPrompt = [
    "You are an expert OCR correction assistant.",
    "You will be given a scanned page image and a raw OCR-extracted markdown version of it.",
    "Produce an improved, corrected markdown transcription by comparing the two.",
    "Priorities, in order:",
    "  1. Every text element visible on the page MUST appear in the output, including handwritten fields.",
    "  2. Preserve the original language(s) and scripts exactly. Do NOT translate.",
    "  3. Correct obvious OCR errors (wrong characters, missing accents, split words).",
    langHint,
    formatHint,
    rotateHint,
    "Respond ONLY with the corrected markdown. Do not include any commentary, explanation, or code fences.",
  ].filter(Boolean).join("\n");

  const userContent = [
    { type: "text", text: "Raw OCR markdown to correct:" },
    { type: "text", text: args.rawMarkdown || "(empty)" },
    { type: "text", text: "Page image for reference:" },
    {
      type: "image_url",
      image_url: args.imageBase64.startsWith("data:")
        ? args.imageBase64
        : `data:image/png;base64,${args.imageBase64}`,
    },
  ];

  const resp = await fetch(MISTRAL_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.mistralKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: PIXTRAL_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!resp.ok) {
    throw new Error(
      `Pixtral call failed: ${resp.status} ${await resp.text().catch(() => "")}`,
    );
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();

  // Pixtral sometimes returns content as an array of parts
  if (Array.isArray(content)) {
    return content
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("\n")
      .trim();
  }
  return args.rawMarkdown;
}

// ============================================================================
// DOCX reconstruction from markdown
// ============================================================================

async function buildDocx(args: {
  pagesMarkdown: string[];
  pageSize: PageSize;
  formatting: Formatting;
}): Promise<Uint8Array> {
  const pageDims = resolvePageSize(args.pageSize);

  const children: Array<Paragraph | Table> = [];

  for (let i = 0; i < args.pagesMarkdown.length; i++) {
    const md = args.pagesMarkdown[i];
    const parsed = renderMarkdown(md, args.formatting);
    children.push(...parsed);

    // Page break between OCR'd pages (except after the last page)
    if (i < args.pagesMarkdown.length - 1) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "", break: 1 })],
          pageBreakBefore: false,
        }),
      );
      children.push(new Paragraph({ children: [], pageBreakBefore: true }));
    }
  }

  const doc = new Document({
    creator: "Cethos PDF→Word (Mistral)",
    sections: [
      {
        properties: {
          page: {
            size: {
              width: pageDims.width,
              height: pageDims.height,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}

function resolvePageSize(size: PageSize): { width: number; height: number } {
  switch (size) {
    case "letter":
      return {
        width: convertInchesToTwip(8.5),
        height: convertInchesToTwip(11),
      };
    case "legal":
      return {
        width: convertInchesToTwip(8.5),
        height: convertInchesToTwip(14),
      };
    case "a4":
      return {
        width: convertMillimetersToTwip(210),
        height: convertMillimetersToTwip(297),
      };
    case "source":
    default:
      // "Match source" falls back to Letter — we don't have reliable access
      // to the PDF's MediaBox in this runtime without a full parser.
      return {
        width: convertInchesToTwip(8.5),
        height: convertInchesToTwip(11),
      };
  }
}

// ----------------------------------------------------------------------------
// Minimal markdown → docx mapper. Handles:
//   # ## ###  headings
//   - | * | numbered lists
//   | pipe | tables |
//   blank-line paragraph breaks
//   **bold** *italic* `code`
// Good enough for OCR output which is mostly flowing text + occasional tables.
// ----------------------------------------------------------------------------

function renderMarkdown(md: string, formatting: Formatting): Array<Paragraph | Table> {
  const lines = md.split(/\r?\n/);
  const out: Array<Paragraph | Table> = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line → paragraph separator
    if (!line.trim()) {
      i++;
      continue;
    }

    // Heading
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 6);
      out.push(
        new Paragraph({
          heading: levelToHeading(level),
          children: inlineRuns(headingMatch[2]),
        }),
      );
      i++;
      continue;
    }

    // Table block (preserve mode only; clean mode flattens to paragraphs)
    if (formatting === "preserve" && isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const tableLines: string[] = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      const table = parseTable(tableLines);
      if (table) {
        out.push(table);
      } else {
        // Fallback: treat rows as paragraphs
        for (const tl of tableLines) {
          out.push(new Paragraph({ children: inlineRuns(tl) }));
        }
      }
      continue;
    }

    // Unordered list
    const ulMatch = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (ulMatch) {
      out.push(
        new Paragraph({
          bullet: { level: 0 },
          children: inlineRuns(ulMatch[1]),
        }),
      );
      i++;
      continue;
    }

    // Ordered list
    const olMatch = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (olMatch) {
      out.push(
        new Paragraph({
          numbering: { reference: "default-numbering", level: 0 },
          children: inlineRuns(olMatch[1]),
        }),
      );
      i++;
      continue;
    }

    // Regular paragraph — consume contiguous non-blank lines as one para
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !(formatting === "preserve" && isTableRow(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    out.push(
      new Paragraph({
        children: inlineRuns(paraLines.join(" ")),
      }),
    );
  }

  return out;
}

function levelToHeading(level: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  switch (level) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    case 4:
      return HeadingLevel.HEADING_4;
    case 5:
      return HeadingLevel.HEADING_5;
    default:
      return HeadingLevel.HEADING_6;
  }
}

function isTableRow(s: string): boolean {
  return /^\s*\|.+\|\s*$/.test(s);
}

function isTableSeparator(s: string): boolean {
  return /^\s*\|[\s:|-]+\|\s*$/.test(s) && /[-]/.test(s);
}

function parseTable(lines: string[]): Table | null {
  if (lines.length < 2) return null;
  const rows = lines
    .filter((l) => !isTableSeparator(l))
    .map((l) =>
      l
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim()),
    );
  if (rows.length === 0) return null;
  const colCount = Math.max(...rows.map((r) => r.length));
  if (colCount === 0) return null;

  const thinBorder = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
  };

  const tableRows = rows.map(
    (r, rowIdx) =>
      new TableRow({
        children: Array.from({ length: colCount }, (_, colIdx) => {
          const text = r[colIdx] ?? "";
          return new TableCell({
            width: { size: Math.floor(100 / colCount), type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: inlineRuns(text),
                alignment: rowIdx === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
              }),
            ],
          });
        }),
      }),
  );

  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: thinBorder,
  });
}

// Parse inline markdown (**bold**, *italic*, `code`) into TextRuns.
function inlineRuns(text: string): TextRun[] {
  if (!text) return [new TextRun({ text: "" })];

  const runs: TextRun[] = [];
  // Tokenizer: scan for **, *, `  delimiters
  const tokens: Array<{ text: string; bold?: boolean; italic?: boolean; code?: boolean }> = [];
  let i = 0;
  let plain = "";
  const flush = () => {
    if (plain) {
      tokens.push({ text: plain });
      plain = "";
    }
  };

  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        flush();
        tokens.push({ text: text.slice(i + 2, end), bold: true });
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "*") {
      const end = text.indexOf("*", i + 1);
      if (end !== -1) {
        flush();
        tokens.push({ text: text.slice(i + 1, end), italic: true });
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        tokens.push({ text: text.slice(i + 1, end), code: true });
        i = end + 1;
        continue;
      }
    }
    plain += text[i];
    i++;
  }
  flush();

  for (const t of tokens) {
    runs.push(
      new TextRun({
        text: t.text,
        bold: t.bold,
        italics: t.italic,
        font: t.code ? "Consolas" : undefined,
      }),
    );
  }
  return runs;
}

// ============================================================================
// Utilities
// ============================================================================

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
