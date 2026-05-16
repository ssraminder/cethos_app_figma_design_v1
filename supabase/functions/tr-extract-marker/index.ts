// ============================================================================
// tr-extract-marker — deterministic extraction of an identity marker from a
// file (footer for .docx, header row for .xlsx, first/last page text for .pdf).
// No Claude call; just OOXML / PDF text extraction.
//
// Input: { file_id }
// Output: { file_id, mime_type, extracted_markers: string[], primary_marker: string|null }
//
// Markers extracted are heuristic — the caller (tr-preflight) compares against
// the user-declared expected_marker via case-insensitive substring match.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, tr } from "../_shared/tr.ts";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import * as pdfjs from "https://esm.sh/pdfjs-dist@4.10.38/legacy/build/pdf.mjs";
import JSZip from "https://esm.sh/jszip@3.10.1";

async function extractDocxMarkers(bytes: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes);
  const candidates: string[] = [];
  // footer1.xml / footer2.xml / header1.xml live in word/ subfolder
  for (const path of Object.keys(zip.files)) {
    if (/^word\/(footer|header)\d*\.xml$/i.test(path)) {
      const xml = await zip.files[path].async("string");
      // Strip XML tags, keep text
      const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text) candidates.push(text);
    }
  }
  // Fallback: scan document.xml for footer-like patterns
  if (!candidates.length && zip.files["word/document.xml"]) {
    const xml = await zip.files["word/document.xml"].async("string");
    const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    // Heuristic: take the last 500 chars as a candidate footer area
    if (text.length > 500) candidates.push(text.slice(-500));
    else if (text) candidates.push(text);
  }
  return candidates;
}

async function extractXlsxMarkers(bytes: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes);
  const candidates: string[] = [];
  // Shared strings carry text values
  if (zip.files["xl/sharedStrings.xml"]) {
    const xml = await zip.files["xl/sharedStrings.xml"].async("string");
    const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) candidates.push(text.slice(0, 1000));
  }
  // First sheet
  if (zip.files["xl/worksheets/sheet1.xml"]) {
    const xml = await zip.files["xl/worksheets/sheet1.xml"].async("string");
    const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) candidates.push(text.slice(0, 1000));
  }
  return candidates;
}

async function extractPdfMarkers(bytes: Uint8Array): Promise<string[]> {
  const candidates: string[] = [];
  try {
    // Try pdf.js text extraction first
    const loadingTask = (pdfjs as { getDocument: (args: { data: Uint8Array }) => { promise: Promise<unknown> } })
      .getDocument({ data: bytes });
    const doc = await loadingTask.promise as { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str: string }[] }> }> };
    const pages = doc.numPages;
    const pagesToCheck = [1, pages];
    for (const p of pagesToCheck) {
      try {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const text = content.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
        if (text) candidates.push(text.slice(0, 1500));
      } catch (e) {
        console.warn(`[tr-extract-marker] pdfjs page ${p} failed:`, e);
      }
    }
  } catch (e) {
    console.warn("[tr-extract-marker] pdfjs failed, falling back to pdf-lib metadata:", e);
    try {
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const title = pdf.getTitle();
      const subject = pdf.getSubject();
      const author = pdf.getAuthor();
      if (title) candidates.push(title);
      if (subject) candidates.push(subject);
      if (author) candidates.push(author);
    } catch (e2) {
      console.warn("[tr-extract-marker] pdf-lib metadata fallback failed:", e2);
    }
  }
  return candidates;
}

function pickPrimaryMarker(markers: string[], expected: string | null): string | null {
  if (!markers.length) return null;
  if (!expected) return markers[0].slice(0, 200);
  const needle = expected.trim().toLowerCase();
  for (const m of markers) {
    if (m.toLowerCase().includes(needle)) return expected;
  }
  // No marker matches; surface the most-distinctive looking candidate
  // (shortest non-empty, often a footer line)
  return markers
    .filter((m) => m.length > 0)
    .sort((a, b) => a.length - b.length)[0]
    .slice(0, 200);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { file_id } = await req.json();
    if (!file_id) return json({ error: "file_id required" }, 400);

    const sb = serviceClient();
    const { data: file } = await tr(sb)
      .from("job_files")
      .select("id, storage_bucket, storage_path, mime_type, expected_marker, original_filename")
      .eq("id", file_id)
      .maybeSingle();
    if (!file) return json({ error: "file not found" }, 404);

    const { data: blob, error: dlErr } = await sb.storage
      .from(file.storage_bucket)
      .download(file.storage_path);
    if (dlErr || !blob) return json({ error: dlErr?.message ?? "download failed" }, 500);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    let markers: string[] = [];
    const mime = (file.mime_type ?? "").toLowerCase();
    const ext = file.original_filename.split(".").pop()?.toLowerCase() ?? "";
    try {
      if (mime.includes("wordprocessingml") || ext === "docx") {
        markers = await extractDocxMarkers(bytes);
      } else if (mime.includes("spreadsheetml") || ext === "xlsx") {
        markers = await extractXlsxMarkers(bytes);
      } else if (mime.includes("pdf") || ext === "pdf") {
        markers = await extractPdfMarkers(bytes);
      } else if (mime.startsWith("text/") || ["txt", "md", "csv"].includes(ext)) {
        const text = new TextDecoder().decode(bytes);
        markers = [text.slice(0, 500), text.slice(-500)].filter((s) => s.trim().length > 0);
      }
    } catch (e) {
      console.error("[tr-extract-marker] extraction error:", e);
    }

    const primary = pickPrimaryMarker(markers, file.expected_marker);

    return json({
      file_id,
      mime_type: file.mime_type,
      extracted_markers: markers,
      primary_marker: primary,
    });
  } catch (err) {
    console.error("[tr-extract-marker] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
