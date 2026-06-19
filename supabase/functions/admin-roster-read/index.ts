// admin-roster-read — staff view of an agency's blinded roster.
//
// Returns ONLY the safe projection (handle, competence label, language pairs,
// domains, roles, eligibility flag). Real names, CVs and evidence are never
// returned — the blinded contract. Also returns evidence demands + the
// released-evidence locker for this agency.
//
// Body: { vendor_id, staff_id }. Staff-gated (staff_users, is_active).

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (d: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { vendor_id, staff_id } = await req.json().catch(() => ({}));
    if (!vendor_id) return json({ success: false, error: "vendor_id required" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (!staff_id) return json({ success: false, error: "staff_id required" }, 401);
    const { data: staff } = await sb.from("staff_users").select("id, is_active").eq("id", staff_id).maybeSingle();
    if (!staff || staff.is_active === false) return json({ success: false, error: "not authorised" }, 401);

    // Safe view — no real_name / cv_path.
    const { data: linguists, error: lErr } = await sb
      .from("vendor_roster_linguists_safe")
      .select("id, handle, competence_basis_code, competence_label, is_active, iso_attested, is_eligible, created_at")
      .eq("vendor_id", vendor_id)
      .order("handle");
    if (lErr) return json({ success: false, error: lErr.message }, 500);

    const ids = (linguists ?? []).map((l) => l.id);
    const [pairsRes, domainsRes, rolesRes, refRes] = await Promise.all([
      ids.length ? sb.from("vendor_roster_linguist_language_pairs").select("roster_linguist_id, source_language, target_language").in("roster_linguist_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? sb.from("vendor_roster_linguist_domains").select("roster_linguist_id, subject_matter_id").in("roster_linguist_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? sb.from("vendor_roster_linguist_roles").select("roster_linguist_id, role_type_code").in("roster_linguist_id", ids) : Promise.resolve({ data: [] }),
      sb.rpc("roster_reference_data"),
    ]);
    const pairs = (pairsRes.data ?? []) as any[];
    const domains = (domainsRes.data ?? []) as any[];
    const roles = (rolesRes.data ?? []) as any[];
    const subjectMatters = ((refRes.data as any)?.subject_matters ?? []) as Array<{ id: string; name: string }>;
    const smName = (id: string) => subjectMatters.find((s) => s.id === id)?.name ?? null;

    const roster = (linguists ?? []).map((l) => ({
      id: l.id,
      handle: l.handle,
      competence_label: l.competence_label,
      is_active: l.is_active,
      iso_attested: l.iso_attested,
      is_eligible: l.is_eligible,
      language_pairs: pairs.filter((p) => p.roster_linguist_id === l.id)
        .map((p) => ({ source_language: p.source_language, target_language: p.target_language })),
      domains: domains.filter((d) => d.roster_linguist_id === l.id).map((d) => smName(d.subject_matter_id)).filter(Boolean),
      roles: roles.filter((r) => r.roster_linguist_id === l.id).map((r) => r.role_type_code),
    }));

    // Demands + released-evidence locker
    const { data: demands } = await sb
      .from("roster_evidence_demands")
      .select("id, roster_linguist_id, order_id, step_id, reason, status, raised_at, released_at")
      .eq("vendor_id", vendor_id)
      .order("raised_at", { ascending: false });
    const { data: releases } = await sb
      .from("roster_evidence_releases")
      .select("id, demand_id, evidence_kind, original_filename, file_mime, file_size, released_at")
      .eq("vendor_id", vendor_id)
      .order("released_at", { ascending: false });

    const handleById = (id: string) => roster.find((r) => r.id === id)?.handle ?? null;
    const demandsOut = (demands ?? []).map((d) => ({ ...d, handle: handleById(d.roster_linguist_id) }));

    return json({ success: true, roster, demands: demandsOut, releases: releases ?? [] });
  } catch (err) {
    console.error("admin-roster-read error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
