// supabase/functions/process-quote-documents/index.ts
//
// State-machine orchestrator for the public/customer quote pricing pipeline.
//
// REPLACES the placeholder stub that shipped after the 2026-05-31 verify_jwt
// redeploy dropped the real inline OCR pipeline. The stub returned the SAME
// fabricated analysis (1pg / 350w / birth_certificate / es / $101.40) for every
// file, so every public quote that wasn't manually re-OCR'd by staff was priced
// off a constant unrelated to the document (see QT26-10685 -> ORD-2026-10524).
//
// This drives the REAL pipeline that the admin "Run OCR" flow already uses:
//   Stage A  copy quote-files -> ocr-uploads, ocr-batch-create   (OCR via cron)
//   Stage B  when OCR completes, run analyse-ocr-batch           (Claude analysis)
//   Stage C  when analysis completes, apply the real price       (update-quote-from-analysis)
//
// Idempotent + re-entrant. Invoked once by the client (fire-and-forget from
// UploadStep1) to start, then re-pinged by ocr-process-next when OCR completes
// to advance. Each call inspects current state and performs only the next step.
// A terminal guard makes repeat pings cheap no-ops.
//
// Auto-pricing is gated by app_settings.public_quote_auto_pricing (default false,
// fail-closed): when off, completed analyses are held in 'review_required' for
// staff; when on, a clean analysis auto-publishes the real price (quote_ready).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Reference uploads use a separate bucket and must not be OCR'd / priced.
const REFERENCE_CATEGORY_ID = "f1aed462-a25f-4dd0-96c0-f952c3a72950";

const COMPLEXITY_MULTIPLIERS: Record<string, number> = {
  easy: 1.0,
  medium: 1.15,
  hard: 1.25,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// deno-lint-ignore no-explicit-any
type SB = any;

async function getSetting(
  supabase: SB,
  key: string,
  fallback: string,
): Promise<string> {
  const { data } = await supabase
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", key)
    .maybeSingle();
  return data?.setting_value ?? fallback;
}

async function setProcessing(supabase: SB, quoteId: string): Promise<void> {
  await supabase
    .from("quotes")
    .update({ processing_status: "processing", updated_at: new Date().toISOString() })
    .eq("id", quoteId);
}

// Notify staff and park the quote for manual review. Used whenever we cannot (or
// are configured not to) auto-publish a price: auto-pricing off, OCR/analysis
// failure, or an analysis that needs human judgement (hard / multi-doc / etc).
async function holdForReview(
  supabase: SB,
  supabaseUrl: string,
  serviceRoleKey: string,
  quoteId: string,
  quoteNumber: string | null,
  reason: string,
): Promise<Response> {
  await supabase
    .from("quotes")
    .update({
      processing_status: "review_required",
      review_required_reasons: [reason],
      updated_at: new Date().toISOString(),
    })
    .eq("id", quoteId);

  try {
    await fetch(`${supabaseUrl}/functions/v1/notify-staff-new-lead`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        quote_id: quoteId,
        trigger_type: "review_required",
        quote_number: quoteNumber || null,
      }),
    });
  } catch (notifErr) {
    console.error("Staff notification failed (non-blocking):", notifErr);
  }

  return json({ status: "review_required", reason });
}

