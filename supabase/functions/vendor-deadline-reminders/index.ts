// ============================================================================
// vendor-deadline-reminders — cron-fired vendor reminder + admin overdue alert.
//
// Sweeps order_workflow_steps for active vendor work with a deadline in range
// and emits up to three idempotent notifications per step:
//   * deadline_reminder_24h  → vendor email
//   * deadline_reminder_6h   → vendor email
//   * deadline_overdue       → vendor email + admin fan-out
//
// Each tier uses a distinct StatusBadge + Callout tone so the urgency reads at
// a glance. All four emails render through `_shared/email-shell.ts`.
//
// Auth: pg_cron via net.http_post. No bearer; verify_jwt=false.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  brevoPayload,
  callout,
  ctaButton,
  detailsTable,
  emailShell,
  esc,
  lead,
  REPLY,
  statusBadge,
  strong,
  title,
  type TemplateMeta,
} from "../_shared/email-shell.ts";

const TPL = {
  reminder24h: { name: "Vendor — Deadline Reminder (24h)", version: "2.0", updatedAt: "2026-05-28" } as TemplateMeta,
  reminder6h:  { name: "Vendor — Deadline Reminder (6h)",  version: "2.0", updatedAt: "2026-05-28" } as TemplateMeta,
  overdue:     { name: "Vendor — Delivery Overdue",        version: "2.0", updatedAt: "2026-05-28" } as TemplateMeta,
  overdueAdmin:{ name: "Admin — Vendor Overdue",           version: "2.0", updatedAt: "2026-05-28" } as TemplateMeta,
};

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
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
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

