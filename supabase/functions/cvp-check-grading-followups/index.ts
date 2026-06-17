/**
 * cvp-check-grading-followups
 *
 * Cron job (daily). Reminds admins/recruitment graders when test
 * submissions have been waiting for human review (cvp-assess-test fell
 * back to staff_review) for 3 / 6 / 9 days. Mirrors the applicant-side
 * cadence in cvp-check-test-followups.
 *
 * Recipients are staff_users with role 'recruitment_grader'. If no such
 * staff exists, falls back to recruitment ops via the
 * CVP_RECRUITMENT_OPS_EMAIL env var.
 *
 * Idempotent — one row per (combination_id, reminder_index) in
 * cvp_grading_reminders_sent prevents double sending.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import { buildV23GradingReminder } from "../_shared/email-templates.ts";
import { requireCronSecret } from "../_shared/require-cron-secret.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const ADMIN_BASE_URL =
  Deno.env.get("ADMIN_PORTAL_URL") ?? "https://admin.cethos.com";
const FALLBACK_OPS_EMAIL =
  Deno.env.get("CVP_RECRUITMENT_OPS_EMAIL") ?? "vm@cethos.com";

interface CombinationRow {
  id: string;
  application_id: string;
  status: string;
  ai_assessment_result: Record<string, unknown> | null;
  updated_at: string;
}

interface ApplicationRow {
  id: string;
  application_number: string;
  full_name: string;
}

interface StaffRow {
  email: string;
  full_name: string;
}

interface ReminderRow {
  combination_id: string;
  reminder_index: number;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ success: false, error: "method_not_allowed" }, 405);
  }

  const authed = await requireCronSecret(req);
  if (!authed.ok) return jsonResponse({ success: false, error: authed.error }, authed.status);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  // Fetch all combinations stuck in 'assessed' (staff_review) or where AI
  // grading hasn't run yet, sitting for >= 3 days. We do reminder routing
  // per row by checking elapsed days since updated_at.
  const cutoff = new Date(now.getTime() - 3 * dayMs).toISOString();
  const { data: comboRows, error: comboErr } = await supabase
    .from("cvp_test_combinations")
    .select("id, application_id, status, ai_assessment_result, updated_at")
    .eq("status", "assessed")
    .lt("updated_at", cutoff)
    .limit(100);

  if (comboErr) {
    console.error("cvp-check-grading-followups query error:", comboErr);
    return jsonResponse({ success: false, error: comboErr.message }, 500);
  }

  const combos = (comboRows ?? []) as CombinationRow[];
  if (combos.length === 0) {
    return jsonResponse({ success: true, data: { sent: 0, skipped: 0 } });
  }

  // Pull the existing reminder log so we know what each combo is owed.
  const comboIds = combos.map((c) => c.id);
  const { data: sentRows } = await supabase
    .from("cvp_grading_reminders_sent")
    .select("combination_id, reminder_index")
    .in("combination_id", comboIds);
  const sentByCombo = new Map<string, Set<number>>();
  for (const r of (sentRows ?? []) as ReminderRow[]) {
    if (!sentByCombo.has(r.combination_id))
      sentByCombo.set(r.combination_id, new Set());
    sentByCombo.get(r.combination_id)!.add(r.reminder_index);
  }

  // Resolve grader recipient list once per tick.
  const { data: graderRows } = await supabase
    .from("staff_users")
    .select("email, full_name")
    .eq("role", "recruitment_grader")
    .eq("is_active", true);
  const graders = (graderRows ?? []) as StaffRow[];
  const recipients: StaffRow[] = graders.length > 0
    ? graders
    : [{ email: FALLBACK_OPS_EMAIL, full_name: "Recruitment Ops" }];

  let sent = 0;
  let skipped = 0;

  for (const combo of combos) {
    const daysWaiting = Math.floor(
      (now.getTime() - new Date(combo.updated_at).getTime()) / dayMs,
    );
    let reminderIndex: 1 | 2 | 3 | null = null;
    const alreadySent = sentByCombo.get(combo.id) ?? new Set<number>();
    if (daysWaiting >= 9 && !alreadySent.has(3)) reminderIndex = 3;
    else if (daysWaiting >= 6 && !alreadySent.has(2)) reminderIndex = 2;
    else if (daysWaiting >= 3 && !alreadySent.has(1)) reminderIndex = 1;
    if (!reminderIndex) {
      skipped += 1;
      continue;
    }

    const { data: appRow } = await supabase
      .from("cvp_applications")
      .select("id, application_number, full_name")
      .eq("id", combo.application_id)
      .maybeSingle();
    if (!appRow) continue;
    const app = appRow as ApplicationRow;

    const reviewUrl = `${ADMIN_BASE_URL.replace(/\/$/, "")}/admin/recruitment/${app.id}`;

    for (const recipient of recipients) {
      const tpl = buildV23GradingReminder({
        graderName: recipient.full_name,
        applicationNumber: app.application_number,
        applicantName: app.full_name,
        reminderIndex,
        daysWaiting,
        reviewUrl,
      });
      try {
        await sendMailgunEmail({
          to: { email: recipient.email, name: recipient.full_name },
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          respectDoNotContactFor: null, // staff list — opt-out doesn't apply
          tags: [`v23-grading-reminder-${reminderIndex}`, app.id],
        });
      } catch (err) {
        console.error(
          `V23 send failed for combo ${combo.id} to ${recipient.email}:`,
          err,
        );
      }
    }

    await supabase
      .from("cvp_grading_reminders_sent")
      .insert({
        combination_id: combo.id,
        reminder_index: reminderIndex,
      });

    sent += 1;
  }

  return jsonResponse({ success: true, data: { sent, skipped, total: combos.length } });
});
