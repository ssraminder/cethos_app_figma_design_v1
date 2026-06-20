// cvp-applicant-portal-invite
// Bulk "your applicant portal is ready" invitation to in-flight applicants.
// Prompts them to log in (existing vendor portal + OTP), sign their NDA, and
// complete any pending step (test, requested info) — to drive progression of
// the fresh ProZ cohort. Sends via Brevo directly + self-logs to
// cvp_outbound_messages (message_id) + dedups against a prior invite.
//
// Body: { action:"preview"|"send", staff_id, limit?, dedup_days? }

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

// Applicants still in the funnel (not terminal).
const IN_FLIGHT = ["submitted", "prescreening", "prescreened", "staff_review", "info_requested",
  "test_sent", "test_in_progress", "references_requested", "references_in_progress"];

function buildEmail(fullName: string): { subject: string; html: string } {
  const fn = esc(firstName(fullName));
  const subject = "Your Cethos applicant portal is ready — log in to continue";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2937;line-height:1.55;max-width:560px;">
<p style="color:#64748b;font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin:0 0 8px;">Cethos linguist application</p>
<p style="margin:0 0 14px;">Hi ${fn},</p>
<p style="margin:0 0 14px;">Thanks again for applying to Cethos. Your applicant portal is now ready — you can <strong>log in to track your application, sign your NDA, and complete any pending step</strong> (such as your assessment or any information we've requested).</p>
<p style="margin:0 0 14px;"><a href="https://vendor.cethos.com" style="color:#0F9DA0;font-weight:600;">Log in to your portal →</a></p>
<p style="margin:0 0 14px;">Use this email address to sign in — you'll receive a one-time code by email or SMS. Signing your NDA early helps us move your application forward quickly.</p>
<p style="margin:0 0 4px;">Thank you,</p>
<p style="margin:0;">The Cethos Linguist Team</p>
</div>`;
  return { subject, html };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: { action?: string; staff_id?: string; limit?: number; dedup_days?: number };
  try { body = await req.json(); } catch { return json({ success: false, error: "invalid_json" }, 400); }

  const action = body.action === "send" ? "send" : "preview";
  const staffId = String(body.staff_id ?? "");
  const limit = Math.min(Math.max(1, Number(body.limit ?? 25)), 500);
  const dedupDays = Math.min(Math.max(0, Number(body.dedup_days ?? 30)), 90);
  if (!staffId) return json({ success: false, error: "staff_id_required" }, 400);

  const { data: staff } = await supabase.from("staff_users").select("id, is_active").eq("id", staffId).maybeSingle();
  if (!staff || (staff as { is_active: boolean }).is_active === false) {
    return json({ success: false, error: "invalid_or_inactive_staff" }, 401);
  }

  const { data: raw } = await supabase
    .from("cvp_applications")
    .select("id, full_name, email, status")
    .in("status", IN_FLIGHT)
    .order("created_at", { ascending: true })
    .limit(900);

  const cutoffIso = dedupDays > 0 ? new Date(Date.now() - dedupDays * 86400000).toISOString() : null;
  const eligible: Array<Record<string, string>> = [];
  for (const a of (raw ?? []) as Array<Record<string, string>>) {
    if (eligible.length >= limit) break;
    if (!a.email) continue;
    if (cutoffIso) {
      const { count } = await supabase.from("cvp_outbound_messages")
        .select("id", { count: "exact", head: true })
        .eq("application_id", a.id).ilike("template_tag", "applicant_portal_invite%").gte("sent_at", cutoffIso);
      if (count) continue;
    }
    eligible.push(a);
  }

  if (action === "preview") {
    const sample = buildEmail("Jane Doe");
    return json({ success: true, data: { action, count: eligible.length, sample_subject: sample.subject, sample_html: sample.html } });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const a of eligible) {
    const mail = buildEmail(a.full_name);
    try {
      const ok = await sendBrevoRawEmail({ to: [{ email: a.email, name: a.full_name ?? a.email }], subject: mail.subject, htmlContent: mail.html });
      if (ok) {
        await supabase.from("cvp_outbound_messages").insert({
          message_id: `applicant-portal-invite:${a.id}:${Date.now()}`,
          application_id: a.id, recipient_email: a.email, subject: mail.subject, body_html: mail.html,
          template_tag: "applicant_portal_invite", sent_by_staff_id: staffId, sent_at: new Date().toISOString(),
        });
      }
      results.push({ application_id: a.id, ok, error: ok ? null : "brevo_send_failed" });
    } catch (e) {
      results.push({ application_id: a.id, ok: false, error: String(e) });
    }
    await sleep(150);
  }
  return json({ success: true, data: { action, sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length } });
});
