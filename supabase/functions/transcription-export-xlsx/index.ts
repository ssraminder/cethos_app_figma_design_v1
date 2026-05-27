// POST /functions/v1/transcription-export-xlsx
// Body: { job_id: string, file_index?: number, include_languages?: string[] }
//
// Generates an xlsx workbook keyed by segment id, uploads to the
// transcription-uploads bucket under {job_id}/exports/, and returns a signed
// URL. The xlsx round-trips back through transcription-import-xlsx, keyed by
// the "Segment ID" column.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import {
  jsonResponse,
  preflight,
  getServiceClient,
  auditLog,
} from "../_shared/transcription.ts";
import {
  type Segment,
  readSegments,
  buildXlsxRows,
} from "../_shared/transcript-segments.ts";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    const jobId = body?.job_id as string;
    const fileIndex = typeof body?.file_index === "number" ? body.file_index : null;
    const includeLanguages: string[] = Array.isArray(body?.include_languages)
      ? body.include_languages.filter((x: unknown) => typeof x === "string")
      : [];

    if (!jobId) return jsonResponse({ success: false, error: "job_id required" }, 400);

    const admin = getServiceClient();
    const { data: job, error: jobErr } = await admin
      .from("transcription_jobs")
      .select("id, file_name, transcript_json, transcript_format_version, source_files, translation_target_language_id")
      .eq("id", jobId)
      .is("deleted_at", null)
      .maybeSingle();
    if (jobErr || !job) return jsonResponse({ success: false, error: "Job not found" }, 404);

    type SourceFile = { name?: string; transcript_json?: unknown };
    const files = (job.source_files as SourceFile[]) ?? [];

    let segmentsJson: unknown;
    let labelSuffix = "";
    if (fileIndex !== null) {
      if (fileIndex < 0 || fileIndex >= files.length) {
        return jsonResponse({ success: false, error: `Invalid file_index: ${fileIndex}` }, 400);
      }
      segmentsJson = files[fileIndex].transcript_json;
      labelSuffix = `-file-${fileIndex + 1}`;
    } else {
      segmentsJson = job.transcript_json;
    }

    const isV2 = segmentsJson && typeof segmentsJson === "object" &&
      (segmentsJson as { format_version?: number }).format_version === 2;
    if (!isV2) {
      return jsonResponse({
        success: false,
        error: "Job is in legacy v1 format. Run transcription-backfill-segments before exporting.",
        code: "BACKFILL_REQUIRED",
      }, 409);
    }

    const segments: Segment[] = await readSegments(segmentsJson);
    if (segments.length === 0) {
      return jsonResponse({ success: false, error: "No segments to export" }, 400);
    }

    // Default the language set to the target language code if not provided.
    let langs = includeLanguages;
    if (langs.length === 0 && job.translation_target_language_id) {
      const { data: lang } = await admin
        .from("languages")
        .select("code")
        .eq("id", job.translation_target_language_id)
        .maybeSingle();
      if (lang?.code) langs = [lang.code];
    }
    // Also surface any language present on at least one segment, deduped.
    const present = new Set<string>(langs);
    for (const s of segments) {
      if (s.translations) {
        for (const k of Object.keys(s.translations)) present.add(k);
      }
    }
    langs = Array.from(present);

    const { headers, rows } = buildXlsxRows(segments, langs);
    const aoa: (string | number)[][] = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Auto-ish column widths.
    ws["!cols"] = headers.map((h) => {
      if (h === "Segment ID") return { wch: 38 };
      if (h === "Speaker") return { wch: 14 };
      if (h === "Start" || h === "End") return { wch: 14 };
      if (h === "Source" || langs.includes(h)) return { wch: 60 };
      if (h === "Notes") return { wch: 30 };
      return { wch: 16 };
    });
    XLSX.utils.book_append_sheet(wb, ws, "Segments");

    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const data = new Uint8Array(buf);

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `${jobId}/exports/segments${labelSuffix}-${ts}.xlsx`;

    const { error: uploadErr } = await admin.storage
      .from("transcription-uploads")
      .upload(path, data, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
    if (uploadErr) {
      console.error("xlsx upload failed:", uploadErr);
      return jsonResponse({ success: false, error: "Failed to upload xlsx" }, 500);
    }

    const { data: signed } = await admin.storage
      .from("transcription-uploads")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    await auditLog(admin, jobId, "xlsx_exported", "staff", null, {
      path,
      segment_count: segments.length,
      languages: langs,
      ...(fileIndex !== null ? { file_index: fileIndex } : {}),
    });

    return jsonResponse({
      success: true,
      job_id: jobId,
      path,
      url: signed?.signedUrl ?? null,
      expires_in_seconds: SIGNED_URL_TTL_SECONDS,
      segment_count: segments.length,
      languages: langs,
    });
  } catch (e) {
    console.error("transcription-export-xlsx error:", e);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});