function firstName(full: string | null | undefined): string {
  if (!full) return "there";
  const trimmed = full.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

// ────────────────────────────────────────────────────────────────────────────
// Per-tier email builder. Tier drives badge tone + callout tone + CTA copy.
// ────────────────────────────────────────────────────────────────────────────
type Tier = "24h" | "6h" | "overdue" | "overdue_admin";

interface BuildArgs {
  tier: Tier;
  vendorName?: string | null;
  vendorLabel?: string | null;
  orderNumber: string;
  stepName: string | null;
  deadline: string;
  hoursLate?: number;
  ctaUrl: string;
  ctaLabel: string;
}

function buildEmail(args: BuildArgs): string {
  const isAdmin = args.tier === "overdue_admin";
  const vendor = firstName(args.vendorName);

  const tierTone = {
    "24h":            { badge: "info" as const, badgeText: "24h reminder", callout: "info" as const },
    "6h":             { badge: "warn" as const, badgeText: "6h left",      callout: "warn" as const },
    "overdue":        { badge: "error" as const, badgeText: "Overdue",      callout: "error" as const },
    "overdue_admin":  { badge: "error" as const, badgeText: "Vendor overdue", callout: "error" as const },
  }[args.tier];

  const leadCopy =
    args.tier === "24h"
      ? `Hi ${esc(vendor)}, heads up — your delivery for ${strong(esc(args.orderNumber))} is due within the next 24 hours.`
      : args.tier === "6h"
        ? `Hi ${esc(vendor)}, your delivery for ${strong(esc(args.orderNumber))} is due in less than 6 hours. If anything's blocking you, please reply now.`
        : args.tier === "overdue"
          ? `Hi ${esc(vendor)}, your delivery for ${strong(esc(args.orderNumber))} is past its deadline. Please deliver as soon as possible or contact us if there's a delay.`
          : `${strong(esc(args.vendorLabel || "Vendor"))} is past the deadline for this step${args.hoursLate != null ? ` (${args.hoursLate}h late)` : ""}. The step has not been delivered — consider reassigning or reaching out.`;

  const titleText =
    args.tier === "24h"
      ? "Deadline reminder — due in 24 hours"
      : args.tier === "6h"
        ? "Final reminder — 6 hours left"
        : args.tier === "overdue"
          ? "Delivery overdue"
          : "Vendor delivery overdue";

  const calloutText =
    args.tier === "24h"
      ? { title: "On track?", body: "If you can't hit the deadline, reply now and we'll work out an extension. We'd rather know early than late." }
      : args.tier === "6h"
        ? { title: "Last call", body: "Deliver from the vendor portal or reply to this email if you need help." }
        : args.tier === "overdue"
          ? { title: "Please deliver or contact us", body: "Late deliveries can pull a step into reassignment. We'd much rather hear from you than reassign." }
          : { title: "Suggested next step", body: "Reach out to the vendor or reassign the step in the admin portal." };

  const detailRows: Array<[string, string]> = [
    ["Order", args.orderNumber],
    ["Step", args.stepName || "—"],
    ["Deadline", args.deadline],
  ];
  if (args.hoursLate != null) detailRows.push(["Hours past", String(args.hoursLate)]);
  if (args.vendorLabel) detailRows.push(["Vendor", args.vendorLabel]);

  const tplMap: Record<Tier, TemplateMeta> = {
    "24h": TPL.reminder24h,
    "6h": TPL.reminder6h,
    "overdue": TPL.overdue,
    "overdue_admin": TPL.overdueAdmin,
  };

  const body = [
    statusBadge(tierTone.badge, tierTone.badgeText),
    title(titleText),
    `<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#4B5563;">${leadCopy}</p>`,
    detailsTable(detailRows),
    callout({ tone: tierTone.callout, title: calloutText.title, body: calloutText.body }),
    ctaButton({ label: args.ctaLabel, url: args.ctaUrl }),
  ].join("");

  return emailShell(body, {
    replyTo: isAdmin ? REPLY.ops : REPLY.vendor,
    template: tplMap[args.tier],
    preheader: `${titleText} — ${args.orderNumber}`,
  });
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
        body: JSON.stringify(brevoPayload({
          to: [{ email: args.recipientEmail, name: args.recipientName || args.recipientEmail }],
          subject: args.subject,
          html: args.htmlContent,
          replyTo: args.recipientType === "admin" ? REPLY.ops : REPLY.vendor,
          tags: [args.eventType],
        })),
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

    const { data: steps, error: stepsErr } = await sb
      .from("order_workflow_steps")
      .select(
        "id, name, step_number, status, deadline, vendor_id, order_id, " +
          "orders!order_id(id, order_number), vendors!vendor_id(id, full_name, email)",
      )
      .in("status", ["assigned", "accepted", "in_progress", "revision_requested"])
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

    const adminRecipients = await getAdminRecipients(sb);

    for (const step of candidateSteps) {
      const vendor = step.vendors;
      const order = step.orders;
      if (!vendor?.email || !order) continue;

      const deadlineDate = new Date(step.deadline);
      const msUntilDeadline = deadlineDate.getTime() - now.getTime();
      const isOverdue = msUntilDeadline <= 0;
      const within6h = !isOverdue && msUntilDeadline <= 6 * 60 * 60 * 1000;
      const within24h = !isOverdue && msUntilDeadline <= 24 * 60 * 60 * 1000;

      const stepCtaUrl = `${VENDOR_PORTAL_URL}/jobs`;
      const adminUrl = `${ADMIN_PORTAL_URL}/admin/orders/${order.id}`;

      if (isOverdue) {
        if (!(await alreadySent(sb, "deadline_overdue", step.id))) {
          const hoursLate = Math.round(-msUntilDeadline / (60 * 60 * 1000));
          const subject = `Overdue: ${order.order_number} — ${step.name || "step"}`;
          const html = buildEmail({
            tier: "overdue",
            vendorName: vendor.full_name,
            orderNumber: order.order_number,
            stepName: step.name,
            deadline: fmtDeadline(step.deadline),
            hoursLate,
            ctaUrl: stepCtaUrl,
            ctaLabel: "Open job",
          });
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

          if (!(await alreadySent(sb, "deadline_overdue_admin", step.id)) && adminRecipients.length > 0) {
            const adminSubject = `Vendor overdue: ${order.order_number} — ${step.name || "step"}`;
            const adminHtml = buildEmail({
              tier: "overdue_admin",
              vendorLabel: vendor.full_name || vendor.email,
              orderNumber: order.order_number,
              stepName: step.name,
              deadline: fmtDeadline(step.deadline),
              hoursLate,
              ctaUrl: adminUrl,
              ctaLabel: "Open in admin portal",
            });
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
          const html = buildEmail({
            tier: "6h",
            vendorName: vendor.full_name,
            orderNumber: order.order_number,
            stepName: step.name,
            deadline: fmtDeadline(step.deadline),
            ctaUrl: stepCtaUrl,
            ctaLabel: "Open job",
          });
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
          const html = buildEmail({
            tier: "24h",
            vendorName: vendor.full_name,
            orderNumber: order.order_number,
            stepName: step.name,
            deadline: fmtDeadline(step.deadline),
            ctaUrl: stepCtaUrl,
            ctaLabel: "Open job",
          });
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
        continue;
      }
    }

    return json({ success: true, ...summary });
  } catch (err: any) {
    console.error("vendor-deadline-reminders threw:", err?.message || err);
    return json({ success: false, error: err?.message || String(err) }, 500);
  }
});
