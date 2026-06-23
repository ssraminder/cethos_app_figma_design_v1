// POST /functions/v1/convert-submission-to-quote
// Body: { submission_id: string, staff_id?: string }
//
// Converts a public /secure-upload submission into a draft quote:
//   1. Find-or-create the customer by email (upsert, same pattern as
//      customer-quote-attach-customer).
//   2. Insert a quotes row (status 'lead', entry_point 'public_submission',
//      submission message preserved in customer_note).
//   3. Copy every downloadable file (scan_clean or scan_error — mirrors the
//      admin UI download policy; scan_infected is skipped) from the
//      public-submissions bucket into quote-files/<quoteId>/ and insert
//      quote_files rows shaped for the normal OCR/analysis pipeline.
//   4. Stamp public_submissions.converted_to_quote_id / customer_id.
//
// Idempotent: a submission already converted returns its existing quote with
// already_converted=true instead of creating a duplicate.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUBMISSIONS_BUCKET = "public-submissions";
const QUOTE_FILES_BUCKET = "quote-files";
const FILE_CATEGORY_TO_TRANSLATE = "45cb02ba-fca5-423a-8cb9-6ad807ad3bbc";

interface SubmissionFile {
  path: string;
  originalName: string;
  size: number;
  mimeType: string;
  scanStatus:
    | "scan_pending"
    | "scan_clean"
    | "scan_infected"
    | "scan_error"
    | "scan_skipped";
}

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "upload.bin";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));
    const submissionId = body?.submission_id;
    if (typeof submissionId !== "string" || !submissionId) {
      return jsonResponse({ success: false, error: "submission_id required" }, 400);
    }

    const { data: sub, error: subErr } = await admin
      .from("public_submissions")
      .select("*")
      .eq("id", submissionId)
      .maybeSingle();
    if (subErr) throw new Error(`submission fetch: ${subErr.message}`);
    if (!sub) {
      return jsonResponse({ success: false, error: "Submission not found" }, 404);
    }

    // Idempotency: already converted → hand back the existing quote.
    if (sub.converted_to_quote_id) {
      const { data: existing } = await admin
        .from("quotes")
        .select("id, quote_number")
        .eq("id", sub.converted_to_quote_id)
        .maybeSingle();
      return jsonResponse({
        success: true,
        already_converted: true,
        quote_id: sub.converted_to_quote_id,
        quote_number: existing?.quote_number ?? null,
      });
    }

    if (sub.scan_status === "scan_pending") {
      return jsonResponse(
        { success: false, error: "Files are still being scanned" },
        409,
      );
    }

    const allFiles = (sub.file_paths as SubmissionFile[]) || [];
    // scan_skipped = AV scan was disabled for the public route (not scanned, not
    // claimed clean); treated as downloadable, same as scan_error.
    const eligible = allFiles.filter(
      (f) =>
        f.scanStatus === "scan_clean" ||
        f.scanStatus === "scan_error" ||
        f.scanStatus === "scan_skipped",
    );
    const skippedInfected = allFiles.length - eligible.length;
    if (eligible.length === 0) {
      return jsonResponse(
        { success: false, error: "No clean files to convert" },
        400,
      );
    }

    const email = String(sub.email ?? "").trim().toLowerCase();
    const fullName = String(sub.full_name ?? "").trim() || email;
    if (!email) {
      return jsonResponse(
        { success: false, error: "Submission has no email — cannot create customer" },
        400,
      );
    }

    // 1. Find-or-create customer
    const customerRow: Record<string, unknown> = {
      email,
      full_name: fullName,
      updated_at: new Date().toISOString(),
    };
    if (sub.phone) customerRow.phone = sub.phone;
    const { data: customer, error: custErr } = await admin
      .from("customers")
      .upsert(customerRow, { onConflict: "email" })
      .select("id")
      .single();
    if (custErr || !customer) {
      throw new Error(`customer upsert: ${custErr?.message ?? "no row"}`);
    }

    // 2. Create the quote
    const noteParts: string[] = [];
    if (sub.message) noteParts.push(String(sub.message).trim());
    noteParts.push(`[Converted from public submission ${submissionId}]`);
    const { data: quote, error: quoteErr } = await admin
      .from("quotes")
      .insert({
        status: "lead",
        entry_point: "public_submission",
        customer_id: customer.id,
        customer_note: noteParts.join("\n"),
      })
      .select("id, quote_number")
      .single();
    if (quoteErr || !quote) {
      throw new Error(`quote insert: ${quoteErr?.message ?? "no row"}`);
    }

    // 3. Copy files into quote-files and register quote_files rows
    const copied: { original_filename: string; quote_file_id: string }[] = [];
    const fileErrors: { original_filename: string; error: string }[] = [];

    for (let i = 0; i < eligible.length; i++) {
      const f = eligible[i];
      try {
        const { data: blob, error: dlErr } = await admin.storage
          .from(SUBMISSIONS_BUCKET)
          .download(f.path);
        if (dlErr || !blob) {
          throw new Error(`download: ${dlErr?.message ?? "no blob"}`);
        }

        const finalPath = `${quote.id}/${i}-${sanitizeFilename(f.originalName)}`;
        const { error: upErr } = await admin.storage
          .from(QUOTE_FILES_BUCKET)
          .upload(finalPath, blob, {
            contentType: f.mimeType || "application/octet-stream",
            upsert: true,
          });
        if (upErr) throw new Error(`upload: ${upErr.message}`);

        const { data: qf, error: qfErr } = await admin
          .from("quote_files")
          .insert({
            quote_id: quote.id,
            original_filename: f.originalName,
            storage_path: finalPath,
            file_size: f.size || 0,
            mime_type: f.mimeType || "application/octet-stream",
            upload_status: "uploaded",
            ai_processing_status: "pending",
            file_category_id: FILE_CATEGORY_TO_TRANSLATE,
            draft_group_id: crypto.randomUUID(),
          })
          .select("id")
          .single();
        if (qfErr) throw new Error(`quote_files insert: ${qfErr.message}`);

        copied.push({ original_filename: f.originalName, quote_file_id: qf!.id });
      } catch (fileErr) {
        const msg = fileErr instanceof Error ? fileErr.message : String(fileErr);
        console.error(`convert file failed (${f.path}):`, msg);
        fileErrors.push({ original_filename: f.originalName, error: msg });
      }
    }

    if (copied.length === 0) {
      // Don't leave an empty shell quote behind.
      await admin.from("quotes").delete().eq("id", quote.id);
      return jsonResponse(
        {
          success: false,
          error: "All file copies failed",
          file_errors: fileErrors,
        },
        500,
      );
    }

    // 4. Stamp the submission. order_or_quote_id is left alone — it holds
    // what the customer typed into the form, not our generated number.
    const { error: stampErr } = await admin
      .from("public_submissions")
      .update({
        converted_to_quote_id: quote.id,
        customer_id: customer.id,
      })
      .eq("id", submissionId);
    if (stampErr) {
      console.error("submission stamp failed:", stampErr.message);
    }

    // 5. Fire the customer "We've got your request" acknowledgment so the
    // submitter hears back once their documents become a quote. Non-blocking
    // and idempotent (notify-customer-quote-ack dedups per quote_id), mirroring
    // the customer-quote-finalize-files path.
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceRoleKey) {
      fetch(`${supabaseUrl}/functions/v1/notify-customer-quote-ack`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ quote_id: quote.id }),
      }).catch((e) =>
        console.warn("quote-ack notify failed (non-blocking):", e?.message ?? e),
      );
    }

    return jsonResponse({
      success: true,
      quote_id: quote.id,
      quote_number: quote.quote_number,
      customer_id: customer.id,
      files_copied: copied.length,
      files_failed: fileErrors.length,
      files_skipped_infected: skippedInfected,
      file_errors: fileErrors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("convert-submission-to-quote error:", msg);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
