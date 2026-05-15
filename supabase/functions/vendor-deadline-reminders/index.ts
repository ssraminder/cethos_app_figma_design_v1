// ============================================================================
// vendor-deadline-reminders — cron-fired vendor reminder + admin overdue alert.
//
// REBUILT 2026-05-15 — prior bundle was lost from Supabase (404'd on every
// cron tick). Workflow audit found vendors never got a heads-up before
// step deadlines, and admin never got an alert when a step ran late.
//
// Behaviour (fire-and-forget, cron schedule */15 min):
//   * Sweeps order_workflow_steps where status IN ('accepted','in_progress',
//     'revision_requested') AND vendor_id IS NOT NULL AND deadline IS NOT NULL.
//   * For each step, emits up to three notifications, idempotent via a
//     prior-event check against notification_log:
//       - 'deadline_reminder_24h'  when deadline is within next 24h (vendor)
//       - 'deadline_reminder_6h'   when deadline is within next 6h  (vendor)
//       - 'deadline_overdue'       when deadline < now()            (vendor + admin)
//   * Each event is sent at most once per (step, event_type). The dedup
//     lookup is a simple SELECT from notification_log filtered by step_id
//     and event_type. No new state column needed.
//
// Auth: invoked by pg_cron via net.http_post. No bearer; verify_jwt=false.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const VENDOR_PORTAL_URL =
  Deno.env.get("VENDOR_PORTAL_URL") || "https://vendor.cethos.com";
const ADMIN_PORTAL_URL =
  Deno.env.get("ADMIN_PORTAL_URL") || "https://portal.cethos.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

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

function fmtDeadline(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-CA", {
      timeZone: "America/Edmonton",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

async function sendBrevo(
  sb: any,
  args: {
    eventType: string;
    recipientType: "vendor" | "admin";
    recipientEmail: string;
    recipientName?: string | null;
    recipientId?: string | null;
    subject: string;
    htmlContent: string;
    orderId?: string | null;
    stepId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  let status: "sent" | "failed" = "sent";
  let errorMsg: string | null = null;
  let brevoMessageId: string | null = null;

  if (!BREVO_API_KEY) {
    status = "failed";
    errorMsg = "BREVO_API_KEY not configured";
    console.warn("vendor-deadline-reminders: BREVO_API_KEY missing");
  } else {
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          to: [{ email: args.recipientEmail, name: args.recipientName || args.recipientEmail }],
          sender: { name: "Cethos Translation Services", email: "donotreply@cethos.com" },
          replyTo: { email: "vendor@cethos.com", name: "Cethos Vendor Ops" },
          subject: args.subject,
          htmlContent: args.htmlContent,
          tags: [args.eventType],
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        status = "failed";
        errorMsg = `Brevo ${res.status}: ${JSON.stringify(result).slice(0, 500)}`;
      } else {
        brevoMessageId = result?.messageId ?? null;
      }
    } catch (err: any) {
      status = "failed";
      errorMsg = err?.message || String(err);
    }
  }

  try {
    await sb.from("notification_log").insert({
      event_type: args.eventType,
      recipient_type: args.recipientType,
      recipient_email: args.recipientEmail,
      recipient_name: args.recipientName ?? null,
      recipient_id: args.recipientId ?? null,
      order_id: args.orderId ?? null,
      step_id: args.stepId ?? null,
      subject: args.subject,
      status,
      error_message: errorMsg,
      metadata: { ...(args.metadata ?? {}), brevo_message_id: brevoMessageId },
    });
  } catch (e: any) {
    console.error("vendor-deadline-reminders log insert failed:", e?.message || e);
  }
}

