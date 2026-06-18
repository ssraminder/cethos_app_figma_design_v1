// qms-evidence-download — admin mints a short-lived signed URL for a QMS
// competence-evidence file so staff can view/verify the document a vendor
// uploaded. The evidence buckets are private (service-role only); the stored
// path doesn't record which bucket, so we try the candidates in order.
//
// Body: { evidence_id: uuid, staff_id?: uuid }
// Returns: { success, signed_url, file_name, file_mime, bucket }

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(d: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Evidence files can live in any of these private buckets depending on how the
// row was created (AI-screen / vendor cert upload, admin manual upload, or CV).
const CANDIDATE_BUCKETS = ["qms-evidence", "vendor-certifications", "vendor-cvs"];
const TTL_SECONDS = 300;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { evidence_id, staff_id } = await req.json().catch(() => ({}));
    if (!evidence_id) return json({ success: false, error: "evidence_id required" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Require a real staff user (defence — these are private credential docs).
    if (!staff_id) return json({ success: false, error: "staff_id required" }, 401);
    const { data: staff } = await sb.from("staff_users").select("id").eq("id", staff_id).maybeSingle();
    if (!staff) return json({ success: false, error: "not authorised" }, 401);

    const { data: ev, error } = await sb.rpc("qms_get_evidence_file", { p_evidence_id: evidence_id });
    if (error) return json({ success: false, error: error.message }, 400);
    const row = ev as { storage_path?: string; file_name?: string; file_mime?: string; title?: string } | null;
    if (!row) return json({ success: false, error: "evidence_not_found" }, 404);
    if (!row.storage_path) return json({ success: false, error: "no_file_on_record" }, 404);

    for (const bucket of CANDIDATE_BUCKETS) {
      const { data: signed } = await sb.storage.from(bucket).createSignedUrl(row.storage_path, TTL_SECONDS, {
        download: row.file_name ?? undefined,
      });
      if (signed?.signedUrl) {
        return json({
          success: true,
          signed_url: signed.signedUrl,
          file_name: row.file_name ?? null,
          file_mime: row.file_mime ?? null,
          bucket,
        });
      }
    }
    return json({ success: false, error: "file_not_found_in_storage", storage_path: row.storage_path }, 404);
  } catch (err) {
    console.error("qms-evidence-download error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
