// ============================================================================
// cvp-send-choice-reminders  (2026-06-23)
//
// Daily reminder sweep for applicants who were sent the test/quiz CHOOSER
// invitation but haven't yet picked test or quiz (instrument_choice IS NULL).
// Each reminder REGENERATES the choice token (fresh /choose link) and retires
// the previous one, so the newest email always has the working link. Capped at
// `max_reminders` (default 6), throttled to ~1/day per applicant.
//
// Deliverability guard (same as cvp-auto-advance): only remind applicants the
// EN→Target assessment can actually dispatch for — into-English back-translators
// and applicants with no declared pairs are skipped (they'd just get a dead-end
// chooser).
//
// Once an applicant chooses, this stops touching them (instrument_choice set) —
// the post-choice test/quiz reminders take over from there.
//
// POST /functions/v1/cvp-send-choice-reminders
// Body: { dry_run?, limit?, max_reminders?, min_hours?, domains?: string[] }
// Returns: { success, data: { considered, reminded, skipped, suppressed, failed, actions } }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const APP_URL = (Deno.env.get("APP_URL") ?? "https://join.cethos.com").replace(/\/$/, "");
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // fresh link lives 7 days
const DEFAULT_MAX_REMINDERS = 6;
const DEFAULT_MIN_HOURS = 24;
const DEFAULT_LIMIT = 50;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function esc(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Escalating copy by reminder number (1-based).
function reminderCopy(n: number, name: string, appNumber: string, chooseUrl: string): { subject: string; html: string; text: string } {
  const subject = n <= 2
    ? `Reminder: your Cethos assessment is waiting · ${appNumber}`
    : n <= 4
      ? `Your Cethos assessment is still open · ${appNumber}`
      : `Final reminder — complete your Cethos assessment · ${appNumber}`;
  const lead = n <= 2
    ? `Just a reminder — your competence assessment for application <strong>${esc(appNumber)}</strong> is ready and waiting. It only takes 20–30 minutes.`
    : n <= 4
      ? `Your assessment for application <strong>${esc(appNumber)}</strong> is still open. Completing it is the next step toward joining the Cethos linguist network — it takes 20–30 minutes.`
      : `This is a final reminder for application <strong>${esc(appNumber)}</strong>. If we don't hear from you soon, your application will pause until you're ready. The assessment takes 20–30 minutes.`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; max-width: 640px;">
      <p>Hi ${esc(name)},</p>
      <p>${lead}</p>
      <p>You can choose how to demonstrate your competence — a short translation test <em>or</em> a multiple-choice quiz. Either is sufficient.</p>
      <p style="margin: 22px 0;">
        <a href="${esc(chooseUrl)}" style="display:inline-block; background:#0891B2; color:#fff; text-decoration:none; padding:11px 22px; border-radius:6px; font-weight:600; font-size:14px;">Choose your assessment</a>
      </p>
      <div style="margin-top: 14px; padding: 12px 14px; background:#FFFBEB; border-left:3px solid #F59E0B; font-size:13px; color:#374151;">
        <strong>Please use the link in this email</strong> — it's your current one and replaces any earlier links. It expires in 7 days.
      </div>
      <div style="margin-top: 12px; padding: 12px 14px; background:#EEF2FF; border-left:3px solid #6366F1; font-size:13px; color:#374151;">
        Before the assessment opens you'll accept a short confidentiality agreement (NDA) — under a minute.
      </div>
      <div style="margin-top: 18px; font-size: 13px; color:#6B7280;">Have a question or want to step back? Just reply to this email.</div>
    </div>`;
  const text =
    `Hi ${name},\n\n` +
    (n <= 2
      ? `A reminder that your Cethos competence assessment (application ${appNumber}) is ready. It takes 20–30 minutes.\n\n`
      : n <= 4
        ? `Your Cethos assessment (application ${appNumber}) is still open — 20–30 minutes to complete.\n\n`
        : `Final reminder: please complete your Cethos assessment (application ${appNumber}). 20–30 minutes.\n\n`) +
    `Choose a short translation test OR a multiple-choice quiz — either is sufficient:\n${chooseUrl}\n\n` +
    `Please use the link in THIS email — it replaces any earlier links and expires in 7 days.\n` +
    `Before the assessment opens you'll accept a short confidentiality agreement (NDA).\n\n` +
    `Questions? Just reply to this email.\n`;
  return { subject, html, text };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: { dry_run?: boolean; limit?: number; max_reminders?: number; min_hours?: number; domains?: string[] } = {};
  try { body = await req.json(); } catch { /* empty body ok for cron */ }
  const dryRun = body.dry_run === true;
  const limit = Math.min(Math.max(body.limit ?? DEFAULT_LIMIT, 1), 100);
  const maxReminders = Math.min(Math.max(body.max_reminders ?? DEFAULT_MAX_REMINDERS, 1), 12);
  const minHours = Math.min(Math.max(body.min_hours ?? DEFAULT_MIN_HOURS, 1), 168);
  const domainsFilter = Array.isArray(body.domains) ? body.domains.filter(Boolean) : null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  // Kill-switch (fail-closed): real sends only run when cvp_system_config
  // 'choice_reminders_enabled'.enabled === true. Lets the bulk-email cron be
  // stopped instantly (flip the flag) without an unschedule/redeploy. dry_run
  // bypasses so previews always work.
  if (!dryRun) {
    let enabled = false;
    try {
      const { data: cfg } = await supabase.from("cvp_system_config").select("value").eq("key", "choice_reminders_enabled").maybeSingle();
      enabled = (cfg?.value as any)?.enabled === true;
    } catch { enabled = false; }
    if (!enabled) {
      return json({ success: true, data: { skipped_disabled: true, considered: 0, reminded: 0, skipped: 0, suppressed: 0, failed: 0, actions: [] } });
    }
  }

  const now = new Date();
  const throttleIso = new Date(now.getTime() - minHours * 3600 * 1000).toISOString();
  // First-reminder gate: only remind once the invite/last-touch is >= minHours
  // old. Token expiry = issue + TTL, so "issued >= minHours ago" ⟺ expiry <
  // now + (TTL - minHours). Each reminder resets expiry, so this same check also
  // throttles subsequent reminders for never-…last_reminder_at-set rows.
  const firstExpiryCutoffIso = new Date(now.getTime() + (TTL_MS - minHours * 3600 * 1000)).toISOString();

  // Candidates: translators invited to the chooser, no choice yet, under the
  // reminder cap, and due (last reminder >= minHours ago, or — never reminded —
  // the invite itself is >= minHours old).
  let q = supabase
    .from("cvp_applications")
    .select("id, full_name, email, application_number, instrument_choice_reminder_count")
    .eq("role_type", "translator")
    .is("instrument_choice", null)
    .not("instrument_choice_token", "is", null)
    .in("status", ["prescreened", "staff_review"])
    .lt("instrument_choice_reminder_count", maxReminders)
    .or(`instrument_choice_last_reminder_at.lt.${throttleIso},and(instrument_choice_last_reminder_at.is.null,instrument_choice_token_expires_at.lt.${firstExpiryCutoffIso})`);
  if (domainsFilter && domainsFilter.length > 0) q = q.overlaps("domains_offered", domainsFilter);
  const { data: rows, error } = await q
    .order("instrument_choice_last_reminder_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return json({ success: false, error: error.message }, 500);
  const candidates = (rows ?? []) as any[];

  // Deliverability guard — only remind applicants with an EN-source / non-English
  // target dispatchable combo (precomputed Set; mirrors cvp-auto-advance).
  const { data: enLangRows } = await supabase.from("languages").select("id").ilike("code", "en%");
  const EN_LANG_IDS = (enLangRows ?? []).map((r: any) => String(r.id));
  const deliverable = new Set<string>();
  const candidateIds = candidates.map((c) => c.id);
  if (candidateIds.length > 0 && EN_LANG_IDS.length > 0) {
    const { data: dRows } = await supabase
      .from("cvp_test_combinations")
      .select("application_id")
      .in("application_id", candidateIds)
      .in("status", ["pending", "test_sent", "skip_manual_review"])
      .in("source_language_id", EN_LANG_IDS)
      .not("target_language_id", "is", null)
      .not("target_language_id", "in", `(${EN_LANG_IDS.join(",")})`);
    for (const r of (dRows ?? []) as any[]) deliverable.add(r.application_id);
  }

  const actions: Array<Record<string, unknown>> = [];
  let reminded = 0, skipped = 0, suppressed = 0, failed = 0;

  for (const a of candidates) {
    if (!deliverable.has(a.id)) {
      skipped++;
      actions.push({ id: a.id, name: a.full_name, action: "skipped_no_en_target_combo" });
      continue;
    }
    const reminderNumber = (a.instrument_choice_reminder_count ?? 0) + 1;
    const newToken = crypto.randomUUID();
    const newExpiryIso = new Date(now.getTime() + TTL_MS).toISOString();
    const chooseUrl = `${APP_URL}/choose/${newToken}`;
    const { subject, html, text } = reminderCopy(reminderNumber, a.full_name ?? "there", a.application_number ?? "", chooseUrl);

    if (dryRun) {
      reminded++;
      actions.push({ id: a.id, name: a.full_name, action: "would_remind", reminderNumber });
      continue;
    }

    // Send FIRST (so a send failure never strands the applicant with a swapped,
    // un-emailed token); persist the fresh token + counters only on success.
    let res;
    try {
      res = await sendMailgunEmail({
        to: { email: a.email, name: a.full_name },
        subject, html, text,
        respectDoNotContactFor: a.email,
        tags: ["v3-choice-reminder", a.id],
        trackContext: { applicationId: a.id, templateTag: "choice-reminder" },
      });
    } catch (e) {
      failed++;
      actions.push({ id: a.id, name: a.full_name, action: "send_error", detail: String(e) });
      continue;
    }

    if (res?.sent) {
      await supabase
        .from("cvp_applications")
        .update({
          instrument_choice_token: newToken,
          instrument_choice_token_expires_at: newExpiryIso,
          instrument_choice_reminder_count: reminderNumber,
          instrument_choice_last_reminder_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", a.id)
        .is("instrument_choice", null); // never override a choice made in the meantime
      reminded++;
      actions.push({ id: a.id, name: a.full_name, action: "reminded", reminderNumber });
    } else if (res?.suppressed) {
      // do-not-contact: cap it out so we stop selecting them; don't touch token.
      await supabase
        .from("cvp_applications")
        .update({ instrument_choice_reminder_count: maxReminders, instrument_choice_last_reminder_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("id", a.id);
      suppressed++;
      actions.push({ id: a.id, name: a.full_name, action: "suppressed_do_not_contact" });
    } else {
      failed++;
      actions.push({ id: a.id, name: a.full_name, action: "send_failed", detail: res?.reason ?? "unknown" });
    }
  }

  return json({
    success: true,
    data: { dry_run: dryRun, considered: candidates.length, reminded, skipped, suppressed, failed, actions },
  });
});
