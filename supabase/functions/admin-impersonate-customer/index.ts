// ============================================================================
// admin-impersonate-customer
// Mints a short-lived customer_sessions row so a staff user can "View as
// customer" in the portal. Parallel to admin-impersonate-vendor.
//
//   start { customer_id, ttl_minutes? } -> { token, expires_at, customer,
//                                            impersonator }
//   end   { token }                     -> { success: true }
//
// Auth: verify_jwt=true. The caller must map to an active staff_users row.
// Token contract: customer_sessions stores SHA-256(token_hash); we hand back
// the RAW token to the caller, who opens /dashboard?impersonate_token=<raw>.
// customer-resolve-impersonation swaps the raw token for {session, customer}.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function generateRawToken(): string {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const DEFAULT_TTL_MIN = 30;
const MAX_TTL_MIN = 120;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const userToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!userToken) return json({ error: "Missing Authorization" }, 401);

    const { data: userData, error: userErr } = await sb.auth.getUser(userToken);
    if (userErr || !userData?.user) return json({ error: "Invalid auth token" }, 401);

    const { data: staff, error: staffErr } = await sb
      .from("staff_users")
      .select("id, email, full_name, is_active")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (staffErr) return json({ error: staffErr.message }, 500);
    if (!staff || staff.is_active === false) return json({ error: "Not a staff user" }, 403);

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action || "start";

    if (action === "end") {
      const rawToken: string | undefined = body?.token;
      if (!rawToken) return json({ error: "Missing token" }, 400);
      const tokenHash = await sha256Hex(rawToken);
      const { error: delErr } = await sb
        .from("customer_sessions")
        .delete()
        .eq("token_hash", tokenHash)
        .eq("is_impersonation", true);
      if (delErr) return json({ error: delErr.message }, 500);
      return json({ success: true });
    }

    // action === "start"
    const customerId: string | undefined = body?.customer_id;
    if (!customerId) return json({ error: "Missing customer_id" }, 400);

    const ttlMin = Math.max(5, Math.min(MAX_TTL_MIN, Number(body?.ttl_minutes) || DEFAULT_TTL_MIN));

    const { data: customer, error: custErr } = await sb
      .from("customers")
      .select("id, full_name, email, phone, company_name")
      .eq("id", customerId)
      .maybeSingle();
    if (custErr) return json({ error: custErr.message }, 500);
    if (!customer) return json({ error: "Customer not found" }, 404);

    const rawToken = generateRawToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + ttlMin * 60_000).toISOString();

    const { error: insertErr } = await sb.from("customer_sessions").insert({
      customer_id: customer.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      is_impersonation: true,
      impersonator_staff_id: staff.id,
      session_type: "session",
      user_agent: req.headers.get("User-Agent") || null,
    });
    if (insertErr) return json({ error: insertErr.message }, 500);

    console.log(`admin-impersonate-customer: staff=${staff.email} -> customer=${customer.email} ttl=${ttlMin}m`);

    return json({
      success: true,
      token: rawToken,
      expires_at: expiresAt,
      customer: {
        id: customer.id,
        full_name: customer.full_name,
        email: customer.email,
        phone: customer.phone,
        company_name: customer.company_name,
      },
      impersonator: {
        staff_id: staff.id,
        staff_email: staff.email,
        staff_name: staff.full_name,
      },
    });
  } catch (err: any) {
    console.error("admin-impersonate-customer error:", err?.message || err);
    return json({ error: err?.message || "Internal error" }, 500);
  }
});
