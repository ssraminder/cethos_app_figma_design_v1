// =============================================================================
// rc-sync-calls — pulls RingCentral call log into comms.call_logs.
//
// Modes:
//   - Cron drain (default): syncs since last seen call (or last 24h on cold start)
//   - Manual w/ ?since=ISO or {since: "..."} body: force a custom window
//   - Manual w/ {full_resync: true}: re-sync last 30 days
//
// Auto-links each call to a customer via comms.find_customer_by_phone() (the
// upsert RPC does this server-side). Idempotent on rc_session_id.
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  corsHeaders,
  getAdminClient,
  getRcConfig,
  jsonResponse,
  rcRequest,
} from "../_shared/ringcentral.ts";

interface RcCallRecord {
  id: string;
  uri?: string;
  sessionId?: string;
  telephonySessionId?: string;
  direction?: "Inbound" | "Outbound";
  from?: { phoneNumber?: string; name?: string; extensionNumber?: string };
  to?: { phoneNumber?: string; name?: string; extensionNumber?: string };
  startTime?: string;
  duration?: number;
  result?: string;
  recording?: { id?: string; uri?: string; contentUri?: string };
  extension?: { id?: number | string; uri?: string };
  legs?: Array<Record<string, unknown>>;
}

const PAGE_SIZE = 250;
const MAX_PAGES_PER_RUN = 10;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const cfg = getRcConfig();
    const admin = getAdminClient();

    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { /* empty body ok */ }
    }
    const url = new URL(req.url);

    const fullResync = body.full_resync === true || url.searchParams.get("full_resync") === "true";

    // Pick the start of the window
    let since: string;
    if (typeof body.since === "string") {
      since = body.since;
    } else if (url.searchParams.get("since")) {
      since = url.searchParams.get("since")!;
    } else if (fullResync) {
      since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    } else {
      // Use the latest started_at we have, minus 5 min overlap for safety.
      const { data: last } = await admin.rpc("comms_list_call_logs", { p_limit: 1, p_offset: 0 });
      const lastStarted = Array.isArray(last) && last[0]?.started_at;
      since = lastStarted
        ? new Date(new Date(lastStarted).getTime() - 5 * 60 * 1000).toISOString()
        : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    }

    let page = 1;
    let fetched = 0;
    let upserted = 0;
    let errors = 0;
    const errorSamples: unknown[] = [];

    while (page <= MAX_PAGES_PER_RUN) {
      const resp = await rcRequest(admin, cfg, "/restapi/v1.0/account/~/call-log", {
        method: "GET",
        query: {
          dateFrom: since,
          perPage: PAGE_SIZE,
          page,
          view: "Detailed",
          withRecording: false,
        },
      });

      if (resp.status !== 200) {
        return jsonResponse(502, { ok: false, step: "call_log", page, status: resp.status, body: resp.body });
      }

      const records = ((resp.body as { records?: RcCallRecord[] })?.records) ?? [];
      fetched += records.length;

      for (const rec of records) {
        try {
          const extId = rec.extension?.id != null ? String(rec.extension.id) : null;
          const recordingUrl = rec.recording?.contentUri ?? rec.recording?.uri ?? null;

          const { error: rpcErr } = await admin.rpc("comms_upsert_call_log", {
            p_rc_session_id: rec.sessionId ?? rec.id,
            p_rc_telephony_session_id: rec.telephonySessionId ?? null,
            p_rc_party_id: rec.id ?? null,
            p_direction: rec.direction ?? "Inbound",
            p_from_number: rec.from?.phoneNumber ?? null,
            p_from_name: rec.from?.name ?? null,
            p_to_number: rec.to?.phoneNumber ?? null,
            p_to_name: rec.to?.name ?? null,
            p_rc_extension_id: extId,
            p_started_at: rec.startTime ?? new Date().toISOString(),
            p_ended_at: rec.startTime && rec.duration
              ? new Date(new Date(rec.startTime).getTime() + rec.duration * 1000).toISOString()
              : null,
            p_duration_sec: rec.duration ?? null,
            p_result: rec.result ?? null,
            p_recording_id: rec.recording?.id ?? null,
            p_recording_url: recordingUrl,
            p_raw: rec as unknown as Record<string, unknown>,
          });
          if (rpcErr) {
            errors++;
            if (errorSamples.length < 3) errorSamples.push({ id: rec.id, err: rpcErr });
          } else {
            upserted++;
          }
        } catch (e) {
          errors++;
          if (errorSamples.length < 3) errorSamples.push({ id: rec.id, err: String(e) });
        }
      }

      // RC returns navigation.nextPage if there's more
      const nav = (resp.body as { navigation?: { nextPage?: { uri?: string } } })?.navigation;
      if (!nav?.nextPage?.uri || records.length < PAGE_SIZE) break;
      page++;
    }

    // Fire-and-forget: trigger auto-transcribe if any calls were upserted
    let autoTranscribeResult: unknown = null;
    if (upserted > 0) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        if (supabaseUrl && serviceKey) {
          const atResp = await fetch(`${supabaseUrl}/functions/v1/rc-auto-transcribe`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ batch_size: 5 }),
          });
          autoTranscribeResult = await atResp.json();
        }
      } catch (e) {
        autoTranscribeResult = { error: String(e) };
      }
    }

    return jsonResponse(200, {
      ok: true,
      window: { since },
      pagesFetched: page,
      fetched,
      upserted,
      errors,
      errorSamples,
      autoTranscribe: autoTranscribeResult,
    });
  } catch (e) {
    return jsonResponse(500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
