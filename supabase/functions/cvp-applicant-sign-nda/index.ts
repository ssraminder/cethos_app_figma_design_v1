// ============================================================================
// cvp-applicant-sign-nda  (2026-06-22)
//
// Applicant-facing, token-based NDA clickwrap. Lets an applicant accept the
// active confidentiality agreement at the moment they open their assessment
// (the NDA gate in cvp-get-quiz / cvp-get-test). Keyed off the quiz/test token
// they already hold — no login required. Writes an auditable e-signature row to
// vendor_nda_signatures (name, email, IP, user-agent, template version, full
// HTML snapshot of what they agreed to), supersedes any prior current NDA, and
// links the applicant's vendor row when one exists.
//
// POST { token, kind: "quiz" | "test", fullName }
// Returns { success, data: { signatureId } } | { success:false, error }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getActiveNdaTemplate } from "../_shared/nda-gate.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: { token?: string; kind?: "quiz" | "test"; fullName?: string };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }
  const token = (body.token ?? "").trim();
  const kind = body.kind === "test" ? "test" : body.kind === "quiz" ? "quiz" : null;
  const fullName = (body.fullName ?? "").trim();
  if (!token || !kind) {
    return json({ success: false, error: "token and kind ('quiz'|'test') are required" }, 400);
  }
  if (fullName.length < 2) {
    return json({ success: false, error: "Please type your full legal name to sign." }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // 1. Resolve the application from the assessment token.
  const table = kind === "quiz" ? "cvp_quiz_submissions" : "cvp_test_submissions";
  const { data: subData } = await supabase
    .from(table)
    .select("id, application_id")
    .eq("token", token)
    .maybeSingle();
  const applicationId = (subData as { application_id?: string } | null)?.application_id;
  if (!applicationId) {
    return json({ success: false, error: "Invalid or expired assessment link." }, 404);
  }

  const { data: appData } = await supabase
    .from("cvp_applications")
    .select("email, full_name")
    .eq("id", applicationId)
    .maybeSingle();
  const app = appData as { email: string; full_name: string } | null;
  if (!app) {
    return json({ success: false, error: "Application not found." }, 404);
  }

  // 2. Active NDA template (the exact text being agreed to).
  const tmpl = await getActiveNdaTemplate(supabase);
  if (!tmpl) {
    return json({ success: false, error: "No active NDA template is configured." }, 500);
  }

  // 3. Optional vendor link (applicants get a vendor row early).
  let vendorId: string | null = null;
  const emailLc = (app.email ?? "").trim().toLowerCase();
  if (emailLc) {
    const { data: v } = await supabase.from("vendors").select("id").ilike("email", emailLc).maybeSingle();
    vendorId = (v as { id?: string } | null)?.id ?? null;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const xff = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ip = req.headers.get("cf-connecting-ip") ?? (xff || null);
  const userAgent = req.headers.get("user-agent") ?? null;

  // 3b. One-time / idempotent. Signing the NDA is a once-ever action. If a current
  // NDA already exists for this applicant (by application or by their vendor row),
  // do NOT create another — return the existing one. This makes the endpoint safe
  // against double-clicks, retries and races, and guarantees a single live NDA.
  {
    let existing: { id: string } | null = null;
    const { data: byApp } = await supabase
      .from("vendor_nda_signatures")
      .select("id")
      .eq("application_id", applicationId)
      .eq("agreement_type", "nda")
      .eq("is_current", true)
      .limit(1)
      .maybeSingle();
    existing = (byApp as { id: string } | null) ?? null;
    if (!existing && vendorId) {
      const { data: byVendor } = await supabase
        .from("vendor_nda_signatures")
        .select("id")
        .eq("vendor_id", vendorId)
        .eq("agreement_type", "nda")
        .eq("is_current", true)
        .limit(1)
        .maybeSingle();
      existing = (byVendor as { id: string } | null) ?? null;
    }
    if (existing) {
      return json({ success: true, data: { signatureId: existing.id, alreadySigned: true } });
    }
  }

  // 4. Supersede any prior (non-current) NDA bookkeeping for this applicant (by
  // application + vendor) so is_current stays single. Append-friendly: prior rows
  // are retained. (No current row exists here — the idempotency check above
  // returned early if one did.)
  const supersede = {
    is_current: false,
    superseded_at: nowIso,
    superseded_reason: "Re-signed at assessment access",
  };
  await supabase
    .from("vendor_nda_signatures")
    .update(supersede)
    .eq("application_id", applicationId)
    .eq("agreement_type", "nda")
    .eq("is_current", true);
  if (vendorId) {
    await supabase
      .from("vendor_nda_signatures")
      .update(supersede)
      .eq("vendor_id", vendorId)
      .eq("agreement_type", "nda")
      .eq("is_current", true);
  }

  // 5. Insert the new signature.
  const { data: inserted, error: insErr } = await supabase
    .from("vendor_nda_signatures")
    .insert({
      application_id: applicationId,
      vendor_id: vendorId,
      nda_template_id: tmpl.id,
      agreement_type: "nda",
      signed_full_name: fullName,
      signed_email: app.email,
      signer_ip: ip,
      signer_user_agent: userAgent,
      signed_html_snapshot: tmpl.body_html,
      signed_at: nowIso,
      is_current: true,
      verification_log: {
        method: "clickwrap",
        source: "assessment_access",
        kind,
        template_version: tmpl.version_label,
        signed_at: nowIso,
      },
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    console.error("cvp-applicant-sign-nda insert failed:", insErr);
    return json({ success: false, error: "Failed to record your acceptance. Please try again." }, 500);
  }

  return json({ success: true, data: { signatureId: (inserted as { id: string }).id } });
});
