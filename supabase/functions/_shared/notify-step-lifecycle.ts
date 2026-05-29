// ============================================================================
// notify-step-lifecycle.ts (admin repo)
// Shared Brevo helpers for the step-lifecycle email events fired BY the admin:
//   - notifyVendorStepApproved        → update-workflow-step.approve
//   - notifyVendorRevisionRequested   → update-workflow-step.request_revision
//   - notifyVendorUnassigned          → update-workflow-step.unassign_vendor
//   - notifyVendorDeadlineChanged     → update-workflow-step.extend_deadline
//   - notifyVendorPayableAdjusted     → manage-vendor-payables.adjust_payable
//   - notifyVendorPayableInvoiced     → manage-vendor-payables.update_status('invoiced')
//   - notifyVendorPayablePaid         → manage-vendor-payables.update_status('paid')
//   - notifyCustomerWorkflowCompleted → update-workflow-step.approve (final step)
//
// Each event renders through the shared shell (`_shared/email-shell.ts`) and
// declares its own TemplateMeta so the footer surfaces "{name} v{version} ·
// Updated {date}" for support.
// ============================================================================

import {
  brevoPayload,
  callout,
  detailsTable,
  emailShell,
  esc,
  eyebrow,
  lead,
  REPLY,
  statusBadge,
  strong,
  title,
  type TemplateMeta,
} from "./email-shell.ts";

// ────────────────────────────────────────────────────────────────────────────
// Per-event template metadata. Bump version + updatedAt when you change copy
// or layout that's customer-visible.
// ────────────────────────────────────────────────────────────────────────────
const TPL = {
  stepApproved:        { name: "Vendor — Step Approved",      version: "2.0", updatedAt: "2026-05-28" } as TemplateMeta,
  revisionRequested:   { name: "Vendor — Revision Requested", version: "2.0", updatedAt: "2026-05-28" } as TemplateMeta,
  payableInvoiced:     { name: "Vendor — Invoice Recorded",   version: "2.0", updatedAt: "2026-05-28" } as TemplateMeta,
  payablePaid:         { name: "Vendor — Payment Sent",       version: "2.0", updatedAt: "2026-05-28" } as TemplateMeta,
  unassigned:          { name: "Vendor — Assignment Removed", version: "2.0", updatedAt: "2026-05-28" } as TemplateMeta,
  deadlineChanged:     { name: "Vendor — Deadline Updated",   version: "2.0", updatedAt: "2026-05-28" } as TemplateMeta,
  payableAdjusted:     { name: "Vendor — Payable Adjusted",   version: "2.0", updatedAt: "2026-05-28" } as TemplateMeta,
  workflowCompleted:   { name: "Customer — Order Complete",   version: "2.0", updatedAt: "2026-05-28" } as TemplateMeta,
};

const VENDOR_PORTAL_URL =
  Deno.env.get("VENDOR_PORTAL_URL") || "https://vendor.cethos.com";
const ADMIN_PORTAL_URL =
  Deno.env.get("ADMIN_PORTAL_URL") || "https://portal.cethos.com";

const fmtMoney = (
  amount: number | null | undefined,
  currency: string | null | undefined,
): string => {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: currency || "CAD",
    }).format(Number(amount));
  } catch {
    return `${amount} ${currency || ""}`.trim();
  }
};

const fmtDate = (iso: string | null | undefined): string => {
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
};

const UNASSIGN_REASON_LABELS: Record<string, string> = {
  vendor_unresponsive: "Vendor unresponsive",
  vendor_unavailable: "Vendor unavailable",
  reassigning: "Reassigning to another vendor",
  quality_concerns: "Quality concerns",
  scope_changed: "Scope changed",
  cancelled_by_customer: "Order cancelled by customer",
  other: "Other",
};

interface VendorRow {
  id: string;
  full_name: string | null;
  email: string;
  additional_emails?: string[];
}

function ccFor(vendor: VendorRow): string[] {
  return (vendor.additional_emails ?? [])
    .map((e) => String(e || "").trim())
    .filter((e) => e && e.toLowerCase() !== String(vendor.email).toLowerCase());
}

