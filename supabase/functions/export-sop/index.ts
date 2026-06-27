// ============================================================================
// export-sop
// Exports a SOP (its current or a specified version) as a downloadable Word
// (.docx) or PDF file, rendered from the version's markdown content_md.
// POST { sop_id, version_id?, format: 'docx' | 'pdf' } -> binary file.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { marked } from "https://esm.sh/marked@12.0.2";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} from "https://esm.sh/docx@8.5.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "content-disposition",
};
const json = (d: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const NAVY = "0C2340", TEAL = "0E7490", LABELBG = "EEF2F6";

// ---- inline (bold/italic/code) -> docx TextRun[] ----
function inlineRuns(tokens: any[], base: any = {}): any[] {
  if (!tokens || !tokens.length) return [new TextRun({ text: "", ...base })];
  const out: any[] = [];
  for (const t of tokens) {
    if (t.type === "strong") out.push(...inlineRuns(t.tokens, { ...base, bold: true }));
    else if (t.type === "em") out.push(...inlineRuns(t.tokens, { ...base, italics: true }));
    else if (t.type === "codespan") out.push(new TextRun({ text: t.text, font: "Consolas", ...base }));
    else if (t.type === "br") out.push(new TextRun({ text: "", break: 1, ...base }));
    else out.push(new TextRun({ text: t.text ?? t.raw ?? "", ...base }));
  }
  return out.length ? out : [new TextRun({ text: "", ...base })];
}

function buildDocx(meta: any, tokens: any[]): Promise<Uint8Array> {
  const FONT = "Calibri";
  const children: any[] = [];
  // header block
  children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: meta.sop_number, bold: true, size: 22, color: TEAL, font: FONT })] }));
  children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: meta.title, bold: true, size: 34, color: NAVY, font: FONT })] }));
  const metaRows = [
    ["Category", meta.category || "—"],
    ["ISO reference", meta.iso_clause_reference || "—"],
    ["Version", `${meta.version_label} · ${meta.status}${meta.effective_date ? " · effective " + meta.effective_date : ""}`],
    ["Approved by", meta.approved_by_name || "—"],
  ];
  children.push(new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [2200, 7160],
    rows: metaRows.map(([k, v]) => new TableRow({ children: [
      new TableCell({ width: { size: 2200, type: WidthType.DXA }, shading: { fill: LABELBG, type: ShadingType.CLEAR, color: "auto" }, margins: { top: 50, bottom: 50, left: 110, right: 110 },
        children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 20, font: FONT })] })] }),
      new TableCell({ width: { size: 7160, type: WidthType.DXA }, margins: { top: 50, bottom: 50, left: 110, right: 110 },
        children: [new Paragraph({ children: [new TextRun({ text: v, size: 20, font: FONT })] })] }),
    ] })),
  }));
  children.push(new Paragraph({ text: "" }));

  for (const tok of tokens) {
    if (tok.type === "heading") {
      const lvl = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][Math.min(tok.depth, 6) - 1];
      children.push(new Paragraph({ heading: lvl, spacing: { before: 200, after: 80 }, children: inlineRuns(tok.tokens, { color: NAVY, font: FONT }) }));
    } else if (tok.type === "paragraph") {
      children.push(new Paragraph({ spacing: { after: 100 }, children: inlineRuns(tok.tokens, { font: FONT }) }));
    } else if (tok.type === "list") {
      let i = 1;
      for (const item of tok.items) {
        const runs = inlineRuns(item.tokens?.[0]?.tokens ?? item.tokens ?? [{ text: item.text }], { font: FONT });
        children.push(new Paragraph({
          spacing: { after: 40 }, indent: { left: 460, hanging: 260 },
          children: [new TextRun({ text: tok.ordered ? `${i++}. ` : "•  ", font: FONT }), ...runs],
        }));
      }
    } else if (tok.type === "table") {
      const widths = tok.header.map(() => Math.floor(9360 / tok.header.length));
      const hdr = new TableRow({ children: tok.header.map((c: any, ci: number) => new TableCell({
        width: { size: widths[ci], type: WidthType.DXA }, shading: { fill: NAVY, type: ShadingType.CLEAR, color: "auto" }, margins: { top: 50, bottom: 50, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: c.text, bold: true, color: "FFFFFF", size: 19, font: FONT })] })] })) });
      const body = tok.rows.map((r: any[]) => new TableRow({ children: r.map((c: any, ci: number) => new TableCell({
        width: { size: widths[ci], type: WidthType.DXA }, margins: { top: 50, bottom: 50, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: c.text, size: 19, font: FONT })] })] })) }));
      children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: widths, rows: [hdr, ...body] }));
      children.push(new Paragraph({ text: "", spacing: { after: 80 } }));
    } else if (tok.type === "blockquote") {
      children.push(new Paragraph({ indent: { left: 360 }, spacing: { after: 100 }, children: [new TextRun({ text: tok.text, italics: true, color: "475569", font: FONT })] }));
    } else if (tok.type === "code") {
      for (const line of String(tok.text).split("\n")) children.push(new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: line || " ", font: "Consolas", size: 18 })] }));
      children.push(new Paragraph({ text: "", spacing: { after: 60 } }));
    } else if (tok.type === "hr") {
      children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1", space: 1 } }, spacing: { after: 100 }, children: [] }));
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 21, color: "1A1A1A" } } } },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }],
  });
  return Packer.toBlob(doc).then(async (blob: Blob) => new Uint8Array(await blob.arrayBuffer()));
}

