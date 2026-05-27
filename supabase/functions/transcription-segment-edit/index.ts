// POST /functions/v1/transcription-segment-edit
// Body: {
//   job_id: string,
//   file_index?: number,
//   edits: Array<{ id: string, text?: string, translations?: Record<string,string> }>
// }
//
// Inline per-segment edit from the admin UI. Applies edits keyed by segment id,
// creates a transcription_versions row with version_type 'inline_edit' (auto-
// activated), and updates the denormalized text fields on the job/source_file.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  jsonResponse,
  preflight,
  getServiceClient,
  auditLog,
} from "../_shared/transcription.ts";
import {
  type Segment,
  type SegmentEdit,
  readSegments,
  applySegmentEdits,
  buildTranscriptJsonV2,
  denormalizeText,
  denormalizeTranslation,
  wordCount,
  TRANSCRIPT_FORMAT_VERSION,
} from "../_shared/transcript-segments.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    const jobId = body?.job_id as string;
    const fileIndex = typeof body?.file_index === "number" ? body.file_index : null;
    const rawEdits = body?.edits;

    if (!jobId) return jsonResponse({ success: false, error: "job_id required" }, 400);
    if (!Array.isArray(rawEdits) || rawEdits.length === 0) {
      return jsonResponse({ success: false, error: "edits[] required (non-empty)" }, 400);
    }

    const edits: SegmentEdit[] = [];
    for (const e of rawEdits) {
      if (!e || typeof e.id !== "string") continue;
      const edit: SegmentEdit = { id: e.id };
      if (typeof e.text === "string") edit.text = e.text;
      if (e.translations && typeof e.translations === "object") {
        const trans: Record<string, string> = {};
        for (const [k, v] of Object.entries(e.translations)) {
          if (typeof v === "string") trans[k] = v;
        }
        if (Object.keys(trans).length > 0) edit.translations = trans;
      }
      if (edit.text !== undefined || edit.translations) edits.push(edit);
    }
    if (edits.length === 0) {
      return jsonResponse({ success: false, error: "No actionable edits in payload" }, 400);
    }

    const admin = getServiceClient();
    const { data: job, error: jobErr } = await admin
      .from("transcription_jobs")
      .select("id, transcript_json, source_files, translation_target_language_id")
      .eq("id", jobId)
      .is("deleted_at", null)
      .maybeSingle();
    if (jobErr || !job) return jsonResponse({ success: false, error: "Job not found" }, 404);

    type SourceFile = { transcript_json?: unknown; transcript_text?: string; translated_text?: string };
    const files = (job.source_files as SourceFile[]) ?? [];
    const sourceJson = fileIndex !== null
      ? files[fileIndex]?.transcript_json
      : job.transcript_json;

    const isV2 = sourceJson && typeof sourceJson === "object" &&
      (sourceJson as { format_version?: number }).format_version === 2;
    if (!isV2) {
      return jsonResponse({
        success: false,
        error: "Job is in legacy v1 format. Run transcription-backfill-segments before editing.",
        code: "BACKFILL_REQUIRED",
      }, 409);
    }

    const segments: Segment[] = await readSegments(sourceJson);
    const { segments: newSegments, applied, unknown, source_edits, translation_edits } =
      applySegmentEdits(segments, edits);
    if (unknown.length > 0) {
      return jsonResponse({
        success: false,
        error: `Unknown Segment IDs: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? "…" : ""}`,
        unknown_ids: unknown,
      }, 400);
    }
    if (applied === 0) {
      return jsonResponse({
        success: true,
        job_id: jobId,
        applied: 0,
        message: "No changes to apply (every edit matched existing text).",
      });
    }

    const newJson = buildTranscriptJsonV2(newSegments, { provider: "inline_edit" });
    const newText = denormalizeText(newSegments);
    const wc = wordCount(newSegments);

    // Resolve target lang code for denormalized translated_text update
    let targetLangCode: string | null = null;
    if (job.translation_target_language_id) {
      const { data: lang } = await admin
        .from("languages")
        .select("code")
        .eq("id", job.translation_target_language_id)
        .maybeSingle();
      if (lang?.code) targetLangCode = lang.code;
    }
    const newTranslation = targetLangCode ? denormalizeTranslation(newSegments, targetLangCode) : null;

    // Deactivate prior versions of the same scope
    const deactivate = admin
      .from("transcription_versions")
      .update({ is_active: false })
      .eq("job_id", jobId)
      .eq("is_active", true);
    if (fileIndex !== null) await deactivate.eq("file_index", fileIndex);
    else await deactivate.is("file_index", null);

    // Insert active inline_edit version row
    const { data: vRow, error: versionErr } = await admin
      .from("transcription_versions")
      .insert({
        job_id: jobId,
        version_type: "inline_edit",
        provider: "human",
        model: "ui_inline",
        transcript_text: newText,
        transcript_json: newJson,
        transcript_format_version: TRANSCRIPT_FORMAT_VERSION,
        word_count: wc,
        cost: 0,
        is_active: true,
        ...(fileIndex !== null ? { file_index: fileIndex } : {}),
      })
      .select("id")
      .single();
    if (versionErr) {
      console.error("Version insert failed:", versionErr);
      return jsonResponse({ success: false, error: "Failed to save version" }, 500);
    }

    // Update denormalized fields on job / source_file
    if (fileIndex !== null) {
      const updatedFiles = [...files];
      updatedFiles[fileIndex] = {
        ...updatedFiles[fileIndex],
        transcript_json: newJson,
        transcript_text: newText,
        ...(newTranslation !== null ? { translated_text: newTranslation } : {}),
      };
      await admin
        .from("transcription_jobs")
        .update({ source_files: updatedFiles })
        .eq("id", jobId);
    } else {
      await admin
        .from("transcription_jobs")
        .update({
          transcript_json: newJson,
          transcript_text: newText,
          ...(newTranslation !== null ? { translated_text: newTranslation } : {}),
        })
        .eq("id", jobId);
    }

    await auditLog(admin, jobId, "inline_edit_applied", "staff", null, {
      version_id: vRow.id,
      applied,
      source_edits,
      translation_edits,
      ...(fileIndex !== null ? { file_index: fileIndex } : {}),
    });

    return jsonResponse({
      success: true,
      job_id: jobId,
      version_id: vRow.id,
      applied,
      source_edits,
      translation_edits,
    });
  } catch (e) {
    console.error("transcription-segment-edit error:", e);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});
