import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunOperationalEmail } from "../_shared/mailgun.ts";
import { requireCronSecret } from "../_shared/require-cron-secret.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Bucket {
  label: string;
  count: number;
}

const APPLICATION_STATUS_ORDER: string[] = [
  "submitted",
  "prescreening",
  "prescreened",
  "test_pending",
  "test_sent",
  "test_in_progress",
  "test_submitted",
  "test_assessed",
  "negotiation",
  "staff_review",
  "info_requested",
  "approved",
  "rejected",
  "waitlisted",
  "archived",
];

const TEST_SUBMISSION_STATUS_ORDER: string[] = [
  "sent",
  "viewed",
  "draft_saved",
  "submitted",
  "assessed",
  "expired",
];

function renderBuckets(buckets: Bucket[]): string {
  if (buckets.length === 0) return `<em>(none)</em>`;
  const rows = buckets
    .map(
      (b) =>
        `<tr><td style="padding:4px 12px 4px 0;">${b.label}</td><td style="padding:4px 0;text-align:right;font-weight:600;">${b.count}</td></tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;font-size:14px;">${rows}</table>`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const authed = await requireCronSecret(req);
  if (!authed.ok) return jsonResponse({ success: false, error: authed.error }, authed.status);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const recipientsRaw =
      Deno.env.get("RECRUITMENT_STATUS_EMAIL") ?? "ss.raminder@gmail.com";
    const recipients = recipientsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((email) => ({ email, name: "CETHOS" }));

    const now = new Date();
    const todayISO = now.toISOString();
    const twentyFourHoursAgo = new Date(
      now.getTime() - 24 * 60 * 60 * 1000,
    ).toISOString();
    const sevenDaysAgo = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // ---- Applications ----
    const { data: appRows } = await supabase
      .from("cvp_applications")
      .select("status, role_type, created_at, staff_reviewed_at, rejection_email_queued_at");

    const apps = appRows ?? [];
    const totalApps = apps.length;
    const newApps24h = apps.filter((a) => a.created_at >= twentyFourHoursAgo).length;
    const newApps7d = apps.filter((a) => a.created_at >= sevenDaysAgo).length;

    const appsByStatus: Record<string, number> = {};
    for (const a of apps) {
      const key = (a.status as string) ?? "unknown";
      appsByStatus[key] = (appsByStatus[key] ?? 0) + 1;
    }
    const appsByStatusBuckets: Bucket[] = APPLICATION_STATUS_ORDER
      .filter((s) => appsByStatus[s])
      .map((s) => ({ label: s, count: appsByStatus[s] }));
    // Include any unexpected statuses at the end
    for (const [s, c] of Object.entries(appsByStatus)) {
      if (!APPLICATION_STATUS_ORDER.includes(s)) {
        appsByStatusBuckets.push({ label: `${s} (unknown)`, count: c });
      }
    }

    const appsByRole: Record<string, number> = {};
    for (const a of apps) {
      const key = (a.role_type as string) ?? "unknown";
      appsByRole[key] = (appsByRole[key] ?? 0) + 1;
    }
    const appsByRoleBuckets: Bucket[] = Object.entries(appsByRole)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }));

    // ---- Needs Attention ----
    const needsAttention = apps.filter((a) => a.status === "staff_review").length;
    const rejectionInterceptWindow = apps.filter(
      (a) =>
        a.status === "rejected" &&
        a.rejection_email_queued_at &&
        new Date(a.rejection_email_queued_at as string).getTime() >
          now.getTime() - 48 * 60 * 60 * 1000,
    ).length;

    // ---- Test combinations ----
    const { data: comboRows } = await supabase
      .from("cvp_test_combinations")
      .select("status");
    const combos = comboRows ?? [];
    const totalCombos = combos.length;
    const combosByStatus: Record<string, number> = {};
    for (const c of combos) {
      const key = (c.status as string) ?? "unknown";
      combosByStatus[key] = (combosByStatus[key] ?? 0) + 1;
    }
    const combosByStatusBuckets: Bucket[] = Object.entries(combosByStatus)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }));

    // ---- Test submissions ----
    const { data: subRows } = await supabase
      .from("cvp_test_submissions")
      .select("status, created_at, token_expires_at, submitted_at");
    const subs = subRows ?? [];
    const totalSubs = subs.length;
    const sent24h = subs.filter(
      (s) => s.created_at && (s.created_at as string) >= twentyFourHoursAgo,
    ).length;
    const submitted24h = subs.filter(
      (s) => s.submitted_at && (s.submitted_at as string) >= twentyFourHoursAgo,
    ).length;
    const submitted7d = subs.filter(
      (s) => s.submitted_at && (s.submitted_at as string) >= sevenDaysAgo,
    ).length;
    const outstandingExpiring24h = subs.filter(
      (s) =>
        ["sent", "viewed", "draft_saved"].includes(s.status as string) &&
        (s.token_expires_at as string) > todayISO &&
        new Date(s.token_expires_at as string).getTime() <
          now.getTime() + 24 * 60 * 60 * 1000,
    ).length;

    const subsByStatus: Record<string, number> = {};
    for (const s of subs) {
      const key = (s.status as string) ?? "unknown";
      subsByStatus[key] = (subsByStatus[key] ?? 0) + 1;
    }
    const subsByStatusBuckets: Bucket[] = TEST_SUBMISSION_STATUS_ORDER
      .filter((s) => subsByStatus[s])
      .map((s) => ({ label: s, count: subsByStatus[s] }));

    // ---- Translators (approved vendors from CVP) ----
    const { data: translatorRows } = await supabase
      .from("cvp_translators")
      .select("id, is_active, created_at");
    const translators = translatorRows ?? [];
    const totalTranslators = translators.length;
    const activeTranslators = translators.filter((t) => t.is_active).length;
    const newTranslators7d = translators.filter(
      (t) => (t.created_at as string) >= sevenDaysAgo,
    ).length;

    // ---- Rejection queue ----
    const { data: rejQueuedRows } = await supabase
      .from("cvp_applications")
      .select("rejection_email_queued_at, rejection_email_status")
      .eq("rejection_email_status", "queued");
    const queuedRejections = rejQueuedRows?.length ?? 0;

    // ---- Inbound applicant replies (Phase C.2) ----
    // Surface replies that landed in the last 24h + total still awaiting a
    // staff acknowledgement, broken down by AI-classified intent so staff
    // can triage without opening the portal.
    const { data: inboundRows } = await supabase
      .from("cvp_inbound_emails")
      .select("id, received_at, acknowledged_at, classified_intent, application_id");
    const inbound = inboundRows ?? [];
    const inbound24h = inbound.filter(
      (i) => (i.received_at as string) >= twentyFourHoursAgo,
    ).length;
    const unackedInbound = inbound.filter((i) => !i.acknowledged_at).length;
    const inboundMatched = inbound.filter((i) => i.application_id).length;
    const inboundByIntent: Record<string, number> = {};
    for (const i of inbound) {
      const key = (i.classified_intent as string) ?? "unclassified";
      inboundByIntent[key] = (inboundByIntent[key] ?? 0) + 1;
    }
    const inboundByIntentBuckets: Bucket[] = Object.entries(inboundByIntent)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label: label.replace(/_/g, " "), count }));

    // ---- Build HTML ----
    const todayStr = now.toISOString().slice(0, 10);
    const html = `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
  <h1 style="color:#0891B2;font-size:20px;margin:0 0 4px;">CETHOS recruitment — daily status</h1>
  <p style="color:#6B7280;margin:0 0 20px;font-size:13px;">${todayStr} · automated digest</p>

  <h2 style="font-size:15px;color:#0C2340;margin:20px 0 8px;border-bottom:1px solid #E5E7EB;padding-bottom:4px;">Applications</h2>
  <p style="margin:4px 0;font-size:14px;">
    <strong>${totalApps}</strong> total · <strong>${newApps24h}</strong> new in last 24h · <strong>${newApps7d}</strong> in last 7d
  </p>
  <p style="margin:12px 0 4px;font-size:13px;color:#6B7280;">By status:</p>
  ${renderBuckets(appsByStatusBuckets)}
  <p style="margin:12px 0 4px;font-size:13px;color:#6B7280;">By role:</p>
  ${renderBuckets(appsByRoleBuckets)}

  <h2 style="font-size:15px;color:#0C2340;margin:24px 0 8px;border-bottom:1px solid #E5E7EB;padding-bottom:4px;">Needs attention</h2>
  <p style="margin:4px 0;font-size:14px;">
    <strong>${needsAttention}</strong> in <code>staff_review</code> · <strong>${rejectionInterceptWindow}</strong> still inside 48h rejection intercept · <strong>${queuedRejections}</strong> rejection emails queued to send
  </p>
  <p style="margin:4px 0;font-size:14px;color:${unackedInbound > 0 ? "#B45309" : "#6B7280"};">
    📨 <strong>${inbound24h}</strong> applicant replies in last 24h · <strong>${unackedInbound}</strong> still unacknowledged · <strong>${inboundMatched}</strong> threaded to an application
  </p>
  ${
    inboundByIntentBuckets.length > 0
      ? `<p style="margin:8px 0 4px;font-size:13px;color:#6B7280;">Inbound by classified intent:</p>${renderBuckets(inboundByIntentBuckets)}`
      : ""
  }

  <h2 style="font-size:15px;color:#0C2340;margin:24px 0 8px;border-bottom:1px solid #E5E7EB;padding-bottom:4px;">Tests</h2>
  <p style="margin:4px 0;font-size:14px;">
    <strong>${totalCombos}</strong> test combinations · <strong>${totalSubs}</strong> test tokens issued
  </p>
  <p style="margin:4px 0;font-size:14px;">
    <strong>${sent24h}</strong> tokens sent in 24h · <strong>${submitted24h}</strong> tests submitted in 24h · <strong>${submitted7d}</strong> in 7d
  </p>
  <p style="margin:4px 0;font-size:14px;color:#B45309;">
    ⏰ <strong>${outstandingExpiring24h}</strong> outstanding tests expiring in next 24h
  </p>
  <p style="margin:12px 0 4px;font-size:13px;color:#6B7280;">Test tokens by status:</p>
  ${renderBuckets(subsByStatusBuckets)}
  <p style="margin:12px 0 4px;font-size:13px;color:#6B7280;">Test combinations by status:</p>
  ${renderBuckets(combosByStatusBuckets)}

  <h2 style="font-size:15px;color:#0C2340;margin:24px 0 8px;border-bottom:1px solid #E5E7EB;padding-bottom:4px;">Approved vendors</h2>
  <p style="margin:4px 0;font-size:14px;">
    <strong>${totalTranslators}</strong> translators total · <strong>${activeTranslators}</strong> active · <strong>${newTranslators7d}</strong> added in last 7d
  </p>

  <p style="margin-top:32px;color:#9CA3AF;font-size:12px;">
    Review queue → <a href="https://portal.cethos.com/admin/recruitment" style="color:#0891B2;">portal.cethos.com/admin/recruitment</a>
  </p>
</div>`;

    const subject = `[CETHOS] Recruitment — ${todayStr} · ${totalApps} apps, ${needsAttention} need attention, ${unackedInbound} inbound unacked, ${outstandingExpiring24h} tests expiring <24h`;

    const sendResult = await sendMailgunOperationalEmail({
      to: recipients,
      subject,
      html,
      tags: ["daily-status"],
    });
    const sent = sendResult.sent;

    console.log(
      `cvp-daily-recruitment-status: recipients=${recipients.length} sent=${sent} totalApps=${totalApps} needsAttention=${needsAttention} unackedInbound=${unackedInbound}`,
    );

    return jsonResponse({
      success: true,
      data: {
        sent,
        recipients: recipients.map((r) => r.email),
        stats: {
          totalApps,
          newApps24h,
          newApps7d,
          appsByStatus,
          appsByRole,
          needsAttention,
          rejectionInterceptWindow,
          queuedRejections,
          totalCombos,
          totalSubs,
          sent24h,
          submitted24h,
          submitted7d,
          outstandingExpiring24h,
          totalTranslators,
          activeTranslators,
          newTranslators7d,
          inbound24h,
          unackedInbound,
          inboundMatched,
          inboundByIntent,
        },
      },
    });
  } catch (err) {
    console.error("Unhandled error in cvp-daily-recruitment-status:", err);
    return jsonResponse(
      { success: false, error: "An unexpected error occurred." },
      500,
    );
  }
});
