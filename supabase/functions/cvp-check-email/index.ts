// cvp-check-email
// Public, read-only helper for the recruitment apply form. Given an email,
// reports whether a Cethos vendor account or a prior application already exists
// for it, so the form can block a duplicate entry up front and direct the
// person to log in / check their status instead of filling the whole form.
//
// Body: { email: string }
// Returns: { exists: boolean, type: "vendor" | "application" | null }

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(b: Record<string, unknown>, s = 200): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ exists: false, type: null }, 405);
  try {
    const { email } = await req.json().catch(() => ({ email: "" }));
    const emailLc = String(email ?? "").trim().toLowerCase();
    // Basic shape check — don't query on obviously-incomplete input.
    if (!emailLc || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLc)) {
      return json({ exists: false, type: null });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: vendor } = await supabase.from("vendors").select("id").ilike("email", emailLc).maybeSingle();
    if (vendor) return json({ exists: true, type: "vendor" });

    const { data: app } = await supabase.from("cvp_applications").select("id").ilike("email", emailLc).maybeSingle();
    if (app) return json({ exists: true, type: "application" });

    return json({ exists: false, type: null });
  } catch (e) {
    // Fail-open: never block submission on a checker error (the submit endpoint
    // is the authoritative guard).
    console.error("cvp-check-email error:", e instanceof Error ? e.message : String(e));
    return json({ exists: false, type: null });
  }
});
