// admin-download-released-evidence — staff downloads a released roster
// evidence file from the audit locker via a short-lived signed URL.
//
// Body: { release_id, staff_id }. Staff-gated.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (d: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const LOCKER = "roster-evidence-locker";
const TTL_SECONDS = 300;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { release_id, staff_id } = await req.json().catch(() => ({}));
    if (!release_id) return json({ success: false, error: "release_id required" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (!staff_id) return json({ success: false, error: "staff_id required" }, 401);
    const { data: staff } = await sb.from("staff_users").select("id, is_active").eq("id", staff_id).maybeSingle();
    if (!staff || staff.is_active === false) return json({ success: false, error: "not authorised" }, 401);

    const { data: rel } = await sb
      .from("roster_evidence_releases")
      .select("id, locker_path, original_filename, file_mime")
      .eq("id", release_id).maybeSingle();
    if (!rel) return json({ success: false, error: "release_not_found" }, 404);

    const { data: signed, error } = await sb.storage
      .from(LOCKER).createSignedUrl(rel.locker_path, TTL_SECONDS, { download: rel.original_filename ?? undefined });
    if (error || !signed?.signedUrl) return json({ success: false, error: error?.message || "file_not_found" }, 404);

    return json({
      success: true,
      signed_url: signed.signedUrl,
      file_name: rel.original_filename ?? null,
      file_mime: rel.file_mime ?? null,
    });
  } catch (err) {
    console.error("admin-download-released-evidence error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
