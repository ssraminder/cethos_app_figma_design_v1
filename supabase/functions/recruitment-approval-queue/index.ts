// recruitment-approval-queue — live read of the admin "Recruitment Approval
// Queue" report. Staff-gated (requireStaff). Reads the cvp_approval_queue view
// (which is NOT granted to authenticated) via the service role, splits into
// ready / needInfo buckets, and returns them with counts. Always current — the
// view is computed at query time from the ISO 17100 evidence view.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireStaff } from "../_shared/require-staff.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

interface Row {
  id: string;
  application_number: string;
  full_name: string | null;
  country: string | null;
  status: string | null;
  target_langs: string | null;
  clinical: boolean;
  has_nda: boolean;
  approval_route: string | null;
  bucket: string;
  is_ref5: boolean | null;
  ref_documented_years: number | null;
  refs_received: number | null;
  real_passed_combos: number | null;
  has_verified_degree_doc: boolean | null;
  degree_doc: { title?: string | null; type?: string | null; confidence?: string | null; storage_path?: string | null; verified?: boolean | null } | null;
  has_translation_degree: boolean | null;
  has_other_degree: boolean | null;
  has_experience_doc: boolean | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const auth = await requireStaff(req);
    if (!auth.ok) return json({ success: false, error: auth.error }, auth.status);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Read via the SECURITY DEFINER function (runs as owner) so the view chain
    // into qms.competence_evidence is permitted — service_role cannot read that
    // table directly. Returns all cvp_approval_queue columns for ready+need_info.
    const { data, error } = await sb.rpc("get_approval_queue");
    if (error) return json({ success: false, error: error.message }, 500);

    const rows = (data ?? []) as Row[];
    const ready = rows
      .filter((r) => r.bucket === "ready")
      .sort((a, b) =>
        Number(b.clinical) - Number(a.clinical) ||
        Number(Boolean(b.is_ref5)) - Number(Boolean(a.is_ref5)) ||
        (b.ref_documented_years ?? 0) - (a.ref_documented_years ?? 0) ||
        a.application_number.localeCompare(b.application_number)
      );
    const needInfo = rows
      .filter((r) => r.bucket === "need_info")
      .sort((a, b) =>
        Number(b.clinical) - Number(a.clinical) ||
        (b.real_passed_combos ?? 0) - (a.real_passed_combos ?? 0) ||
        a.application_number.localeCompare(b.application_number)
      );

    return json({
      success: true,
      generatedAt: new Date().toISOString(),
      counts: {
        ready: ready.length,
        needInfo: needInfo.length,
        readyCoa: ready.filter((r) => r.clinical).length,
        readyNoNda: ready.filter((r) => !r.has_nda).length,
        needInfoCoa: needInfo.filter((r) => r.clinical).length,
        routeA: ready.filter((r) => r.approval_route === "Degree — translation (route a)").length,
        routeB: ready.filter((r) => r.approval_route === "Degree — other field (route b · +2yr exp)").length,
      },
      ready,
      needInfo,
    });
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