function firstName(full: string | null | undefined): string {
  if (!full) return "there";
  const trimmed = full.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

// ────────────────────────────────────────────────────────────────────────────
// Send helper — pushes to Brevo + audits to notification_log.
// ────────────────────────────────────────────────────────────────────────────
interface SendArgs {
  supabase: any;
  eventType: string;
  recipientEmail: string;
  recipientName?: string | null;
  recipientId?: string | null;
  recipientType?: "vendor" | "customer" | "admin";
  ccEmails?: string[];
  subject: string;
  htmlContent: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
  orderId?: string | null;
  stepId?: string | null;
  payableId?: string | null;
}

async function sendOne(args: SendArgs): Promise<void> {
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  if (!BREVO_API_KEY) {
    console.warn("notify-step-lifecycle: BREVO_API_KEY not set, skipping send");
    return;
  }
  const payload = brevoPayload({
    to: [{ email: args.recipientEmail, name: args.recipientName || args.recipientEmail }],
    subject: args.subject,
    html: args.htmlContent,
    replyTo: args.replyTo ?? REPLY.vendor,
    cc: args.ccEmails && args.ccEmails.length > 0
      ? args.ccEmails.map((e) => ({ email: e }))
      : undefined,
    tags: [args.eventType],
  });

  let status: "sent" | "failed" = "sent";
  let errorMsg: string | null = null;
  let brevoMessageId: string | null = null;

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      status = "failed";
      errorMsg = `Brevo ${res.status}: ${JSON.stringify(result).slice(0, 500)}`;
      console.error("notify-step-lifecycle Brevo error:", errorMsg);
    } else {
      brevoMessageId = result?.messageId ?? null;
    }
  } catch (err: any) {
    status = "failed";
    errorMsg = err?.message || String(err);
    console.error("notify-step-lifecycle threw:", errorMsg);
  }

  try {
    await args.supabase.from("notification_log").insert({
      event_type: args.eventType,
      recipient_type: args.recipientType ?? "vendor",
      recipient_email: args.recipientEmail,
      recipient_name: args.recipientName ?? null,
      recipient_id: args.recipientId ?? null,
      order_id: args.orderId ?? null,
      step_id: args.stepId ?? null,
      payable_id: args.payableId ?? null,
      subject: args.subject,
      status,
      error_message: errorMsg,
      metadata: {
        ...(args.metadata ?? {}),
        brevo_message_id: brevoMessageId,
        cc: args.ccEmails ?? [],
      },
    });
  } catch (e: any) {
    console.error("notify-step-lifecycle notification_log insert failed:", e?.message || e);
  }
}

export interface StepLifecycleContext {
  supabase: any;
  vendor: VendorRow;
  order: { id: string; order_number: string };
  step: { id: string; name: string | null; step_number?: number | null };
  payable?: {
    id: string;
    total: number | null;
    currency: string;
    payment_method?: string | null;
    payment_reference?: string | null;
    vendor_invoice_number?: string | null;
    vendor_invoice_date?: string | null;
  } | null;
}

