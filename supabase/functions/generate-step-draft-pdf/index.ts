// ============================================================================
// generate-step-draft-pdf — produces a watermarked DRAFT PDF from the step's
// final delivery file. If the final is .docx, calls Adobe to convert
// Word → PDF first, then overlays a diagonal DRAFT watermark via pdf-lib.
//
// The watermarked PDF is stored under
//   quote-files/workflows/<order_id>/<step_id>/drafts/<timestamp>-DRAFT.pdf
// and returned as a signed URL.
//
// Input:  { step_id }
// Output: { pdf_storage_path, signed_url, expires_at, bytes,
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
function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const BUCKET = "quote-files";
const SIGNED_URL_TTL = 60 * 60 * 24; // 24h

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { step_id } = await req.json();
    if (!step_id) return json({ error: "step_id required" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Resolve the final delivery — explicit final_delivery_id wins; fall
    // back to the most-recent step_deliveries row when admin hasn't picked
    // one (the latest version is usually the intended final).
    const { data: step } = await sb
      .from("order_workflow_steps")
      .select("id, order_id, name, final_delivery_id")
      .eq("id", step_id)
      .maybeSingle();
    if (!step) return json({ error: "step not found" }, 404);

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
    // Use the first file — multi-file deliveries are uncommon; admin can
    // expand this later if a use case appears.
    const sourcePath = paths[0];
    const sourceFilename = sourcePath.split("/").pop() ?? "delivery";
    const ext = sourceFilename.split(".").pop()?.toLowerCase() ?? "";
    const isPdf = ext === "pdf";
    const isWord = ext === "docx" || ext === "doc";
    if (!isPdf && !isWord) {
      return json(
        { error: `unsupported final file extension: ${ext}. Only PDF and DOCX are supported for customer drafts.` },
        415,
      );
    }

    // Download the source file.
    const { data: blob, error: downloadErr } = await sb.storage.from(BUCKET).download(sourcePath);
    if (downloadErr || !blob) {
      return json({ error: `failed to download source: ${downloadErr?.message || "empty"}` }, 500);
    }
    const sourceBytes = new Uint8Array(await blob.arrayBuffer());

    // Convert if needed.
    let pdfBytes: Uint8Array;
    let wasConverted = false;
    if (isWord) {
      pdfBytes = await convertWordToPdf(sourceBytes);
      wasConverted = true;
    } else {
      pdfBytes = sourceBytes;
    }

    // Watermark every page DRAFT diagonal.
    const watermarked = await applyDiagonalWatermark(pdfBytes, { text: "DRAFT" });

    // Write to storage. New draft path per call so multiple drafts don't
    // clobber each other; staff can see the history via step_draft_sends.
    const timestamp = Date.now();
    const pdfStoragePath = `workflows/${step.order_id}/${step.id}/drafts/${timestamp}-DRAFT.pdf`;
    const { error: uploadErr } = await sb.storage.from(BUCKET).upload(pdfStoragePath, watermarked, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadErr) return json({ error: `storage upload failed: ${uploadErr.message}` }, 500);

    const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(pdfStoragePath, SIGNED_URL_TTL);
    return json({
      pdf_storage_path: pdfStoragePath,
      signed_url: signed?.signedUrl ?? null,
      expires_at: new Date(Date.now() + SIGNED_URL_TTL * 1000).toISOString(),
      bytes: watermarked.byteLength,
      source_filename: sourceFilename,
      was_converted_from_word: wasConverted,
      delivery_id: delivery.id,
      delivery_version: delivery.version,
    }, 201);
  } catch (err: any) {
    console.error("[generate-step-draft-pdf] fatal:", err);
    return json({ error: err?.message || String(err) }, 500);
  }
});
