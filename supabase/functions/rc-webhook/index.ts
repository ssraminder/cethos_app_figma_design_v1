// =============================================================================
// rc-webhook — RingCentral push-subscription receiver
//
// RC's PubNub/WebHook flow has two phases:
//   1. Subscription validation. When RC first delivers to the URL it sends
//      a request with a `Validation-Token` header. We must echo it back as
//      a response header within 5 seconds, with status 200.
//   2. Event delivery. RC POSTs event payloads with a `Verification-Token`
//      header. We must check it against the verification_token we set when
//      registering the subscription.
//
// Strategy: keep the receiver thin. When a relevant event lands, just invoke
// the existing rc-sync-sms / rc-sync-calls functions with a short window —
// reuse battle-tested code instead of duplicating it here.
//
// Public (verify_jwt=false) because RC has no way to send a Supabase JWT.
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { corsHeaders, getAdminClient, jsonResponse } from "../_shared/ringcentral.ts";

const PROJECT_URL = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

async function invokeSync(name: "rc-sync-sms" | "rc-sync-calls") {
  // Fire-and-forget invocation of the sync function. We don't await its
  // result — the webhook needs to ack in <5s.
  fetch(`${PROJECT_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify({}),
  }).catch((e) => console.error(`invoke ${name} failed`, e));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Phase 1: validation handshake ─────────────────────────────────────
  const validationToken = req.headers.get("Validation-Token") || req.headers.get("validation-token");
  if (validationToken) {
    console.log("rc-webhook validation handshake received");
    return new Response(null, {
      status: 200,
      headers: {
        "Validation-Token": validationToken,
        "Content-Type": "application/json",
      },
    });
  }

  // ── Phase 2: event delivery ───────────────────────────────────────────
  const verificationToken = req.headers.get("Verification-Token") || req.headers.get("verification-token");
  const expected = Deno.env.get("RC_WEBHOOK_VERIFICATION_TOKEN") || "";

  // Defense-in-depth: fall back to the latest token persisted by rc-webhook-manage
  // if the env var isn't set, so credential rotation works without a redeploy.
  let acceptedTokens: string[] = [];
  if (expected) acceptedTokens.push(expected);
  try {
    const admin = getAdminClient();
    const { data: sub } = await admin.rpc("comms_get_active_rc_subscription");
    const row = Array.isArray(sub) ? sub[0] : sub;
    if (row?.verification_token && !acceptedTokens.includes(row.verification_token)) {
      acceptedTokens.push(row.verification_token);
    }
  } catch (e) {
    console.error("rc-webhook: could not load subscription token", e);
  }

  if (acceptedTokens.length === 0 || !verificationToken || !acceptedTokens.includes(verificationToken)) {
    console.warn("rc-webhook rejected: missing/mismatched Verification-Token");
    return jsonResponse(401, { ok: false, error: "invalid_verification_token" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // RC sends an empty body on some lifecycle events — that's fine
  }

  const eventPath = String(body.event ?? "");
  const isSms = eventPath.includes("/message-store");
  const isTelephony = eventPath.includes("/telephony/");
  const isPresence = eventPath.includes("/presence");
  const isCall = isTelephony || isPresence;

  console.log("rc-webhook event", { event: eventPath, isSms, isTelephony, isPresence, uuid: body.uuid });

  // ── Telephony sessions: write a ring-state row immediately so the call
  // shows up on /admin/calls before the call-log API has anything to say.
  // Payload shape: { event, body: { id, parties: [{ direction, from, to, status, ... }], creationTime } }
  if (isTelephony) {
    try {
      const admin = getAdminClient();
      const session = (body.body || body) as Record<string, unknown>;
      const tsid = String(session.id ?? "");
      const parties = (session.parties as Array<Record<string, unknown>> | undefined) ?? [];
      const creationTime = (session.creationTime as string | undefined) ?? new Date().toISOString();
      const master = parties.find((p) => p.master === true) || parties[0];
      if (master && tsid) {
        const from = (master.from as Record<string, unknown> | undefined) || {};
        const to = (master.to as Record<string, unknown> | undefined) || {};
        const statusObj = (master.status as Record<string, unknown> | undefined) || {};
        const code = String(statusObj.code ?? "Unknown");
        const direction = String(master.direction ?? "Inbound");
        const missed = Boolean(master.missedCall);
        let result = code;
        if (code === "Disconnected") result = missed ? "Missed" : "Call connected";
        else if (code === "Answered") result = "Call connected";
        else if (code === "Proceeding" || code === "Setup") result = "Ringing";

        const ext = (master.extension as Record<string, unknown> | undefined);
        const extId = ext?.id != null ? String(ext.id) : null;

        await admin.rpc("comms_upsert_call_ring_state", {
          p_telephony_session_id: tsid,
          p_party_id: master.id != null ? String(master.id) : null,
          p_direction: direction,
          p_from_number: (from.phoneNumber as string | undefined) ?? null,
          p_from_name: (from.name as string | undefined) ?? null,
          p_to_number: (to.phoneNumber as string | undefined) ?? null,
          p_to_name: (to.name as string | undefined) ?? null,
          p_extension_id: extId,
          p_status: result,
          p_started_at: creationTime,
          p_ended_at: code === "Disconnected" ? ((session.lastModifiedTime as string | undefined) ?? new Date().toISOString()) : null,
          p_raw: session,
        });
      }
    } catch (e) {
      console.error("rc-webhook telephony parse failed", e);
    }
  }

  // Backstop: kick the matching sync function to fill in any details the
  // realtime payload doesn't carry (recording url, final duration on call
  // end, full SMS body, etc.).
  if (isSms) invokeSync("rc-sync-sms");
  if (isCall) invokeSync("rc-sync-calls");

  return jsonResponse(200, { ok: true });
});
