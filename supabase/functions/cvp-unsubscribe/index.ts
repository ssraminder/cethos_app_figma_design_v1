// cvp-unsubscribe
//
// JSON API for the vendor unsubscribe flow. Records an opt-out (with optional
// reason) into cvp_vendor_email_opt_outs AND deactivates the vendor profile
// (vendors.status = 'inactive') so no further job offers are routed.
//
//   GET  ?token=<vendor_uuid>     -> 302 redirect to the unsubscribe page on
//                                    the vendor portal.
//   POST { token, reason?, reason_text? }
//                                 -> Records opt-out + deactivates vendor;
//                                    returns { status: "success", email }
//   POST body "List-Unsubscribe=One-Click" (RFC 8058)
//                                 -> Silent opt-out + deactivate; returns 200.
//
// Token == vendor_id (UUID). Unguessable, durable.
// verify_jwt=false so mail-client clicks and one-click POSTs work without auth.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const FRONTEND_URL =
  (Deno.env.get("VENDOR_PORTAL_URL") ?? "https://vendor.cethos.com") + "/unsubscribe";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_REASONS = new Set([
  "too_many_emails",
  "not_relevant",
  "no_longer_translator",
  "never_signed_up",
  "other",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

function plainResponse(text: string, status = 200): Response {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(text, { status, headers });
}

function redirect(token: string): Response {
  const safeToken = UUID_RE.test(token) ? token : "";
  const url = safeToken ? `${FRONTEND_URL}?token=${safeToken}` : FRONTEND_URL;
  const headers = new Headers(corsHeaders);
  headers.set("Location", url);
  headers.set("Cache-Control", "no-store");
  return new Response(null, { status: 302, headers });
}

async function recordOptOut(
  supabase: ReturnType<typeof createClient>,
  vendorId: string,
  email: string,
  args: {
    source: "unsubscribe_link" | "list_unsubscribe_post";
    reason: string | null;
    reasonText: string | null;
    userAgent: string | null;
    ipAddress: string | null;
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { error } = await supabase.from("cvp_vendor_email_opt_outs").upsert(
    {
      vendor_id: vendorId,
      email,
      source: args.source,
      reason: args.reason,
      reason_text: args.reasonText,
      user_agent: args.userAgent,
      ip_address: args.ipAddress,
    },
    { onConflict: "vendor_id" },
  );
  if (error) {
    console.error("cvp-unsubscribe upsert error:", error.message);
    return { ok: false, reason: error.message };
  }

  // Unsubscribing also deactivates the vendor profile so no further
  // job offers route to them. The unsubscribe UI tells the vendor this
  // explicitly; reactivation is handled by support contact only.
  const { error: deactErr } = await supabase
    .from("vendors")
    .update({ status: "inactive" })
    .eq("id", vendorId);
  if (deactErr) {
    // Don't fail the unsubscribe itself — the opt-out row is already in,
    // and the email-send filter will exclude this vendor either way.
    // But log it so we can backfill if it happens.
    console.error("cvp-unsubscribe: failed to deactivate vendor", vendorId, deactErr.message);
  }

  return { ok: true };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const url = new URL(req.url);
  const queryToken = (url.searchParams.get("token") ?? "").trim();

  if (req.method === "GET") {
    return redirect(queryToken);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  const userAgent = req.headers.get("user-agent") ?? null;
  const ipHeader =
    req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;
  const ipAddress = ipHeader?.split(",")[0]?.trim() || null;

  if (!contentType.includes("application/json")) {
    let body = "";
    try { body = (await req.text()).toLowerCase(); } catch { /* ignore */ }
    if (!body.includes("list-unsubscribe=one-click")) {
      return plainResponse("Bad request", 400);
    }
    if (!queryToken || !UUID_RE.test(queryToken)) {
      return plainResponse("Invalid token", 400);
    }
    const { data: vendor } = await supabase
      .from("vendors")
      .select("id, email")
      .eq("id", queryToken)
      .maybeSingle();
    if (!vendor || !vendor.email) {
      return plainResponse("Vendor not found", 404);
    }
    const r = await recordOptOut(supabase, vendor.id as string, vendor.email as string, {
      source: "list_unsubscribe_post",
      reason: null, reasonText: null, userAgent, ipAddress,
    });
    return plainResponse(r.ok ? "Unsubscribed" : "Server error", r.ok ? 200 : 500);
  }

  let payload: { token?: string; reason?: string | null; reason_text?: string | null };
  try { payload = await req.json(); }
  catch { return jsonResponse({ error: "invalid_json" }, 400); }

  const token = (payload.token ?? queryToken ?? "").trim();
  if (!token || !UUID_RE.test(token)) {
    return jsonResponse({ error: "invalid_token" }, 400);
  }

  const reason =
    payload.reason && VALID_REASONS.has(payload.reason) ? payload.reason : null;
  const reasonText = payload.reason_text?.toString().slice(0, 500).trim() || null;

  const { data: vendor, error: vendorErr } = await supabase
    .from("vendors")
    .select("id, email")
    .eq("id", token)
    .maybeSingle();

  if (vendorErr || !vendor || !vendor.email) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  const r = await recordOptOut(supabase, vendor.id as string, vendor.email as string, {
    source: "unsubscribe_link",
    reason, reasonText, userAgent, ipAddress,
  });

  if (!r.ok) return jsonResponse({ error: "server_error" }, 500);

  return jsonResponse({ status: "success", email: vendor.email });
});
