// supabase/functions/scan-public-submission/index.ts
//
// VirusTotal scanner for two upload paths:
//
//   1. Anon submissions  — kind="submission", scans public_submissions.file_paths
//                          and updates the row's overall scan_status.
//   2. Customer batches  — kind="customer-batch", scans customer_files rows
//                          (filtered by upload_session_id + customer_id) and
//                          updates each row individually.
//
// The function processes up to BATCH_SIZE files per invocation (1 minute of
// VT free-tier throttle, well under the edge function wall-time limit) and
// self-reinvokes for any remaining scan_pending files. Each invocation is
// idempotent — it scans only files still marked scan_pending.
//
// Request body:
//   { kind: 'submission', submissionId: uuid }
//   { kind: 'customer-batch', uploadSessionId: uuid, customerId: uuid }
//
// Required edge-function secrets:
//   VIRUSTOTAL_API_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANON_BUCKET = "public-submissions";
const ANON_QUARANTINE_BUCKET = "public-submissions-quarantine";
const CUSTOMER_BUCKET = "customer-files";

const VT_UPLOAD_URL = "https://www.virustotal.com/api/v3/files";
const VT_ANALYSIS_URL_BASE = "https://www.virustotal.com/api/v3/analyses/";
const VT_POLL_INTERVAL_MS = 3000;
const VT_POLL_TIMEOUT_MS = 2 * 60 * 1000;

// Free tier is 4 req/min. We enforce ~16s/file. BATCH_SIZE=3 → ~48s of
// throttle per invocation, leaving plenty of headroom under the 150s wall.
const BATCH_SIZE = 3;
const PER_FILE_DELAY_MS = 16 * 1000;

type Kind = "submission" | "customer-batch";

interface AnonFileMeta {
  path: string;
  originalName: string;
  size: number;
  mimeType: string;
  scanStatus: "scan_pending" | "scan_clean" | "scan_infected" | "scan_error";
}

interface CustomerFileRow {
  id: string;
  storage_path: string;
  original_filename: string;
  customer_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const vtKey = Deno.env.get("VIRUSTOTAL_API_KEY") ?? "";

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    if (!vtKey) throw new Error("VIRUSTOTAL_API_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const kind: Kind = body.kind === "customer-batch" ? "customer-batch" : "submission";

    if (kind === "submission") {
      return await handleSubmission(supabaseAdmin, vtKey, body.submissionId);
    } else {
      return await handleCustomerBatch(
        supabaseAdmin,
        vtKey,
        body.uploadSessionId,
        body.customerId,
      );
    }
  } catch (err: unknown) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error("scan-public-submission error:", msg);
    return jsonResponse(500, { success: false, error: msg });
  }
});

// ============================================================================
// Anon submission scanner
// ============================================================================

