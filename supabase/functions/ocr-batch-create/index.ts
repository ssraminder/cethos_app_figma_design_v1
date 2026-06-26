// supabase/functions/ocr-batch-create/index.ts
// Version: 1 (recreated 2026-05-27 from observed contract — original bundle was
// dropped by Supabase, mcp__supabase__get_edge_function returns
// "Failed to retrieve function bundle" despite slug being ACTIVE v46).
//
// Creates one ocr_batches row + N ocr_batch_files rows for the supplied chunks,
// then fires `ocr-process-next` so processing starts immediately. The
// `ocr-process-queue` pg_cron job (every 2 min) is a backstop if the inline
// trigger drops.
//
// Idempotency:
//   If `quoteId` is provided and `force !== true`, the function will return the
//   existing non-failed batch for that quote instead of creating a new one.
//   This is defense-in-depth against double-submits / race conditions; the
//   primary guard is the client-side confirm prompt in AdminQuoteDetail.
//   Callers that explicitly intend to create a new batch (PreprocessOCRPage,
//   OCRWordCountPage, AdminQuoteDetail-after-confirm) should pass `force: true`.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface UploadedFile {
  filename: string;
  originalFilename?: string;
  storagePath: string;
  fileSize?: number;
  chunkIndex?: number | null;
  fileGroupId?: string | null;
  // Links the batch file back to the originating quote_files row so
  // update-quote-from-analysis can map analysis → quote_file without filename
  // guessing. Set by the public quote pipeline (process-quote-documents).
  quoteFileId?: string | null;
}

interface CreateBatchRequest {
  files: UploadedFile[];
  quoteId?: string | null;
  notes?: string | null;
  force?: boolean;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ success: false, error: "Server misconfigured" }, 500);
  }

  let body: CreateBatchRequest;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const { files, quoteId, notes, force } = body;

  if (!Array.isArray(files) || files.length === 0) {
    return json({ success: false, error: "files array is required" }, 400);
  }

  // Validate each file row has the minimum we need to insert ocr_batch_files.
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f.filename || !f.storagePath) {
      return json(
        { success: false, error: `files[${i}] missing filename or storagePath` },
        400,
      );
    }
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // -----------------------------------------------------------------
  // Idempotency: short-circuit if this quote already has a live batch
  // -----------------------------------------------------------------
  if (quoteId && !force) {
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("ocr_batches")
      .select("id, status, total_files, created_at")
      .eq("quote_id", quoteId)
      .in("status", ["pending", "processing", "completed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existingErr && existing) {
      console.log(
        `[ocr-batch-create] Idempotent hit for quote ${quoteId}: ` +
          `returning existing batch ${existing.id} (status=${existing.status})`,
      );
      return json({
        success: true,
        batchId: existing.id,
        reused: true,
        existingBatch: existing,
      });
    }
  }

  // -----------------------------------------------------------------
  // Identify the caller (best-effort — function runs with verify_jwt=false).
  // `created_by` FKs to staff_users(id), NOT auth.users(id), so it stays
  // null unless we can resolve a staff_users row.
  // -----------------------------------------------------------------
  let staffName: string | null = null;
  let staffEmail: string | null = null;
  let createdBy: string | null = null;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token && token !== SERVICE_ROLE_KEY) {
      try {
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (user?.email) {
          staffEmail = user.email;
          staffName = user.email; // historical default when no staff_users row matches

          const { data: staff } = await supabaseAdmin
            .from("staff_users")
            .select("id, full_name")
            .eq("auth_user_id", user.id)
            .maybeSingle();
          if (staff?.id) {
            createdBy = staff.id;
            if (staff.full_name) staffName = staff.full_name;
          }
        }
      } catch (err) {
        console.warn("[ocr-batch-create] Could not resolve caller identity:", err);
      }
    }
  }

  // -----------------------------------------------------------------
  // Insert ocr_batches row
  // -----------------------------------------------------------------
  const { data: batch, error: batchErr } = await supabaseAdmin
    .from("ocr_batches")
    .insert({
      quote_id: quoteId ?? null,
      notes: notes ?? null,
      status: "pending",
      total_files: files.length,
      completed_files: 0,
      failed_files: 0,
      staff_name: staffName,
      staff_email: staffEmail,
      created_by: createdBy,
    })
    .select("id")
    .single();

  if (batchErr || !batch) {
    console.error("[ocr-batch-create] Failed to insert ocr_batches:", batchErr);
    return json(
      { success: false, error: batchErr?.message ?? "Failed to create batch" },
      500,
    );
  }

  // -----------------------------------------------------------------
  // Insert ocr_batch_files rows
  // -----------------------------------------------------------------
  const now = new Date().toISOString();
  const fileRows = files.map((f) => ({
    batch_id: batch.id,
    filename: f.filename,
    original_filename: f.originalFilename ?? f.filename,
    storage_path: f.storagePath,
    file_size: f.fileSize ?? null,
    mime_type: "application/pdf",
    status: "pending",
    chunk_index: f.chunkIndex ?? null,
    file_group_id: f.fileGroupId ?? null,
    quote_file_id: f.quoteFileId ?? null,
    queued_at: now,
  }));

  const { error: filesErr } = await supabaseAdmin
    .from("ocr_batch_files")
    .insert(fileRows);

  if (filesErr) {
    console.error("[ocr-batch-create] Failed to insert ocr_batch_files:", filesErr);
    // Roll back the parent so we don't leak an empty batch.
    await supabaseAdmin.from("ocr_batches").delete().eq("id", batch.id);
    return json(
      { success: false, error: `Failed to insert batch files: ${filesErr.message}` },
      500,
    );
  }

  // -----------------------------------------------------------------
  // Fire-and-forget: kick off ocr-process-next so processing starts now.
  // The ocr-process-queue cron (every 2 min) is a backstop if this drops.
  // -----------------------------------------------------------------
  fetch(`${SUPABASE_URL}/functions/v1/ocr-process-next`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  }).catch((err) => {
    console.warn(
      `[ocr-batch-create] Non-fatal: could not kick ocr-process-next: ${err?.message ?? err}`,
    );
  });

  console.log(
    `[ocr-batch-create] Created batch ${batch.id} with ${files.length} file(s) ` +
      `for quote ${quoteId ?? "<none>"} by ${staffEmail ?? "<anon>"}`,
  );

  return json({
    success: true,
    batchId: batch.id,
    totalFiles: files.length,
    reused: false,
  });
});
