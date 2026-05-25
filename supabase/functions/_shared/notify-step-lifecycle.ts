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
// Each helper writes a row to notification_log (success or failure) so the
// admin "Email log" modal can show staff what was sent — same pattern as
// notify-counter.ts and notify-vendor-assignment.ts.
// ============================================================================

const VENDOR_PORTAL_URL =
  Deno.env.get("VENDOR_PORTAL_URL") || "https://vendor.cethos.com";
const ADMIN_PORTAL_URL =
  Deno.env.get("ADMIN_PORTAL_URL") || "https://portal.cethos.com";

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

const fmtMoney = (amount: number | null | undefined, currency: string | null | undefined): string => {
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

// Human-readable labels for the unassign_reason enum the admin UI picks
// from. Falls through to the raw value if a new reason is added before
// this map is updated.
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
  const payload: Record<string, unknown> = {
    to: [{ email: args.recipientEmail, name: args.recipientName || args.recipientEmail }],
    sender: { name: "Cethos Translation Services", email: "donotreply@cethos.com" },
    replyTo: { email: "vendor@cethos.com", name: "Cethos Vendor Ops" },
    subject: args.subject,
    htmlContent: args.htmlContent,
    tags: [args.eventType],
  };
  if (args.ccEmails && args.ccEmails.length > 0) {
    payload.cc = args.ccEmails.map((e) => ({ email: e }));
  }

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

function emailShell(title: string, lead: string, detailsHtml: string, noteHtml: string, ctaLabel: string, ctaUrl: string): string {
  return `
<!doctype html>
<html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:20px 24px;background:#0f766e;color:#ffffff;">
          <div style="font-size:18px;font-weight:600;">Cethos Translation Services</div>
          <div style="font-size:13px;opacity:0.85;margin-top:2px;">${escapeHtml(title)}</div>
        </td></tr>
        <tr><td style="padding:24px;color:#111827;">
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">${lead}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;">${detailsHtml}</table>
          ${noteHtml}
          <p style="margin:24px 0 0;text-align:center;">
            <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:10px 20px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">${escapeHtml(ctaLabel)}</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
          Replies to this email go to vendor@cethos.com.
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

function noteBlock(label: string, body: string): string {
  if (!body) return "";
  return `<div style="margin-top:16px;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;color:#374151;font-size:13px;line-height:1.5;white-space:pre-wrap;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(body)}</div>`;
}

// Common context shape — vendor + order + step + payable are the four
// entities every step-lifecycle email touches.
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
// 1. notifyVendorStepApproved — admin approved the vendor's delivery.
// This makes the work invoiceable; payment happens later, only after admin
// marks the payable paid. Copy must not imply auto-scheduling.
// ──────────────────────────────────────────────────────────────────────────
export async function notifyVendorStepApproved(ctx: StepLifecycleContext): Promise<void> {
  const subject = `Step approved: ${ctx.order.order_number} — ${ctx.step.name || "step"}`;
  const lead = `Your delivery has been approved. Thanks for the work — this step is now eligible for invoicing. You can submit your invoice from the vendor portal whenever you're ready.`;
  const items: Array<[string, string]> = [
    ["Order", ctx.order.order_number],
    ["Step", ctx.step.name || "—"],
  ];
  if (ctx.payable?.total != null) items.push(["Amount", fmtMoney(ctx.payable.total, ctx.payable.currency)]);
  const html = emailShell(
    "Step approved — thank you",
    lead,
    rows(items),
    "",
    "Open vendor portal",
    `${VENDOR_PORTAL_URL}/jobs`,
  );
  await sendOne({
    supabase: ctx.supabase,
    eventType: "step_approved",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: html,
    orderId: ctx.order.id,
    stepId: ctx.step.id,
    payableId: ctx.payable?.id ?? null,
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 2. notifyVendorRevisionRequested — admin asked the vendor to revise.
// Carries the reviewer's reason so vendor knows what to address.
// ──────────────────────────────────────────────────────────────────────────
export async function notifyVendorRevisionRequested(
  ctx: StepLifecycleContext & { reason: string | null },
): Promise<void> {
  const subject = `Revision requested: ${ctx.order.order_number} — ${ctx.step.name || "step"}`;
  const lead = `The reviewer has requested revisions to your delivery. Please address the feedback and re-deliver from the vendor portal.`;
  const html = emailShell(
    "Revision requested",
    lead,
    rows([
      ["Order", ctx.order.order_number],
      ["Step", ctx.step.name || "—"],
    ]),
    noteBlock("Reviewer feedback", ctx.reason ?? ""),
    "Open job",
    `${VENDOR_PORTAL_URL}/jobs`,
  );
  await sendOne({
    supabase: ctx.supabase,
    eventType: "revision_requested",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: html,
    orderId: ctx.order.id,
    stepId: ctx.step.id,
    metadata: { reason: ctx.reason ?? null },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 3. notifyVendorPayableInvoiced — admin recorded the vendor's invoice number.
// Confirms admin received the invoice; payment is the next state.
// ──────────────────────────────────────────────────────────────────────────
export async function notifyVendorPayableInvoiced(ctx: StepLifecycleContext): Promise<void> {
  if (!ctx.payable) return;
  const subject = `Invoice recorded: ${ctx.order.order_number}`;
  const lead = `Your invoice has been recorded against this job. Payment will follow per the agreed terms.`;
  const items: Array<[string, string]> = [
    ["Order", ctx.order.order_number],
    ["Step", ctx.step.name || "—"],
    ["Amount", fmtMoney(ctx.payable.total, ctx.payable.currency)],
  ];
  if (ctx.payable.vendor_invoice_number) items.push(["Invoice #", ctx.payable.vendor_invoice_number]);
  if (ctx.payable.vendor_invoice_date) items.push(["Invoice date", ctx.payable.vendor_invoice_date]);
  const html = emailShell(
    "Invoice recorded",
    lead,
    rows(items),
    "",
    "Open vendor portal",
    `${VENDOR_PORTAL_URL}/invoices`,
  );
  await sendOne({
    supabase: ctx.supabase,
    eventType: "payable_invoiced",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: html,
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
// 4. notifyVendorPayablePaid — admin marked the payable paid.
// Final payment confirmation. Carries method + reference so vendor can
// match against their bank record.
// ──────────────────────────────────────────────────────────────────────────
export async function notifyVendorPayablePaid(ctx: StepLifecycleContext): Promise<void> {
  if (!ctx.payable) return;
  const subject = `Payment sent: ${ctx.order.order_number}`;
  const lead = `Payment has been issued for this job. Reference details below.`;
  const items: Array<[string, string]> = [
    ["Order", ctx.order.order_number],
    ["Step", ctx.step.name || "—"],
    ["Amount", fmtMoney(ctx.payable.total, ctx.payable.currency)],
  ];
  if (ctx.payable.payment_method) items.push(["Method", ctx.payable.payment_method]);
  if (ctx.payable.payment_reference) items.push(["Reference", ctx.payable.payment_reference]);
  const html = emailShell(
    "Payment sent",
    lead,
    rows(items),
    "",
    "View payment history",
    `${VENDOR_PORTAL_URL}/invoices`,
  );
  await sendOne({
    supabase: ctx.supabase,
    eventType: "payable_paid",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: html,
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
// 5. notifyCustomerWorkflowCompleted — fired when the last workflow step
// flips to approved/skipped and the parent order_workflows row transitions
// to status='completed'. Tells the customer their order is done.
//
// Uses a separate context shape (customer, no vendor) but the same Brevo
// + notification_log audit pipeline via sendOne. recipient_type='customer'
// so admin email-log filters can distinguish customer-facing emails.
// ──────────────────────────────────────────────────────────────────────────
export interface WorkflowCompletedContext {
  supabase: any;
  customer: { id: string; full_name: string | null; email: string };
  order: { id: string; order_number: string };
  workflowId: string;
}

// ──────────────────────────────────────────────────────────────────────────
// 6. notifyVendorUnassigned — admin removed the vendor from a step.
// Fires AFTER the step has been reset (vendor_id cleared, unassigned_*
// columns populated), so the caller must pass the previous vendor's row
// in the context — we don't try to re-fetch off step.vendor_id (which is
// now null).
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
  const lead = `Your assignment for order <strong>${escapeHtml(ctx.order.order_number)}</strong> has been removed by the project manager. You no longer need to deliver this step. See details and reason below.`;
  const items: Array<[string, string]> = [
    ["Order", ctx.order.order_number],
    ["Step", ctx.step.name || "—"],
    ["Reason", reasonLabel],
  ];
  const note = ctx.notes ? noteBlock("Notes from project manager", ctx.notes) : "";
  const html = emailShell(
    "Assignment removed",
    lead,
    rows(items),
    note,
    "Open vendor portal",
    `${VENDOR_PORTAL_URL}/jobs`,
  );
  await sendOne({
    supabase: ctx.supabase,
    eventType: "vendor_unassigned",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: html,
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
// 7. notifyVendorDeadlineChanged — admin updated the step deadline.
// Surfaces old → new so the vendor immediately sees what shifted.
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
  const shifted =
    oldMs != null && Number.isFinite(oldMs) && Number.isFinite(newMs)
      ? newMs > oldMs
        ? "extended"
        : newMs < oldMs
          ? "shortened"
          : "unchanged"
      : null;
  const lead =
    shifted === "extended"
      ? `The deadline for your assignment on order <strong>${escapeHtml(ctx.order.order_number)}</strong> has been <strong>extended</strong>. The new deadline is below.`
      : shifted === "shortened"
        ? `The deadline for your assignment on order <strong>${escapeHtml(ctx.order.order_number)}</strong> has been <strong>shortened</strong>. Please confirm you can still deliver by the new deadline.`
        : `The deadline for your assignment on order <strong>${escapeHtml(ctx.order.order_number)}</strong> has been updated. Details below.`;
  const items: Array<[string, string]> = [
    ["Order", ctx.order.order_number],
    ["Step", ctx.step.name || "—"],
  ];
  if (ctx.old_deadline) items.push(["Previous deadline", fmtDate(ctx.old_deadline)]);
  items.push(["New deadline", fmtDate(ctx.new_deadline)]);
  const note = ctx.reason ? noteBlock("Reason", ctx.reason) : "";
  const html = emailShell(
    "Deadline updated",
    lead,
    rows(items),
    note,
    "Open job",
    `${VENDOR_PORTAL_URL}/jobs`,
  );
  await sendOne({
    supabase: ctx.supabase,
    eventType: "vendor_deadline_changed",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: html,
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
// 8. notifyVendorPayableAdjusted — admin changed the rate or total on a
// committed payable. The vendor needs to see this so they don't invoice
// the old amount.
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
  const direction =
    ctx.old_subtotal != null && ctx.new_subtotal != null
      ? ctx.new_subtotal > ctx.old_subtotal
        ? "increased"
        : ctx.new_subtotal < ctx.old_subtotal
          ? "decreased"
          : "unchanged"
      : null;
  const lead =
    direction === "increased"
      ? `The payable for your work on order <strong>${escapeHtml(ctx.order.order_number)}</strong> has been <strong>increased</strong>. Updated amounts below — please invoice the new total when ready.`
      : direction === "decreased"
        ? `The payable for your work on order <strong>${escapeHtml(ctx.order.order_number)}</strong> has been <strong>decreased</strong>. Updated amounts below — please invoice the new total when ready.`
        : `The payable for your work on order <strong>${escapeHtml(ctx.order.order_number)}</strong> has been adjusted. Updated amounts below.`;
  const items: Array<[string, string]> = [
    ["Order", ctx.order.order_number],
    ["Step", ctx.step.name || "—"],
  ];
  if (ctx.old_rate != null) items.push(["Previous rate", fmtMoney(ctx.old_rate, ctx.currency)]);
  if (ctx.new_rate != null) items.push(["New rate", fmtMoney(ctx.new_rate, ctx.currency)]);
  if (ctx.old_subtotal != null) items.push(["Previous total", fmtMoney(ctx.old_subtotal, ctx.currency)]);
  if (ctx.new_subtotal != null) items.push(["New total", fmtMoney(ctx.new_subtotal, ctx.currency)]);
  const note = ctx.reason ? noteBlock("Reason", ctx.reason) : "";
  const html = emailShell(
    "Payable adjusted",
    lead,
    rows(items),
    note,
    "View in vendor portal",
    `${VENDOR_PORTAL_URL}/jobs`,
  );
  await sendOne({
    supabase: ctx.supabase,
    eventType: "vendor_payable_adjusted",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: html,
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

export async function notifyCustomerWorkflowCompleted(ctx: WorkflowCompletedContext): Promise<void> {
  const subject = `Order complete: ${ctx.order.order_number}`;
  const greeting = ctx.customer.full_name
    ? `Hi ${escapeHtml(ctx.customer.full_name.split(" ")[0])},`
    : `Hi,`;
  const lead = `${greeting} good news — every step of your order has been completed and approved. Your final deliverable is being prepared.`;
  const html = emailShell(
    "Your order is complete",
    lead,
    rows([
      ["Order", ctx.order.order_number],
      ["Status", "Completed"],
    ]),
    "",
    "Open order",
    `${ADMIN_PORTAL_URL}/orders/${ctx.order.id}`,
  );
  await sendOne({
    supabase: ctx.supabase,
    eventType: "workflow_completed",
    recipientType: "customer",
    recipientEmail: ctx.customer.email,
    recipientName: ctx.customer.full_name,
    recipientId: ctx.customer.id,
    subject,
    htmlContent: html,
    orderId: ctx.order.id,
    metadata: { workflow_id: ctx.workflowId },
  });
}