// Build the update-quote-from-analysis documents[] payload from the completed
// ocr_ai_analysis rows of a job, then either auto-publish the price (toggle on +
// clean analysis) or hand off to staff review.
async function applyOrHold(
  supabase: SB,
  supabaseUrl: string,
  serviceRoleKey: string,
  quoteId: string,
  quoteNumber: string | null,
  batchId: string,
  jobId: string,
): Promise<Response> {
  const { data: rows, error: rowsErr } = await supabase
    .from("ocr_ai_analysis")
    .select(
      "file_id, original_filename, detected_language, language_name, detected_document_type, " +
        "assessed_complexity, ocr_word_count, ocr_page_count, billable_pages, document_count, " +
        "is_multi_language, processing_status",
    )
    .eq("job_id", jobId);

  if (rowsErr || !rows || rows.length === 0) {
    return holdForReview(
      supabase,
      supabaseUrl,
      serviceRoleKey,
      quoteId,
      quoteNumber,
      "Analysis produced no results",
    );
  }

  const baseRate = parseFloat(await getSetting(supabase, "base_rate", "55")) || 55;
  // Mirrors calcTranslationCost() in OcrResultsModal: non-overridden rate is
  // rounded up to the nearest $2.50 increment.
  const perPageRate = Math.ceil(baseRate / 2.5) * 2.5;

  const completed = rows.filter((r: SB) => r.processing_status === "completed");

  const documents = completed.map((r: SB) => {
    const billable = Math.max(Number(r.billable_pages) || 0, 1.0);
    return {
      filename: r.original_filename || "Unknown",
      ocrBatchFileId: r.file_id || null,
      detectedLanguage: r.detected_language || "unknown",
      languageName: r.language_name || "",
      detectedDocumentType: r.detected_document_type || "other",
      assessedComplexity: r.assessed_complexity || "easy",
      wordCount: Number(r.ocr_word_count) || 0,
      pageCount: Number(r.ocr_page_count) || 1,
      billablePages: billable,
      complexityMultiplier:
        COMPLEXITY_MULTIPLIERS[r.assessed_complexity as string] ?? 1.0,
      baseRate,
      perPageRate,
      translationCost: round2(billable * perPageRate),
      certificationTypeId: null,
      certificationPrice: 0,
    };
  });

  const autoPricingOn =
    (await getSetting(supabase, "public_quote_auto_pricing", "false")) === "true";

  // "Clean" = safe to price without a human: every row analysed cleanly, single
  // document each, single language, complexity not hard, language identified.
  const isClean =
    documents.length > 0 &&
    rows.every((r: SB) => r.processing_status === "completed") &&
    rows.every((r: SB) => (r.document_count || 1) === 1) &&
    rows.every((r: SB) => !r.is_multi_language) &&
    documents.every((d: SB) => d.assessedComplexity !== "hard") &&
    documents.every((d: SB) => d.detectedLanguage && d.detectedLanguage !== "unknown");

  if (!autoPricingOn) {
    return holdForReview(
      supabase,
      supabaseUrl,
      serviceRoleKey,
      quoteId,
      quoteNumber,
      "Auto-pricing disabled — staff to review analysis and send quote",
    );
  }

  if (!isClean) {
    return holdForReview(
      supabase,
      supabaseUrl,
      serviceRoleKey,
      quoteId,
      quoteNumber,
      "Analysis needs staff review (complex, multi-document, multi-language, or low confidence)",
    );
  }

  // Auto-publish the real price. update-quote-from-analysis sets the totals,
  // flips status to awaiting_payment + processing_status to quote_ready, and
  // re-enforces the post-payment guard.
  const res = await fetch(`${supabaseUrl}/functions/v1/update-quote-from-analysis`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ quoteId, batchId, staffId: null, documents }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.success) {
    return holdForReview(
      supabase,
      supabaseUrl,
      serviceRoleKey,
      quoteId,
      quoteNumber,
      `Auto-pricing apply failed: ${data?.error || res.status}`,
    );
  }

  // update-quote-from-analysis (the admin path) leaves status='awaiting_payment'
  // for staff to send a payment link. The public self-serve flow instead lets
  // the customer review + check out immediately, and Checkout.tsx only proceeds
  // on status 'quote_ready'/'approved'. Set it server-side so the customer isn't
  // dependent on client timing to reach checkout.
  await supabase
    .from("quotes")
    .update({ status: "quote_ready" })
    .eq("id", quoteId);

  return json({ status: "quote_ready", totals: data.totals });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let quoteId: string | null = null;
  let quoteNumber: string | null = null;

  try {
    const body = await req.json();
    quoteId = body.quoteId;
    if (!quoteId) return json({ success: false, error: "quoteId is required" }, 400);

    // ── Load quote ───────────────────────────────────────────────────────
    const { data: quote, error: quoteErr } = await supabase
      .from("quotes")
      .select("id, quote_number, processing_status")
      .eq("id", quoteId)
      .maybeSingle();
    if (quoteErr || !quote) throw new Error(`Quote not found: ${quoteId}`);
    quoteNumber = quote.quote_number;

    // ── Terminal guard ───────────────────────────────────────────────────
    // Once a quote is priced or parked for review we are done. Makes repeated
    // pings (from ocr-process-next completion / cron backstops) cheap no-ops.
    if (["quote_ready", "review_required"].includes(quote.processing_status)) {
      return json({ status: quote.processing_status, terminal: true });
    }

    // ── Post-payment guard ───────────────────────────────────────────────
    // Never reprocess a quote whose linked order captured payment.
    const { data: paidOrders } = await supabase
      .from("orders")
      .select("id")
      .eq("quote_id", quoteId)
      .gt("amount_paid", 0);
    if (paidOrders && paidOrders.length > 0) {
      return json({ status: "locked" });
    }

    // ── Load billable (non-reference) uploaded files ─────────────────────
    const { data: files, error: filesErr } = await supabase
      .from("quote_files")
      .select("id, original_filename, storage_path, file_size, mime_type, file_category_id")
      .eq("quote_id", quoteId)
      .eq("upload_status", "uploaded")
      .is("deleted_at", null);
    if (filesErr) throw new Error(`Failed to fetch files: ${filesErr.message}`);
    const billableFiles = (files || []).filter(
      (f: SB) => f.file_category_id !== REFERENCE_CATEGORY_ID,
    );
    if (billableFiles.length === 0) throw new Error("No uploaded files for quote");

    // ── Find the quote's OCR batch (most recent non-failed) ──────────────
    const { data: batch } = await supabase
      .from("ocr_batches")
      .select("id, status")
      .eq("quote_id", quoteId)
      .neq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // ── Stage A: no batch yet → stage files to ocr-uploads + create batch ──
    if (!batch) {
      await setProcessing(supabase, quoteId);

      const uploadFiles: Array<Record<string, unknown>> = [];
      for (const f of billableFiles) {
        const { data: blob, error: dlErr } = await supabase.storage
          .from("quote-files")
          .download(f.storage_path);
        if (dlErr || !blob) {
          console.error(`Could not download ${f.original_filename}:`, dlErr);
          continue;
        }
        // Flat path (no slash) → ocr-process-next reads the ocr-uploads bucket.
        const flatName = `${quoteId}_${f.id}.pdf`;
        const { error: upErr } = await supabase.storage
          .from("ocr-uploads")
          .upload(flatName, blob, {
            contentType: f.mime_type || "application/pdf",
            upsert: true,
          });
        if (upErr) {
          console.error(`Could not stage ${f.original_filename} to ocr-uploads:`, upErr);
          continue;
        }
        uploadFiles.push({
          filename: flatName,
          originalFilename: f.original_filename,
          storagePath: flatName,
          fileSize: f.file_size,
          quoteFileId: f.id,
        });
      }

      if (uploadFiles.length === 0) {
        return holdForReview(
          supabase, supabaseUrl, serviceRoleKey, quoteId, quoteNumber,
          "Could not stage any documents for OCR",
        );
      }

      // No `force` → ocr-batch-create is idempotent per quote, so a duplicate
      // ping that races here returns the existing batch instead of a second one.
      const res = await fetch(`${supabaseUrl}/functions/v1/ocr-batch-create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ files: uploadFiles, quoteId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        return holdForReview(
          supabase, supabaseUrl, serviceRoleKey, quoteId, quoteNumber,
          `Could not start OCR: ${data?.error || res.status}`,
        );
      }
      return json({ status: "processing", stage: "ocr", batchId: data.batchId });
    }

    // ── Batch exists → check OCR completion ──────────────────────────────
    const { data: bfiles } = await supabase
      .from("ocr_batch_files")
      .select("id, status")
      .eq("batch_id", batch.id);
    const batchFiles = bfiles || [];
    const ocrDone =
      batchFiles.length > 0 &&
      batchFiles.every((f: SB) => f.status === "completed" || f.status === "failed");
    const ocrAnyOk = batchFiles.some((f: SB) => f.status === "completed");

    if (!ocrDone) {
      await setProcessing(supabase, quoteId);
      return json({ status: "processing", stage: "ocr", batchId: batch.id });
    }
    if (!ocrAnyOk) {
      return holdForReview(
        supabase, supabaseUrl, serviceRoleKey, quoteId, quoteNumber,
        "OCR failed for all documents",
      );
    }

    // ── Check AI analysis ────────────────────────────────────────────────
    const { data: job } = await supabase
      .from("ocr_ai_analysis_jobs")
      .select("id, status")
      .eq("batch_id", batch.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // ── Stage B: OCR done, no analysis yet → trigger analyse-ocr-batch ────
    if (!job) {
      await setProcessing(supabase, quoteId);
      const completedFileIds = batchFiles
        .filter((f: SB) => f.status === "completed")
        .map((f: SB) => f.id);

      const aRes = await fetch(`${supabaseUrl}/functions/v1/analyse-ocr-batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          batchId: batch.id,
          fileIds: completedFileIds,
          staffName: "Auto (public quote)",
          staffEmail: null,
        }),
      });
      const aData = await aRes.json().catch(() => ({}));

      if (!aRes.ok || !aData?.success) {
        return holdForReview(
          supabase, supabaseUrl, serviceRoleKey, quoteId, quoteNumber,
          `Document analysis failed: ${aData?.error || aRes.status}`,
        );
      }

      // Large document sets process in the background; rather than chase the
      // async job, hand those to staff (they warrant a human look anyway).
      if (aData.mode === "background") {
        return holdForReview(
          supabase, supabaseUrl, serviceRoleKey, quoteId, quoteNumber,
          "Large document set queued for analysis — staff review",
        );
      }

      // Sync mode: analysis completed inline → apply now.
      return await applyOrHold(
        supabase, supabaseUrl, serviceRoleKey, quoteId, quoteNumber, batch.id, aData.jobId,
      );
    }

    // ── Stage B (in flight): analysis job not finished ───────────────────
    if (["pending", "processing"].includes(job.status)) {
      await setProcessing(supabase, quoteId);
      return json({ status: "processing", stage: "analysis", batchId: batch.id });
    }

    // ── Stage C: analysis finished → apply price or hand to staff ─────────
    return await applyOrHold(
      supabase, supabaseUrl, serviceRoleKey, quoteId, quoteNumber, batch.id, job.id,
    );
  } catch (err) {
    console.error("process-quote-documents error:", err);
    // Never leave a customer stuck: park for staff review on any failure.
    if (quoteId) {
      return await holdForReview(
        supabase, supabaseUrl, serviceRoleKey, quoteId, quoteNumber,
        err instanceof Error ? err.message : "Processing error",
      );
    }
    return json(
      { success: false, error: err instanceof Error ? err.message : "Processing failed" },
      500,
    );
  }
});