async function handleSubmission(
  supabaseAdmin: ReturnType<typeof createClient>,
  vtKey: string,
  submissionId: string | undefined,
): Promise<Response> {
  if (!submissionId) {
    return jsonResponse(400, { success: false, error: "submissionId required" });
  }

  const { data: row } = await supabaseAdmin
    .from("public_submissions")
    .select("id, file_paths, scan_status")
    .eq("id", submissionId)
    .maybeSingle();
  if (!row) {
    return jsonResponse(404, { success: false, error: "submission not found" });
  }

  const allFiles = (row.file_paths as AnonFileMeta[]) || [];
  if (allFiles.length === 0) {
    await supabaseAdmin
      .from("public_submissions")
      .update({
        scan_status: "scan_clean",
        scan_completed_at: new Date().toISOString(),
      })
      .eq("id", submissionId);
    return jsonResponse(200, { success: true, files: 0, result: "no_files" });
  }

  const pendingIdx: number[] = [];
  for (let i = 0; i < allFiles.length; i++) {
    if (allFiles[i].scanStatus === "scan_pending") pendingIdx.push(i);
  }

  if (pendingIdx.length === 0) {
    return jsonResponse(200, { success: true, result: "already_done" });
  }

  const batchIdx = pendingIdx.slice(0, BATCH_SIZE);
  const updated = [...allFiles];

  for (let n = 0; n < batchIdx.length; n++) {
    const i = batchIdx[n];
    const f = allFiles[i];
    try {
      console.log(`anon ${submissionId} [${n + 1}/${batchIdx.length}] ${f.originalName}`);
      const verdict = await scanOneFile(vtKey, supabaseAdmin, ANON_BUCKET, f.path, f.originalName);
      if (verdict === "infected") {
        await moveToQuarantine(supabaseAdmin, ANON_BUCKET, ANON_QUARANTINE_BUCKET, f.path);
        updated[i] = { ...f, scanStatus: "scan_infected" };
      } else {
        updated[i] = { ...f, scanStatus: "scan_clean" };
      }
    } catch (fileErr) {
      console.error(`scan failed for ${f.path}:`, fileErr);
      updated[i] = { ...f, scanStatus: "scan_error" };
    }
    if (n < batchIdx.length - 1) await sleep(PER_FILE_DELAY_MS);
  }

  // Recompute overall status
  const remaining = updated.filter((f) => f.scanStatus === "scan_pending").length;
  const anyInfected = updated.some((f) => f.scanStatus === "scan_infected");
  const anyError = updated.some((f) => f.scanStatus === "scan_error");
  const overall =
    remaining > 0
      ? "scan_pending"
      : anyInfected
        ? "scan_infected"
        : anyError
          ? "scan_error"
          : "scan_clean";

  await supabaseAdmin
    .from("public_submissions")
    .update({
      file_paths: updated,
      scan_status: overall,
      scan_completed_at: remaining > 0 ? null : new Date().toISOString(),
    })
    .eq("id", submissionId);

  // If more remain, fire self for the next batch (don't await).
  if (remaining > 0) {
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/scan-public-submission`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ kind: "submission", submissionId }),
    }).catch(() => {});
  }

  console.log(`anon ${submissionId} batch done, remaining=${remaining}, overall=${overall}`);
  return jsonResponse(200, {
    success: true,
    submissionId,
    processed: batchIdx.length,
    remaining,
    overall,
  });
}

// ============================================================================
// Customer batch scanner — works against customer_files rows
// ============================================================================

async function handleCustomerBatch(
  supabaseAdmin: ReturnType<typeof createClient>,
  vtKey: string,
  uploadSessionId: string | undefined,
  customerId: string | undefined,
): Promise<Response> {
  if (!uploadSessionId || !customerId) {
    return jsonResponse(400, {
      success: false,
      error: "uploadSessionId and customerId required",
    });
  }

  const { data: pending, error: pendingErr } = await supabaseAdmin
    .from("customer_files")
    .select("id, storage_path, original_filename, customer_id")
    .eq("upload_session_id", uploadSessionId)
    .eq("customer_id", customerId)
    .eq("scan_status", "scan_pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (pendingErr) throw new Error(`pending fetch: ${pendingErr.message}`);

  const rows = (pending || []) as CustomerFileRow[];
  if (rows.length === 0) {
    return jsonResponse(200, { success: true, result: "already_done" });
  }

  for (let n = 0; n < rows.length; n++) {
    const r = rows[n];
    try {
      console.log(`customer ${uploadSessionId} [${n + 1}/${rows.length}] ${r.original_filename}`);
      const verdict = await scanOneFile(vtKey, supabaseAdmin, CUSTOMER_BUCKET, r.storage_path, r.original_filename);
      if (verdict === "infected") {
        // Move to quarantine in same bucket under <customerId>/_quarantine/
        await moveWithinBucket(
          supabaseAdmin,
          CUSTOMER_BUCKET,
          r.storage_path,
          `${customerId}/_quarantine/${r.id}-${r.original_filename}`,
        );
        await supabaseAdmin
          .from("customer_files")
          .update({
            scan_status: "scan_infected",
            scan_completed_at: new Date().toISOString(),
          })
          .eq("id", r.id);
      } else {
        await supabaseAdmin
          .from("customer_files")
          .update({
            scan_status: "scan_clean",
            scan_completed_at: new Date().toISOString(),
          })
          .eq("id", r.id);
      }
    } catch (fileErr) {
      console.error(`scan failed for ${r.storage_path}:`, fileErr);
      await supabaseAdmin
        .from("customer_files")
        .update({
          scan_status: "scan_error",
          scan_completed_at: new Date().toISOString(),
        })
        .eq("id", r.id);
    }
    if (n < rows.length - 1) await sleep(PER_FILE_DELAY_MS);
  }

  // Check if more remain → re-invoke
  const { count: remaining } = await supabaseAdmin
    .from("customer_files")
    .select("id", { count: "exact", head: true })
    .eq("upload_session_id", uploadSessionId)
    .eq("customer_id", customerId)
    .eq("scan_status", "scan_pending");

  if ((remaining ?? 0) > 0) {
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/scan-public-submission`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        kind: "customer-batch",
        uploadSessionId,
        customerId,
      }),
    }).catch(() => {});
  }

  console.log(
    `customer ${uploadSessionId} batch done, remaining=${remaining ?? 0}`,
  );
  return jsonResponse(200, {
    success: true,
    uploadSessionId,
    processed: rows.length,
    remaining: remaining ?? 0,
  });
}

