// ============================================================================
// cvp-provisional-onboard-batch
//
// Bulk PROVISIONAL onboarding of in-progress recruitment applicants who have
// already passed competence (Group 1: references-stage / test_in_progress with
// at least one approved test/quiz combination, not yet a vendor).
//
// For each application it:
//   1. calls cvp-approve-application (internalAuto + skipWelcomeEmail) — creates
//      the provisional vendor, cvp_translator, QMS role_qualification +
//      competence_evidence, vendor profile rows, password-setup token. No
//      "you're approved" welcome email is sent.
//   2. (the recruitment_approved=false hold + the document request are applied
//      in a follow-up step by the operator, once this step is validated.)
//
// Auth: trusted internal call — requires the service-role key as Bearer. The
// key is read from this function's own env, never handled client-side.
//
// Body: {
//   action: "preview" | "run",   // preview = list only, no writes
//   staff_id: string,            // accountable staff (must be active)
//   limit?: number,              // cap apps processed (default 5, max 200)
//   application_ids?: string[],  // optional explicit list (overrides the query)
// }
// ============================================================================

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

const IN_PROGRESS = ["references_requested", "references_in_progress", "test_in_progress"];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: { action?: string; staff_id?: string; limit?: number; application_ids?: string[] };
  try { body = await req.json(); } catch { return json({ success: false, error: "invalid_json" }, 400); }

  const action = body.action === "run" ? "run" : "preview";
  const staffId = String(body.staff_id ?? "");
  const limit = Math.min(Math.max(1, Number(body.limit ?? 5)), 200);
  if (!staffId) return json({ success: false, error: "staff_id_required" }, 400);

  const { data: staff } = await supabase.from("staff_users").select("id, is_active").eq("id", staffId).maybeSingle();
  if (!staff || (staff as { is_active: boolean }).is_active === false) {
    return json({ success: false, error: "invalid_or_inactive_staff" }, 401);
  }

  // ── Resolve the candidate set ──────────────────────────────────────────
  let apps: Array<{ id: string; application_number: string; full_name: string; email: string }> = [];
  if (Array.isArray(body.application_ids) && body.application_ids.length) {
    const { data } = await supabase
      .from("cvp_applications")
      .select("id, application_number, full_name, email")
      .in("id", body.application_ids.slice(0, 200));
    apps = (data ?? []) as typeof apps;
  } else {
    // competence-proven, in-progress, oldest first
    const { data: raw } = await supabase
      .from("cvp_applications")
      .select("id, application_number, full_name, email, status")
      .in("status", IN_PROGRESS)
      .order("created_at", { ascending: true })
      .limit(800);
    const candidates: typeof apps = [];
    for (const a of (raw ?? []) as Array<Record<string, string>>) {
      if (candidates.length >= limit) break;
      // must have an approved combo
      const { count: passed } = await supabase
        .from("cvp_test_combinations")
        .select("id", { count: "exact", head: true })
        .eq("application_id", a.id).eq("status", "approved");
      if (!passed) continue;
      // must not already be a vendor (by email)
      const { count: isVendor } = await supabase
        .from("vendors").select("id", { count: "exact", head: true }).ilike("email", a.email);
      if (isVendor) continue;
      candidates.push({ id: a.id, application_number: a.application_number, full_name: a.full_name, email: a.email });
    }
    apps = candidates;
  }

  if (action === "preview") {
    return json({ success: true, data: { action, count: apps.length, apps } });
  }

  // ── Run: provisionally onboard each (no welcome email) ──────────────────
  const results: Array<Record<string, unknown>> = [];
  for (const a of apps) {
    try {
      const resp = await fetch(`${url}/functions/v1/cvp-approve-application`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          applicationId: a.id,
          internalAuto: true,
          actingStaffId: staffId,
          skipWelcomeEmail: true,
          staffNotes: "Provisional onboarding from in-progress recruitment queue (competence proven via internal test/quiz). Held for QMS document verification.",
        }),
      });
      const out = await resp.json().catch(() => ({}));
      results.push({
        application_number: a.application_number,
        full_name: a.full_name,
        ok: resp.ok && out?.success !== false,
        vendor_id: out?.data?.vendorId ?? null,
        translator_id: out?.data?.translatorId ?? null,
        idempotent: out?.idempotent ?? false,
        error: (resp.ok && out?.success !== false) ? null : (out?.error ?? `http ${resp.status}`),
      });
    } catch (e) {
      results.push({ application_number: a.application_number, full_name: a.full_name, ok: false, error: String(e) });
    }
  }

  const onboarded = results.filter((r) => r.ok).length;
  return json({ success: true, data: { action, processed: results.length, onboarded, results } });
});
