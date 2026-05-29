// ============================================================================
// notify-counter.ts (admin repo copy)
// Shared helpers for counter-offer email notifications fired by
// admin-respond-counter-offer. Mirrors the vendor-repo copy at
// D:\cethos-vendor\supabase\functions\_shared\notify-counter.ts — please
// keep both in sync.
//
// Triggers wired by admin-respond-counter-offer:
//   * `accepted` — admin accepted the counter; emails the vendor.
//   * `rejected` — admin rejected the counter; emails the vendor.
//
// Renders through `_shared/email-shell.ts`. Per-event TemplateMeta surfaces
// in the footer.
// ============================================================================

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
  title,
  type TemplateMeta,
} from "./email-shell.ts";

const TPL = {
  counterAccepted: { name: "Vendor — Counter Accepted", version: "2.0", updatedAt: "2026-05-28" } as TemplateMeta,
  counterRejected: { name: "Vendor — Counter Declined", version: "2.0", updatedAt: "2026-05-28" } as TemplateMeta,
};

const VENDOR_PORTAL_URL =
  Deno.env.get("VENDOR_PORTAL_URL") || "https://vendor.cethos.com";

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

interface SendArgs {
  supabase: any;
  eventType: string;
  recipientType: "vendor" | "admin";
  recipientEmail: string;
  recipientName?: string | null;
  recipientId?: string | null;
  ccEmails?: string[];
  subject: string;
  htmlContent: string;
  metadata?: Record<string, unknown>;
  orderId?: string | null;
  stepId?: string | null;
  offerId?: string | null;
}

async function sendOne(args: SendArgs): Promise<void> {
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  if (!BREVO_API_KEY) {
    console.warn("notify-counter: BREVO_API_KEY not set, skipping send");
    return;
  }

  const payload = brevoPayload({
    to: [{ email: args.recipientEmail, name: args.recipientName || args.recipientEmail }],
    subject: args.subject,
    html: args.htmlContent,
    replyTo: REPLY.vendor,
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
      console.error("notify-counter Brevo error:", errorMsg);
    } else {
      brevoMessageId = result?.messageId ?? null;
    }
  } catch (err: any) {
    status = "failed";
    errorMsg = err?.message || String(err);
    console.error("notify-counter threw:", errorMsg);
  }

  try {
    await args.supabase.from("notification_log").insert({
      event_type: args.eventType,
      recipient_type: args.recipientType,
      recipient_email: args.recipientEmail,
      recipient_name: args.recipientName ?? null,
      recipient_id: args.recipientId ?? null,
      order_id: args.orderId ?? null,
      step_id: args.stepId ?? null,
      offer_id: args.offerId ?? null,
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
    console.error("notify-counter notification_log insert failed:", e?.message || e);
  }
}

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

interface DecisionContext {
  supabase: any;
  offerId: string;
  stepId: string;
  vendor: VendorRow;
  order: { id: string; order_number: string };
  step: { id: string; name: string | null };
  applied: {
    rate: number | null;
    rate_unit: string | null;
    total: number | null;
    currency: string;
    deadline: string | null;
  };
  rejectionReason?: string | null;
}

function appliedRows(c: DecisionContext): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["Order", c.order.order_number],
    ["Step", c.step.name || "—"],
  ];
  if (c.applied.rate != null) rows.push(["Rate", fmtMoney(c.applied.rate, c.applied.currency)]);
  if (c.applied.total != null) rows.push(["Total", fmtMoney(c.applied.total, c.applied.currency)]);
  if (c.applied.deadline) rows.push(["Deadline", fmtDate(c.applied.deadline)]);
  return rows;
}

// `accepted` — admin accepted the counter; vendor's assignment is now live
// at the counter terms.
export async function notifyVendorCounterAccepted(ctx: DecisionContext): Promise<void> {
  const subject = `Counter accepted — you're assigned: ${ctx.order.order_number}`;

  const body = [
    statusBadge("success", "Counter accepted"),
    title("Your counter was accepted — assignment confirmed"),
    lead(
      `Hi ${esc(firstName(ctx.vendor.full_name))}, good news — your counter-proposal was accepted. The step has been assigned to you at the terms below.`,
    ),
    detailsTable(appliedRows(ctx)),
    callout({
      tone: "success",
      title: "What happens next",
      body: "You'll find the job in your vendor portal queue. Begin work whenever you're ready; the deadline above is binding.",
    }),
    ctaButton({ label: "View in vendor portal", url: `${VENDOR_PORTAL_URL}/jobs` }),
  ].join("");

  await sendOne({
    supabase: ctx.supabase,
    eventType: "counter_accepted",
    recipientType: "vendor",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: emailShell(body, { replyTo: REPLY.vendor, template: TPL.counterAccepted }),
    orderId: ctx.order.id,
    stepId: ctx.step.id,
    offerId: ctx.offerId,
  });
}

// `rejected` — admin rejected the counter; the original offer is back in
// the vendor's court.
export async function notifyVendorCounterRejected(ctx: DecisionContext): Promise<void> {
  const subject = `Counter declined: ${ctx.order.order_number}`;

  const reasonCallout = ctx.rejectionReason
    ? callout({ tone: "error", title: "Reason", body: esc(ctx.rejectionReason) })
    : "";

  const body = [
    statusBadge("warn", "Counter declined"),
    title("Your counter was declined"),
    lead(
      `Hi ${esc(firstName(ctx.vendor.full_name))}, the admin has declined your counter-proposal. The original offer is still open if you'd like to accept it as offered, or you can decline.`,
    ),
    detailsTable(appliedRows(ctx)),
    reasonCallout,
    ctaButton({ label: "Review original offer", url: `${VENDOR_PORTAL_URL}/jobs` }),
  ].join("");

  await sendOne({
    supabase: ctx.supabase,
    eventType: "counter_rejected",
    recipientType: "vendor",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: emailShell(body, { replyTo: REPLY.vendor, template: TPL.counterRejected }),
    orderId: ctx.order.id,
    stepId: ctx.step.id,
    offerId: ctx.offerId,
    metadata: { rejection_reason: ctx.rejectionReason ?? null },
  });
}
