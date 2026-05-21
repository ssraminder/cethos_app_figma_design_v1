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

const STAFF_BUCKET = "quote-files";
const VENDOR_BUCKET = "vendor-deliveries";

// step_deliveries.file_paths is text[] but two writers store different shapes:
//   - staff-deliver-step (admin): array of plain path strings, all in quote-files
//   - vendor-deliver-step (vendor portal): array of JSON-stringified objects
//     {storage_path, original_filename, file_size, mime_type}, in vendor-deliveries
// Normalize both before consuming.
type NormalizedFile = { storage_path: string; filename: string };
function normalizeFilePaths(raw: unknown): NormalizedFile[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: NormalizedFile[] = [];
  for (const entry of arr) {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === "object" && typeof parsed.storage_path === "string") {
            out.push({
              storage_path: parsed.storage_path,
              filename: parsed.original_filename ?? parsed.storage_path.split("/").pop() ?? "delivery",
            });
            continue;
          }
        } catch { /* fall through and treat as plain string */ }
      }
      out.push({ storage_path: trimmed, filename: trimmed.split("/").pop() ?? "delivery" });
    } else if (entry && typeof entry === "object" && typeof (entry as any).storage_path === "string") {
      const obj = entry as any;
      out.push({
        storage_path: obj.storage_path,
        filename: obj.original_filename ?? obj.storage_path.split("/").pop() ?? "delivery",
      });
    }
  }
  return out;
}

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
      .select("id, order_id, workflow_id, name, actor_type, final_delivery_id, order_workflows!workflow_id(order_id)")
      .eq("id", step_id)
      .maybeSingle();
    if (!step) return json({ error: "step not found" }, 404);
    const order_id =
      (step as any).order_id ?? (step as any).order_workflows?.order_id ?? null;
    if (!order_id) return json({ error: "step has no linked order" }, 400);

    // Resolve the delivery we'll watermark.
    let delivery:
      | { id: string; version: number; file_paths: unknown; actor_type?: string | null }
      | null = null;
    if (step.final_delivery_id) {
      const { data } = await sb
        .from("step_deliveries")
        .select("id, version, file_paths, actor_type")
        .eq("id", step.final_delivery_id)
        .maybeSingle();
      delivery = data as typeof delivery;
    }
    if (!delivery) {
      const { data } = await sb
        .from("step_deliveries")
        .select("id, version, file_paths, actor_type")
        .eq("step_id", step_id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      delivery = data as typeof delivery;
    }
    if (!delivery) return json({ error: "no delivery on this step yet" }, 404);

    const files = normalizeFilePaths(delivery.file_paths);
    if (files.length === 0) return json({ error: "delivery has no files" }, 400);
    const { storage_path: sourcePath, filename: sourceFilename } = files[0];
    const ext = sourceFilename.split(".").pop()?.toLowerCase() ?? "";
    const isPdf = ext === "pdf";
    const isWord = ext === "docx" || ext === "doc";
    if (!isPdf && !isWord) {
      return json({ error: `unsupported extension: ${ext}. Only PDF + DOCX are supported.` }, 415);
    }

    // Pick the right source bucket based on who delivered. Vendor uploads land
    // in vendor-deliveries; staff uploads land in quote-files. Fall back to the
    // other bucket if the primary lookup fails, so a future writer that misroutes
    // doesn't break the flow silently.
    const deliveryActorType = delivery.actor_type ?? (step as any).actor_type ?? null;
    const primaryBucket = deliveryActorType === "external_vendor" ? VENDOR_BUCKET : STAFF_BUCKET;
    const fallbackBucket = primaryBucket === STAFF_BUCKET ? VENDOR_BUCKET : STAFF_BUCKET;

    let blob: Blob | null = null;
    let downloadErr: { message: string } | null = null;
    {
      const r = await sb.storage.from(primaryBucket).download(sourcePath);
      blob = r.data ?? null;
      downloadErr = r.error as any;
    }
    if (!blob) {
      const r2 = await sb.storage.from(fallbackBucket).download(sourcePath);
      if (r2.data) {
        blob = r2.data;
        downloadErr = null;
      }
    }
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

    const { error: uploadErr } = await sb.storage.from(STAFF_BUCKET).upload(pdfStoragePath, watermarked, {
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
      try { await sb.storage.from(STAFF_BUCKET).remove([pdfStoragePath]); } catch { /* swallow */ }
      return json({ error: "order has no quote_id; cannot create draft file" }, 400);
    }

    const { data: cat } = await sb
      .from("file_categories")
      .select("id")
      .eq("slug", "draft_translation")
      .maybeSingle();
    if (!cat?.id) {
      try { await sb.storage.from(STAFF_BUCKET).remove([pdfStoragePath]); } catch { /* swallow */ }
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

    // Supersede any prior pending_review draft on this quote — review-draft-file
    // lists EVERY pending_review row on the quote when sending the customer email,
    // so leaving older versions pending causes duplicate rows in the email.
    await sb
      .from("quote_files")
      .update({ deleted_at: new Date().toISOString() })
      .eq("quote_id", order.quote_id)
      .eq("file_category_id", cat.id)
      .eq("review_status", "pending_review")
      .is("deleted_at", null);

    const { data: row, error: insertErr } = await sb
      .from("quote_files")
      .insert({
        quote_id: order.quote_id,
        original_filename: pdfFilename,
        storage_path: pdfStoragePath,
        file_size: watermarked.byteLength,
        mime_type: "application/pdf",
        // upload_status allowed values:
        //   pending|uploading|uploaded|processing|processed|error|replaced
        // ai_processing_status allowed values:
        //   pending|processing|completed|failed|skipped|review_required
        upload_status: "uploaded",
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
      try { await sb.storage.from(STAFF_BUCKET).remove([pdfStoragePath]); } catch { /* swallow */ }
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
