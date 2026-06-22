// ============================================================================
// cvp-send-instrument-reminder  (2026-06-22)
//
// Staff-triggered, single-submission reminder for a test OR quiz. Re-emails the
// EXISTING link to the applicant (no new token, no new TM-Cethos job — that
// avoids the double-provisioning risk of re-running cvp-send-tests). Mirrors the
// cron (cvp-check-test-followups) wording exactly: V4 for tests, inline quiz
// copy for quizzes. Stamps the earliest empty reminder_N_sent_at slot so the
// admin "Reminders sent" log stays accurate and the cron won't double-fire.
//
// POST { submissionId, kind: "test" | "quiz", staffId? }
// Returns { success, data: { sentTo, slot } } | { success:false, error }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import { buildV4TestReminder24hr } from "../_shared/email-templates.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const APP_URL = Deno.env.get("APP_URL") ?? "https://join.cethos.com";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface SubRow {
  id: string;
  application_id: string;
  token: string;
  token_expires_at: string;
  status: string;
  reminder_1_sent_at: string | null;
  reminder_2_sent_at: string | null;
  reminder_3_sent_at: string | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: { submissionId?: string; kind?: "test" | "quiz"; staffId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }
  const submissionId = (body.submissionId ?? "").trim();
  const kind = body.kind === "quiz" ? "quiz" : body.kind === "test" ? "test" : null;
  if (!submissionId || !kind) {
    return json({ success: false, error: "submissionId and kind ('test'|'quiz') are required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const table = kind === "quiz" ? "cvp_quiz_submissions" : "cvp_test_submissions";
  const { data: subData, error: subErr } = await supabase
    .from(table)
    .select("id, application_id, token, token_expires_at, status, reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at")
    .eq("id", submissionId)
    .maybeSingle();
  if (subErr || !subData) {
    return json({ success: false, error: "Submission not found." }, 404);
  }
  const sub = subData as SubRow;

  // Open statuses where a reminder makes sense. Tests also have draft_saved.
  const openStatuses = kind === "quiz" ? ["sent", "viewed"] : ["sent", "viewed", "draft_saved"];
  if (!openStatuses.includes(sub.status)) {
    return json(
      { success: false, error: `Cannot remind — ${kind} is "${sub.status}" (already submitted or closed).` },
      400,
    );
  }
  const now = new Date();
  const expMs = new Date(sub.token_expires_at).getTime();
  if (Number.isFinite(expMs) && expMs <= now.getTime()) {
    return json(
      { success: false, error: "The link has expired — re-issue a new link instead of reminding." },
      400,
    );
  }

  const { data: appData } = await supabase
    .from("cvp_applications")
    .select("email, full_name, application_number")
    .eq("id", sub.application_id)
    .maybeSingle();
  const app = appData as { email: string; full_name: string; application_number: string } | null;
  if (!app?.email) {
    return json({ success: false, error: "Applicant email not found." }, 404);
  }

  const hoursRemaining = Math.max(0, Math.floor((expMs - now.getTime()) / (1000 * 60 * 60)));

  try {
    if (kind === "test") {
      const tpl = buildV4TestReminder24hr({
        fullName: app.full_name,
        applicationNumber: app.application_number,
        testLink: `${APP_URL.replace(/\/$/, "")}/test/${sub.token}`,
        hoursRemaining,
      });
      await sendMailgunEmail({
        to: { email: app.email, name: app.full_name },
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        respectDoNotContactFor: app.email,
        tags: ["v4-test-reminder-manual", sub.application_id],
      });
    } else {
      const link = `${APP_URL.replace(/\/$/, "")}/quiz/${sub.token}`;
      await sendMailgunEmail({
        to: { email: app.email, name: app.full_name },
        subject: `Reminder: your CETHOS quiz expires in ${hoursRemaining}h`,
        html:
          `<p>Hi ${app.full_name},</p>` +
          `<p>We noticed you haven't submitted your ISO competence quiz yet for <strong>${app.application_number}</strong>. The link expires in about <strong>${hoursRemaining} hours</strong>.</p>` +
          `<p><a href="${link}" style="display:inline-block;background:#0891B2;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;">Open quiz</a></p>` +
          `<p style="color:#6B7280;font-size:13px;">If you're no longer interested, you can ignore this email.</p>`,
        text: `Hi ${app.full_name},\n\nReminder: your CETHOS quiz for ${app.application_number} expires in about ${hoursRemaining} hours.\n\n${link}\n`,
        respectDoNotContactFor: app.email,
        tags: ["v4-quiz-reminder-manual", sub.application_id],
      });
    }
  } catch (e) {
    console.error("cvp-send-instrument-reminder send failed:", e);
    return json({ success: false, error: "Failed to send the reminder email." }, 500);
  }

  // Stamp the earliest empty reminder slot so the cron picks up from here and
  // the admin log reflects the manual nudge. If all three are used, the email
  // still went out (manual override) — we just bump updated_at.
  const nowIso = now.toISOString();
  const update: Record<string, unknown> = { updated_at: nowIso };
  let slot = 0;
  if (!sub.reminder_1_sent_at) { update.reminder_1_sent_at = nowIso; slot = 1; }
  else if (!sub.reminder_2_sent_at) { update.reminder_2_sent_at = nowIso; slot = 2; }
  else if (!sub.reminder_3_sent_at) { update.reminder_3_sent_at = nowIso; slot = 3; }
  await supabase.from(table).update(update).eq("id", sub.id);

  return json({ success: true, data: { sentTo: app.email, slot } });
});
