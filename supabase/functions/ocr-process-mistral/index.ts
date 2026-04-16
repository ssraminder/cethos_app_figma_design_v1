// supabase/functions/ocr-process-mistral/index.ts
// Version: 1
//
// Backup OCR processor using Mistral Document OCR
// (POST https://api.mistral.ai/v1/ocr, model: mistral-ocr-latest).
//
// Modes:
//   - "single": reprocess one ocr_batch_files.id. Deletes any existing
//     ocr_batch_results rows for that file_id and writes fresh ones with
//     ocr_provider='mistral' + markdown_text populated. Used for:
//       (a) admin "Re-OCR with Mistral" manual re-runs
//       (b) auto-fallback from ocr-process-next when Google Document AI fails
//   - "queue": reserved for future (not used in Phase 1)
//
// Required Supabase edge-function secret (set in dashboard):
//   MISTRAL_API_KEY — API key from https://console.mistral.ai/
//
// Mistral pricing (at time of writing): ~$1 per 1,000 pages ≈ $0.001/page.
// Update MISTRAL_COST_PER_PAGE_USD below if pricing changes.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MISTRAL_OCR_URL = "https://api.mistral.ai/v1/ocr";
const MISTRAL_MODEL = "mistral-ocr-latest";
const MISTRAL_TIMEOUT_MS = 120_000;
const MISTRAL_COST_PER_PAGE_USD = 0.001;
const SIGNED_URL_TTL_SECONDS = 600; // 10 minutes — enough for Mistral to fetch the file

const IMAGE_MIME_PREFIXES = ["image/"];
const PDF_MIME_TYPES = ["application/pdf"];

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
    if (!mistralKey) {
      throw new Error("MISTRAL_API_KEY not configured in edge-function secrets");
    }

    const body = await req.json().catch(() => ({}));
    const mode = (body.mode as string) || "single";
    const fileId = body.fileId as string | undefined;

    if (mode !== "single") {
      return jsonResponse(400, { success: false, error: `Unsupported mode: ${mode}` });
    }
    if (!fileId) {
      return jsonResponse(400, { success: false, error: "fileId required for mode=single" });
    }

    console.log(`🤖 Mistral OCR — processing file ${fileId}`);

    const { data: fileRow, error: fileError } = await supabaseAdmin
      .from("ocr_batch_files")
      .select("id, batch_id, filename, storage_path, mime_type")
      .eq("id", fileId)
      .single();

    if (fileError || !fileRow) {
      throw new Error(`File ${fileId} not found: ${fileError?.message || "no row"}`);
    }

    await supabaseAdmin
      .from("ocr_batch_files")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", fileId);

    const startTime = Date.now();

    const result = await processWithMistral({
      supabaseAdmin,
      mistralKey,
      fileRow,
    });

    const processingTime = Date.now() - startTime;

    // Delete any existing results for this file, then insert fresh ones.
    const { error: deleteError } = await supabaseAdmin
      .from("ocr_batch_results")
      .delete()
      .eq("file_id", fileId);
    if (deleteError) {
      throw new Error(`Failed to clear existing results: ${deleteError.message}`);
    }

    if (result.pageResults.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("ocr_batch_results")
        .insert(result.pageResults);
      if (insertError) {
        throw new Error(`Failed to save results: ${insertError.message}`);
      }
    }

    const costUsd = result.pageResults.length * MISTRAL_COST_PER_PAGE_USD;

    await supabaseAdmin
      .from("ocr_batch_files")
      .update({
        status: "completed",
        page_count: result.pageResults.length,
        word_count: result.totalWords,
        processing_time_ms: processingTime,
        completed_at: new Date().toISOString(),
        ocr_provider: "mistral",
        error_message: null,
        total_api_cost_usd: costUsd,
        total_pages_ocrd: result.pageResults.length,
        api_calls_count: 1,
      })
      .eq("id", fileId);

    // Log the Mistral call for cost tracking
    await supabaseAdmin.from("api_usage_log").insert({
      source_type: "ocr_batch",
      source_id: fileRow.batch_id,
      batch_file_id: fileId,
      provider: "mistral",
      model: MISTRAL_MODEL,
      operation: "ocr",
      pages_processed: result.pageResults.length,
      cost_usd: costUsd,
      processing_time_ms: processingTime,
      status: "success",
    });

    await updateBatchProgress(supabaseAdmin, fileRow.batch_id);

    console.log(
      `✅ Mistral OCR completed: ${result.pageResults.length} pages, ${result.totalWords} words, ${processingTime}ms`
    );

    return jsonResponse(200, {
      success: true,
      fileId,
      pages: result.pageResults.length,
      words: result.totalWords,
      provider: "mistral",
    });
  } catch (error: any) {
    const errorMessage = error?.message?.substring(0, 500) || "Unknown error";
    console.error("❌ Mistral OCR error:", errorMessage);

    return jsonResponse(500, {
      success: false,
      error: errorMessage,
    });
  }
});

