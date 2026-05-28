// ============================================================================
// vendor-acceptance-reminders — cron-fired escalating reminders for vendors
// who haven't accepted a direct-assigned step.
//
// Behaviour (fire-and-forget, cron schedule */15 min):
//   * Sweeps order_workflow_steps WHERE status = 'assigned'
//     AND vendor_id IS NOT NULL AND assigned_at IS NOT NULL.
//   * For each step, emits up to two notifications, idempotent via
//     notification_log dedup on (step_id, event_type):
//       - 'acceptance_reminder_1h' when assigned_at + 1h < now()
//           → reminder email to vendor only
//       - 'acceptance_reminder_2h' when assigned_at + 2h < now()
//           → urgent email to vendor + pm@cethoscorp.com
//
// Auth: invoked by pg_cron via net.http_post. No bearer; verify_jwt=false.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  callout,
  ctaButton,
  detailsTable,
  emailShell,
  esc as escShell,
  hint,
  lead,
  REPLY,
  statusBadge,
  title,
  type TemplateMeta,
} from "../_shared/email-shell.ts";

const TPL_ACCEPTANCE_NORMAL: TemplateMeta = {
  name: "Vendor — Acceptance Reminder (1h)",
  version: "2.0",
  updatedAt: "2026-05-28",
};
const TPL_ACCEPTANCE_URGENT: TemplateMeta = {
  name: "Vendor — Acceptance Reminder (Urgent 2h)",
  version: "2.0",
  updatedAt: "2026-05-28",
};

const VENDOR_PORTAL_URL =
  Deno.env.get("VENDOR_PORTAL_URL") || "https://vendor.cethos.com";
