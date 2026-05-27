// POST /functions/v1/transcription-import-xlsx
// Body: { job_id: string, file_index?: number, file_base64: string }  (or multipart)
//
// Accepts an xlsx file exported by transcription-export-xlsx, parses it, and
// stages the edits as a new transcription_versions row with version_type
// 'human_review' and is_active: false. The admin must explicitly activate it
// via the UI to apply the edits to the live transcript.
//
// Validation:
//   - Every "Segment ID" must exist in the current active segments
//   - No duplicate IDs in the upload
//   - Required columns: Segment ID, Source
//
// Audit log records: row count, languages touched, sha-256 of uploaded file.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import {
  jsonResponse,
  preflight,
  getServiceClient,
  auditLog,
  sha256Hex,
} from "../_shared/transcription.ts";
import {
  type Segment,
  readSegments,
  applySegmentEdits,
  parseXlsxRows,
  buildTranscriptJsonV2,
  denormalizeText,
  wordCount,
  TRANSCRIPT_FORMAT_VERSION,
} from "../_shared/transcript-segments.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    let jobId = "";
    let fileIndex: number | null = null;
    let xlsxBytes: Uint8Array | null = null;

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.startsWith("multipart/")) {
      const form = await req.formData();
      jobId = String(form.get("job_id") ?? "");
      const fi = form.get("file_index");
      fileIndex = fi !== null && fi !== "" ? Number(fi) : null;
      const file = form.get("file");
      if (file instanceof File) {
        xlsxBytes = new Uint8Array(await file.arrayBuffer());
      }
    } else {
      const body = await req.json().catch(() => null);
      jobId = body?.job_id ?? "";
      fileIndex = typeof body?.file_index === "number" ? body.file_index : null;
      const b64 = body?.file_base64 as string | undefined;
      if (b64) {
        xlsxBytes = base64ToBytes(b64);
      }
    }

    if (!jobId) return jsonResponse({ success: false, error: "job_id required" }, 400);
    if (!xlsxBytes || xlsxBytes.byteLength === 0) {
      return jsonResponse({ success: false, error: "Missing xlsx file (multipart 'file' or 'file_base64')" }, 400);
    }

    const admin = getServiceClient();
    const { data: job, error: jobErr } = await admin
      .from("transcription_jobs")
      .select("id, transcript_json, source_files")
      .eq("id", jobId)
      .is("deleted_at", null)
      .maybeSingle();
    if (jobErr || !job) return jsonResponse({ success: false, error: "Job not found" }, 404);

    type SourceFile = { transcript_json?: unknown };
    const files = (job.source_files as SourceFile[]) ?? [];
    const sourceJson = fileIndex !== null
      ? files[fileIndex]?.transcript_json
      : job.transcript_json;

    const isV2 = sourceJson && typeof sourceJson === "object" &&
      (sourceJson as { format_version?: number }).format_version === 2;
    if (!isV2) {
      return jsonResponse({
        success: false,
        error: "Job is in legacy v1 format. Run transcription-backfill-segments before importing.",
        code: "BACKFILL_REQUIRED",
      }, 409);
    }

    const segments: Segment[] = await readSegments(sourceJson);

    // ── Parse xlsx ─────────────────────────────────────────────────────────
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(xlsxBytes, { type: "array" });
    } catch (e) {
      console.error("xlsx parse failed:", e);
      return jsonResponse({ success: false, error: "Failed to parse xlsx file" }, 400);
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return jsonResponse({ success: false, error: "xlsx has no sheets" }, 400);
    }
    const ws = workbook.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

    if (aoa.length < 2) {
      return jsonResponse({ success: false, error: "xlsx must have a header row and at least one data row" }, 400);
    }

    const headers = (aoa[0] as unknown[]).map((h) => String(h ?? "").trim());
    const rows = (aoa.slice(1) as unknown[][])
      .filter((r) => r.some((cell) => String(cell ?? "").trim() !== ""))
      .map((r) => {
        const obj: Record<string, string> = {};
        for (let i = 0; i < headers.length; i++) {
          obj[headers[i]] = String(r[i] ?? "");
        }
        return obj;
      });

    const { edits, unknown_ids, duplicate_ids, missing_columns } =
      parseXlsxRows(headers, rows, segments);

    if (missing_columns.length > 0) {
      return jsonResponse({
        success: false,
        error: `Missing required columns: ${missing_columns.join(", ")}`,
        missing_columns,
      }, 400);
    }
    if (duplicate_ids.length > 0) {
      return jsonResponse({
        success: false,
        error: `Duplicate Segment IDs in upload: ${duplicate_ids.slice(0, 5).join(", ")}${duplicate_ids.length > 5 ? "…" : ""}`,
        duplicate_ids,
      }, 400);
    }
    if (unknown_ids.length > 0) {
      return jsonResponse({
        success: false,
        error: `Unknown Segment IDs (do not match this job's active segments): ${unknown_ids.slice(0, 5).join(", ")}${unknown_ids.length > 5 ? "…" : ""}`,
        unknown_ids,
      }, 400);
    }

    if (edits.length === 0) {
      return jsonResponse({
        success: true,
        job_id: jobId,
        applied: 0,
        message: "No changes detected — every row matched the current transcript.",
      });
    }

    const { segments: newSegments, applied, source_edits, translation_edits } =
      applySegmentEdits(segments, edits);

    const newJson = buildTranscriptJsonV2(newSegments, { provider: "human_review_xlsx" });
    const newText = denormalizeText(newSegments);
    const wc = wordCount(newSegments);

    const fileHash = await sha256Hex(new TextDecoder().decode(xlsxBytes.slice(0, Math.min(xlsxBytes.byteLength, 1_000_000))));

    // Languages touched (any non-source key in any edit.translations)
    const langs = new Set<string>();
    for (const e of edits) {
      if (e.translations) for (const k of Object.keys(e.translations)) langs.add(k);
    }

    const { data: vRow, error: versionErr } = await admin
      .from("transcription_versions")
      .insert({
        job_id: jobId,
        version_type: "human_review",
        provider: "human",
        model: "xlsx_import",
        transcript_text: newText,
        transcript_json: newJson,
        transcript_format_version: TRANSCRIPT_FORMAT_VERSION,
        word_count: wc,
        cost: 0,
        is_active: false,
        ...(fileIndex !== null ? { file_index: fileIndex } : {}),
      })
      .select("id")
      .single();

    if (versionErr) {
      console.error("Version insert failed:", versionErr);
      return jsonResponse({ success: false, error: "Failed to save version" }, 500);
    }

    await auditLog(admin, jobId, "xlsx_imported", "staff", null, {
      version_id: vRow.id,
      applied,
      source_edits,
      translation_edits,
      languages: Array.from(langs),
      row_count: rows.length,
      segment_count: segments.length,
      upload_hash_prefix: fileHash.slice(0, 16),
      ...(fileIndex !== null ? { file_index: fileIndex } : {}),
    });

    return jsonResponse({
      success: true,
      job_id: jobId,
      version_id: vRow.id,
      applied,
      source_edits,
      translation_edits,
      languages: Array.from(langs),
      message: "Import staged as new version. Activate it from the Versions tab to apply.",
    });
  } catch (e) {
    console.error("transcription-import-xlsx error:", e);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});

function base64ToBytes(b64: string): Uint8Array {
  const stripped = b64.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(stripped);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
