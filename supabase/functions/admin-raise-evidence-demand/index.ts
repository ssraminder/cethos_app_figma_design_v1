// admin-raise-evidence-demand — staff formally requests the ISO competence
// evidence for one blinded roster linguist (e.g. on a client/audit request).
// The agency releases the documents via the vendor portal; they land in the
// staff-readable roster-evidence-locker. Backed by the roster_terms T&C.
//
// Body: { roster_linguist_id, order_id?, step_id?, reason?, staff_id }
// Staff-gated.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendBrevoRawEmail } from "../_shared/brevo.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (d: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { roster_linguist_id, order_id, step_id, reason, staff_id } = await req.json().catch(() => ({}));
    if (!roster_linguist_id) return json({ success: false, error: "roster_linguist_id required" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (!staff_id) return json({ success: false, error: "staff_id required" }, 401);
    const { data: staff } = await sb.from("staff_users").select("id, is_active").eq("id", staff_id).maybeSingle();
    if (!staff || staff.is_active === false) return json({ success: false, error: "not authorised" }, 401);

    // Resolve the linguist's agency (service role bypasses the blinded RLS).
    const { data: linguist } = await sb
      .from("vendor_roster_linguists")
      .select("id, vendor_id, handle")
      .eq("id", roster_linguist_id).maybeSingle();
    if (!linguist) return json({ success: false, error: "linguist_not_found" }, 404);

    const { data: demand, error: insErr } = await sb
      .from("roster_evidence_demands")
      .insert({
        roster_linguist_id,
        vendor_id: linguist.vendor_id,
        order_id: order_id ?? null,
        step_id: step_id ?? null,
        reason: reason ?? null,
        raised_by_staff_id: staff_id,
        status: "open",
      })
      .select("id")
      .single();
    if (insErr) return json({ success: false, error: insErr.message }, 500);

    // Best-effort notify the agency (the demand also shows in their portal).
    try {
      const { data: vendor } = await sb.from("vendors").select("email, full_name, business_name").eq("id", linguist.vendor_id).maybeSingle();
      if (vendor?.email) {
        await sendBrevoRawEmail({
          to: [{ email: vendor.email, name: vendor.business_name ?? vendor.full_name ?? undefined }],
          subject: "Cethos has requested ISO competence evidence",
          htmlContent: `<p>Hello ${vendor.business_name ?? vendor.full_name ?? "there"},</p>
            <p>Cethos has requested the ISO 17100 competence evidence for one of your roster linguists
            (<strong>${linguist.handle}</strong>)${reason ? ` — ${reason}` : ""}.</p>
            <p>Please sign in to the vendor portal, open <strong>Linguist Roster</strong>, and use
            <em>Upload &amp; release</em> on the evidence request to provide the supporting documents.</p>
            <p>— Cethos</p>`,
        });
      }
    } catch (e) {
      console.error("demand notify failed:", e);
    }

    return json({ success: true, demand_id: demand.id });
  } catch (err) {
    console.error("admin-raise-evidence-demand error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
