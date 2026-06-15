// manage-staff-competence — documented competence records for STAFF
// (ISO 17100 §3.1.7 project managers, §3.1.6 in-house reviewers, and any
// in-house linguist functions). Staff are not vendors, so this is separate
// from qms.role_qualifications. Service-role only; the admin UI calls it.
//
// Actions:
//   list_all                            → every active staff member + their competence records
//   list      { staff_id }              → one staff member's records (incl. withdrawn)
//   record    { staff_id, function_code, basis_kind, basis_summary, ...
//               evidence_title?, evidence_storage_path?, acquired_on?,
//               iso_clause_reference?, re_review_due?, staff_id_acting }
//   withdraw  { id, staff_id_acting, reason }

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(d: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

const FUNCTION_CODES = ["project_manager", "reviewer", "translator", "reviser", "vendor_manager", "qms_admin"];
const BASIS_KINDS = ["formal_training", "higher_education", "on_the_job_training", "industry_experience", "professional_membership", "other"];
// Default ISO clause per function, used when the caller doesn't supply one.
const ISO_BY_FUNCTION: Record<string, string> = {
  project_manager: "ISO 17100:2015 §3.1.7",
  reviewer: "ISO 17100:2015 §3.1.6",
  translator: "ISO 17100:2015 §3.1.4",
  reviser: "ISO 17100:2015 §3.1.5",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json();
    const action = body?.action as string;

    if (action === "list_all") {
      const { data: staff, error: sErr } = await sb
        .from("staff_users")
        .select("id, full_name, email, role")
        .eq("is_active", true)
        .order("full_name");
      if (sErr) return json({ success: false, error: sErr.message }, 400);

      const { data: recs, error: rErr } = await sb
        .from("qms_staff_competence")
        .select("*")
        .eq("status", "active")
        .order("qualified_at", { ascending: false });
      if (rErr) return json({ success: false, error: rErr.message }, 400);

      const byStaff: Record<string, unknown[]> = {};
      for (const r of recs ?? []) {
        (byStaff[r.staff_id] ??= []).push(r);
      }
      return json({
        success: true,
        staff: (staff ?? []).map((s) => ({ ...s, competence: byStaff[s.id] ?? [] })),
      });
    }

    if (action === "list") {
      const { staff_id } = body;
      if (!staff_id) return json({ success: false, error: "staff_id required" }, 400);
      const { data, error } = await sb
        .from("qms_staff_competence")
        .select("*")
        .eq("staff_id", staff_id)
        .order("qualified_at", { ascending: false });
      if (error) return json({ success: false, error: error.message }, 400);
      return json({ success: true, records: data ?? [] });
    }

    if (action === "record") {
      const { staff_id, function_code, basis_kind, basis_summary, evidence_title, evidence_storage_path, acquired_on, iso_clause_reference, re_review_due, staff_id_acting } = body;
      if (!staff_id || !function_code || !basis_kind || !basis_summary?.trim() || !staff_id_acting) {
        return json({ success: false, error: "staff_id, function_code, basis_kind, basis_summary, staff_id_acting required" }, 400);
      }
      if (!FUNCTION_CODES.includes(function_code)) return json({ success: false, error: `invalid function_code` }, 400);
      if (!BASIS_KINDS.includes(basis_kind)) return json({ success: false, error: `invalid basis_kind` }, 400);

      const { data: actor } = await sb.from("staff_users").select("full_name").eq("id", staff_id_acting).maybeSingle();
      const { data, error } = await sb
        .from("qms_staff_competence")
        .insert({
          staff_id,
          function_code,
          basis_kind,
          basis_summary: basis_summary.trim(),
          evidence_title: evidence_title?.trim() || null,
          evidence_storage_path: evidence_storage_path || null,
          acquired_on: acquired_on || null,
          iso_clause_reference: iso_clause_reference || ISO_BY_FUNCTION[function_code] || null,
          re_review_due: re_review_due || null,
          qualified_by: staff_id_acting,
          qualified_by_name: actor?.full_name ?? null,
        })
        .select("*")
        .single();
      if (error) return json({ success: false, error: error.message }, 400);
      return json({ success: true, record: data });
    }

    if (action === "withdraw") {
      const { id, staff_id_acting, reason } = body;
      if (!id || !staff_id_acting) return json({ success: false, error: "id + staff_id_acting required" }, 400);
      const { data, error } = await sb
        .from("qms_staff_competence")
        .update({ status: "withdrawn", withdrawn_at: new Date().toISOString(), withdrawn_by: staff_id_acting, withdrawn_reason: reason?.trim() || null })
        .eq("id", id)
        .eq("status", "active")
        .select("*")
        .single();
      if (error) return json({ success: false, error: error.message }, 400);
      return json({ success: true, record: data });
    }

    return json({ success: false, error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
