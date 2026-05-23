// =============================================================================
// rc-auto-transcribe — Batch-process call recordings: transcribe + summarize.
//
// Reads `call_transcription_mode` from app_settings. If "auto", fetches
// all calls with recordings that haven't been transcribed yet, transcribes
// them via ElevenLabs, and optionally summarizes via Claude Haiku 4.5.
//
// Called by rc-sync-calls after each sync, or manually for backfill.
//
// POST body (optional):
//   { batch_size: number (default 5), force: boolean (skip mode check) }
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

    const batchSize = typeof body.batch_size === "number" ? body.batch_size : 5;
    const force = body.force === true;

    const commsAdmin = getAdminClient();
    const publicAdmin = getPublicAdminClient();

    // Check if auto mode is enabled (unless forced)
    if (!force) {
      const { data: modeData } = await publicAdmin
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", "call_transcription_mode")
        .maybeSingle();

      const mode = modeData?.setting_value ?? "manual";
      if (mode !== "auto") {
        return jsonResponse(200, {
          ok: true,
          skipped: true,
          reason: `transcription mode is "${mode}", not "auto"`,
        });
      }
    }

    // Check if auto-summarize is on
    const { data: sumData } = await publicAdmin
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "call_auto_summarize")
      .maybeSingle();
    const autoSummarize = (sumData?.setting_value ?? "true") === "true";

    // Get pending recordings
    const { data: pending, error: pendErr } = await publicAdmin.rpc(
      "comms_get_pending_transcriptions",
      { p_limit: batchSize },
    );

    if (pendErr) {
      return jsonResponse(500, { ok: false, error: "failed to get pending", detail: pendErr.message });
    }

    const calls = (pending ?? []) as Array<{
      id: string;
      recording_id: string;
      has_transcript: boolean;
      has_summary: boolean;
    }>;

    if (calls.length === 0) {
      return jsonResponse(200, { ok: true, processed: 0, message: "no pending recordings" });
    }

    const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!elevenLabsKey) {
      return jsonResponse(503, { ok: false, error: "ELEVENLABS_API_KEY not configured" });
    }

    const cfg = getRcConfig();
    const results: Array<{ id: string; transcribed: boolean; summarized: boolean; error?: string }> = [];

    for (const call of calls) {
      try {
        // 1. Fetch audio from RC
        const token = await getAccessToken(commsAdmin, cfg);
        const contentUrl = `${cfg.serverUrl}/restapi/v1.0/account/~/recording/${call.recording_id}/content`;

        const rcResp = await fetch(contentUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!rcResp.ok) {
          results.push({ id: call.id, transcribed: false, summarized: false, error: `RC fetch failed: ${rcResp.status}` });
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
          results.push({ id: call.id, transcribed: false, summarized: false, error: `STT failed: ${sttResp.status}` });
          console.error(`STT failed for ${call.id}:`, errText);
          continue;
        }

        const sttResult = await sttResp.json();
        const transcript = sttResult.text || "";

        if (!transcript.trim()) {
          // Save empty transcript to avoid re-processing
          await publicAdmin.rpc("comms_save_call_transcript", {
            p_call_id: call.id,
            p_transcript: "(no speech detected)",
          });
          results.push({ id: call.id, transcribed: true, summarized: false });
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

        results.push({ id: call.id, transcribed: true, summarized });
      } catch (e) {
        results.push({ id: call.id, transcribed: false, summarized: false, error: String(e) });
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
  } catch (e) {
    console.error("rc-auto-transcribe error:", e);
    return jsonResponse(500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
