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

        const htmlBody = `
          <p>Hi ${escapeHtml(vendor.full_name)},</p>
          ${isUrgent
            ? `<p style="color: #dc2626; font-weight: bold;">This assignment has been waiting for your acceptance for over 2 hours. Please respond as soon as possible.</p>`
            : `<p>This is a reminder that you have a pending assignment waiting for your acceptance.</p>`
          }
          <table style="border-collapse:collapse; margin:16px 0;">
            <tr><td style="padding:4px 12px 4px 0; color:#6b7280;">Order:</td><td style="padding:4px 0; font-weight:600;">${escapeHtml(orderLabel)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#6b7280;">Step:</td><td style="padding:4px 0; font-weight:600;">${escapeHtml(stepLabel)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#6b7280;">Deadline:</td><td style="padding:4px 0; font-weight:600;">${escapeHtml(deadlineStr)}</td></tr>
          </table>
          <p>
            <a href="${VENDOR_PORTAL_URL}/jobs" style="display:inline-block;padding:10px 20px;background:#0d9488;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
              Accept Assignment
            </a>
          </p>
          <p style="color:#9ca3af; font-size:12px;">If you cannot complete this assignment, please contact the project manager at ${ADMIN_EMAIL}.</p>
        `;

        try {
          const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
              "api-key": BREVO_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sender: { name: "Cethos Portal", email: "noreply@cethos.com" },
              to: recipients,
              subject,
              htmlContent: htmlBody,
              tags: [event.type],
            }),
          });

          const brevoData = await brevoRes.json().catch(() => ({}));

          // Log to notification_log
          await supabase.from("notification_log").insert({
            event_type: event.type,
            step_id: step.id,
            metadata: {
              vendor_id: step.vendor_id,
              vendor_email: vendor.email,
              order_number: orderLabel,
              brevo_message_id: brevoData?.messageId ?? null,
              is_urgent: isUrgent,
              hours_elapsed: Math.round(hoursElapsed * 10) / 10,
            },
          });

          sent++;
          console.log(
            `Sent ${event.type} for step=${step.id} vendor=${vendor.email}`,
          );
        } catch (emailErr) {
          console.error(`Email send failed for ${event.type} step=${step.id}:`, emailErr);
          // Log failure too
          await supabase.from("notification_log").insert({
            event_type: event.type,
            step_id: step.id,
            metadata: {
              vendor_id: step.vendor_id,
              error: String(emailErr),
              is_urgent: isUrgent,
            },
          });
        }
      }
    }

    return json({ processed: steps.length, sent });
  } catch (err) {
    console.error("vendor-acceptance-reminders error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
