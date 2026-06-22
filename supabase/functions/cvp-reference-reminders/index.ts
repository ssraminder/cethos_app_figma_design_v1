// ============================================================================
// cvp-reference-reminders  (2026-06-22)
//
// Nudges stalled reference collection. Three cases:
//   A. Referee was sent the form but hasn't completed it  -> remind the REFEREE
//      (link to /reference-feedback/<token>).
//   B. Applicant gave referee details but they're still pending -> remind the
//      APPLICANT with the form link(s) so they can chase their referees.
//   C. Applicant never submitted referee contacts -> remind the APPLICANT
//      (link to /references/<request_token>).
//
// Cadence: reminders at 3, 7, 14 days from the original request, max 3 per item.
// Dedup + count via cvp_outbound_messages (message_id marker), so it's safe to
// run daily. Body: { confirm?: true, dry_run?: true, limit?: number }.
// Preview unless confirm:true.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendBrevoRawEmail } from "../_shared/brevo.ts";

const SENDER = { email: "recruitment@cethos.com", name: "Cethos Recruitment Team" };
const APP_URL = Deno.env.get("APP_URL") ?? "https://join.cethos.com";
const MILESTONES = [3, 7, 14];
const MAX_REMINDERS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: Record<string, unknown>, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const daysSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86400000;
/** milestones passed for an age = how many reminders SHOULD have gone out. */
const dueCount = (ageDays: number) => MILESTONES.filter((m) => ageDays >= m).length;

