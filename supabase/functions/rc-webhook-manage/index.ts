// =============================================================================
// rc-webhook-manage — admin tool to create / renew / list / delete the
// RingCentral push subscription that delivers events to /rc-webhook.
//
// Actions (POST body):
//   { action: "register" }          — creates a new subscription
//   { action: "list" }              — fetches all subscriptions from RC
//   { action: "renew", id?: text }  — renews active subscription (or by id)
//   { action: "delete", id: text }  — deletes a subscription
//
// Public (verify_jwt=false) — only callable by service_role since the gateway
// rejects anonymous-only callers for non-public functions. In practice this
// is used as a one-shot setup tool + cron renewal target.
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  corsHeaders,
  getAdminClient,
  getRcConfig,
  jsonResponse,
  rcRequest,
} from "../_shared/ringcentral.ts";

const SUBSCRIPTION_EVENTS = [
  "/restapi/v1.0/account/~/extension/~/message-store/instant?type=SMS",
  "/restapi/v1.0/account/~/extension/~/message-store",
  "/restapi/v1.0/account/~/extension/~/telephony/sessions",
  "/restapi/v1.0/account/~/extension/~/presence",
];

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const cfg = getRcConfig();
    const admin = getAdminClient();

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const action = (body.action as string) || "list";

    const projectUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
    const deliveryUrl = `${projectUrl}/functions/v1/rc-webhook`;

    if (action === "list") {
      const resp = await rcRequest(admin, cfg, "/restapi/v1.0/subscription", { method: "GET" });
      return jsonResponse(resp.status, resp.body);
    }

    if (action === "register") {
      const verificationToken = randomToken();
      const resp = await rcRequest(admin, cfg, "/restapi/v1.0/subscription", {
        method: "POST",
        body: {
          eventFilters: SUBSCRIPTION_EVENTS,
          deliveryMode: {
            transportType: "WebHook",
            address: deliveryUrl,
            verificationToken,
          },
          expiresIn: 604800, // 7 days
        },
      });
      if (resp.status < 200 || resp.status >= 300) {
        return jsonResponse(resp.status, { ok: false, step: "register", body: resp.body });
      }
      const sub = resp.body as Record<string, unknown>;
      const expiresAt = sub.expirationTime
        ? new Date(String(sub.expirationTime)).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await admin.rpc("comms_upsert_rc_subscription", {
        p_id: String(sub.id),
        p_status: String(sub.status || "Active"),
        p_event_filters: SUBSCRIPTION_EVENTS,
        p_delivery_url: deliveryUrl,
        p_verification_token: verificationToken,
        p_expires_at: expiresAt,
        p_raw: sub,
      });
      return jsonResponse(200, {
        ok: true,
        action: "register",
        subscription_id: sub.id,
        expires_at: expiresAt,
        delivery_url: deliveryUrl,
      });
    }

    if (action === "renew") {
      let subId = (body.id as string) || "";
      if (!subId) {
        const { data } = await admin.rpc("comms_get_active_rc_subscription");
        const row = Array.isArray(data) ? data[0] : data;
        subId = row?.id;
      }
      if (!subId) {
        return jsonResponse(404, { ok: false, error: "no_active_subscription" });
      }
      const resp = await rcRequest(admin, cfg, `/restapi/v1.0/subscription/${subId}/renew`, {
        method: "POST",
      });
      if (resp.status < 200 || resp.status >= 300) {
        return jsonResponse(resp.status, { ok: false, step: "renew", body: resp.body });
      }
      const sub = resp.body as Record<string, unknown>;
      const expiresAt = sub.expirationTime
        ? new Date(String(sub.expirationTime)).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      // Pull the verification_token we already stored
      const { data: existing } = await admin.rpc("comms_get_active_rc_subscription");
      const existingRow = Array.isArray(existing) ? existing[0] : existing;
      await admin.rpc("comms_upsert_rc_subscription", {
        p_id: String(sub.id),
        p_status: String(sub.status || "Active"),
        p_event_filters: SUBSCRIPTION_EVENTS,
        p_delivery_url: deliveryUrl,
        p_verification_token: existingRow?.verification_token ?? "",
        p_expires_at: expiresAt,
        p_raw: sub,
      });
      return jsonResponse(200, { ok: true, action: "renew", subscription_id: sub.id, expires_at: expiresAt });
    }

    if (action === "delete") {
      const subId = (body.id as string) || "";
      if (!subId) return jsonResponse(400, { ok: false, error: "id required" });
      const resp = await rcRequest(admin, cfg, `/restapi/v1.0/subscription/${subId}`, {
        method: "DELETE",
      });
      return jsonResponse(resp.status, { ok: resp.status < 300, body: resp.body });
    }

    return jsonResponse(400, { ok: false, error: `unknown action: ${action}` });
  } catch (e) {
    return jsonResponse(500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
