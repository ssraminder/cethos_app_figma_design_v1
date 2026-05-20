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
  // Examples:
  //   /restapi/v1.0/account/.../extension/.../message-store/instant?type=SMS
  //   /restapi/v1.0/account/.../extension/.../telephony/sessions
  //   /restapi/v1.0/account/.../extension/.../message-store
  const isSms = eventPath.includes("/message-store");
  const isCall = eventPath.includes("/telephony/") || eventPath.includes("/presence");

  console.log("rc-webhook event", { event: eventPath, isSms, isCall, uuid: body.uuid });

  // Dispatch — fire-and-forget so we can ack RC fast.
  if (isSms) invokeSync("rc-sync-sms");
  if (isCall) invokeSync("rc-sync-calls");

  return jsonResponse(200, { ok: true });
});
