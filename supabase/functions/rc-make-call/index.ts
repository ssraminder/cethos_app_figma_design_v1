// =============================================================================
// rc-make-call — place an outbound call via RingCentral RingOut, optionally
// send a follow-up SMS, and (for cron-driven one-shots) self-unschedule.
//
// RingOut bridges through your RC line: it dials the `from` number first,
// and when that line picks up, it connects to `to`. The `from` number must
// be a real RC extension/device that will answer.
//
// Body:
//   {
//     to_number: "+13179351831",                  // required, E.164 target
//     from_number?: "+14165550100",                // default: RC_SMS_FROM_NUMBER
//     caller_id?: "+14165550100",                  // default: from_number
//     play_prompt?: boolean,                       // default: true
//     sms_after?: { custom_body: "..." },          // optional follow-up SMS to to_number
//     cron_job_name?: "rc-call-317-once"           // if set, unschedule after fire
//   }
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  corsHeaders,
  getAdminClient,
  getRcConfig,
  jsonResponse,
  rcRequest,
  toE164,
} from "../_shared/ringcentral.ts";

interface SmsAfter {
  custom_body?: string;
  template_key?: string;
  variables?: Record<string, string>;
}

interface RequestBody {
  to_number: string;
  from_number?: string;
  caller_id?: string;
  play_prompt?: boolean;
  sms_after?: SmsAfter;
  cron_job_name?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const cfg = getRcConfig();
    const admin = getAdminClient();

    const body: RequestBody = await req.json();
    if (!body.to_number) {
      return jsonResponse(400, { ok: false, error: "to_number required" });
    }

    const toE = toE164(body.to_number);
    if (!toE) return jsonResponse(400, { ok: false, error: "invalid to_number" });

    const fromE = toE164(body.from_number) ?? toE164(cfg.smsFromNumber);
    if (!fromE) {
      return jsonResponse(503, { ok: false, error: "no from_number (set RC_SMS_FROM_NUMBER or pass from_number)" });
    }

    const callerId = toE164(body.caller_id) ?? fromE;

    // ── 1. RingOut ─────────────────────────────────────────────────────────
    const ringoutResp = await rcRequest(admin, cfg, "/restapi/v1.0/account/~/extension/~/ring-out", {
      method: "POST",
      body: {
        from: { phoneNumber: fromE },
        to: { phoneNumber: toE },
        callerId: { phoneNumber: callerId },
        playPrompt: body.play_prompt ?? true,
      },
    });

    const ringoutOk = ringoutResp.status >= 200 && ringoutResp.status < 300;
    const ringoutBody = ringoutResp.body as Record<string, unknown> | string | undefined;
    const sessionId =
      ringoutOk && ringoutBody && typeof ringoutBody === "object"
        ? ((ringoutBody as { id?: number | string }).id?.toString() ?? null)
        : null;

    console.log("rc-make-call ringout", {
      status: ringoutResp.status,
      to: toE,
      from: fromE,
      session_id: sessionId,
      ok: ringoutOk,
    });

    if (!ringoutOk) {
      // Don't fire SMS or unschedule if the call failed — leave the cron job
      // alone so the next minute can retry (or so a human can investigate).
      return jsonResponse(502, {
        ok: false,
        step: "ringout",
        status: ringoutResp.status,
        body: ringoutBody,
      });
    }

    // ── 2. Optional follow-up SMS ──────────────────────────────────────────
    let smsResult: { ok: boolean; sms_message_id?: string; rc_message_id?: string | null; error?: string } | null = null;
    if (body.sms_after && (body.sms_after.custom_body || body.sms_after.template_key)) {
      try {
        if (!cfg.smsFromNumber) {
          smsResult = { ok: false, error: "RC_SMS_FROM_NUMBER not configured" };
        } else {
          const smsResp = await rcRequest(admin, cfg, "/restapi/v1.0/account/~/extension/~/sms", {
            method: "POST",
            body: {
              from: { phoneNumber: cfg.smsFromNumber },
              to: [{ phoneNumber: toE }],
              text: body.sms_after.custom_body ?? "",
            },
          });
          const smsOk = smsResp.status >= 200 && smsResp.status < 300;
          const smsBody = smsResp.body as Record<string, unknown> | string | undefined;
          const rcMessageId =
            smsOk && smsBody && typeof smsBody === "object"
              ? ((smsBody as { id?: number | string }).id?.toString() ?? null)
              : null;
          smsResult = {
            ok: smsOk,
            rc_message_id: rcMessageId,
            error: smsOk ? undefined : typeof smsBody === "string" ? smsBody : JSON.stringify(smsBody),
          };
          console.log("rc-make-call sms_after", { ok: smsOk, status: smsResp.status, rc_message_id: rcMessageId });
        }
      } catch (e) {
        smsResult = { ok: false, error: e instanceof Error ? e.message : String(e) };
        console.error("rc-make-call sms_after exception", e);
      }
    }

    // ── 3. One-shot self-unschedule ────────────────────────────────────────
    let unscheduled: { ok: boolean; error?: string } | null = null;
    if (body.cron_job_name) {
      const { error: unschedErr } = await admin.rpc("cron_unschedule_by_name", {
        p_job_name: body.cron_job_name,
      });
      unscheduled = { ok: !unschedErr, error: unschedErr?.message };
      if (unschedErr) {
        console.error("rc-make-call cron_unschedule_failed", unschedErr);
      }
    }

    return jsonResponse(200, {
      ok: true,
      ringout: { status: ringoutResp.status, session_id: sessionId, body: ringoutBody },
      sms_after: smsResult,
      unscheduled,
      to: toE,
      from: fromE,
    });
  } catch (e) {
    console.error("rc-make-call fatal", e);
    return jsonResponse(500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
