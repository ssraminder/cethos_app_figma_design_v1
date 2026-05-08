// ============================================================================
// admin-impersonate-vendor v1
// Mints a short-lived vendor_sessions row for a staff user to "view as
// vendor" — the same pattern XTRF exposes. Two action types:
//   - start { vendor_id, ttl_minutes? } -> { token, expires_at, vendor }
//       Verifies the caller is an active staff_user, then inserts a
//       vendor_sessions row tagged with is_impersonation=true and
//       impersonator_staff_id=<staff>. Returns the raw token; the
//       caller opens the vendor portal with this token in the URL.
//   - end   { token }                    -> { success: true }
//       Deletes the impersonation session (cooperative logout from
//       the vendor portal banner).
//
// Auth: verify_jwt = true. The Supabase auth header must belong to an
// active staff_user; impersonation by anyone else is rejected.
// Date: 2026-05-08
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// Session-token scheme matches vendor-auth-otp-verify (raw, not hashed).
// vendor-auth-session looks up vendor_sessions.session_token verbatim, so
// we store the same string we hand back to the caller.
function generateRawToken(): string {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

const DEFAULT_TTL_MIN = 30;
const MAX_TTL_MIN = 120;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // verify_jwt=true means Supabase already validated the JWT before
    // hitting us. Decode it via supabase.auth.getUser using the user's
    // bearer token, then verify the user maps to an active staff_users row.
    const authHeader = req.headers.get("Authorization") || "";
    const userToken = authHeader.replace(/^Bearer\s+/i, "");
    if (!userToken) return json({ error: "Missing Authorization" }, 401);

    const { data: userData, error: userErr } = await supabase.auth.getUser(
      userToken,
    );
    if (userErr || !userData?.user) {
      return json({ error: "Invalid auth token" }, 401);
    }
    const authUserId = userData.user.id;

    const { data: staff, error: staffErr } = await supabase
      .from("staff_users")
      .select("id, email, is_active")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (staffErr) return json({ error: staffErr.message }, 500);
    if (!staff || staff.is_active === false) {
      return json({ error: "Not a staff user" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action || "start";

    if (action === "end") {
      const rawToken: string | undefined = body?.token;
      if (!rawToken) return json({ error: "Missing token" }, 400);
      // Only delete if it's a staff impersonation session — never wipe
      // a real vendor login by accident.
      const { error: delErr } = await supabase
        .from("vendor_sessions")
        .delete()
        .eq("session_token", rawToken)
        .eq("is_impersonation", true);
      if (delErr) return json({ error: delErr.message }, 500);
      return json({ success: true });
    }

    // action === "start"
    const vendorId: string | undefined = body?.vendor_id;
    if (!vendorId) return json({ error: "Missing vendor_id" }, 400);

    const ttlMin = Math.max(
      5,
      Math.min(MAX_TTL_MIN, Number(body?.ttl_minutes) || DEFAULT_TTL_MIN),
    );

    const { data: vendor, error: vendorErr } = await supabase
      .from("vendors")
      .select("id, full_name, email, status")
      .eq("id", vendorId)
      .maybeSingle();
    if (vendorErr) return json({ error: vendorErr.message }, 500);
    if (!vendor) return json({ error: "Vendor not found" }, 404);

    const rawToken = generateRawToken();
    const expiresAt = new Date(Date.now() + ttlMin * 60_000).toISOString();

    const { error: insertErr } = await supabase.from("vendor_sessions").insert({
      vendor_id: vendor.id,
      session_token: rawToken,
      expires_at: expiresAt,
      is_impersonation: true,
      impersonator_staff_id: staff.id,
      user_agent: req.headers.get("User-Agent") || null,
    });
    if (insertErr) return json({ error: insertErr.message }, 500);

    console.log(
      `admin-impersonate-vendor: staff=${staff.email} -> vendor=${vendor.email} ttl=${ttlMin}m`,
    );

    return json({
      success: true,
      token: rawToken,
      expires_at: expiresAt,
      vendor: {
        id: vendor.id,
        full_name: vendor.full_name,
        email: vendor.email,
      },
      impersonator: {
        staff_id: staff.id,
        staff_email: staff.email,
      },
    });
  } catch (err: any) {
    console.error("admin-impersonate-vendor error:", err?.message || err);
    return json({ error: err?.message || "Internal error" }, 500);
  }
});