// ============================================================================
// VirusTotal scan helper
// ============================================================================

async function scanOneFile(
  vtKey: string,
  supabaseAdmin: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  originalName: string,
): Promise<"clean" | "infected"> {
  const { data: blob, error: dlErr } = await supabaseAdmin.storage
    .from(bucket)
    .download(path);
  if (dlErr || !blob) {
    throw new Error(`storage download: ${dlErr?.message || "no blob"}`);
  }

  const vtForm = new FormData();
  vtForm.append("file", blob, originalName || "upload.bin");
  const uploadResp = await fetch(VT_UPLOAD_URL, {
    method: "POST",
    headers: { "x-apikey": vtKey },
    body: vtForm,
  });
  if (!uploadResp.ok) {
    throw new Error(
      `VT upload: ${uploadResp.status} ${await uploadResp.text().catch(() => "")}`,
    );
  }
  const uploadData = await uploadResp.json();
  const analysisId = uploadData?.data?.id;
  if (!analysisId) throw new Error("VT upload returned no analysis id");

  const deadline = Date.now() + VT_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const analysisResp = await fetch(`${VT_ANALYSIS_URL_BASE}${analysisId}`, {
      headers: { "x-apikey": vtKey },
    });
    if (!analysisResp.ok) {
      throw new Error(`VT analysis fetch: ${analysisResp.status}`);
    }
    const analysisData = await analysisResp.json();
    const status = analysisData?.data?.attributes?.status;
    if (status === "completed") {
      const stats = analysisData?.data?.attributes?.stats || {};
      const malicious = (stats.malicious || 0) + (stats.suspicious || 0);
      return malicious > 0 ? "infected" : "clean";
    }
    await sleep(VT_POLL_INTERVAL_MS);
  }
  throw new Error("VT analysis timed out");
}

async function moveToQuarantine(
  supabaseAdmin: ReturnType<typeof createClient>,
  fromBucket: string,
  quarantineBucket: string,
  path: string,
): Promise<void> {
  const { data: blob } = await supabaseAdmin.storage.from(fromBucket).download(path);
  if (!blob) return;
  const { error: upErr } = await supabaseAdmin.storage
    .from(quarantineBucket)
    .upload(path, blob, { upsert: true });
  if (upErr) {
    console.error(`quarantine upload failed for ${path}:`, upErr.message);
    return;
  }
  await supabaseAdmin.storage.from(fromBucket).remove([path]).catch(() => {});
}

async function moveWithinBucket(
  supabaseAdmin: ReturnType<typeof createClient>,
  bucket: string,
  fromPath: string,
  toPath: string,
): Promise<void> {
  // Supabase storage SDK has a `move` operation
  const { error } = await supabaseAdmin.storage.from(bucket).move(fromPath, toPath);
  if (error) {
    console.error(`storage move failed ${fromPath} -> ${toPath}:`, error.message);
  }
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
