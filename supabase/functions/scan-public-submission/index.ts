// supabase/functions/scan-public-submission/index.ts
//
// Scans every file in a public_submissions row via VirusTotal Files API.
// Invoked fire-and-forget by the Next.js API route after a submission is
// inserted. Updates scan_status to scan_clean | scan_infected | scan_error.
// Infected files are moved from the public-submissions bucket to
// public-submissions-quarantine.
//
// Request body: { submissionId: string }
//
// Required edge-function secrets:
//   VIRUSTOTAL_API_KEY — from https://www.virustotal.com/gui/my-apikey
//   (free tier: 500 requests/day, 4/min — sufficient for starting volume)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "public-submissions";
const QUARANTINE_BUCKET = "public-submissions-quarantine";
const VT_UPLOAD_URL = "https://www.virustotal.com/api/v3/files";
const VT_ANALYSIS_URL_BASE = "https://www.virustotal.com/api/v3/analyses/";
const VT_POLL_INTERVAL_MS = 3000;
const VT_POLL_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes/file

// VirusTotal free tier: 4 requests/min. We add 16s delay between files.
const PER_FILE_DELAY_MS = 16 * 1000;

type FileMeta = {
  path: string;
  originalName: string;
  size: number;
  mimeType: string;
  scanStatus: "scan_pending" | "scan_clean" | "scan_infected" | "scan_error";
  scanDetails?: unknown;
};

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
    if (!vtKey) {
      throw new Error("VIRUSTOTAL_API_KEY not configured");
    }

    const body = await req.json().catch(() => ({}));
    const submissionId = body.submissionId as string | undefined;
    if (!submissionId) {
      return jsonResponse(400, { success: false, error: "submissionId required" });
    }

    console.log(`🛡️ Scanning submission ${submissionId}`);

    const { data: row, error: rowErr } = await supabaseAdmin
      .from("public_submissions")
      .select("id, file_paths, scan_status")
      .eq("id", submissionId)
      .single();

    if (rowErr || !row) {
      throw new Error(`submission not found: ${rowErr?.message || "no row"}`);
    }

    const files = (row.file_paths as FileMeta[]) || [];
    if (files.length === 0) {
      // Nothing to scan — mark clean
      await supabaseAdmin
        .from("public_submissions")
        .update({
          scan_status: "scan_clean",
          scan_completed_at: new Date().toISOString(),
        })
        .eq("id", submissionId);
      return jsonResponse(200, { success: true, files: 0, result: "no_files" });
    }

    let anyInfected = false;
    let anyError = false;
    const updatedFiles: FileMeta[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        console.log(`  ↳ [${i + 1}/${files.length}] ${f.originalName}`);
        const verdict = await scanOneFile(supabaseAdmin, vtKey, f);
        if (verdict === "infected") {
          anyInfected = true;
          await moveToQuarantine(supabaseAdmin, f.path);
          updatedFiles.push({ ...f, scanStatus: "scan_infected" });
        } else {
          updatedFiles.push({ ...f, scanStatus: "scan_clean" });
        }
      } catch (fileErr) {
        console.error(`  ↳ scan failed for ${f.path}:`, fileErr);
        anyError = true;
        updatedFiles.push({ ...f, scanStatus: "scan_error" });
      }

      // Throttle to respect VT free-tier rate limit
      if (i < files.length - 1) {
        await sleep(PER_FILE_DELAY_MS);
      }
    }

    const overallStatus = anyInfected
      ? "scan_infected"
      : anyError
        ? "scan_error"
        : "scan_clean";

    await supabaseAdmin
      .from("public_submissions")
      .update({
        scan_status: overallStatus,
        scan_completed_at: new Date().toISOString(),
        file_paths: updatedFiles,
      })
      .eq("id", submissionId);

    console.log(`✅ Scan done: ${submissionId} → ${overallStatus}`);

    return jsonResponse(200, {
      success: true,
      submissionId,
      files: updatedFiles.length,
      result: overallStatus,
    });
  } catch (error: unknown) {
    const msg =
      (error instanceof Error ? error.message : String(error)).slice(0, 500);
    console.error("❌ scan error:", msg);
    return jsonResponse(500, { success: false, error: msg });
  }
});

// ============================================================================
// VirusTotal scan of a single file
// ============================================================================

async function scanOneFile(
  supabaseAdmin: ReturnType<typeof createClient>,
  vtKey: string,
  file: FileMeta,
): Promise<"clean" | "infected"> {
  // 1. Download from Supabase storage
  const { data: blob, error: dlErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(file.path);
  if (dlErr || !blob) {
    throw new Error(`storage download failed: ${dlErr?.message}`);
  }

  // 2. Upload to VirusTotal
  const vtForm = new FormData();
  vtForm.append("file", blob, file.originalName || "upload.bin");
  const uploadResp = await fetch(VT_UPLOAD_URL, {
    method: "POST",
    headers: { "x-apikey": vtKey },
    body: vtForm,
  });
  if (!uploadResp.ok) {
    throw new Error(
      `VT upload failed: ${uploadResp.status} ${await uploadResp.text().catch(() => "")}`,
    );
  }
  const uploadData = await uploadResp.json();
  const analysisId = uploadData?.data?.id;
  if (!analysisId) {
    throw new Error("VT upload returned no analysis id");
  }

  // 3. Poll analysis
  const deadline = Date.now() + VT_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const analysisResp = await fetch(`${VT_ANALYSIS_URL_BASE}${analysisId}`, {
      headers: { "x-apikey": vtKey },
    });
    if (!analysisResp.ok) {
      throw new Error(`VT analysis fetch failed: ${analysisResp.status}`);
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

// ============================================================================
// Quarantine — move infected file out of the main bucket
// ============================================================================

async function moveToQuarantine(
  supabaseAdmin: ReturnType<typeof createClient>,
  path: string,
): Promise<void> {
  const { data: blob, error: dlErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(path);
  if (dlErr || !blob) return;

  const { error: upErr } = await supabaseAdmin.storage
    .from(QUARANTINE_BUCKET)
    .upload(path, blob, { upsert: true });
  if (upErr) {
    console.error(`quarantine upload failed for ${path}:`, upErr.message);
    return;
  }

  await supabaseAdmin.storage
    .from(BUCKET)
    .remove([path])
    .catch(() => {});
}

// ============================================================================
// Utilities
// ============================================================================

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
