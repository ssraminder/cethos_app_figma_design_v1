// ============================================================================
// customer-resolve-impersonation
// Swaps a raw ?impersonate_token= for the {session, customer, impersonator}
// payload the customer portal stuffs into localStorage on landing. Used only
// by the staff "View as customer" flow (admin-impersonate-customer mints the
// row); regular customer logins still go through verify-customer-login-otp.
//
// Input:  { token }
// Output: { session: { token, expires_at }, customer: {...},
//           impersonator: { staff_id, staff_name } }
//
// verify_jwt = false (called pre-auth from the portal landing page).
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

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { token } = await req.json();
    if (!token || typeof token !== "string") return json({ error: "Missing token" }, 400);

    const tokenHash = await sha256Hex(token);

    // Resolve the session — must be an impersonation row, not a real login.
    const { data: session, error: sErr } = await sb
      .from("customer_sessions")
      .select("id, customer_id, expires_at, is_impersonation, impersonator_staff_id")
      .eq("token_hash", tokenHash)
      .eq("is_impersonation", true)
      .maybeSingle();
    if (sErr) return json({ error: sErr.message }, 500);
    if (!session) return json({ error: "Invalid or expired impersonation token" }, 404);

    if (new Date(session.expires_at) <= new Date()) {
      return json({ error: "Impersonation token expired" }, 410);
    }

    const [{ data: customer }, { data: staff }] = await Promise.all([
      sb.from("customers")
        .select("id, full_name, email, phone, company_name")
        .eq("id", session.customer_id)
        .maybeSingle(),
      session.impersonator_staff_id
        ? sb.from("staff_users")
            .select("id, full_name, email")
            .eq("id", session.impersonator_staff_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (!customer) return json({ error: "Customer not found" }, 404);

    await sb
      .from("customer_sessions")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("id", session.id);

    return json({
      success: true,
      session: { token, expires_at: session.expires_at },
      customer,
      impersonator: staff
        ? { staff_id: staff.id, staff_name: staff.full_name, staff_email: staff.email }
        : null,
    });
  } catch (err: any) {
    console.error("customer-resolve-impersonation error:", err?.message || err);
    return json({ error: err?.message || "Internal error" }, 500);
  }
});
