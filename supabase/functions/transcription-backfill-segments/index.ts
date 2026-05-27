// POST /functions/v1/transcription-backfill-segments
// Body: { limit?: number, cursor?: string, dry_run?: boolean }
//
// One-shot admin-invoked migration: walks v1 transcription_jobs +
// transcription_versions rows, normalizes their transcript_json into the
// canonical v2 shape with DETERMINISTIC segment UUIDs (sha-256 of natural key),
// and bumps transcript_format_version to 2.
//
// Deterministic UUIDs mean re-running with the same input is idempotent and
// the same segment will keep the same id no matter how many times we replay.
//
// Chunks over (created_at, id) cursors so large backfills don't hit the 150s
// edge function wall clock. Emits next_cursor if more rows remain.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  jsonResponse,
  preflight,
  getServiceClient,
  auditLog,
} from "../_shared/transcription.ts";
import {
  type Segment,
  type ProviderHint,
  normalizeToSegments,
  buildTranscriptJsonV2,
  buildNaturalKey,
  deterministicUuid,
  denormalizeText,
  wordCount,
  TRANSCRIPT_FORMAT_VERSION,
} from "../_shared/transcript-segments.ts";

// Fallback: when transcript_json has no usable structure (e.g. OpenAI
// gpt-4o-transcribe response_format=json returns only {text, logprobs}) but
// the row still has transcript_text, synthesize a single segment so the row
// is still v2-addressable.
async function synthesizeFallbackSegment(
  jobId: string,
  fileIndex: number | null,
  text: string,
  durationSeconds: number | null,
): Promise<Segment[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const startMs = 0;
  const endMs = Math.max(1000, Math.round((durationSeconds ?? 0) * 1000));
  const id = await deterministicUuid(buildNaturalKey(jobId, fileIndex, null, startMs, endMs));
  return [{ id, speaker_id: null, start: startMs, end: endMs, text: trimmed }];
}