// ──────────────────────────────────────────────────────────────────────────
// 1. notifyVendorStepApproved
// ──────────────────────────────────────────────────────────────────────────
export async function notifyVendorStepApproved(ctx: StepLifecycleContext): Promise<void> {
  const subject = `Step approved: ${ctx.order.order_number} — ${ctx.step.name || "step"}`;
  const rows: Array<[string, string]> = [
    ["Order", ctx.order.order_number],
    ["Step", ctx.step.name || "—"],
  ];
  if (ctx.payable?.total != null) {
    rows.push(["Amount", fmtMoney(ctx.payable.total, ctx.payable.currency)]);
  }

  const body = [
    statusBadge("success", "Step approved"),
    title(`Step approved: ${esc(ctx.step.name || "step")}`),
    lead(
      `Hi ${esc(firstName(ctx.vendor.full_name))}, your delivery has been approved. Thanks for the work — this step is now eligible for invoicing. You can submit your invoice from the vendor portal whenever you're ready.`,
    ),
    detailsTable(rows),
    callout({
      tone: "success",
      title: "Ready to invoice",
      body: "Submit your invoice from the vendor portal. Payment follows on the next bi-weekly cycle once we record your invoice.",
    }),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tbody><tr><td align="center" bgcolor="#0891B2" style="background:#0891B2;border-radius:8px;"><a href="${esc(VENDOR_PORTAL_URL + "/jobs")}" target="_blank" style="display:inline-block;padding:14px 28px;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;">Open vendor portal</a></td></tr></tbody></table>`,
  ].join("");

  await sendOne({
    supabase: ctx.supabase,
    eventType: "step_approved",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: emailShell(body, { replyTo: REPLY.vendor, template: TPL.stepApproved }),
    orderId: ctx.order.id,
    stepId: ctx.step.id,
    payableId: ctx.payable?.id ?? null,
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 2. notifyVendorRevisionRequested
// ──────────────────────────────────────────────────────────────────────────
export async function notifyVendorRevisionRequested(
  ctx: StepLifecycleContext & { reason: string | null },
): Promise<void> {
  const subject = `Revision requested: ${ctx.order.order_number} — ${ctx.step.name || "step"}`;
  const reasonCallout = ctx.reason
    ? callout({ tone: "warn", title: "Reviewer feedback", body: esc(ctx.reason) })
    : "";

  const body = [
    eyebrow("Revision requested", "warn"),
    title(`Revision requested: ${esc(ctx.step.name || "step")}`),
    lead(
      `Hi ${esc(firstName(ctx.vendor.full_name))}, the reviewer has requested revisions to your delivery. Please address the feedback and re-deliver from the vendor portal.`,
    ),
    detailsTable([
      ["Order", ctx.order.order_number],
      ["Step", ctx.step.name || "—"],
    ]),
    reasonCallout,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tbody><tr><td align="center" bgcolor="#0891B2" style="background:#0891B2;border-radius:8px;"><a href="${esc(VENDOR_PORTAL_URL + "/jobs")}" target="_blank" style="display:inline-block;padding:14px 28px;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;">Open job</a></td></tr></tbody></table>`,
  ].join("");

  await sendOne({
    supabase: ctx.supabase,
    eventType: "revision_requested",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: emailShell(body, { replyTo: REPLY.vendor, template: TPL.revisionRequested }),
    orderId: ctx.order.id,
    stepId: ctx.step.id,
    metadata: { reason: ctx.reason ?? null },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 3. notifyVendorPayableInvoiced
// ──────────────────────────────────────────────────────────────────────────
export async function notifyVendorPayableInvoiced(ctx: StepLifecycleContext): Promise<void> {
  if (!ctx.payable) return;
  const subject = `Invoice recorded: ${ctx.order.order_number}`;

  const rows: Array<[string, string]> = [
    ["Order", ctx.order.order_number],
    ["Step", ctx.step.name || "—"],
    ["Amount", fmtMoney(ctx.payable.total, ctx.payable.currency)],
  ];
  if (ctx.payable.vendor_invoice_number) rows.push(["Invoice #", ctx.payable.vendor_invoice_number]);
  if (ctx.payable.vendor_invoice_date) rows.push(["Invoice date", ctx.payable.vendor_invoice_date]);

  const body = [
    eyebrow("Invoice received", "teal"),
    title("Invoice recorded against this job"),
    lead(
      `Hi ${esc(firstName(ctx.vendor.full_name))}, your invoice has been recorded against this job. Payment will follow per the agreed terms.`,
    ),
    detailsTable(rows),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tbody><tr><td align="center" bgcolor="#0891B2" style="background:#0891B2;border-radius:8px;"><a href="${esc(VENDOR_PORTAL_URL + "/invoices")}" target="_blank" style="display:inline-block;padding:14px 28px;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;">Open vendor portal</a></td></tr></tbody></table>`,
  ].join("");

  await sendOne({
    supabase: ctx.supabase,
    eventType: "payable_invoiced",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: emailShell(body, { replyTo: REPLY.vendor, template: TPL.payableInvoiced }),
    orderId: ctx.order.id,
    stepId: ctx.step.id,
    payableId: ctx.payable.id,
    metadata: {
      vendor_invoice_number: ctx.payable.vendor_invoice_number ?? null,
      vendor_invoice_date: ctx.payable.vendor_invoice_date ?? null,
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 4. notifyVendorPayablePaid
// ──────────────────────────────────────────────────────────────────────────
export async function notifyVendorPayablePaid(ctx: StepLifecycleContext): Promise<void> {
  if (!ctx.payable) return;
  const subject = `Payment sent: ${ctx.order.order_number}`;

  const rows: Array<[string, string]> = [
    ["Order", ctx.order.order_number],
    ["Step", ctx.step.name || "—"],
    ["Amount", fmtMoney(ctx.payable.total, ctx.payable.currency)],
  ];
  if (ctx.payable.payment_method) rows.push(["Method", ctx.payable.payment_method]);
  if (ctx.payable.payment_reference) rows.push(["Reference", ctx.payable.payment_reference]);

  const body = [
    statusBadge("success", "Payment sent"),
    title("Your payment has been issued"),
    lead(
      `Hi ${esc(firstName(ctx.vendor.full_name))}, payment has been issued for this job. Reference details below — please match against your bank record.`,
    ),
    detailsTable(rows),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tbody><tr><td align="center" bgcolor="#0891B2" style="background:#0891B2;border-radius:8px;"><a href="${esc(VENDOR_PORTAL_URL + "/invoices")}" target="_blank" style="display:inline-block;padding:14px 28px;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;">View payment history</a></td></tr></tbody></table>`,
  ].join("");

  await sendOne({
    supabase: ctx.supabase,
    eventType: "payable_paid",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: emailShell(body, { replyTo: REPLY.vendor, template: TPL.payablePaid }),
    orderId: ctx.order.id,
    stepId: ctx.step.id,
    payableId: ctx.payable.id,
    metadata: {
      payment_method: ctx.payable.payment_method ?? null,
      payment_reference: ctx.payable.payment_reference ?? null,
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 5. notifyVendorUnassigned
// ──────────────────────────────────────────────────────────────────────────
export interface UnassignedContext extends StepLifecycleContext {
  reason: string | null;
  notes: string | null;
}

export async function notifyVendorUnassigned(ctx: UnassignedContext): Promise<void> {
  const reasonLabel = ctx.reason
    ? UNASSIGN_REASON_LABELS[ctx.reason] ?? ctx.reason
    : "Not specified";
  const subject = `Assignment removed: ${ctx.order.order_number} — ${ctx.step.name || "step"}`;
  const notesCallout = ctx.notes
    ? callout({ tone: "info", title: "Notes from project manager", body: esc(ctx.notes) })
    : "";

  const body = [
    eyebrow("Assignment removed", "muted"),
    title(`Assignment removed for ${esc(ctx.order.order_number)}`),
    lead(
      `Hi ${esc(firstName(ctx.vendor.full_name))}, your assignment for order ${strong(esc(ctx.order.order_number))} has been removed by the project manager. You no longer need to deliver this step. See details and reason below.`,
    ),
    detailsTable([
      ["Order", ctx.order.order_number],
      ["Step", ctx.step.name || "—"],
      ["Reason", reasonLabel],
    ]),
    notesCallout,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tbody><tr><td align="center" bgcolor="#0891B2" style="background:#0891B2;border-radius:8px;"><a href="${esc(VENDOR_PORTAL_URL + "/jobs")}" target="_blank" style="display:inline-block;padding:14px 28px;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;">Open vendor portal</a></td></tr></tbody></table>`,
  ].join("");

  await sendOne({
    supabase: ctx.supabase,
    eventType: "vendor_unassigned",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: emailShell(body, { replyTo: REPLY.vendor, template: TPL.unassigned }),
    orderId: ctx.order.id,
    stepId: ctx.step.id,
    metadata: {
      reason: ctx.reason ?? null,
      reason_label: reasonLabel,
      notes: ctx.notes ?? null,
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 6. notifyVendorDeadlineChanged
// ──────────────────────────────────────────────────────────────────────────
export interface DeadlineChangedContext extends StepLifecycleContext {
  old_deadline: string | null;
  new_deadline: string;
  reason: string | null;
}

export async function notifyVendorDeadlineChanged(ctx: DeadlineChangedContext): Promise<void> {
  const subject = `Deadline updated: ${ctx.order.order_number} — ${ctx.step.name || "step"}`;
  const now = Date.now();
  const oldMs = ctx.old_deadline ? new Date(ctx.old_deadline).getTime() : null;
  const newMs = new Date(ctx.new_deadline).getTime();
  const shifted: "extended" | "shortened" | "unchanged" | null =
    oldMs != null && Number.isFinite(oldMs) && Number.isFinite(newMs)
      ? newMs > oldMs ? "extended"
        : newMs < oldMs ? "shortened" : "unchanged"
      : null;

  const leadCopy =
    shifted === "extended"
      ? `Hi ${esc(firstName(ctx.vendor.full_name))}, the deadline for your assignment on order ${strong(esc(ctx.order.order_number))} has been ${strong("extended")}. The new deadline is below.`
      : shifted === "shortened"
        ? `Hi ${esc(firstName(ctx.vendor.full_name))}, the deadline for your assignment on order ${strong(esc(ctx.order.order_number))} has been ${strong("shortened")}. Please confirm you can still deliver by the new deadline.`
        : `Hi ${esc(firstName(ctx.vendor.full_name))}, the deadline for your assignment on order ${strong(esc(ctx.order.order_number))} has been updated. Details below.`;

  const tone = shifted === "shortened" ? "warn" : "info";

  const rows: Array<[string, string]> = [
    ["Order", ctx.order.order_number],
    ["Step", ctx.step.name || "—"],
  ];
  if (ctx.old_deadline) rows.push(["Previous deadline", fmtDate(ctx.old_deadline)]);
  rows.push(["New deadline", fmtDate(ctx.new_deadline)]);

  const reasonCallout = ctx.reason
    ? callout({ tone, title: "Reason", body: esc(ctx.reason) })
    : "";

  const body = [
    eyebrow("Deadline updated", tone === "warn" ? "warn" : "teal"),
    title("Deadline updated"),
    lead(leadCopy),
    detailsTable(rows),
    reasonCallout,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tbody><tr><td align="center" bgcolor="#0891B2" style="background:#0891B2;border-radius:8px;"><a href="${esc(VENDOR_PORTAL_URL + "/jobs")}" target="_blank" style="display:inline-block;padding:14px 28px;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;">Open job</a></td></tr></tbody></table>`,
  ].join("");

  await sendOne({
    supabase: ctx.supabase,
    eventType: "vendor_deadline_changed",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: emailShell(body, { replyTo: REPLY.vendor, template: TPL.deadlineChanged }),
    orderId: ctx.order.id,
    stepId: ctx.step.id,
    metadata: {
      old_deadline: ctx.old_deadline ?? null,
      new_deadline: ctx.new_deadline,
      direction: shifted,
      reason: ctx.reason ?? null,
      hours_from_now:
        Number.isFinite(newMs) ? Math.round(((newMs - now) / 3600000) * 10) / 10 : null,
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 7. notifyVendorPayableAdjusted
// ──────────────────────────────────────────────────────────────────────────
export interface PayableAdjustedContext extends StepLifecycleContext {
  old_rate: number | null;
  new_rate: number | null;
  old_subtotal: number | null;
  new_subtotal: number | null;
  currency: string;
  reason: string | null;
}

export async function notifyVendorPayableAdjusted(ctx: PayableAdjustedContext): Promise<void> {
  const subject = `Payable adjusted: ${ctx.order.order_number} — ${ctx.step.name || "step"}`;
  const direction: "increased" | "decreased" | "unchanged" | null =
    ctx.old_subtotal != null && ctx.new_subtotal != null
      ? ctx.new_subtotal > ctx.old_subtotal ? "increased"
        : ctx.new_subtotal < ctx.old_subtotal ? "decreased" : "unchanged"
      : null;
  const leadCopy =
    direction === "increased"
      ? `Hi ${esc(firstName(ctx.vendor.full_name))}, the payable for your work on order ${strong(esc(ctx.order.order_number))} has been ${strong("increased")}. Updated amounts below — please invoice the new total when ready.`
      : direction === "decreased"
        ? `Hi ${esc(firstName(ctx.vendor.full_name))}, the payable for your work on order ${strong(esc(ctx.order.order_number))} has been ${strong("decreased")}. Updated amounts below — please invoice the new total when ready.`
        : `Hi ${esc(firstName(ctx.vendor.full_name))}, the payable for your work on order ${strong(esc(ctx.order.order_number))} has been adjusted. Updated amounts below.`;

  const rows: Array<[string, string]> = [
    ["Order", ctx.order.order_number],
    ["Step", ctx.step.name || "—"],
  ];
  if (ctx.old_rate != null) rows.push(["Previous rate", fmtMoney(ctx.old_rate, ctx.currency)]);
  if (ctx.new_rate != null) rows.push(["New rate", fmtMoney(ctx.new_rate, ctx.currency)]);
  if (ctx.old_subtotal != null) rows.push(["Previous total", fmtMoney(ctx.old_subtotal, ctx.currency)]);
  if (ctx.new_subtotal != null) rows.push(["New total", fmtMoney(ctx.new_subtotal, ctx.currency)]);

  const reasonCallout = ctx.reason
    ? callout({ tone: "info", title: "Reason", body: esc(ctx.reason) })
    : "";

  const body = [
    eyebrow("Payable adjusted", "teal"),
    title("Payable adjusted"),
    lead(leadCopy),
    detailsTable(rows),
    reasonCallout,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tbody><tr><td align="center" bgcolor="#0891B2" style="background:#0891B2;border-radius:8px;"><a href="${esc(VENDOR_PORTAL_URL + "/jobs")}" target="_blank" style="display:inline-block;padding:14px 28px;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;">View in vendor portal</a></td></tr></tbody></table>`,
  ].join("");

  await sendOne({
    supabase: ctx.supabase,
    eventType: "vendor_payable_adjusted",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: emailShell(body, { replyTo: REPLY.vendor, template: TPL.payableAdjusted }),
    orderId: ctx.order.id,
    stepId: ctx.step.id,
    payableId: ctx.payable?.id ?? null,
    metadata: {
      old_rate: ctx.old_rate,
      new_rate: ctx.new_rate,
      old_subtotal: ctx.old_subtotal,
      new_subtotal: ctx.new_subtotal,
      currency: ctx.currency,
      direction,
      reason: ctx.reason ?? null,
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 8. notifyCustomerWorkflowCompleted — order complete (customer).
// ──────────────────────────────────────────────────────────────────────────
export interface WorkflowCompletedContext {
  supabase: any;
  customer: { id: string; full_name: string | null; email: string };
  order: { id: string; order_number: string };
  workflowId: string;
}

export async function notifyCustomerWorkflowCompleted(ctx: WorkflowCompletedContext): Promise<void> {
  const subject = `Order complete: ${ctx.order.order_number}`;
  const greeting = ctx.customer.full_name
    ? `Hi ${esc(firstName(ctx.customer.full_name))},`
    : "Hi,";

  const body = [
    statusBadge("success", "Order complete"),
    title("Your order is complete"),
    lead(
      `${greeting} good news — every step of your order has been completed and approved. Your final deliverable is being prepared.`,
    ),
    detailsTable([
      ["Order", ctx.order.order_number],
      ["Status", "Completed"],
    ]),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tbody><tr><td align="center" bgcolor="#0891B2" style="background:#0891B2;border-radius:8px;"><a href="${esc(ADMIN_PORTAL_URL + "/orders/" + ctx.order.id)}" target="_blank" style="display:inline-block;padding:14px 28px;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;">Open order</a></td></tr></tbody></table>`,
  ].join("");

  await sendOne({
    supabase: ctx.supabase,
    eventType: "workflow_completed",
    recipientType: "customer",
    recipientEmail: ctx.customer.email,
    recipientName: ctx.customer.full_name,
    recipientId: ctx.customer.id,
    subject,
    htmlContent: emailShell(body, { replyTo: REPLY.customer, template: TPL.workflowCompleted }),
    replyTo: REPLY.customer,
    orderId: ctx.order.id,
    metadata: { workflow_id: ctx.workflowId },
  });
}