function wrap(title: string, bodyHtml: string, btnLabel: string, btnUrl: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;">
  <h2 style="color:#0F9DA0;font-size:18px;">${esc(title)}</h2>
  ${bodyHtml}
  <p style="margin:18px 0;"><a href="${btnUrl}" style="display:inline-block;background:#0F9DA0;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:600;">${esc(btnLabel)}</a></p>
  <p style="color:#6b7280;font-size:12px;">Cethos Recruitment · If you've already done this, please ignore this reminder.</p>
</div>`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: { confirm?: boolean; dry_run?: boolean; limit?: number } = {};
  try { body = await req.json(); } catch { /* cron may send empty */ }
  const send = body.confirm === true && body.dry_run !== true;
  const limit = Math.min(Math.max(1, Number(body.limit ?? 100)), 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Prior reminder counts per item, parsed from message_id markers.
  const counts = new Map<string, number>();
  {
    const { data } = await supabase.from("cvp_outbound_messages").select("message_id").like("message_id", "refrem-%").limit(20000);
    for (const r of data ?? []) {
      const mid = (r as { message_id: string }).message_id ?? "";
      const key = mid.split(":").slice(0, 2).join(":"); // refrem-<type>:<id>
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const priorCount = (type: string, id: string) => counts.get(`refrem-${type}:${id}`) ?? 0;
  const nowIso = new Date().toISOString();

  type Job = { type: "referee" | "chase" | "contacts"; id: string; to: string; toName: string; subject: string; html: string };
  const jobs: Job[] = [];

  // ---- A: referees who haven't completed the form ----
  const { data: pendingRefs } = await supabase
    .from("cvp_application_references")
    .select("id, application_id, reference_name, reference_email, feedback_token, status, created_at, feedback_token_expires_at")
    .eq("status", "requested")
    .gt("feedback_token_expires_at", nowIso);
  // applicant names for the pending refs
  const appIds = Array.from(new Set((pendingRefs ?? []).map((r) => (r as { application_id: string }).application_id)));
  const appById = new Map<string, { full_name: string | null; email: string | null }>();
  if (appIds.length) {
    const { data: apps } = await supabase.from("cvp_applications").select("id, full_name, email").in("id", appIds);
    for (const a of apps ?? []) appById.set((a as { id: string }).id, a as { full_name: string | null; email: string | null });
  }
  const pendingByApp = new Map<string, { name: string; token: string }[]>();
  for (const r of (pendingRefs ?? []) as Array<Record<string, string>>) {
    if (!r.reference_email || !r.feedback_token) continue;
    const applicant = appById.get(r.application_id);
    const aName = applicant?.full_name ?? "your applicant";
    // A — referee reminder
    if (priorCount("referee", r.id) < dueCount(daysSince(r.created_at)) && priorCount("referee", r.id) < MAX_REMINDERS) {
      const url = `${APP_URL}/reference-feedback/${r.feedback_token}`;
      jobs.push({
        type: "referee", id: r.id, to: r.reference_email, toName: r.reference_name ?? r.reference_email,
        subject: `Reminder: a quick reference for ${aName}`,
        html: wrap(`Reference for ${aName}`,
          `<p>Hi ${esc(r.reference_name ?? "there")},</p><p>${esc(aName)} listed you as a professional reference for their application to Cethos. The short form takes only a few minutes and helps us complete their qualification.</p>`,
          "Complete the reference form", url),
      });
    }
    // collect for B (applicant chase)
    const arr = pendingByApp.get(r.application_id) ?? [];
    arr.push({ name: r.reference_name ?? r.reference_email, token: r.feedback_token });
    pendingByApp.set(r.application_id, arr);
  }

  // ---- B: applicants whose referees are still pending (chase) ----
  for (const [appId, refs] of pendingByApp) {
    const applicant = appById.get(appId);
    if (!applicant?.email) continue;
    // age = oldest pending ref for this app
    const oldest = Math.max(...(pendingRefs ?? []).filter((r) => (r as { application_id: string }).application_id === appId).map((r) => daysSince((r as { created_at: string }).created_at)));
    if (priorCount("chase", appId) >= dueCount(oldest) || priorCount("chase", appId) >= MAX_REMINDERS) continue;
    const list = refs.map((x) => `<li style="margin:4px 0;">${esc(x.name)} — <a href="${APP_URL}/reference-feedback/${x.token}">their reference form</a></li>`).join("");
    jobs.push({
      type: "chase", id: appId, to: applicant.email, toName: applicant.full_name ?? applicant.email,
      subject: "Your references are still pending — Cethos",
      html: wrap("Your application is waiting on references",
        `<p>Hi ${esc(applicant.full_name ?? "there")},</p><p>Your application is held up waiting on your referee(s) to complete a short form. Please give them a nudge — each can use their own link below:</p><ul>${list}</ul>`,
        "View your application", `${APP_URL}`),
    });
  }

  // ---- C: applicants who never submitted referee contacts ----
  const { data: reqs } = await supabase
    .from("cvp_application_reference_requests")
    .select("id, application_id, request_token, contacts_submitted_at, created_at, request_token_expires_at")
    .is("contacts_submitted_at", null)
    .gt("request_token_expires_at", nowIso);
  const reqAppIds = Array.from(new Set((reqs ?? []).map((r) => (r as { application_id: string }).application_id)));
  if (reqAppIds.length) {
    const missing = reqAppIds.filter((id) => !appById.has(id));
    if (missing.length) {
      const { data: apps2 } = await supabase.from("cvp_applications").select("id, full_name, email").in("id", missing);
      for (const a of apps2 ?? []) appById.set((a as { id: string }).id, a as { full_name: string | null; email: string | null });
    }
  }
  for (const rq of (reqs ?? []) as Array<Record<string, string>>) {
    const applicant = appById.get(rq.application_id);
    if (!applicant?.email || !rq.request_token) continue;
    if (priorCount("contacts", rq.id) >= dueCount(daysSince(rq.created_at)) || priorCount("contacts", rq.id) >= MAX_REMINDERS) continue;
    jobs.push({
      type: "contacts", id: rq.id, to: applicant.email, toName: applicant.full_name ?? applicant.email,
      subject: "We still need your references — Cethos",
      html: wrap("Add your professional references",
        `<p>Hi ${esc(applicant.full_name ?? "there")},</p><p>To continue your application we need a couple of professional references. It takes a minute to add their contact details:</p>`,
        "Add your references", `${APP_URL}/references/${rq.request_token}`),
    });
  }

  const todo = jobs.slice(0, limit);
  const byType = (t: string) => jobs.filter((j) => j.type === t).length;
  if (!send) {
    return json({ dry_run: true, total: jobs.length, would_send: todo.length, by_type: { referee: byType("referee"), chase: byType("chase"), contacts: byType("contacts") }, sample: todo.slice(0, 8).map((j) => ({ type: j.type, to: j.to, subject: j.subject })) });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const j of todo) {
    try {
      const ok = await sendBrevoRawEmail({ to: [{ email: j.to, name: j.toName }], subject: j.subject, htmlContent: j.html, sender: SENDER });
      if (ok) {
        await supabase.from("cvp_outbound_messages").insert({
          message_id: `refrem-${j.type}:${j.id}:${Date.now()}`,
          recipient_email: j.to, subject: j.subject, body_html: j.html,
          template_tag: `reference_reminder:${j.type}`, sent_at: new Date().toISOString(),
        });
      }
      results.push({ type: j.type, to: j.to, ok });
    } catch (e) {
      results.push({ type: j.type, to: j.to, ok: false, error: String(e) });
    }
    await sleep(150);
  }
  return json({ sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, by_type: { referee: byType("referee"), chase: byType("chase"), contacts: byType("contacts") }, remaining: jobs.length - todo.length });
});