const DEFAULT_LIMIT = 25;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const limit = Math.max(1, Math.min(100, Number(body?.limit ?? DEFAULT_LIMIT)));
    const cursorRaw = (body?.cursor as string | undefined) ?? null;
    const dryRun = !!body?.dry_run;

    const admin = getServiceClient();

    let q = admin
      .from("transcription_jobs")
      .select("id, provider, transcript_json, transcript_text, file_duration_seconds, source_files, created_at, transcript_format_version, translation_target_language_id, detected_language, language_confidence")
      .eq("transcript_format_version", 1)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit);

    if (cursorRaw) {
      try {
        const decoded = JSON.parse(atob(cursorRaw)) as { created_at: string; id: string };
        // Compound cursor: prefer later timestamp, or same timestamp + greater id.
        q = q.or(`created_at.gt.${decoded.created_at},and(created_at.eq.${decoded.created_at},id.gt.${decoded.id})`);
      } catch {
        return jsonResponse({ success: false, error: "Invalid cursor" }, 400);
      }
    }

    const { data: jobs, error: jobsErr } = await q;
    if (jobsErr) return jsonResponse({ success: false, error: jobsErr.message }, 500);
    if (!jobs || jobs.length === 0) {
      return jsonResponse({ success: true, processed: 0, more: false, message: "No v1 jobs remain" });
    }

    type SourceFile = { name?: string; transcript_text?: string; transcript_json?: unknown; translated_text?: string };

    let processed = 0;
    let totalSegments = 0;
    const perJob: Array<{ job_id: string; segment_count: number; file_count: number; versions_updated: number }> = [];

    for (const job of jobs) {
      const jobId = job.id as string;
      const providerHint: ProviderHint =
        job.provider === "assemblyai" ? "assemblyai" :
        job.provider === "elevenlabs" ? "elevenlabs" :
        job.provider === "openai" ? "openai" : "unknown";
      const files = (job.source_files as SourceFile[] | null) ?? [];

      // ── Normalize per-file ───────────────────────────────────────────────
      const perFileSegments: Segment[][] = [];
      const updatedFiles: SourceFile[] = [...files];
      if (files.length > 0) {
        for (let fi = 0; fi < files.length; fi++) {
          let segs = await normalizeToSegments(files[fi].transcript_json, {
            provider: providerHint,
            idStrategy: "deterministic",
            jobId,
            fileIndex: fi,
          });
          if (segs.length === 0 && files[fi].transcript_text) {
            segs = await synthesizeFallbackSegment(jobId, fi, files[fi].transcript_text!, null);
          }
          perFileSegments.push(segs);
          const v2 = buildTranscriptJsonV2(segs, { provider: job.provider });
          updatedFiles[fi] = {
            ...files[fi],
            transcript_json: v2,
            transcript_text: denormalizeText(segs) || files[fi].transcript_text,
          };
        }
      }

      // ── Normalize the combined transcript ────────────────────────────────
      let combinedSegments: Segment[];
      if (files.length > 0) {
        combinedSegments = perFileSegments.flat();
      } else {
        combinedSegments = await normalizeToSegments(job.transcript_json, {
          provider: providerHint,
          idStrategy: "deterministic",
          jobId,
          fileIndex: null,
        });
        if (combinedSegments.length === 0 && job.transcript_text) {
          combinedSegments = await synthesizeFallbackSegment(
            jobId,
            null,
            job.transcript_text as string,
            (job.file_duration_seconds as number | null) ?? null,
          );
        }
      }
      const combinedV2 = buildTranscriptJsonV2(combinedSegments, {
        provider: job.provider,
        language_code: job.detected_language,
        language_probability: job.language_confidence,
      });
      const combinedText = denormalizeText(combinedSegments);
      const wc = wordCount(combinedSegments);

      if (!dryRun) {
        const { error: jobUpdErr } = await admin
          .from("transcription_jobs")
          .update({
            transcript_json: combinedV2,
            transcript_format_version: TRANSCRIPT_FORMAT_VERSION,
            transcript_text: combinedText || undefined,
            word_count: wc || undefined,
            ...(files.length > 0 ? { source_files: updatedFiles } : {}),
          })
          .eq("id", jobId);
        if (jobUpdErr) {
          console.error(`[backfill] job ${jobId} update failed:`, jobUpdErr);
          continue;
        }
      }

      // ── Normalize each v1 version row ────────────────────────────────────
      const { data: versions } = await admin
        .from("transcription_versions")
        .select("id, file_index, transcript_json, transcript_text, version_type")
        .eq("job_id", jobId)
        .eq("transcript_format_version", 1);

      let versionsUpdated = 0;
      for (const v of versions ?? []) {
        const vFi = (v.file_index as number | null) ?? null;
        let segs = await normalizeToSegments(v.transcript_json, {
          provider: providerHint,
          idStrategy: "deterministic",
          jobId,
          fileIndex: vFi,
        });
        if (segs.length === 0 && v.transcript_text) {
          segs = await synthesizeFallbackSegment(
            jobId,
            vFi,
            v.transcript_text as string,
            (job.file_duration_seconds as number | null) ?? null,
          );
        }
        const v2 = buildTranscriptJsonV2(segs, { provider: job.provider });
        const vText = denormalizeText(segs);
        if (!dryRun) {
          const { error: vErr } = await admin
            .from("transcription_versions")
            .update({
              transcript_json: v2,
              transcript_format_version: TRANSCRIPT_FORMAT_VERSION,
              transcript_text: vText || undefined,
              word_count: wordCount(segs) || undefined,
            })
            .eq("id", v.id);
          if (vErr) {
            console.error(`[backfill] version ${v.id} update failed:`, vErr);
            continue;
          }
        }
        versionsUpdated++;
      }

      if (!dryRun) {
        await auditLog(admin, jobId, "backfill_v2", "system", null, {
          segment_count: combinedSegments.length,
          file_count: files.length,
          versions_updated: versionsUpdated,
          deterministic_ids: true,
        });
      }

      processed++;
      totalSegments += combinedSegments.length;
      perJob.push({
        job_id: jobId,
        segment_count: combinedSegments.length,
        file_count: files.length,
        versions_updated: versionsUpdated,
      });
    }

    const last = jobs[jobs.length - 1];
    const nextCursor = jobs.length >= limit
      ? btoa(JSON.stringify({ created_at: last.created_at, id: last.id }))
      : null;

    return jsonResponse({
      success: true,
      processed,
      total_segments: totalSegments,
      dry_run: dryRun,
      more: !!nextCursor,
      next_cursor: nextCursor,
      per_job: perJob,
    });
  } catch (e) {
    console.error("transcription-backfill-segments error:", e);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});
