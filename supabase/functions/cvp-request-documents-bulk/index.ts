// ============================================================================
// cvp-request-documents-bulk
//
// Bulk applicant-facing documentation request for the in-progress recruitment
// cohort (doc-request-first re-engagement; no vendor creation). Per applicant
// it assembles a templated email and calls cvp-request-documents (reply-by-
// email, application-keyed). Applicants stay applicants; onboarding happens at
// the human final-approval step once they respond.
//
// Cohorts:
//   g1 = competence-proven, references-stage / test_in_progress (passed a
//        test/quiz) — ask for degree + proof of experience + (nudge) references.
//   g2 = no competence yet, test_sent / prescreened — ask for degree + proof of
//        experience (establishes the ISO 17100 §3.1.1 basis without a test).
//
// Dedup: skips applicants already sent a document_request in the last N days
// (cvp_outbound_messages.template_tag LIKE 'document_request%').
//
// Body: { action:"preview"|"send", group:"g1"|"g2", staff_id, limit?, dedup_days? }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendBrevoRawEmail } from "../_shared/brevo.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(b: Record<string, unknown>, s = 200): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}
function esc(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function firstName(full: string): string {
  return (full ?? "").trim().split(/\s+/)[0] || "there";
}

const G1_STATUSES = ["references_requested", "references_in_progress", "test_in_progress"];
const G2_STATUSES = ["test_sent", "prescreened"];

function buildEmail(group: string, fullName: string): { subject: string; html: string; docTypes: string[] } {
  const fn = esc(firstName(fullName));
  const docTypes = group === "g1"
    ? ["degree_or_diploma", "proof_of_experience", "references"]
    : ["degree_or_diploma", "proof_of_experience"];
  const items = group === "g1"
    ? [
        "A copy of your university degree or translation diploma",
        "Proof of professional translation experience (a reference/employment letter, contract, or detailed CV)",
        "Your two professional references, if you haven't sent them already",
      ]
    : [
        "A copy of your university degree or translation diploma",
        "Proof of professional translation experience (a reference/employment letter, contract, or detailed CV)",
      ];
  const intro = group === "g1"
    ? `Thank you for completing your Cethos translation assessment — you passed. To finalize your linguist file under our ISO 17100 quality process, we just need a couple of supporting documents:`
    : `Thank you for applying to Cethos. To continue your linguist application under our ISO 17100 quality process, we can qualify you on your credentials. Please send us:`;
  const subject = group === "g1"
    ? "Cethos — a couple of documents to finalize your linguist application"
    : "Cethos — documents to continue your linguist application";
  const li = items.map((i) => `<li style="margin:6px 0;">${esc(i)}</li>`).join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2937;line-height:1.55;max-width:560px;">
<p style="color:#64748b;font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin:0 0 8px;">ISO 17100 onboarding</p>
<p style="margin:0 0 14px;">Hi ${fn},</p>
<p style="margin:0 0 14px;">${esc(intro)}</p>
<ul style="margin:0 0 16px;padding-left:20px;">${li}</ul>
<p style="margin:0 0 14px;">The quickest way to send these is through your applicant portal — <strong>log in and upload them under Profile &rsaquo; Supporting Documents</strong>. Sign in with this email address and you'll receive a one-time code by email or SMS.</p>
<p style="margin:0 0 16px;"><a href="https://vendor.cethos.com" style="display:inline-block;background:#0F9DA0;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;">Log in to upload your documents</a></p>
<p style="margin:0 0 16px;color:#475569;font-size:13px;">Prefer email? You can also reply to this message with the documents attached and we'll continue your review.</p>
<p style="margin:0 0 4px;">Thank you,</p>
<p style="margin:0;">The Cethos Linguist Team</p>
</div>`;
  return { subject, html, docTypes };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: { action?: string; group?: string; staff_id?: string; limit?: number; dedup_days?: number };
  try { body = await req.json(); } catch { return json({ success: false, error: "invalid_json" }, 400); }

  const action = body.action === "send" ? "send" : "preview";
  const group = body.group === "g2" ? "g2" : "g1";
  const staffId = String(body.staff_id ?? "");
  const limit = Math.min(Math.max(1, Number(body.limit ?? 25)), 200);
  const dedupDays = Math.min(Math.max(0, Number(body.dedup_days ?? 14)), 90);
  if (!staffId) return json({ success: false, error: "staff_id_required" }, 400);

  const { data: staff } = await supabase.from("staff_users").select("id, is_active").eq("id", staffId).maybeSingle();
  if (!staff || (staff as { is_active: boolean }).is_active === false) {
    return json({ success: false, error: "invalid_or_inactive_staff" }, 401);
  }

  const statuses = group === "g1" ? G1_STATUSES : G2_STATUSES;
  const { data: raw } = await supabase
    .from("cvp_applications")
    .select("id, application_number, full_name, email, status")
    .in("status", statuses)
    .order("created_at", { ascending: true })
    .limit(800);

  const cutoffIso = dedupDays > 0 ? new Date(Date.now() - dedupDays * 86400000).toISOString() : null;

  // Skip applicants who already uploaded supporting documents — don't re-nag the
  // ones who responded. Their uploads live in the matched applicant vendor
  // account (vendors.certifications), surfaced by cvp_application_iso_evidence.
  const { data: uploadedRows } = await supabase
    .from("cvp_application_iso_evidence")
    .select("application_id")
    .gt("uploaded_docs_count", 0);
  const alreadyUploaded = new Set(
    (uploadedRows ?? []).map((r) => (r as { application_id: string }).application_id),
  );

  const eligible: Array<Record<string, string>> = [];
  for (const a of (raw ?? []) as Array<Record<string, string>>) {
    if (eligible.length >= limit) break;
    if (!a.email) continue;
    if (alreadyUploaded.has(a.id)) continue;
    // g1 requires a passed combo (competence proven); g2 must NOT have one
    const { count: passed } = await supabase
      .from("cvp_test_combinations").select("id", { count: "exact", head: true })
      .eq("application_id", a.id).eq("status", "approved");
    if (group === "g1" && !passed) continue;
    if (group === "g2" && passed) continue;
    // dedup: skip if a document_request already went out recently
    if (cutoffIso) {
      const { count: recent } = await supabase
        .from("cvp_outbound_messages").select("id", { count: "exact", head: true })
        .eq("application_id", a.id).ilike("template_tag", "document_request%").gte("sent_at", cutoffIso);
      if (recent) continue;
    }
    eligible.push(a);
  }

  if (action === "preview") {
    const sample = buildEmail(group, "Jane Doe");
    return json({ success: true, data: { action, group, count: eligible.length, sample_subject: sample.subject, sample_html: sample.html, apps: eligible.map((a) => ({ application_number: a.application_number, full_name: a.full_name, email: a.email })) } });
  }

  // Send via Brevo directly (avoids the per-function invocation rate limit hit
  // when looping cvp-request-documents) and write the audit row ourselves with a
  // message_id (cvp_outbound_messages.message_id is NOT NULL) so logging + dedup
  // are reliable. Throttle a little to stay friendly to Brevo.
  const results: Array<Record<string, unknown>> = [];
  for (const a of eligible) {
    const mail = buildEmail(group, a.full_name);
    try {
      const ok = await sendBrevoRawEmail({
        to: [{ email: a.email, name: a.full_name ?? a.email }],
        subject: mail.subject,
        htmlContent: mail.html,
      });
      if (ok) {
        const { error: logErr } = await supabase.from("cvp_outbound_messages").insert({
          message_id: `bulk-docreq-${group}:${a.id}:${Date.now()}`,
          application_id: a.id,
          recipient_email: a.email,
          subject: mail.subject,
          body_html: mail.html,
          template_tag: `document_request:${mail.docTypes.join(",")}`.slice(0, 255),
          sent_by_staff_id: staffId,
          sent_at: new Date().toISOString(),
        });
        if (logErr) console.error("outbound log insert failed for", a.application_number, logErr.message);
      }
      results.push({ application_number: a.application_number, ok, error: ok ? null : "brevo_send_failed" });
    } catch (e) {
      results.push({ application_number: a.application_number, ok: false, error: String(e) });
    }
    await sleep(150);
  }
  return json({ success: true, data: { action, group, sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results } });
});