const ADMIN_EMAIL = "pm@cethoscorp.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const escapeHtml = (s: string | null | undefined): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const BREVO_KEY = Deno.env.get("BREVO_API_KEY");
  if (!BREVO_KEY) return json({ error: "BREVO_API_KEY not set" }, 500);

  try {
    // Find all "assigned" steps with a vendor and assigned_at timestamp
    const { data: steps, error: stepErr } = await supabase
      .from("order_workflow_steps")
      .select(`
        id, step_number, name, vendor_id, assigned_at, deadline,
        workflow_id, order_id
      `)
      .eq("status", "assigned")
      .not("vendor_id", "is", null)
      .not("assigned_at", "is", null);

    if (stepErr) {
      console.error("Query error:", stepErr);
      return json({ error: stepErr.message }, 500);
    }

    if (!steps || steps.length === 0) {
      return json({ processed: 0 });
    }

    const now = Date.now();
    let sent = 0;

    for (const step of steps) {
      const assignedAt = new Date(step.assigned_at).getTime();
      const hoursElapsed = (now - assignedAt) / (1000 * 60 * 60);

      // Determine which events to fire
      const events: { type: string; urgent: boolean }[] = [];

      if (hoursElapsed >= 2) {
        events.push(
          { type: "acceptance_reminder_1h", urgent: false },
          { type: "acceptance_reminder_2h", urgent: true },
        );
      } else if (hoursElapsed >= 1) {
        events.push({ type: "acceptance_reminder_1h", urgent: false });
      }

      if (events.length === 0) continue;

      // Check which events have already been sent
      const { data: existing } = await supabase
        .from("notification_log")
        .select("event_type")
        .eq("step_id", step.id)
        .in("event_type", events.map((e) => e.type));

      const sentTypes = new Set((existing ?? []).map((e: any) => e.event_type));

      // Filter to unsent events
      const toSend = events.filter((e) => !sentTypes.has(e.type));
      if (toSend.length === 0) continue;

      // Fetch vendor + order info
      const [vendorRes, orderRes] = await Promise.all([
        supabase
          .from("vendors")
          .select("full_name, email")
          .eq("id", step.vendor_id)
          .single(),
        supabase
          .from("orders")
          .select("order_number")
          .eq("id", step.order_id)
          .single(),
      ]);

      const vendor = vendorRes.data;
      const order = orderRes.data;
      if (!vendor?.email) continue;

      const orderLabel = order?.order_number ?? step.order_id;
      const stepLabel = `Step ${step.step_number}: ${step.name}`;
      const deadlineStr = step.deadline
        ? new Date(step.deadline).toLocaleString("en-CA", {
            timeZone: "America/Edmonton",
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "Not set";

      for (const event of toSend) {
        const isUrgent = event.urgent;
        const recipients = isUrgent
          ? [{ email: vendor.email }, { email: ADMIN_EMAIL }]
          : [{ email: vendor.email }];

        const subject = isUrgent
          ? `URGENT: Please accept assignment — ${orderLabel} — ${escapeHtml(step.name)}`
          : `Reminder: Please accept assignment — ${orderLabel} — ${escapeHtml(step.name)}`;

        const firstName = (vendor.full_name || "").trim().split(/\s+/)[0] || "there";
        const urgentCallout = isUrgent
          ? callout({
              tone: "error",
              title: "Action needed within the hour",
              body: "This assignment has been waiting for your acceptance for over 2 hours. Please respond as soon as possible — if you can't take it, decline so we can route it to another vendor.",
            })
          : "";
        const htmlBody = emailShell(
          [
            statusBadge(isUrgent ? "error" : "warn", isUrgent ? "Urgent · 2h+" : "Awaiting acceptance"),
            title(`Please accept your assignment for ${escShell(orderLabel)}`),
            lead(
              `Hi ${escShell(firstName)}, ${isUrgent ? "this assignment is overdue for your acceptance — please respond as soon as possible." : "this is a reminder that you have a pending assignment waiting for your acceptance."}`,
            ),
            detailsTable([
              ["Order", orderLabel],
              ["Step", stepLabel],
              ["Deadline", deadlineStr],
            ]),
            urgentCallout,
            ctaButton({ label: "Accept assignment", url: `${VENDOR_PORTAL_URL}/jobs`, align: "full" }),
            hint(`If you cannot complete this assignment, please contact the project manager at <a href="mailto:${ADMIN_EMAIL}" style="color:#0E7490;">${escShell(ADMIN_EMAIL)}</a>.`),
          ].join(""),
          { replyTo: REPLY.vendor, template: isUrgent ? TPL_ACCEPTANCE_URGENT : TPL_ACCEPTANCE_NORMAL, preheader: `${isUrgent ? "URGENT" : "Reminder"}: pending assignment for ${orderLabel}` },
        );

        // notification_log has NOT NULL constraints on event_type,
        // recipient_type, recipient_email, subject, status. The old INSERTs
        // below only set event_type + step_id + metadata, so they 23502'd
        // and the dedup row was never persisted — meaning once the 1h or
        // 2h threshold passed, this cron would re-send the same email
        // every 15 minutes forever. Provide the full required column set
        // and wrap each INSERT in its own try/catch so an audit failure
        // doesn't block the Brevo send.
        let brevoStatus: "sent" | "failed" = "failed";
        let brevoMessageId: string | null = null;
        let errorMessage: string | null = null;
        try {
          const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
              "api-key": BREVO_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sender: { name: "Cethos Translation Services", email: "donotreply@cethos.com" },
              replyTo: { email: REPLY.vendor },
              to: recipients,
              subject,
              htmlContent: htmlBody,
              tags: [event.type],
            }),
          });

          const brevoData = await brevoRes.json().catch(() => ({}));
          if (brevoRes.ok) {
            brevoStatus = "sent";
            brevoMessageId = brevoData?.messageId ?? null;
            sent++;
            console.log(
              `Sent ${event.type} for step=${step.id} vendor=${vendor.email}`,
            );
          } else {
            errorMessage = `Brevo ${brevoRes.status}: ${JSON.stringify(brevoData).slice(0, 300)}`;
            console.error(
              `Brevo ${event.type} step=${step.id}: ${errorMessage}`,
            );
          }
        } catch (emailErr) {
          errorMessage = String(emailErr).slice(0, 500);
          console.error(`Email send failed for ${event.type} step=${step.id}:`, emailErr);
        }

        // Audit row — primary recipient is the vendor for the 1h tier,
        // both vendor + admin for the urgent 2h tier; we record the
        // vendor as recipient_email and put admin_email + recipients in
        // metadata to preserve the (step_id, event_type) dedup contract.
        try {
          const { error: logErr } = await supabase
            .from("notification_log")
            .insert({
              event_type: event.type,
              recipient_type: "vendor",
              recipient_email: vendor.email,
              recipient_name: vendor.full_name ?? null,
              recipient_id: step.vendor_id,
              order_id: step.order_id,
              step_id: step.id,
              subject,
              status: brevoStatus,
              error_message: errorMessage,
              metadata: {
                vendor_id: step.vendor_id,
                vendor_email: vendor.email,
                order_number: orderLabel,
                brevo_message_id: brevoMessageId,
                is_urgent: isUrgent,
                hours_elapsed: Math.round(hoursElapsed * 10) / 10,
                cc_admin_email: isUrgent ? ADMIN_EMAIL : null,
                recipients: recipients.map((r) => r.email),
              },
            });
          if (logErr) {
            console.error(
              `notification_log insert error for ${event.type} step=${step.id}:`,
              logErr,
            );
          }
        } catch (logErr) {
          console.error(
            `notification_log insert threw for ${event.type} step=${step.id}:`,
            logErr,
          );
        }
      }
    }

    return json({ processed: steps.length, sent });
  } catch (err) {
    console.error("vendor-acceptance-reminders error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