async function buildPdf(meta: any, tokens: any[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const W = 612, H = 792, M = 56;
  let page = pdf.addPage([W, H]); let y = H - M;
  const navy = rgb(0.047, 0.137, 0.251), ink = rgb(0.1, 0.1, 0.1), mute = rgb(0.4, 0.45, 0.5);
  const ensure = (need: number) => { if (y - need < M) { page = pdf.addPage([W, H]); y = H - M; } };
  // pdf-lib StandardFonts are WinAnsi/CP1252 — map the non-CP1252 glyphs SOPs use (arrows/math)
  const san = (s: string) => String(s)
    .replace(/→/g, "->").replace(/←/g, "<-").replace(/↔/g, "<->").replace(/⇒/g, "=>")
    .replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/≠/g, "!=").replace(/≈/g, "~")
    .replace(/[←-⇿∀-⋿]/g, "?");
  const wrap = (text: string, font: any, size: number, maxW: number): string[] => {
    const words = san(String(text)).split(/\s+/); const lines: string[] = []; let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (font.widthOfTextAtSize(t, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur); return lines.length ? lines : [""];
  };
  const draw = (text: string, opt: { font?: any; size?: number; color?: any; x?: number; gap?: number; maxW?: number } = {}) => {
    const font = opt.font ?? reg, size = opt.size ?? 10.5, color = opt.color ?? ink, x = opt.x ?? M, maxW = opt.maxW ?? (W - 2 * M - (x - M));
    for (const line of wrap(text, font, size, maxW)) { ensure(size + 3); page.drawText(line, { x, y: y - size, size, font, color }); y -= size + 3; }
    y -= opt.gap ?? 0;
  };
  // header
  draw(meta.sop_number, { font: bold, size: 11, color: rgb(0.055, 0.455, 0.565) });
  draw(meta.title, { font: bold, size: 18, color: navy, gap: 6 });
  for (const [k, v] of [["Category", meta.category || "—"], ["ISO reference", meta.iso_clause_reference || "—"],
       ["Version", `${meta.version_label} · ${meta.status}${meta.effective_date ? " · effective " + meta.effective_date : ""}`], ["Approved by", meta.approved_by_name || "—"]]) {
    ensure(14); page.drawText(k + ":", { x: M, y: y - 9, size: 9, font: bold, color: mute });
    for (const line of wrap(v, reg, 9, W - 2 * M - 110)) { page.drawText(line, { x: M + 110, y: y - 9, size: 9, font: reg, color: ink }); y -= 12; }
  }
  y -= 8; ensure(2); page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.8, 0.85, 0.9) }); y -= 14;

  const plain = (toks: any[]): string => (toks || []).map((t: any) => t.tokens ? plain(t.tokens) : (t.text ?? t.raw ?? "")).join("");
  for (const tok of tokens) {
    if (tok.type === "heading") { const sz = [16, 13.5, 12, 11][Math.min(tok.depth, 4) - 1]; y -= 6; draw(plain(tok.tokens), { font: bold, size: sz, color: navy, gap: 3 }); }
    else if (tok.type === "paragraph") draw(plain(tok.tokens), { gap: 5 });
    else if (tok.type === "list") {
      let i = 1; for (const item of tok.items) { const pre = tok.ordered ? `${i++}.` : "•";
        ensure(13); page.drawText(pre, { x: M, y: y - 10, size: 10.5, font: reg, color: ink });
        const lines = wrap(plain(item.tokens), reg, 10.5, W - 2 * M - 16);
        lines.forEach((ln, li) => { if (li > 0) ensure(13); page.drawText(ln, { x: M + 16, y: y - 10, size: 10.5, font: reg, color: ink }); y -= 13; }); }
      y -= 4;
    } else if (tok.type === "table") {
      for (const c of tok.header) { /* header row as bold label line */ }
      const cols = tok.header.length;
      const rows = [tok.header.map((c: any) => c.text), ...tok.rows.map((r: any[]) => r.map((c: any) => c.text))];
      rows.forEach((r, ri) => {
        if (cols === 2) { ensure(13); page.drawText(san(r[0]), { x: M, y: y - 9, size: 9, font: bold, color: ri === 0 ? navy : mute });
          for (const ln of wrap(r[1], reg, 9, W - 2 * M - 150)) { page.drawText(ln, { x: M + 150, y: y - 9, size: 9, font: reg, color: ink }); y -= 12; } }
        else { ensure(13); page.drawText(san(r.join("   ·   ")), { x: M, y: y - 9, size: 8.5, font: ri === 0 ? bold : reg, color: ri === 0 ? navy : ink }); y -= 12; }
      });
      y -= 6;
    } else if (tok.type === "code") { for (const line of String(tok.text).split("\n")) draw(line || " ", { font: mono, size: 8.5, color: mute }); y -= 4; }
    else if (tok.type === "blockquote") draw(tok.text, { font: reg, size: 10, color: mute, gap: 5 });
    else if (tok.type === "hr") { y -= 4; ensure(2); page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.8, 0.85, 0.9) }); y -= 10; }
  }
  return await pdf.save();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { sop_id, version_id, format } = await req.json();
    if (!sop_id || !["docx", "pdf"].includes(format)) return json({ success: false, error: "Missing sop_id or invalid format" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sop, error: sErr } = await sb.from("sops").select("id, sop_number, title, category, iso_clause_reference, current_version_id").eq("id", sop_id).single();
    if (sErr || !sop) return json({ success: false, error: "SOP not found" }, 404);

    const verId = version_id || sop.current_version_id;
    if (!verId) return json({ success: false, error: "SOP has no version to export" }, 400);
    const { data: ver, error: vErr } = await sb.from("sop_versions").select("version_number, document_version, content_md, status, effective_date, approved_by_name").eq("id", verId).single();
    if (vErr || !ver) return json({ success: false, error: "Version not found" }, 404);

    const meta = { sop_number: sop.sop_number, title: sop.title, category: sop.category, iso_clause_reference: sop.iso_clause_reference,
                   version_label: ver.document_version ? `v${ver.document_version}` : `v${ver.version_number}`,
                   status: ver.status, effective_date: ver.effective_date, approved_by_name: ver.approved_by_name };
    const tokens = marked.lexer(ver.content_md || "");

    const bytes = format === "docx" ? await buildDocx(meta, tokens) : await buildPdf(meta, tokens);
    const safe = `${sop.sop_number} - ${sop.title}`.replace(/[^a-zA-Z0-9 ._-]/g, "_").slice(0, 120);
    return new Response(bytes, { headers: { ...CORS,
      "Content-Type": format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
      "Content-Disposition": `attachment; filename="${safe}.${format}"` } });
  } catch (err) {
    console.error("export-sop error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
