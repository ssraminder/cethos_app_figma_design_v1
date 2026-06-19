// admin-record-training-completion
// Staff records that a vendor completed a training OFFLINE (outside the portal).
// Writes a completion with method='offline' + recorded_by (staff). Online
// completions are recorded by the vendor flow; this is the manual escape hatch.
//
// Body: { staff_id, vendor_id, training_id, notes? }

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
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);
  try {
    const body = await req.json();
    const { staff_id, vendor_id, training_id, notes } = body ?? {};
    if (!staff_id || !vendor_id || !training_id) {
      return json({ success: false, error: "staff_id, vendor_id and training_id are required" }, 400);
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: staff } = await supabase.from("staff_users").select("id, is_active").eq("id", staff_id).maybeSingle();
    if (!staff || (staff as { is_active: boolean }).is_active === false) {
      return json({ success: false, error: "invalid_or_inactive_staff" }, 401);
    }

    const { data: id, error } = await supabase.rpc("cvp_record_training_completion", {
      p_vendor_id: vendor_id, p_training_id: training_id, p_method: "offline",
      p_recorded_by: staff_id, p_notes: notes ?? null,
    });
    if (error) return json({ success: false, error: error.message }, 400);
    return json({ success: true, completion_id: id });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
