// Hourly cron worker: sweep cvp_applications with a queued rejection whose
// 48hr intercept window has elapsed, send V12, mark as sent.
//
// Designed to be invoked by pg_cron against /functions/v1/cvp-send-queued-rejections.
// Also safe to invoke manually by staff from the admin UI.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import { buildV12Rejected } from "../_shared/email-templates.ts";
import { requireCronSecret } from "../_shared/require-cron-secret.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authed = await requireCronSecret(req);
  if (!authed.ok) return json({ success: false, error: authed.error }, authed.status);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const threshold = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

  const { data: queued, error: qErr } = await supabase
    .from("cvp_applications")
    .select("id, email, full_name, application_number, rejection_reason, rejection_email_subject_override, can_reapply_after")
    .eq("rejection_email_status", "queued")
    .lte("rejection_email_queued_at", threshold)
    .limit(100);

  if (qErr) return json({ success: false, error: qErr.message }, 500);

  const results: Array<{ id: string; sent: boolean; error?: string }> = [];

  for (const app of queued ?? []) {
    // Plain-text reason slot; if staff edited in preview, it landed here.
    // Previously this code fell back to rejection_email_draft (full HTML),
    // which was a bug — the HTML would be injected as the <em> paragraph.
    const reasonSummary =
      (app.rejection_reason as string | null) ??
      "We were unable to move forward with your application at this time.";
    const reapplyAfterDate = app.can_reapply_after
      ? new Date(app.can_reapply_after as string).toLocaleDateString("en-CA", {
          year: "numeric", month: "long", day: "numeric",
        })
      : "six months from today";

    const tpl = buildV12Rejected({
      fullName: app.full_name as string,
      applicationNumber: app.application_number as string,
      reasonSummary,
      reapplyAfterDate,
    });
    // Staff-edited subject (from the preview step) overrides the default.
    const subject =
      (app.rejection_email_subject_override as string | null) ?? tpl.subject;
    const result = await sendMailgunEmail({
      to: { email: app.email as string, name: app.full_name as string },
      subject,
      html: tpl.html,
      text: tpl.text,
      respectDoNotContactFor: app.email as string,
      tags: ["v12-rejected", app.id as string],
      trackContext: {
        applicationId: app.id as string,
        templateTag: "v12-rejected",
      },
    });

    if (result.sent || result.suppressed) {
      await supabase
        .from("cvp_applications")
        .update({
          rejection_email_status: result.suppressed ? "suppressed" : "sent",
          updated_at: new Date().toISOString(),
        })
        .eq("id", app.id);
      results.push({ id: app.id as string, sent: result.sent });
    } else {
      results.push({
        id: app.id as string,
        sent: false,
        error: result.reason ?? "mailgun_send_failed",
      });
    }
  }

  return json({ success: true, data: { processed: queued?.length ?? 0, results } });
});