// ============================================================================
// HELPERS
// ============================================================================

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function processWithMistral(args: {
  supabaseAdmin: any;
  mistralKey: string;
  fileRow: {
    id: string;
    batch_id: string;
    filename: string;
    storage_path: string;
    mime_type: string | null;
  };
}): Promise<{
  pageResults: Array<Record<string, unknown>>;
  totalWords: number;
}> {
  const { supabaseAdmin, mistralKey, fileRow } = args;

  // Signed URL lets Mistral fetch the file directly — avoids base64 payload
  // inflation and keeps the request body small.
  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from("ocr-uploads")
    .createSignedUrl(fileRow.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signedError || !signed?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${signedError?.message || "no URL"}`);
  }

  const mime = (fileRow.mime_type || "").toLowerCase();
  const isImage = IMAGE_MIME_PREFIXES.some((p) => mime.startsWith(p));
  const isPdf = PDF_MIME_TYPES.includes(mime) || fileRow.storage_path.toLowerCase().endsWith(".pdf");

  if (!isImage && !isPdf) {
    throw new Error(`Unsupported MIME type for Mistral OCR: ${mime || "unknown"}`);
  }

  const document = isImage
    ? { type: "image_url", image_url: signed.signedUrl }
    : { type: "document_url", document_url: signed.signedUrl };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MISTRAL_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(MISTRAL_OCR_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mistralKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        document,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Mistral OCR error: ${response.status} - ${errText.substring(0, 400)}`);
  }

  const result = await response.json();
  const pages = Array.isArray(result.pages) ? result.pages : [];

  let totalWords = 0;
  const pageResults = pages.map((page: any, idx: number) => {
    const markdown = typeof page.markdown === "string" ? page.markdown : "";
    const plain = stripMarkdown(markdown);
    const wordCount = countWords(plain);
    totalWords += wordCount;
    return {
      file_id: fileRow.id,
      page_number: (typeof page.index === "number" ? page.index : idx) + 1,
      word_count: wordCount,
      character_count: plain.length,
      raw_text: plain.substring(0, 50000),
      markdown_text: markdown.substring(0, 200000),
      confidence_score: null,
      detected_language: null,
      language_confidence: null,
      ocr_provider: "mistral",
    };
  });

  return { pageResults, totalWords };
}

function stripMarkdown(md: string): string {
  if (!md) return "";
  return md
    // fenced code blocks
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ""))
    // images ![alt](url)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // inline code `x`
    .replace(/`([^`]+)`/g, "$1")
    // headings / blockquotes
    .replace(/^\s{0,3}(#{1,6}|>)\s+/gm, "")
    // emphasis **x** *x* __x__ _x_
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    // table separator lines
    .replace(/^\s*\|?[\s:-]+\|[\s:|-]*$/gm, "")
    // table pipe chars (keep cell text separated by spaces)
    .replace(/\|/g, " ")
    // list markers
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/^\s{0,3}\d+\.\s+/gm, "")
    // collapse whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

async function updateBatchProgress(supabaseAdmin: any, batchId: string): Promise<void> {
  const { data: files } = await supabaseAdmin
    .from("ocr_batch_files")
    .select("status, page_count, word_count")
    .eq("batch_id", batchId);

  if (!files) return;

  const completed = files.filter((f: any) => f.status === "completed").length;
  const failed = files.filter((f: any) => f.status === "failed").length;
  const totalPages = files.reduce((sum: number, f: any) => sum + (f.page_count || 0), 0);
  const totalWords = files.reduce((sum: number, f: any) => sum + (f.word_count || 0), 0);
  const allDone = completed + failed === files.length;

  await supabaseAdmin
    .from("ocr_batches")
    .update({
      status: allDone ? "completed" : "processing",
      completed_files: completed,
      failed_files: failed,
      total_pages: totalPages,
      total_words: totalWords,
      ...(allDone ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", batchId);
}
