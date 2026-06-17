import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import {
  buildV4TestReminder24hr,
  buildV5TestExpired,
} from "../_shared/email-templates.ts";
import { requireCronSecret } from "../_shared/require-cron-secret.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TestSubmissionRow {
  id: string;
  combination_id: string;
  application_id: string;
  token: string;
  token_expires_at: string;
  status: string;
  created_at: string;
  reminder_1_sent_at: string | null;
  reminder_2_sent_at: string | null;
  reminder_3_sent_at: string | null;
}

interface ApplicationRow {
  email: string;
  full_name: string;
  application_number: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * cvp-check-test-followups
 *
 * Cron job (hourly). Test invitation lifecycle:
 *
 * | Timing                                | Template | Action                |
 * |---------------------------------------|----------|-----------------------|
 * | Day 0                                 | V3       | Test invitation       |
 * | Day 3 (created_at <= now - 3d)        | V4       | Reminder #1           |
 * | Day 6 (reminder_1 sent + 3d)          | V4       | Reminder #2           |
 * | Day 9 (reminder_2 sent + 3d)          | V4       | Reminder #3 (final)   |
 * | Day 10 (token_expires_at)             | V5       | Token expired         |
 * | Day 12 (token expired + 2d)           | —        | Archive               |
 *
 * Idempotent. Processes batches of 50 per tier per tick.
 */
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authed = await requireCronSecret(req);
  if (!authed.ok) return jsonResponse({ success: false, error: authed.error }, authed.status);

  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ success: false, error: "method_not_allowed" }, 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const now = new Date();
    const appUrl = Deno.env.get("APP_URL") ?? "https://join.cethos.com";

    let reminder1Sent = 0;
    let reminder2Sent = 0;
    let reminder3Sent = 0;
    let expiredSent = 0;
    let archived = 0;
    let errors = 0;

    const dayMs = 24 * 60 * 60 * 1000;
    const isoMinus = (days: number): string =>
      new Date(now.getTime() - days * dayMs).toISOString();

    async function fetchApp(applicationId: string): Promise<ApplicationRow | null> {
      const { data } = await supabase
        .from("cvp_applications")
        .select("email, full_name, application_number")
        .eq("id", applicationId)
        .single();
      return data ? (data as unknown as ApplicationRow) : null;
    }

    /**
     * Defensive: a vendor whose test landed on TM-Cethos but whose vendor-portal
     * callback failed (or whose original submission expired before the May 1
     * TM→VP callback shipped) will have a SIBLING submission on the same
     * combination that's already in submitted/assessed/approved state. Sending
     * a V4 / V5 to the stale row is the bug the 2026-05-18 incident exposed —
     * many vendors received "your test is expiring" emails after they'd already
     * submitted. This check auto-expires the stale row instead of nudging.
     *
     * Returns true if we expired the row and the caller should skip it.
     */
    async function expireIfSiblingDone(
      submissionId: string,
      combinationId: string,
    ): Promise<boolean> {
      const { data: siblings } = await supabase
        .from("cvp_test_submissions")
        .select("id, status")
        .eq("combination_id", combinationId)
        .neq("id", submissionId)
        .in("status", ["submitted", "assessed", "approved", "rejected"]);
      if (!siblings || siblings.length === 0) return false;
      await supabase
        .from("cvp_test_submissions")
        .update({
          status: "expired",
          submitted_notes: `[Auto-expired by cvp-check-test-followups at ${now.toISOString()}: duplicate of submission ${(siblings[0] as { id: string }).id} on the same combination — applicant already submitted via the prior row]`,
          updated_at: now.toISOString(),
        })
        .eq("id", submissionId);
      return true;
    }

    function hoursLeft(row: TestSubmissionRow): number {
      return Math.max(
        0,
        Math.floor(
          (new Date(row.token_expires_at).getTime() - now.getTime()) / (1000 * 60 * 60),
        ),
      );
    }

    async function sendReminder(
      row: TestSubmissionRow,
      app: ApplicationRow,
      tag: string,
    ): Promise<void> {
      const tpl = buildV4TestReminder24hr({
        fullName: app.full_name,
        applicationNumber: app.application_number,
        testLink: `${appUrl}/test/${row.token}`,
        hoursRemaining: hoursLeft(row),
      });
      await sendMailgunEmail({
        to: { email: app.email, name: app.full_name },
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        respectDoNotContactFor: app.email,
        tags: [tag, row.application_id],
      });
    }

    // --- Reminder #1: Day 3 (created_at <= now - 3 days) ---
    {
      const { data: rows } = await supabase
        .from("cvp_test_submissions")
        .select(
          "id, combination_id, application_id, token, token_expires_at, status, created_at, reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at",
        )
        .in("status", ["sent", "viewed", "draft_saved"])
        .is("reminder_1_sent_at", null)
        .lt("created_at", isoMinus(3))
        .limit(50);

      for (const row of (rows ?? []) as unknown as TestSubmissionRow[]) {
        if (new Date(row.token_expires_at) <= now) continue;
        if (await expireIfSiblingDone(row.id, row.combination_id)) continue;
        try {
          const app = await fetchApp(row.application_id);
          if (!app) continue;
          await sendReminder(row, app, "v4-test-reminder-1");
          await supabase
            .from("cvp_test_submissions")
            .update({
              reminder_1_sent_at: now.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq("id", row.id);
          reminder1Sent++;
        } catch (err) {
          console.error(`Reminder #1 failed for submission ${row.id}:`, err);
          errors++;
        }
      }
    }

    // --- Reminder #2: 3+ days after reminder #1 ---
    {
      const { data: rows } = await supabase
        .from("cvp_test_submissions")
        .select(
          "id, combination_id, application_id, token, token_expires_at, status, created_at, reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at",
        )
        .in("status", ["sent", "viewed", "draft_saved"])
        .not("reminder_1_sent_at", "is", null)
        .is("reminder_2_sent_at", null)
        .lt("reminder_1_sent_at", isoMinus(3))
        .limit(50);

      for (const row of (rows ?? []) as unknown as TestSubmissionRow[]) {
        if (new Date(row.token_expires_at) <= now) continue;
        if (await expireIfSiblingDone(row.id, row.combination_id)) continue;
        try {
          const app = await fetchApp(row.application_id);
          if (!app) continue;
          await sendReminder(row, app, "v4-test-reminder-2");
          await supabase
            .from("cvp_test_submissions")
            .update({
              reminder_2_sent_at: now.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq("id", row.id);
          reminder2Sent++;
        } catch (err) {
          console.error(`Reminder #2 failed for submission ${row.id}:`, err);
          errors++;
        }
      }
    }

    // --- Reminder #3: 3+ days after reminder #2 ---
    {
      const { data: rows } = await supabase
        .from("cvp_test_submissions")
        .select(
          "id, combination_id, application_id, token, token_expires_at, status, created_at, reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at",
        )
        .in("status", ["sent", "viewed", "draft_saved"])
        .not("reminder_2_sent_at", "is", null)
        .is("reminder_3_sent_at", null)
        .lt("reminder_2_sent_at", isoMinus(3))
        .limit(50);

      for (const row of (rows ?? []) as unknown as TestSubmissionRow[]) {
        if (new Date(row.token_expires_at) <= now) continue;
        if (await expireIfSiblingDone(row.id, row.combination_id)) continue;
        try {
          const app = await fetchApp(row.application_id);
          if (!app) continue;
          await sendReminder(row, app, "v4-test-reminder-3");
          await supabase
            .from("cvp_test_submissions")
            .update({
              reminder_3_sent_at: now.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq("id", row.id);
          reminder3Sent++;
        } catch (err) {
          console.error(`Reminder #3 failed for submission ${row.id}:`, err);
          errors++;
        }
      }
    }

    // --- Expired notification (token_expires_at passed) ---
    {
      const { data: rows } = await supabase
        .from("cvp_test_submissions")
        .select("id, combination_id, application_id, token, token_expires_at, status, created_at, reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at")
        .in("status", ["sent", "viewed", "draft_saved"])
        .lt("token_expires_at", now.toISOString())
        .limit(50);

      for (const row of (rows ?? []) as unknown as TestSubmissionRow[]) {
        // Sibling-done check: don't send V5 "your test expired" to a vendor who
        // already submitted via a different row on the same combination.
        if (await expireIfSiblingDone(row.id, row.combination_id)) continue;
        try {
          const app = await fetchApp(row.application_id);
          if (!app) continue;
          const tpl = buildV5TestExpired({
            fullName: app.full_name,
            applicationNumber: app.application_number,
          });
          await sendMailgunEmail({
            to: { email: app.email, name: app.full_name },
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
            respectDoNotContactFor: app.email,
            tags: ["v5-test-expired", row.application_id],
          });

          await supabase
            .from("cvp_test_submissions")
            .update({
              status: "expired",
              updated_at: now.toISOString(),
            })
            .eq("id", row.id);

          const { data: subData } = await supabase
            .from("cvp_test_submissions")
            .select("combination_id")
            .eq("id", row.id)
            .single();
          if (subData) {
            await supabase
              .from("cvp_test_combinations")
              .update({
                status: "test_sent",
                updated_at: now.toISOString(),
              })
              .eq("id", (subData as Record<string, unknown>).combination_id);
          }

          expiredSent++;
        } catch (err) {
          console.error(`Expiry notice failed for submission ${row.id}:`, err);
          errors++;
        }
      }
    }

    // --- Archive: expired + 2 days, no submission ---
    {
      const { data: rows } = await supabase
        .from("cvp_test_submissions")
        .select("id, application_id")
        .eq("status", "expired")
        .lt("token_expires_at", isoMinus(2))
        .limit(50);

      for (const row of (rows ?? []) as { id: string; application_id: string }[]) {
        try {
          const { data: allSubs } = await supabase
            .from("cvp_test_submissions")
            .select("id, status")
            .eq("application_id", row.application_id);
          const subs = (allSubs ?? []) as { id: string; status: string }[];
          const allArchivable = subs.every(
            (s) => s.status === "expired" || s.status === "archived" || s.status === "submitted",
          );
          if (allArchivable) {
            await supabase
              .from("cvp_test_submissions")
              .update({ status: "archived", updated_at: now.toISOString() })
              .eq("id", row.id);
            archived++;
          }
        } catch (err) {
          console.error(`Archive failed for submission ${row.id}:`, err);
          errors++;
        }
      }
    }

    // ===== QUIZ LIFECYCLE (added 2026-05-15 alongside the applicant-choice
    // test-or-quiz routing rollout). Mirrors the test lifecycle above:
    // Day 3 / Day 6 / Day 9 reminders, Day 10 expiry, Day 12 archive.
    // V4-style reminder + V5-style expiry use inline quiz-specific wording
    // since the existing V4/V5 templates hardcode "test".
    // =====
    let quizReminder1Sent = 0;
    let quizReminder2Sent = 0;
    let quizReminder3Sent = 0;
    let quizExpiredSent = 0;
    let quizArchived = 0;
    let choiceExpiredSent = 0;

    interface QuizRow {
      id: string;
      application_id: string;
      token: string;
      token_expires_at: string;
      status: string;
      created_at: string;
      reminder_1_sent_at: string | null;
      reminder_2_sent_at: string | null;
      reminder_3_sent_at: string | null;
    }

    async function sendQuizReminder(
      row: QuizRow,
      app: ApplicationRow,
      tag: string,
    ): Promise<void> {
      const link = `${appUrl}/quiz/${row.token}`;
      const hours = hoursLeft(row as unknown as TestSubmissionRow);
      await sendMailgunEmail({
        to: { email: app.email, name: app.full_name },
        subject: `Reminder: your CETHOS quiz expires in ${hours}h`,
        html:
          `<p>Hi ${app.full_name},</p>` +
          `<p>We noticed you haven't submitted your ISO competence quiz yet for <strong>${app.application_number}</strong>. The link expires in about <strong>${hours} hours</strong>.</p>` +
          `<p><a href="${link}" style="display:inline-block;background:#0891B2;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;">Open quiz</a></p>` +
          `<p style="color:#6B7280;font-size:13px;">If you're no longer interested, you can ignore this email.</p>`,
        text:
          `Hi ${app.full_name},\n\nReminder: your CETHOS quiz for ${app.application_number} expires in about ${hours} hours.\n\n${link}\n`,
        respectDoNotContactFor: app.email,
        tags: [tag, row.application_id],
      });
    }

    // Quiz reminder #1 — Day 3 after creation
    {
      const { data: rows } = await supabase
        .from("cvp_quiz_submissions")
        .select(
          "id, application_id, token, token_expires_at, status, created_at, reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at",
        )
        .in("status", ["sent", "viewed"])
        .is("reminder_1_sent_at", null)
        .lt("created_at", isoMinus(3))
        .limit(50);
      for (const row of (rows ?? []) as unknown as QuizRow[]) {
        if (new Date(row.token_expires_at) <= now) continue;
        try {
          const app = await fetchApp(row.application_id);
          if (!app) continue;
          await sendQuizReminder(row, app, "v4-quiz-reminder-1");
          await supabase
            .from("cvp_quiz_submissions")
            .update({ reminder_1_sent_at: now.toISOString(), updated_at: now.toISOString() })
            .eq("id", row.id);
          quizReminder1Sent++;
        } catch (err) {
          console.error(`Quiz reminder #1 failed for ${row.id}:`, err);
          errors++;
        }
      }
    }

    // Quiz reminder #2 — Day 6 (3+ days after #1)
    {
      const { data: rows } = await supabase
        .from("cvp_quiz_submissions")
        .select(
          "id, application_id, token, token_expires_at, status, created_at, reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at",
        )
        .in("status", ["sent", "viewed"])
        .not("reminder_1_sent_at", "is", null)
        .is("reminder_2_sent_at", null)
        .lt("reminder_1_sent_at", isoMinus(3))
        .limit(50);
      for (const row of (rows ?? []) as unknown as QuizRow[]) {
        if (new Date(row.token_expires_at) <= now) continue;
        try {
          const app = await fetchApp(row.application_id);
          if (!app) continue;
          await sendQuizReminder(row, app, "v4-quiz-reminder-2");
          await supabase
            .from("cvp_quiz_submissions")
            .update({ reminder_2_sent_at: now.toISOString(), updated_at: now.toISOString() })
            .eq("id", row.id);
          quizReminder2Sent++;
        } catch (err) {
          console.error(`Quiz reminder #2 failed for ${row.id}:`, err);
          errors++;
        }
      }
    }

    // Quiz reminder #3 — Day 9 (3+ days after #2)
    {
      const { data: rows } = await supabase
        .from("cvp_quiz_submissions")
        .select(
          "id, application_id, token, token_expires_at, status, created_at, reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at",
        )
        .in("status", ["sent", "viewed"])
        .not("reminder_2_sent_at", "is", null)
        .is("reminder_3_sent_at", null)
        .lt("reminder_2_sent_at", isoMinus(3))
        .limit(50);
      for (const row of (rows ?? []) as unknown as QuizRow[]) {
        if (new Date(row.token_expires_at) <= now) continue;
        try {
          const app = await fetchApp(row.application_id);
          if (!app) continue;
          await sendQuizReminder(row, app, "v4-quiz-reminder-3");
          await supabase
            .from("cvp_quiz_submissions")
            .update({ reminder_3_sent_at: now.toISOString(), updated_at: now.toISOString() })
            .eq("id", row.id);
          quizReminder3Sent++;
        } catch (err) {
          console.error(`Quiz reminder #3 failed for ${row.id}:`, err);
          errors++;
        }
      }
    }

    // Quiz expiry — token_expires_at passed, still in sent/viewed
    {
      const { data: rows } = await supabase
        .from("cvp_quiz_submissions")
        .select(
          "id, application_id, token, token_expires_at, status, created_at, reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at",
        )
        .in("status", ["sent", "viewed"])
        .lt("token_expires_at", now.toISOString())
        .limit(50);
      for (const row of (rows ?? []) as unknown as QuizRow[]) {
        try {
          const app = await fetchApp(row.application_id);
          if (!app) continue;
          // Inline V5-style expiry notice (existing V5 template hardcodes "test")
          await sendMailgunEmail({
            to: { email: app.email, name: app.full_name },
            subject: `Your CETHOS quiz link has expired — ${app.application_number}`,
            html:
              `<p>Hi ${app.full_name},</p>` +
              `<p>The quiz link for application <strong>${app.application_number}</strong> has expired. If you still want to continue, reply to this email and we'll re-issue a new link.</p>`,
            text:
              `Hi ${app.full_name},\n\nThe quiz link for ${app.application_number} has expired. Reply to this email if you still want to continue and we'll re-issue.\n`,
            respectDoNotContactFor: app.email,
            tags: ["v5-quiz-expired", row.application_id],
          });
          await supabase
            .from("cvp_quiz_submissions")
            .update({ status: "expired", updated_at: now.toISOString() })
            .eq("id", row.id);
          quizExpiredSent++;
        } catch (err) {
          console.error(`Quiz expiry failed for ${row.id}:`, err);
          errors++;
        }
      }
    }

    // Quiz archive — expired + 2 days
    {
      const { data: rows } = await supabase
        .from("cvp_quiz_submissions")
        .select("id, application_id")
        .eq("status", "expired")
        .lt("token_expires_at", isoMinus(2))
        .limit(50);
      for (const row of (rows ?? []) as { id: string; application_id: string }[]) {
        try {
          await supabase
            .from("cvp_quiz_submissions")
            .update({ status: "archived", updated_at: now.toISOString() })
            .eq("id", row.id);
          quizArchived++;
        } catch (err) {
          console.error(`Quiz archive failed for ${row.id}:`, err);
          errors++;
        }
      }
    }

    // Instrument-choice token expiry — applicants who got the chooser email
    // but never picked. No reminder cadence on the choice flow (one decision,
    // they either care or they don't); only the expiry sweep.
    {
      const { data: rows } = await supabase
        .from("cvp_applications")
        .select("id, email, full_name, application_number, instrument_choice_token, instrument_choice_token_expires_at")
        .is("instrument_choice", null)
        .not("instrument_choice_token", "is", null)
        .lt("instrument_choice_token_expires_at", now.toISOString())
        .limit(50);
      for (const row of (rows ?? []) as Array<{
        id: string;
        email: string;
        full_name: string;
        application_number: string;
        instrument_choice_token: string;
        instrument_choice_token_expires_at: string;
      }>) {
        try {
          await sendMailgunEmail({
            to: { email: row.email, name: row.full_name },
            subject: `Your CETHOS assessment link has expired — ${row.application_number}`,
            html:
              `<p>Hi ${row.full_name},</p>` +
              `<p>The chooser link for application <strong>${row.application_number}</strong> has expired. Reply to this email if you'd still like to proceed and we'll re-issue.</p>`,
            text:
              `Hi ${row.full_name},\n\nThe assessment chooser link for ${row.application_number} has expired. Reply to this email if you'd still like to proceed.\n`,
            respectDoNotContactFor: row.email,
            tags: ["v5-choice-expired", row.id],
          });
          // Null the token so re-issuing via cvp-send-instrument-choice-invitation
          // generates a fresh one and the expired URL is dead.
          await supabase
            .from("cvp_applications")
            .update({
              instrument_choice_token: null,
              instrument_choice_token_expires_at: null,
              updated_at: now.toISOString(),
            })
            .eq("id", row.id);
          choiceExpiredSent++;
        } catch (err) {
          console.error(`Choice-expiry failed for ${row.id}:`, err);
          errors++;
        }
      }
    }

    return jsonResponse({
      success: true,
      data: {
        // Test lifecycle
        reminder1Sent,
        reminder2Sent,
        reminder3Sent,
        expiredSent,
        archived,
        // Quiz lifecycle
        quizReminder1Sent,
        quizReminder2Sent,
        quizReminder3Sent,
        quizExpiredSent,
        quizArchived,
        // Choice lifecycle
        choiceExpiredSent,
        errors,
      },
    });
  } catch (err) {
    console.error("cvp-check-test-followups unhandled:", err);
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
