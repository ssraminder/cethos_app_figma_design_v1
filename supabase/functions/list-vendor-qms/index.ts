// list-vendor-qms — reads a vendor's qms.role_qualifications + nda_agreements
// for the admin VendorQmsTab.
//
// 2026-06-12 audit fix: the previous version used a supabase-js client scoped
// with { db: { schema: 'qms' } }, which PostgREST rejects ("Invalid schema:
// qms") because the qms schema is not in the exposed-schemas list — service
// role included. All reads now go through the public SECURITY DEFINER RPC
// qms_list_vendor_qualifications, which also reports the latest portal NDA
// signature (vendor_nda_signatures) so the tab stops claiming "No NDA" for
// vendors who signed through the agreements system.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(d: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { vendor_id } = await req.json();
    if (!vendor_id) return json({ success: false, error: "vendor_id required" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await sb.rpc("qms_list_vendor_qualifications", { p_vendor_id: vendor_id });
    if (error) return json({ success: false, error: error.message }, 400);

    return json({
      success: true,
      qualifications: data?.qualifications ?? [],
      unlinked_evidence: data?.unlinked_evidence ?? [],
      ndas: data?.ndas ?? [],
      portal_nda_signed_at: data?.portal_nda_signed_at ?? null,
    });
  } catch (err: unknown) {
    console.error("list-vendor-qms error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
