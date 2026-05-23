// =============================================================================
// rc-call-recording — Proxy RC recording audio, transcribe via ElevenLabs,
// summarize via Claude Haiku.
//
// POST body:
//   { call_id: uuid, action: "audio" | "transcribe" | "summarize" }
//
// action=audio     → streams the recording audio from RingCentral (proxied)
// action=transcribe → fetches audio, sends to ElevenLabs STT, saves transcript
// action=summarize  → reads transcript from DB, summarizes with Claude Haiku
//
// Required secrets:
//   RC_* (existing RingCentral config)
//   ELEVENLABS_API_KEY
//   ANTHROPIC_API_KEY
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

interface RequestBody {
  call_id: string;
  action: "audio" | "transcribe" | "summarize";
}

interface CallInfo {
  id: string;
  recording_id: string | null;
  recording_url: string | null;
  has_recording: boolean;
  transcript: string | null;
  transcript_at: string | null;
  summary: string | null;
  summary_at: string | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body: RequestBody = await req.json();
    if (!body.call_id || !body.action) {
      return jsonResponse(400, { ok: false, error: "call_id and action required" });
    }

    // Use the comms-schema admin client for RC token cache lookups,
    // and the public-schema admin client for RPC calls to comms.call_logs.
    const commsAdmin = getAdminClient();
    const publicAdmin = getPublicAdminClient();

    // Fetch call record via public RPC (comms schema not exposed to PostgREST)
    const { data: callData, error: callErr } = await publicAdmin.rpc(
      "comms_get_call_recording_info",
      { p_call_id: body.call_id },
    );

    if (callErr || !callData) {
      return jsonResponse(404, { ok: false, error: "call not found" });
    }

    const call = callData as CallInfo;

    if (!call.has_recording || !call.recording_id) {
      return jsonResponse(400, { ok: false, error: "no recording for this call" });
    }

    // ── ACTION: audio ──────────────────────────────────────────────────
    if (body.action === "audio") {
      return await proxyAudio(commsAdmin, call);
    }

    // ── ACTION: transcribe ─────────────────────────────────────────────
    if (body.action === "transcribe") {
      return await transcribeRecording(commsAdmin, publicAdmin, call);
    }

    // ── ACTION: summarize ──────────────────────────────────────────────
    if (body.action === "summarize") {
      return await summarizeTranscript(publicAdmin, call);
    }

    return jsonResponse(400, { ok: false, error: `unknown action: ${body.action}` });
  } catch (e) {
    console.error("rc-call-recording error:", e);
    return jsonResponse(500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// ── Proxy audio from RingCentral ─────────────────────────────────────────────

async function proxyAudio(commsAdmin: SupabaseClient, call: CallInfo) {
  const cfg = getRcConfig();
  const token = await getAccessToken(commsAdmin, cfg);

  const contentUrl = `${cfg.serverUrl}/restapi/v1.0/account/~/recording/${call.recording_id}/content`;

  const rcResp = await fetch(contentUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!rcResp.ok) {
    return jsonResponse(502, {
      ok: false,
      error: "failed to fetch recording from RC",
      status: rcResp.status,
    });
  }

  const contentType = rcResp.headers.get("content-type") || "audio/mpeg";
  const audioData = await rcResp.arrayBuffer();

  return new Response(audioData, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": contentType,
      "Content-Length": String(audioData.byteLength),
    },
  });
}

// ── Transcribe via ElevenLabs ────────────────────────────────────────────────

async function transcribeRecording(
  commsAdmin: SupabaseClient,
  publicAdmin: SupabaseClient,
  call: CallInfo,
) {
  const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!elevenLabsKey) {
    return jsonResponse(503, { ok: false, error: "ELEVENLABS_API_KEY not configured" });
  }

  // Fetch audio from RC
  const cfg = getRcConfig();
  const token = await getAccessToken(commsAdmin, cfg);
  const contentUrl = `${cfg.serverUrl}/restapi/v1.0/account/~/recording/${call.recording_id}/content`;

  const rcResp = await fetch(contentUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!rcResp.ok) {
    return jsonResponse(502, {
      ok: false,
      error: "failed to fetch recording from RC",
      status: rcResp.status,
    });
  }

  const audioBlob = await rcResp.blob();
  const contentType = rcResp.headers.get("content-type") || "audio/mpeg";
  const ext = contentType.includes("wav") ? "wav" : contentType.includes("mp4") ? "m4a" : "mp3";

  // Send to ElevenLabs Speech-to-Text
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
    console.error("ElevenLabs STT failed:", sttResp.status, errText);
    return jsonResponse(502, {
      ok: false,
      error: "ElevenLabs transcription failed",
      status: sttResp.status,
      detail: errText,
    });
  }

  const sttResult = await sttResp.json();
  const transcript = sttResult.text || "";

  if (!transcript.trim()) {
    return jsonResponse(200, {
      ok: true,
      transcript: "",
      message: "Recording contained no detectable speech",
    });
  }

  // Save transcript to DB via RPC
  const { error: updateErr } = await publicAdmin.rpc("comms_save_call_transcript", {
    p_call_id: call.id,
    p_transcript: transcript,
  });

  if (updateErr) {
    console.error("Failed to save transcript:", updateErr);
  }

  return jsonResponse(200, { ok: true, transcript });
}

// ── Summarize via Claude Haiku ───────────────────────────────────────────────

async function summarizeTranscript(publicAdmin: SupabaseClient, call: CallInfo) {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    return jsonResponse(503, { ok: false, error: "ANTHROPIC_API_KEY not configured" });
  }

  if (!call.transcript || !call.transcript.trim()) {
    return jsonResponse(400, { ok: false, error: "no transcript available — transcribe first" });
  }

  const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Summarize this phone call transcript in 3-5 bullet points. Focus on: who called, what they needed, any action items or commitments, and the outcome. Be concise and professional.\n\nTranscript:\n${call.transcript}`,
        },
      ],
    }),
  });

  if (!claudeResp.ok) {
    const errText = await claudeResp.text();
    console.error("Claude API failed:", claudeResp.status, errText);
    return jsonResponse(502, {
      ok: false,
      error: "Claude summarization failed",
      status: claudeResp.status,
    });
  }

  const claudeResult = await claudeResp.json();
  const summary = claudeResult.content?.[0]?.text || "";

  if (!summary.trim()) {
    return jsonResponse(200, {
      ok: true,
      summary: "",
      message: "Could not generate summary",
    });
  }

  // Save summary to DB via RPC
  const { error: updateErr } = await publicAdmin.rpc("comms_save_call_summary", {
    p_call_id: call.id,
    p_summary: summary,
  });

  if (updateErr) {
    console.error("Failed to save summary:", updateErr);
  }

  return jsonResponse(200, { ok: true, summary });
}
