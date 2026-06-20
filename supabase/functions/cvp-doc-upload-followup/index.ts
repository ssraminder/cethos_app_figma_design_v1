// cvp-doc-upload-followup
// Follow-up to applicants who received the OLD "reply with the documents
// attached" request emails (v17-request-more-info / document_request:*) before
// the portal-upload fix. Directs them to log in and upload under Profile >
// Supporting Documents (the ISO-preferred, traceable channel). Targets only
// in-flight applicants who have NOT already uploaded and have NOT already been
// nudged. Sends from recruitment@cethos.com via Brevo; logs to
// cvp_outbound_messages (template_tag 'upload_followup'). Body: { confirm:true }.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendBrevoRawEmail } from "../_shared/brevo.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: string) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const firstName = (f: string) => (f ?? "").trim().split(/\s+/)[0] || "there";

const SENDER = { email: "recruitment@cethos.com", name: "Cethos Recruitment Team" };
const IN_FLIGHT = ["submitted", "prescreening", "prescreened", "staff_review", "info_requested",
  "test_sent", "test_in_progress", "references_requested", "references_in_progress"];

function buildEmail(fullName: string): { subject: string; html: string } {
  const fn = esc(firstName(fullName));
  const subject = "An easier way to send your Cethos documents — upload in your portal";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2937;line-height:1.55;max-width:560px;">
<p style="margin:0 0 14px;">Hi ${fn},</p>
<p style="margin:0 0 14px;">A little while ago we asked you for some supporting documents to continue your Cethos application. We've since made this easier and more secure — instead of emailing them, you can now <strong>upload them directly in your applicant portal</strong>.</p>
<p style="margin:0 0 14px;">Log in and go to <strong>Profile &rsaquo; Supporting Documents</strong>:</p>
<p style="margin:0 0 16px;"><a href="https://vendor.cethos.com" style="display:inline-block;background:#0F9DA0;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:600;">Log in to upload your documents</a></p>
<p style="margin:0 0 14px;">Sign in with this email address and you'll receive a one-time code by email or SMS. Uploading keeps your documents secure and linked directly to your application, so we can review them faster.</p>
<p style="margin:0 0 14px;color:#475569;font-size:13px;">If you've already uploaded or sent your documents, thank you — no action needed. And if you just have a quick question, you can reply to this email.</p>
<p style="margin:0 0 4px;">Thank you,</p>
<p style="margin:0;">The Cethos Recruitment Team</p>
</div>`;
  return { subject, html };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: { confirm?: boolean; limit?: number };
  try { body = await req.json(); } catch { body = {}; }
  const limit = Math.min(Math.max(1, Number(body.limit ?? 500)), 500);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // 1. Emails that received the OLD reply-style request (v17 + document_request:*)
  const emailed = new Set<string>();
  for (const tag of ["v17-request-more-info"]) {
    const { data } = await supabase.from("cvp_outbound_messages")
      .select("recipient_email").eq("template_tag", tag).limit(5000);
    for (const r of (data ?? []) as Array<{ recipient_email: string }>) {
      if (r.recipient_email) emailed.add(r.recipient_email.toLowerCase());
    }
  }
  {
    const { data } = await supabase.from("cvp_outbound_messages")
      .select("recipient_email").ilike("template_tag", "document_request%").limit(5000);
    for (const r of (data ?? []) as Array<{ recipient_email: string }>) {
      if (r.recipient_email) emailed.add(r.recipient_email.toLowerCase());
    }
  }

  // 2. Applications already nudged with this follow-up (dedup).
  const nudged = new Set<string>();
  {
    const { data } = await supabase.from("cvp_outbound_messages")
      .select("application_id").eq("template_tag", "upload_followup").limit(5000);
    for (const r of (data ?? []) as Array<{ application_id: string | null }>) {
      if (r.application_id) nudged.add(r.application_id);
    }
  }

  // 3. Applicant emails that already uploaded a supporting doc (non-empty
  //    certifications array on their vendor record => uploaded via portal).
  const uploaders = new Set<string>();
  {
    const { data } = await supabase.from("vendors")
      .select("email, certifications").eq("status", "applicant").limit(5000);
    for (const v of (data ?? []) as Array<{ email: string; certifications: unknown }>) {
      if (v.email && Array.isArray(v.certifications) && v.certifications.length > 0) {
        uploaders.add(v.email.toLowerCase());
      }
    }
  }

  // 4. In-flight applications that were emailed, not nudged, not uploaders.
  const { data: apps } = await supabase.from("cvp_applications")
    .select("id, email, full_name, status").in("status", IN_FLIGHT)
    .order("created_at", { ascending: true }).limit(2000);

  const eligible: Array<{ id: string; email: string; full_name: string }> = [];
  for (const a of (apps ?? []) as Array<{ id: string; email: string; full_name: string }>) {
    if (eligible.length >= limit) break;
    const e = (a.email ?? "").toLowerCase();
    if (!e || !emailed.has(e)) continue;
    if (nudged.has(a.id)) continue;
    if (uploaders.has(e)) continue;
    eligible.push({ id: a.id, email: a.email, full_name: a.full_name });
  }

  if (!body.confirm) {
    const sample = buildEmail("Jane Doe");
    return json({
      success: true, action: "preview", sender: SENDER,
      cohort: eligible.length,
      sample_subject: sample.subject, sample_html: sample.html,
      sample_recipients: eligible.slice(0, 5).map((a) => a.email),
      note: "Pass { confirm: true } to send.",
    });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const a of eligible) {
    const mail = buildEmail(a.full_name);
    let ok = false;
    try {
      ok = await sendBrevoRawEmail({ to: [{ email: a.email, name: a.full_name ?? a.email }], subject: mail.subject, htmlContent: mail.html, sender: SENDER });
    } catch (e) {
      results.push({ id: a.id, ok: false, error: String(e) });
      continue;
    }
    if (ok) {
      try {
        await supabase.from("cvp_outbound_messages").insert({
          message_id: `upload-followup:${a.id}:${Date.now()}`,
          application_id: a.id, recipient_email: a.email, subject: mail.subject, body_html: mail.html,
          template_tag: "upload_followup", sent_at: new Date().toISOString(),
        });
      } catch (logErr) {
        console.error("audit log insert failed (non-fatal):", a.email, String(logErr));
      }
    }
    results.push({ id: a.id, ok, error: ok ? null : "brevo_send_failed" });
    await sleep(180);
  }

  return json({
    success: true, action: "send",
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });
});
