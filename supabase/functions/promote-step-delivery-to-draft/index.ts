// ============================================================================
// promote-step-delivery-to-draft — turns a workflow step's delivery into a
// staff-created draft_translation file on the order, so admin can send it
// to the customer via the EXISTING review-draft-file pipeline (the
// "Upload Draft Translation" + "Send Selected to Customer" surface on
// AdminOrderDetail).
//
// Pipeline per call:
//   1. Resolve the step's final_delivery_id (or latest delivery if none
//      marked) + read the source file path from step_deliveries.file_paths.
//   2. Download the source. If .docx/.doc, convert to PDF via Adobe (Create
//      PDF from Office).
//   3. Overlay diagonal "DRAFT" watermark on every page via pdf-lib.
//   4. Upload to quote-files bucket under
//        workflows/<order>/<step>/drafts/<ts>-DRAFT.pdf
//   5. INSERT into quote_files: quote_id from orders.quote_id, category
//      = draft_translation, is_staff_created=true,
//      review_status=pending_review, review_version=next.
//
// Output: { file_id, quote_file_id, storage_path, review_version,
//           source_filename, was_converted_from_word }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { convertWordToPdf } from "../_shared/word-to-pdf.ts";
import { applyDiagonalWatermark } from "../_shared/pdf-watermark.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(d: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const BUCKET = "quote-files";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { step_id } = await req.json();
    if (!step_id) return json({ error: "step_id required" }, 400);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Step + workflow + order_id (the workflow row holds the order link).
    const { data: step } = await sb
      .from("order_workflow_steps")
      .select("id, order_id, workflow_id, name, final_delivery_id, order_workflows!workflow_id(order_id)")
      .eq("id", step_id)
      .maybeSingle();
    if (!step) return json({ error: "step not found" }, 404);
    const order_id =
      (step as any).order_id ?? (step as any).order_workflows?.order_id ?? null;
    if (!order_id) return json({ error: "step has no linked order" }, 400);

    // Resolve the delivery we'll watermark.
    let delivery: { id: string; version: number; file_paths: string[] | null } | null = null;
    if (step.final_delivery_id) {
      const { data } = await sb
        .from("step_deliveries")
        .select("id, version, file_paths")
        .eq("id", step.final_delivery_id)
        .maybeSingle();
      delivery = data as typeof delivery;
    }
    if (!delivery) {
      const { data } = await sb
        .from("step_deliveries")
        .select("id, version, file_paths")
        .eq("step_id", step_id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      delivery = data as typeof delivery;
    }
    if (!delivery) return json({ error: "no delivery on this step yet" }, 404);

    const paths = Array.isArray(delivery.file_paths) ? delivery.file_paths : [];
    if (paths.length === 0) return json({ error: "delivery has no files" }, 400);
    const sourcePath = paths[0];
    const sourceFilename = sourcePath.split("/").pop() ?? "delivery";
    const ext = sourceFilename.split(".").pop()?.toLowerCase() ?? "";
    const isPdf = ext === "pdf";
    const isWord = ext === "docx" || ext === "doc";
    if (!isPdf && !isWord) {
      return json({ error: `unsupported extension: ${ext}. Only PDF + DOCX are supported.` }, 415);
    }

    // Download + convert + watermark.
    const { data: blob, error: downloadErr } = await sb.storage.from(BUCKET).download(sourcePath);
    if (downloadErr || !blob) return json({ error: `download failed: ${downloadErr?.message || "empty"}` }, 500);
    const sourceBytes = new Uint8Array(await blob.arrayBuffer());

    let pdfBytes: Uint8Array;
    let wasConverted = false;
    if (isWord) {
      pdfBytes = await convertWordToPdf(sourceBytes);
      wasConverted = true;
    } else {
      pdfBytes = sourceBytes;
    }
    const watermarked = await applyDiagonalWatermark(pdfBytes, { text: "DRAFT" });

    const ts = Date.now();
    const baseName = sourceFilename.replace(/\.(docx?|pdf)$/i, "");
    const pdfFilename = `${baseName}-DRAFT.pdf`;
    const pdfStoragePath = `workflows/${order_id}/${step.id}/drafts/${ts}-${pdfFilename}`;

    const { error: uploadErr } = await sb.storage.from(BUCKET).upload(pdfStoragePath, watermarked, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadErr) return json({ error: `storage upload failed: ${uploadErr.message}` }, 500);

    // Look up the order's quote_id (quote_files is keyed by quote_id) +
    // the draft_translation category id.
    const { data: order } = await sb
      .from("orders")
      .select("quote_id")
      .eq("id", order_id)
      .maybeSingle();
    if (!order?.quote_id) {
      try { await sb.storage.from(BUCKET).remove([pdfStoragePath]); } catch { /* swallow */ }
      return json({ error: "order has no quote_id; cannot create draft file" }, 400);
    }

    const { data: cat } = await sb
      .from("file_categories")
      .select("id")
      .eq("slug", "draft_translation")
      .maybeSingle();
    if (!cat?.id) {
      try { await sb.storage.from(BUCKET).remove([pdfStoragePath]); } catch { /* swallow */ }
      return json({ error: "draft_translation file_category not found" }, 500);
    }

    // Determine next review_version on this quote's drafts.
    const { data: existingDrafts } = await sb
      .from("quote_files")
      .select("review_version")
      .eq("quote_id", order.quote_id)
      .eq("file_category_id", cat.id)
      .is("deleted_at", null);
    const nextVersion =
      (existingDrafts ?? []).reduce((m: number, r: any) => Math.max(m, r.review_version ?? 0), 0) + 1;

    const { data: row, error: insertErr } = await sb
      .from("quote_files")
      .insert({
        quote_id: order.quote_id,
        original_filename: pdfFilename,
        storage_path: pdfStoragePath,
        file_size: watermarked.byteLength,
        mime_type: "application/pdf",
        upload_status: "completed",
        processing_status: "completed",
        ai_processing_status: "skipped",
        is_staff_created: true,
        file_category_id: cat.id,
        review_status: "pending_review",
        review_version: nextVersion,
        staff_notes: `Promoted from workflow step "${step.name}" v${delivery.version}${wasConverted ? " (Word → PDF + DRAFT watermark)" : " (DRAFT watermark)"}`,
      })
      .select("id")
      .single();

    if (insertErr || !row) {
      try { await sb.storage.from(BUCKET).remove([pdfStoragePath]); } catch { /* swallow */ }
      return json({ error: insertErr?.message ?? "quote_files insert failed" }, 500);
    }

    return json({
      quote_file_id: row.id,
      storage_path: pdfStoragePath,
      review_version: nextVersion,
      source_filename: sourceFilename,
      was_converted_from_word: wasConverted,
      bytes: watermarked.byteLength,
    }, 201);
  } catch (err: any) {
    console.error("[promote-step-delivery-to-draft] fatal:", err);
    return json({ error: err?.message || String(err) }, 500);
  }
});
