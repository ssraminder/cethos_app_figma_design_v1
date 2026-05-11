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
// ============================================================================

const VENDOR_PORTAL_URL =
  Deno.env.get("VENDOR_PORTAL_URL") || "https://vendor.cethos.com";

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

function appliedRows(c: DecisionContext): string {
  const rows: Array<[string, string]> = [
    ["Order", c.order.order_number],
    ["Step", c.step.name || "—"],
  ];
  if (c.applied.rate != null) rows.push(["Rate", fmtMoney(c.applied.rate, c.applied.currency)]);
  if (c.applied.total != null) rows.push(["Total", fmtMoney(c.applied.total, c.applied.currency)]);
  if (c.applied.deadline) rows.push(["Deadline", fmtDate(c.applied.deadline)]);
  return rows
    .map(([k, v]) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:4px 0;color:#111827;font-size:14px;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
}

function reasonBlock(reason: string | null | undefined): string {
  if (!reason) return "";
  return `<div style="margin-top:16px;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;color:#991b1b;font-size:13px;line-height:1.5;white-space:pre-wrap;"><strong>Reason:</strong> ${escapeHtml(reason)}</div>`;
}

// `accepted` — admin accepted the counter; vendor's assignment is now live
// at the counter terms.
export async function notifyVendorCounterAccepted(ctx: DecisionContext): Promise<void> {
  const subject = `Counter accepted — you're assigned: ${ctx.order.order_number}`;
  const lead = `Good news — your counter-proposal was accepted. The step has been assigned to you at the terms below.`;
  const html = emailShell(
    "Counter accepted — assignment confirmed",
    lead,
    appliedRows(ctx),
    "",
    "View in vendor portal",
    `${VENDOR_PORTAL_URL}/jobs`,
  );
  await sendOne({
    supabase: ctx.supabase,
    eventType: "counter_accepted",
    recipientType: "vendor",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: html,
    orderId: ctx.order.id,
    stepId: ctx.step.id,
    offerId: ctx.offerId,
  });
}

// `rejected` — admin rejected the counter; the original offer is back in
// the vendor's court (they can still Accept the original terms or Decline).
export async function notifyVendorCounterRejected(ctx: DecisionContext): Promise<void> {
  const subject = `Counter declined: ${ctx.order.order_number}`;
  const lead = `The admin has declined your counter-proposal. The original offer is still open if you'd like to accept it as offered, or you can decline.`;
  const html = emailShell(
    "Counter declined",
    lead,
    appliedRows(ctx),
    reasonBlock(ctx.rejectionReason),
    "Review original offer",
    `${VENDOR_PORTAL_URL}/jobs`,
  );
  await sendOne({
    supabase: ctx.supabase,
    eventType: "counter_rejected",
    recipientType: "vendor",
    recipientEmail: ctx.vendor.email,
    recipientName: ctx.vendor.full_name,
    recipientId: ctx.vendor.id,
    ccEmails: ccFor(ctx.vendor),
    subject,
    htmlContent: html,
    orderId: ctx.order.id,
    stepId: ctx.step.id,
    offerId: ctx.offerId,
    metadata: { rejection_reason: ctx.rejectionReason ?? null },
  });
}
