// admin-record-qualification — staff records a vendor's QMS qualification (R14).
// Wraps qms.record_qualification SQL function with staff-session resolution +
// audit-friendly response shape. Used from the admin QMS tab on the vendor
// profile.
//
// Body:
//   {
//     vendor_id,
//     role_code,                 // translator / reviser / post_editor / interpreter
//     competence_basis_code,
//     evidence: { type_code, title, issuing_organization?, issued_date?, expiry_date?, notes? },
//     nda?:     { signed_date, template_version? }   // only required if vendor has no active NDA
//     language_pairs: [{ source, target, direction? }, ...]   // ISO codes / names
//     competence_basis_notes?
//   }

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const {
      vendor_id,
      role_code,
      competence_basis_code,
      evidence,
      nda,
      language_pairs,
      competence_basis_notes,
      staff_id,
    } = body ?? {};

    if (!vendor_id || !role_code || !competence_basis_code || !evidence?.type_code || !evidence?.title) {
      return json({ success: false, error: "Missing required field (vendor_id, role_code, competence_basis_code, evidence.type_code, evidence.title)" }, 400);
    }
    if (!Array.isArray(language_pairs) || language_pairs.length === 0) {
      return json({ success: false, error: "At least one language pair is required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve auth.users id to satisfy the trigger's auth.uid() requirement.
    // We accept staff_id from the body (resolved by the admin client) and look
    // up the linked auth user via staff_users.auth_user_id.
    let acting_user_id: string | null = null;
    if (staff_id) {
      const { data: staffRow } = await supabase
        .from("staff_users")
        .select("auth_user_id, full_name, email")
        .eq("id", staff_id)
        .maybeSingle();
      acting_user_id = staffRow?.auth_user_id ?? null;
    }
    if (!acting_user_id) {
      return json({ success: false, error: "Could not resolve acting staff user (staff_id missing or not linked to an auth user)." }, 401);
    }

    // Scoped client for qms schema RPCs (record_qualification lives in qms).
    const qmsClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "qms" } },
    );

    const { data: result, error } = await qmsClient.rpc("record_qualification", {
      p_vendor_id: vendor_id,
      p_role_code: role_code,
      p_competence_basis_code: competence_basis_code,
      p_evidence_type_code: evidence.type_code,
      p_evidence_title: evidence.title,
      p_evidence_org: evidence.issuing_organization ?? null,
      p_evidence_issued_date: evidence.issued_date ?? null,
      p_evidence_expiry_date: evidence.expiry_date ?? null,
      p_evidence_notes: evidence.notes ?? null,
      p_nda_signed_date: nda?.signed_date ?? null,
      p_nda_template_version: nda?.template_version ?? "cethos-v1",
      p_language_pairs: language_pairs,
      p_competence_basis_notes: competence_basis_notes ?? null,
      p_acting_user_id: acting_user_id,
    });

    if (error) {
      return json({ success: false, error: error.message, hint: error.hint }, 400);
    }

    return json({ success: true, role_qualification_id: result });
  } catch (err: any) {
    console.error("admin-record-qualification error:", err);
    return json({ success: false, error: err?.message ?? String(err) }, 500);
  }
});
