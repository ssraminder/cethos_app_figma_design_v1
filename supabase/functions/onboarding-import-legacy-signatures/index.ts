// ============================================================================
// onboarding-import-legacy-signatures
//
// Back-enters onboarding signatures collected via the earlier Cethos onboarding
// Google Form. Recorded HONESTLY: each is marked as a legacy form import with
// clear provenance (verification_log.method = 'legacy_google_form'), preserving
// the form's IP / timestamp / device. The signed_html_snapshot is a legacy
// SIGNATURE RECORD that states what it is and does NOT reproduce the current
// package's later §11 supersession clause as something the contractor reviewed.
// Idempotent: skips any vendor that already has a current onboarding signature.
//
// POST /functions/v1/onboarding-import-legacy-signatures
// Body: { dry_run?: boolean, rows: [{ reference_code, signed_full_name, signer_ip, device, signed_at }] }
// Deploy with --no-verify-jwt.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const GATE_WAIVER_UNTIL = "2099-12-31T00:00:00Z";

function json(b: Record<string, unknown>, s = 200): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}
function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const DOC_LIST =
  "Independent Contractor Services Agreement; Confidentiality &amp; Non-Disclosure Agreement; Data Security &amp; " +
  "Acceptable-Use Attestation; Conflict of Interest Declaration; Quality, SOP &amp; Data-Protection Training " +
  "Acknowledgement; Professional Code of Conduct Acknowledgement; Linguist Qualifications &amp; Working-Languages Declaration";

function legacySnapshot(name: string, code: string, ip: string, device: string, signedAt: string): string {
  return `<h2>Onboarding &amp; Compliance Package - signature record (legacy form import)</h2>
<p><em>This is an imported signature record from the Cethos onboarding form. It is not a portal clickwrap capture and was not independently verified by the portal.</em></p>
<p><strong>${esc(name)}</strong> (reference ${esc(code)}) electronically acknowledged and signed the Cethos Onboarding &amp; Compliance Package via the Cethos onboarding form on ${esc(signedAt)}.</p>
<p><strong>Documents presented and accepted:</strong> ${DOC_LIST}.</p>
<p><strong>Signature metadata as captured by the form:</strong> IP ${esc(ip || "-")} &middot; device ${esc(device || "-")} &middot; timestamp ${esc(signedAt)}.</p>
<p>The form presented these documents as in effect on the signing date. The current package on file adds a supersession clause (section 11) on 2026-06-26, which was provided to the contractor separately for online signature. This record reflects provenance honestly and does not assert that the contractor reviewed the later section 11 amendment.</p>
<p><em>Imported from the staff-maintained onboarding form export on 2026-06-26.</em></p>`;
}

interface InRow { reference_code?: string; signed_full_name?: string; signer_ip?: string; device?: string; signed_at?: string }

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  try {
    let body: { dry_run?: boolean; rows?: InRow[] } = {};
    try { body = await req.json(); } catch { /* */ }
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) return json({ success: false, error: "rows[] required" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const results: Record<string, unknown>[] = [];
    let inserted = 0, skipped = 0;

    for (const r of rows) {
      const code = (r.reference_code ?? "").trim();
      const detail: Record<string, unknown> = { reference_code: code, signed_at: r.signed_at, signer_ip: r.signer_ip, device: r.device };
      if (!code || !r.signed_full_name || !r.signed_at) { detail.action = "skip_invalid_row"; results.push(detail); skipped++; continue; }

      const { data: pkg } = await sb.from("vendor_onboarding_packages")
        .select("id, vendor_id, reference_code, contractor_name, contractor_email")
        .eq("reference_code", code).eq("is_current", true).maybeSingle();
      if (!pkg) { detail.action = "skip_unknown_code"; results.push(detail); skipped++; continue; }

      detail.vendor_id = pkg.vendor_id; detail.package_id = pkg.id; detail.signed_email = pkg.contractor_email; detail.signed_full_name = r.signed_full_name;

      const { data: existing } = await sb.from("vendor_nda_signatures")
        .select("id").eq("vendor_id", pkg.vendor_id).eq("is_current", true).eq("agreement_type", "onboarding").maybeSingle();
      if (existing) { detail.action = "skip_already_signed"; detail.existing_signature_row_id = existing.id; results.push(detail); skipped++; continue; }

      const snapshot = legacySnapshot(pkg.contractor_name ?? "", pkg.reference_code ?? "", r.signer_ip ?? "", r.device ?? "", r.signed_at ?? "");
      detail.snapshot_len = snapshot.length;
      const verificationLog = {
        method: "legacy_google_form",
        source: "imported from staff-provided onboarding form export (2026-06-26)",
        device_label: r.device ?? null,
        note: "Signature collected via the Cethos onboarding Google Form; IP, timestamp and device preserved as captured. Snapshot is a legacy signature record (the form presented the 7 onboarding documents in effect at the time). The section 11 supersession clause was added 2026-06-26 and sent separately for online signature; this record does not assert the contractor reviewed it.",
      };

      if (body.dry_run) { detail.action = "would_insert"; results.push(detail); continue; }

      const { data: ins, error: insErr } = await sb.from("vendor_nda_signatures").insert({
        vendor_id: pkg.vendor_id,
        agreement_type: "onboarding",
        onboarding_package_id: pkg.id,
        signed_full_name: r.signed_full_name,
        signed_email: pkg.contractor_email,
        signed_at: r.signed_at,
        signer_ip: r.signer_ip ?? null,
        signer_user_agent: r.device ?? null,
        signed_html_snapshot: snapshot,
        is_current: true,
        verification_log: verificationLog,
      }).select("id").single();
      if (insErr) { detail.action = "error"; detail.error = insErr.message; results.push(detail); skipped++; continue; }

      const { error: vErr } = await sb.from("vendors").update({
        onboarding_signed_at: r.signed_at,
        nda_waived_until: GATE_WAIVER_UNTIL,
      }).eq("id", pkg.vendor_id);
      if (vErr) console.error("vendors update failed", pkg.vendor_id, vErr.message);

      detail.action = "inserted"; detail.signature_row_id = ins?.id; results.push(detail); inserted++;
    }

    return json({ success: true, data: { dry_run: !!body.dry_run, total: rows.length, inserted, skipped, results } });
  } catch (e) {
    console.error("onboarding-import-legacy-signatures error:", e);
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
