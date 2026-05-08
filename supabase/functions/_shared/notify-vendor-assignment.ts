// ============================================================================
// notify-vendor-assignment
// Shared helper used by update-workflow-step to send a Brevo email when
// a vendor is offered or directly assigned to a workflow step. Failures
// are swallowed so they don't block the assignment write.
// ============================================================================

interface NotifyArgs {
  supabase: any;
  vendor_id: string;
  step: any;
  workflow: any;
  kind: "direct_assign" | "offer_vendor";
  vendor_rate?: number | null;
  vendor_rate_unit?: string | null;
  vendor_total?: number | null;
  vendor_currency?: string | null;
  deadline?: string | null;
  expires_at?: string | null;
  instructions?: string | null;
}

const VENDOR_PORTAL_URL =
  Deno.env.get("VENDOR_PORTAL_URL") || "https://vendor.cethos.com";

const escapeHtml = (s: string | null | undefined): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });

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

export async function notifyVendorAssignment(args: NotifyArgs): Promise<void> {
  try {
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) {
      console.warn("notify-vendor-assignment: BREVO_API_KEY not set, skipping");
      return;
    }

    const { supabase, vendor_id, step, workflow, kind } = args;

    // Resolve vendor + order envelope in parallel
    const [{ data: vendor }, { data: order }] = await Promise.all([
      supabase
        .from("vendors")
        .select("id, full_name, email, additional_emails")
        .eq("id", vendor_id)
        .maybeSingle(),
      supabase
        .from("orders")
        .select("id, order_number, internal_project_id")
        .eq("id", workflow?.order_id)
        .maybeSingle(),
    ]);

    if (!vendor?.email) {
      console.warn(`notify-vendor-assignment: vendor ${vendor_id} has no email`);
      return;
    }

    // Additional cc recipients (vendors.additional_emails). Filter out
    // empties and the primary so we don't double-deliver.
    const ccList: string[] = Array.isArray(vendor.additional_emails)
      ? vendor.additional_emails
          .map((e: any) => String(e || "").trim())
          .filter((e: string) => e && e.toLowerCase() !== String(vendor.email).toLowerCase())
      : [];

    const isOffer = kind === "offer_vendor";
    const subject = isOffer
      ? `New offer: ${order?.order_number ?? "Order"} — ${step?.name ?? "step"}`
      : `Assigned: ${order?.order_number ?? "Order"} — ${step?.name ?? "step"}`;

    const portalLink = `${VENDOR_PORTAL_URL}/jobs`;
    const ctaLabel = isOffer ? "Review offer" : "View assignment";

    const detailRows: Array<[string, string]> = [
      ["Order", order?.order_number ?? "—"],
      ["Step", step?.name ?? `Step ${step?.step_number ?? ""}`],
    ];
    if (args.vendor_rate != null && args.vendor_total != null) {
      detailRows.push([
        "Rate",
        `${fmtMoney(args.vendor_rate, args.vendor_currency)} per ${args.vendor_rate_unit || "unit"}`,
      ]);
      detailRows.push(["Total", fmtMoney(args.vendor_total, args.vendor_currency)]);
    }
    if (args.deadline) detailRows.push(["Deadline", fmtDate(args.deadline)]);
    if (isOffer && args.expires_at)
      detailRows.push(["Offer expires", fmtDate(args.expires_at)]);

    const detailsHtml = detailRows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:4px 0;color:#111827;font-size:14px;">${escapeHtml(v)}</td></tr>`,
      )
      .join("");

    const instructionsBlock = args.instructions
      ? `<div style="margin-top:16px;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;color:#374151;font-size:13px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(args.instructions)}</div>`
      : "";

    const lead = isOffer
      ? `You have a new offer for <strong>${escapeHtml(order?.order_number ?? "an order")}</strong>. Please respond before the offer expires.`
      : `You have been assigned to <strong>${escapeHtml(order?.order_number ?? "an order")}</strong>. The job is ready to start.`;

    const htmlContent = `
<!doctype html>
<html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:20px 24px;background:#0f766e;color:#ffffff;">
          <div style="font-size:18px;font-weight:600;">Cethos Translation Services</div>
          <div style="font-size:13px;opacity:0.85;margin-top:2px;">${escapeHtml(isOffer ? "New job offer" : "New job assignment")}</div>
        </td></tr>
        <tr><td style="padding:24px;color:#111827;">
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">Hello ${escapeHtml(vendor.full_name || "there")},</p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">${lead}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;">${detailsHtml}</table>
          ${instructionsBlock}
          <p style="margin:24px 0 0;text-align:center;">
            <a href="${escapeHtml(portalLink)}" style="display:inline-block;padding:10px 20px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">${escapeHtml(ctaLabel)}</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
          You're receiving this because you're a registered Cethos vendor.
          Reply to this email or visit the vendor portal if you have questions.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim();

    const payload: Record<string, unknown> = {
      to: [{ email: vendor.email, name: vendor.full_name || vendor.email }],
      sender: { name: "Cethos Translation Services", email: "donotreply@cethos.com" },
      replyTo: { email: "vendor@cethos.com", name: "Cethos Vendor Ops" },
      subject,
      htmlContent,
      tags: [`vendor-assignment-${kind}`, `order-${order?.order_number ?? "unknown"}`],
    };
    if (ccList.length > 0) {
      payload.cc = ccList.map((e) => ({ email: e }));
    }

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
      console.error("notify-vendor-assignment Brevo error:", JSON.stringify(result));
      return;
    }
    console.log(
      `notify-vendor-assignment ${kind} sent to ${vendor.email} (msg ${result?.messageId})`,
    );
  } catch (err: any) {
    console.error("notify-vendor-assignment threw:", err?.message || err);
  }
}
