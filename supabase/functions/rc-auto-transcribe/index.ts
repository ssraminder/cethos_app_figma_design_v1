// =============================================================================
// rc-auto-transcribe — Batch-process call recordings: transcribe + summarize.
//
// Two modes of operation:
//   1. Cron/sync trigger (no force): only processes calls whose label has
//      transcription_mode = "auto", OR unlabeled calls when the global
//      call_transcription_mode = "auto".
//   2. Manual backfill (force: true): processes any pending recordings,
//      optionally filtered by date_from and label_ids.
//
// POST body:
//   { batch_size?: number, force?: boolean, date_from?: string, label_ids?: string[] }
//
// Required secrets: RC_*, ELEVENLABS_API_KEY, ANTHROPIC_API_KEY
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  corsHeaders,
  getAdminClient,
  getPublicAdminClient,
  getRcConfig,
  getAccessToken,
  jsonResponse,
} from "../_shared/ringcentral.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { /* empty body ok */ }
    }

    const batchSize = typeof body.batch_size === "number" ? Math.min(body.batch_size, 50) : 5;
    const force = body.force === true;
    const dateFrom = typeof body.date_from === "string" ? body.date_from : null;
    const labelIds = Array.isArray(body.label_ids) ? body.label_ids as string[] : null;

    const commsAdmin = getAdminClient();
    const publicAdmin = getPublicAdminClient();

    // ── Determine which calls to process ────────────────────────────────

    if (!force) {
      // Cron/sync mode: get labels with auto mode, then fetch their pending calls
      const { data: labelsData } = await publicAdmin.rpc("comms_list_call_labels");
      const labels = (labelsData ?? []) as Array<{
        id: string; name: string; transcription_mode: string;
      }>;
      const autoLabelIds = labels
        .filter(l => l.transcription_mode === "auto")
        .map(l => l.id);

      // Also check global mode for unlabeled calls
      const { data: modeData } = await publicAdmin
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", "call_transcription_mode")
        .maybeSingle();
      const globalMode = modeData?.setting_value ?? "manual";

      if (autoLabelIds.length === 0 && globalMode !== "auto") {
        return jsonResponse(200, {
          ok: true,
          skipped: true,
          reason: "no labels set to auto and global mode is not auto",
        });
      }

      // Build the query: fetch calls that are either:
      // - labeled with an auto label, OR
      // - unlabeled AND global mode is auto
      const { data: pending, error: pendErr } = await publicAdmin.rpc(
        "comms_get_auto_pending",
        {
          p_auto_label_ids: autoLabelIds,
          p_include_unlabeled: globalMode === "auto",
          p_limit: batchSize,
        },
      );

      if (pendErr) {
        return jsonResponse(500, { ok: false, error: "failed to get pending", detail: pendErr.message });
      }

      const calls = (pending ?? []) as CallRecord[];
      if (calls.length === 0) {
        return jsonResponse(200, { ok: true, processed: 0, message: "no pending auto-transcribe recordings" });
      }

      return await processRecordings(calls, commsAdmin, publicAdmin);
    }

    // ── Force / backfill mode ──────────────────────────────────────────

    const rpcParams: Record<string, unknown> = { p_limit: batchSize };
    if (dateFrom) rpcParams.p_date_from = dateFrom;
    if (labelIds && labelIds.length > 0) rpcParams.p_label_ids = labelIds;

    const { data: pending, error: pendErr } = await publicAdmin.rpc(
      "comms_get_pending_transcriptions",
      rpcParams,
    );

    if (pendErr) {
      return jsonResponse(500, { ok: false, error: "failed to get pending", detail: pendErr.message });
    }

    const calls = (pending ?? []) as CallRecord[];
    if (calls.length === 0) {
      return jsonResponse(200, { ok: true, processed: 0, message: "no pending recordings" });
    }

    return await processRecordings(calls, commsAdmin, publicAdmin);
  } catch (e) {
    console.error("rc-auto-transcribe error:", e);
    return jsonResponse(500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// ── Types ──────────────────────────────────────────────────────────────────────

interface CallRecord {
  id: string;
  recording_id: string;
  label_id?: string | null;
  label_name?: string | null;
  has_transcript: boolean;
  has_summary: boolean;
}

// ── Process a batch of recordings ──────────────────────────────────────────────

async function processRecordings(
  calls: CallRecord[],
  commsAdmin: SupabaseClient,
  publicAdmin: SupabaseClient,
) {
  // Check if auto-summarize is on
  const { data: sumData } = await publicAdmin
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", "call_auto_summarize")
    .maybeSingle();
  const autoSummarize = (sumData?.setting_value ?? "true") === "true";

  const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!elevenLabsKey) {
    return jsonResponse(503, { ok: false, error: "ELEVENLABS_API_KEY not configured" });
  }

  const cfg = getRcConfig();
  const results: Array<{ id: string; transcribed: boolean; summarized: boolean; label?: string | null; error?: string }> = [];

  for (const call of calls) {
    try {
      // 1. Fetch audio from RC
      const token = await getAccessToken(commsAdmin, cfg);
      const contentUrl = `${cfg.serverUrl}/restapi/v1.0/account/~/recording/${call.recording_id}/content`;

      const rcResp = await fetch(contentUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!rcResp.ok) {
        results.push({ id: call.id, transcribed: false, summarized: false, label: call.label_name, error: `RC fetch failed: ${rcResp.status}` });
        continue;
      }

      const audioBlob = await rcResp.blob();
      const contentType = rcResp.headers.get("content-type") || "audio/mpeg";
      const ext = contentType.includes("wav") ? "wav" : contentType.includes("mp4") ? "m4a" : "mp3";

      // 2. Transcribe via ElevenLabs
      const form = new FormData();
      form.append("file", new File([audioBlob], `recording.${ext}`, { type: contentType }));
      form.append("model_id", "scribe_v1");

      const sttResp = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": elevenLabsKey },
        body: form,
      });

      if (!sttResp.ok) {
        const errText = await sttResp.text();
        results.push({ id: call.id, transcribed: false, summarized: false, label: call.label_name, error: `STT failed: ${sttResp.status}` });
        console.error(`STT failed for ${call.id}:`, errText);
        continue;
      }

      const sttResult = await sttResp.json();
      const transcript = sttResult.text || "";

      if (!transcript.trim()) {
        await publicAdmin.rpc("comms_save_call_transcript", {
          p_call_id: call.id,
          p_transcript: "(no speech detected)",
        });
        results.push({ id: call.id, transcribed: true, summarized: false, label: call.label_name });
        continue;
      }

      // Save transcript
      await publicAdmin.rpc("comms_save_call_transcript", {
        p_call_id: call.id,
        p_transcript: transcript,
      });

      // 3. Summarize via Claude (if enabled and key available)
      let summarized = false;
      if (autoSummarize && anthropicKey && transcript.trim()) {
        try {
          const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": anthropicKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 1024,
              messages: [
                {
                  role: "user",
                  content: `Summarize this phone call transcript in 3-5 bullet points. Focus on: who called, what they needed, any action items or commitments, and the outcome. Be concise and professional.\n\nTranscript:\n${transcript}`,
                },
              ],
            }),
          });

          if (claudeResp.ok) {
            const claudeResult = await claudeResp.json();
            const summary = claudeResult.content?.[0]?.text || "";
            if (summary.trim()) {
              await publicAdmin.rpc("comms_save_call_summary", {
                p_call_id: call.id,
                p_summary: summary,
              });
              summarized = true;
            }
          } else {
            console.error(`Claude failed for ${call.id}: ${claudeResp.status}`);
          }
        } catch (e) {
          console.error(`Summary error for ${call.id}:`, e);
        }
      }

      results.push({ id: call.id, transcribed: true, summarized, label: call.label_name });
    } catch (e) {
      results.push({ id: call.id, transcribed: false, summarized: false, label: call.label_name, error: String(e) });
    }
  }

  const transcribed = results.filter(r => r.transcribed).length;
  const summarized = results.filter(r => r.summarized).length;

  return jsonResponse(200, {
    ok: true,
    processed: results.length,
    transcribed,
    summarized,
    results,
  });
}