function emailShell(title: string, lead: string, detailsHtml: string, ctaLabel: string, ctaUrl: string, accent = "#0f766e"): string {
  return `
<!doctype html>
<html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:20px 24px;background:${accent};color:#ffffff;">
          <div style="font-size:18px;font-weight:600;">Cethos Translation Services</div>
          <div style="font-size:13px;opacity:0.85;margin-top:2px;">${escapeHtml(title)}</div>
        </td></tr>
        <tr><td style="padding:24px;color:#111827;">
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">${lead}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;">${detailsHtml}</table>
          <p style="margin:24px 0 0;text-align:center;">
            <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:10px 20px;background:${accent};color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">${escapeHtml(ctaLabel)}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim();
}

function rows(items: Array<[string, string]>): string {
  return items
    .map(([k, v]) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:4px 0;color:#111827;font-size:14px;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
}

interface StepRow {
  id: string;
  name: string | null;
  step_number: number | null;
  status: string;
  deadline: string;
  vendor_id: string;
  order_id: string;
  orders?: { id: string; order_number: string } | null;
  vendors?: { id: string; full_name: string | null; email: string } | null;
}

async function alreadySent(sb: any, eventType: string, stepId: string): Promise<boolean> {
  const { data } = await sb
    .from("notification_log")
    .select("id")
    .eq("event_type", eventType)
    .eq("step_id", stepId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function getAdminRecipients(sb: any): Promise<Array<{ email: string; name: string | null }>> {
  const { data } = await sb
    .from("notification_recipients")
    .select("email, name, notification_type, is_active")
    .eq("is_active", true)
    .in("notification_type", ["all", "vendor_offers", "deadlines"]);
  return (data ?? []).map((r: any) => ({ email: r.email, name: r.name }));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Sweep every active vendor step with a deadline in scope.
    const { data: steps, error: stepsErr } = await sb
      .from("order_workflow_steps")
      .select(
        "id, name, step_number, status, deadline, vendor_id, order_id, " +
          "orders!order_id(id, order_number), vendors!vendor_id(id, full_name, email)",
      )
      .in("status", ["accepted", "in_progress", "revision_requested"])
      .not("vendor_id", "is", null)
      .not("deadline", "is", null)
      .lt("deadline", in24h.toISOString());

    if (stepsErr) {
      console.error("vendor-deadline-reminders select failed:", stepsErr.message);
      return json({ success: false, error: stepsErr.message }, 500);
    }

    const summary = {
      reminders_24h: 0,
      reminders_6h: 0,
      overdue_vendor: 0,
      overdue_admin_fanout: 0,
      skipped_dedup: 0,
    };

    const candidateSteps = (steps ?? []) as StepRow[];
    if (candidateSteps.length === 0) {
      return json({ success: true, ...summary });
    }

    // Pre-load admin recipients once (avoids N+1).
    const adminRecipients = await getAdminRecipients(sb);

    for (const step of candidateSteps) {
      const vendor = step.vendors;
      const order = step.orders;
      if (!vendor?.email || !order) {
        // Defensive: skip if the embed didn't populate. Should be rare.
        continue;
      }
      const deadlineDate = new Date(step.deadline);
      const msUntilDeadline = deadlineDate.getTime() - now.getTime();
      const isOverdue = msUntilDeadline <= 0;
      const within6h = !isOverdue && msUntilDeadline <= 6 * 60 * 60 * 1000;
      const within24h = !isOverdue && msUntilDeadline <= 24 * 60 * 60 * 1000;

      const stepCtaUrl = `${VENDOR_PORTAL_URL}/jobs`;
      const adminUrl = `${ADMIN_PORTAL_URL}/admin/orders/${order.id}`;

      if (isOverdue) {
        // Vendor overdue email — at most once per step.
        if (!(await alreadySent(sb, "deadline_overdue", step.id))) {
          const hoursLate = Math.round(-msUntilDeadline / (60 * 60 * 1000));
          const subject = `Overdue: ${order.order_number} — ${step.name || "step"}`;
          const lead = `Heads up — your delivery for this step is past its deadline. Please deliver as soon as possible or contact us if there's a delay.`;
          const html = emailShell(
            "Delivery overdue",
            lead,
            rows([
              ["Order", order.order_number],
              ["Step", step.name || "—"],
              ["Deadline", fmtDeadline(step.deadline)],
              ["Hours past deadline", String(hoursLate)],
            ]),
            "Open job",
            stepCtaUrl,
            "#b91c1c",
          );
          await sendBrevo(sb, {
            eventType: "deadline_overdue",
            recipientType: "vendor",
            recipientEmail: vendor.email,
            recipientName: vendor.full_name,
            recipientId: vendor.id,
            subject,
            htmlContent: html,
            orderId: order.id,
            stepId: step.id,
            metadata: { hours_late: hoursLate, deadline: step.deadline },
          });
          summary.overdue_vendor++;

          // Admin fan-out — also at most once per step.
          if (!(await alreadySent(sb, "deadline_overdue_admin", step.id)) && adminRecipients.length > 0) {
            const adminSubject = `Vendor overdue: ${order.order_number} — ${step.name || "step"}`;
            const adminLead = `<strong>${escapeHtml(vendor.full_name || vendor.email)}</strong> is past the deadline for this step (${hoursLate}h late). The step has not been delivered.`;
            const adminHtml = emailShell(
              "Vendor delivery overdue",
              adminLead,
              rows([
                ["Order", order.order_number],
                ["Step", step.name || "—"],
                ["Vendor", vendor.full_name || vendor.email],
                ["Deadline", fmtDeadline(step.deadline)],
                ["Hours past", String(hoursLate)],
              ]),
              "Open in admin portal",
              adminUrl,
              "#b91c1c",
            );
            for (const a of adminRecipients) {
              await sendBrevo(sb, {
                eventType: "deadline_overdue_admin",
                recipientType: "admin",
                recipientEmail: a.email,
                recipientName: a.name,
                subject: adminSubject,
                htmlContent: adminHtml,
                orderId: order.id,
                stepId: step.id,
                metadata: { hours_late: hoursLate, vendor_id: vendor.id },
              });
            }
            summary.overdue_admin_fanout += adminRecipients.length;
          }
        } else {
          summary.skipped_dedup++;
        }
        continue;
      }

      if (within6h) {
        if (!(await alreadySent(sb, "deadline_reminder_6h", step.id))) {
          const subject = `6 hours left: ${order.order_number} — ${step.name || "step"}`;
          const lead = `Reminder — your delivery for this step is due in less than 6 hours.`;
          const html = emailShell(
            "Final reminder — 6 hours",
            lead,
            rows([
              ["Order", order.order_number],
              ["Step", step.name || "—"],
              ["Deadline", fmtDeadline(step.deadline)],
            ]),
            "Open job",
            stepCtaUrl,
            "#b45309",
          );
          await sendBrevo(sb, {
            eventType: "deadline_reminder_6h",
            recipientType: "vendor",
            recipientEmail: vendor.email,
            recipientName: vendor.full_name,
            recipientId: vendor.id,
            subject,
            htmlContent: html,
            orderId: order.id,
            stepId: step.id,
            metadata: { deadline: step.deadline },
          });
          summary.reminders_6h++;
        } else {
          summary.skipped_dedup++;
        }
        continue;
      }

      if (within24h) {
        if (!(await alreadySent(sb, "deadline_reminder_24h", step.id))) {
          const subject = `Reminder: ${order.order_number} — due in 24h`;
          const lead = `Heads up — your delivery for this step is due within the next 24 hours.`;
          const html = emailShell(
            "Deadline reminder",
            lead,
            rows([
              ["Order", order.order_number],
              ["Step", step.name || "—"],
              ["Deadline", fmtDeadline(step.deadline)],
            ]),
            "Open job",
            stepCtaUrl,
          );
          await sendBrevo(sb, {
            eventType: "deadline_reminder_24h",
            recipientType: "vendor",
            recipientEmail: vendor.email,
            recipientName: vendor.full_name,
            recipientId: vendor.id,
            subject,
            htmlContent: html,
            orderId: order.id,
            stepId: step.id,
            metadata: { deadline: step.deadline },
          });
          summary.reminders_24h++;
        } else {
          summary.skipped_dedup++;
        }
      }
    }

    return json({ success: true, ...summary });
  } catch (err: any) {
    console.error("vendor-deadline-reminders error:", err?.message || err);
    return json({ success: false, error: err?.message || "Internal server error" }, 500);
  }
});
