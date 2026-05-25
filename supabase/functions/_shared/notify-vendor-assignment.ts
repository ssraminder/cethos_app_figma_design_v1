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
  offer_id?: string | null;
  vendor_rate?: number | null;
  vendor_rate_unit?: string | null;
  vendor_total?: number | null;
  vendor_currency?: string | null;
  deadline?: string | null;
  expires_at?: string | null;
  instructions?: string | null;
}

// Writes a row to notification_log so vendor-offer sends are auditable the
// same way customer/admin emails are. Failures here MUST NOT throw — this
// helper itself runs in a fire-and-forget context inside update-workflow-step.
async function logNotification(
  supabase: any,
  fields: {
    event_type: string;
    recipient_email: string;
    recipient_name?: string | null;
    recipient_id?: string | null;
    order_id?: string | null;
    step_id?: string | null;
    offer_id?: string | null;
    subject: string;
    status: "sent" | "failed";
    error_message?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await supabase.from("notification_log").insert({
      event_type: fields.event_type,
      recipient_type: "vendor",
      recipient_email: fields.recipient_email,
      recipient_name: fields.recipient_name ?? null,
      recipient_id: fields.recipient_id ?? null,
      order_id: fields.order_id ?? null,
      step_id: fields.step_id ?? null,
      offer_id: fields.offer_id ?? null,
      subject: fields.subject,
      status: fields.status,
      error_message: fields.error_message ?? null,
      metadata: fields.metadata ?? {},
    });
  } catch (e: any) {
    console.error("notify-vendor-assignment notification_log insert failed:", e?.message || e);
  }
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

// Rate units are stored as "per_word"/"per_page"/"per_hour"/"flat". The
// raw value bleeds straight into the email otherwise — see "per per_page"
// in the assignment email before this fix.
const fmtRateUnit = (unit: string | null | undefined): string => {
  switch (unit) {
    case "per_word":
      return "per word";
    case "per_page":
      return "per page";
    case "per_hour":
      return "per hour";
    case "flat":
      return "flat";
    default:
      return unit ? unit.replace(/_/g, " ") : "unit";
  }
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolve a source/target language pair from the step row. Both fields
// are UUIDs into the `languages` table on order_workflow_steps; some
// older rows carry uppercase ISO codes directly. Returns display names
// (e.g. "English", "Hindi") so the email reads naturally.
async function resolveLanguagePair(
  supabase: any,
  sourceVal: string | null | undefined,
  targetVal: string | null | undefined,
): Promise<{ source: string | null; target: string | null }> {
  const ids = [sourceVal, targetVal].filter(
    (v): v is string => typeof v === "string" && UUID_RE.test(v),
  );
  let nameMap = new Map<string, string>();
  if (ids.length > 0) {
    try {
      const { data: rows } = await supabase
        .from("languages")
        .select("id, name")
        .in("id", ids);
      for (const r of (rows ?? []) as Array<{ id: string; name: string }>) {
        nameMap.set(r.id, r.name);
      }
    } catch (e: any) {
      console.warn("resolveLanguagePair lookup failed:", e?.message || e);
    }
  }
  const resolve = (v: string | null | undefined): string | null => {
    if (!v) return null;
    if (UUID_RE.test(v)) return nameMap.get(v) ?? null;
    return v;
  };
  return {
    source: resolve(sourceVal ?? null),
    target: resolve(targetVal ?? null),
  };
}

export async function notifyVendorAssignment(args: NotifyArgs): Promise<void> {
  try {
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) {
      console.warn("notify-vendor-assignment: BREVO_API_KEY not set, skipping");
      return;
    }

    const { supabase, vendor_id, step, workflow, kind } = args;

    // Resolve vendor + order envelope + service + language pair + workflow
    // step count in parallel. The extra context (languages, service, "Step
    // X of Y") was the missing piece in the previous template — vendors
    // had to open the portal just to find out what language pair they were
    // being asked to translate.
    const serviceId: string | null = step?.service_id ?? null;
    const workflowId: string | null = step?.workflow_id ?? workflow?.id ?? null;

    const [
      { data: vendor },
      { data: order },
      { data: service },
      languagePair,
      { count: totalStepsRaw },
    ] = await Promise.all([
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
      serviceId
        ? supabase
            .from("services")
            .select("name")
            .eq("id", serviceId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      resolveLanguagePair(
        supabase,
        step?.source_language ?? null,
        step?.target_language ?? null,
      ),
      workflowId
        ? supabase
            .from("order_workflow_steps")
            .select("id", { count: "exact", head: true })
            .eq("workflow_id", workflowId)
        : Promise.resolve({ count: null }),
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
    const totalSteps: number | null =
      typeof totalStepsRaw === "number" && totalStepsRaw > 0 ? totalStepsRaw : null;
    const stepNum = step?.step_number;
    const stepPositionLabel =
      stepNum != null && totalSteps != null
        ? `${stepNum} of ${totalSteps}`
        : stepNum != null
          ? `Step ${stepNum}`
          : null;
    const stepDisplayName = step?.name ?? null;
    const stepRowValue =
      stepPositionLabel && stepDisplayName
        ? `${stepPositionLabel} — ${stepDisplayName}`
        : stepDisplayName ?? stepPositionLabel ?? "—";

    const languagePairLabel =
      languagePair.source && languagePair.target
        ? `${languagePair.source} → ${languagePair.target}`
        : languagePair.source || languagePair.target || null;

    const subject = isOffer
      ? `New offer: ${order?.order_number ?? "Order"} — ${stepDisplayName ?? "step"}${languagePairLabel ? ` (${languagePairLabel})` : ""}`
      : `Assigned: ${order?.order_number ?? "Order"} — ${stepDisplayName ?? "step"}${languagePairLabel ? ` (${languagePairLabel})` : ""}`;

    const portalLink = `${VENDOR_PORTAL_URL}/jobs`;
    const ctaLabel = isOffer ? "Review offer" : "Accept assignment";

    // Detail rows surface the job specifics inline so vendors can decide
    // whether to act without opening the portal. Order keeps the same
    // shape as the customer-facing payment email: muted label, dark
    // value, right-aligned.
    const detailRows: Array<[string, string]> = [
      ["Order", order?.order_number ?? "—"],
      ["Step", stepRowValue],
    ];
    if (languagePairLabel) detailRows.push(["Languages", languagePairLabel]);
    if (service?.name) detailRows.push(["Service", service.name]);
    if (args.vendor_rate != null && args.vendor_total != null) {
      const rateUnitLabel = fmtRateUnit(args.vendor_rate_unit);
      const ratePrefix =
        args.vendor_rate_unit === "flat" ? "" : `${rateUnitLabel === "flat" ? "" : "/" + rateUnitLabel}`;
      // Flat → just the amount. Per-unit → "$0.12/per word".
      const rateText =
        args.vendor_rate_unit === "flat"
          ? `${fmtMoney(args.vendor_rate, args.vendor_currency)} (flat)`
          : `${fmtMoney(args.vendor_rate, args.vendor_currency)} ${ratePrefix}`;
      detailRows.push(["Rate", rateText]);
      detailRows.push(["Total", fmtMoney(args.vendor_total, args.vendor_currency)]);
    }
    if (args.deadline) detailRows.push(["Deadline", fmtDate(args.deadline)]);
    if (isOffer && args.expires_at)
      detailRows.push(["Offer expires", fmtDate(args.expires_at)]);

    const detailsHtml = detailRows
      .map(
        ([k, v]) =>
          `<tr>
            <td style="padding:8px 0;color:#6b7280;font-size:13px;vertical-align:top;">${escapeHtml(k)}</td>
            <td style="padding:8px 0;color:#111827;font-size:14px;text-align:right;font-weight:600;">${escapeHtml(v)}</td>
          </tr>`,
      )
      .join("");

    const instructionsBlock = args.instructions
      ? `<div style="margin-top:20px;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;color:#374151;font-size:13px;line-height:1.6;white-space:pre-wrap;">
          <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Instructions</div>
          ${escapeHtml(args.instructions)}
        </div>`
      : "";

    const lead = isOffer
      ? `You have a new offer for order <strong>${escapeHtml(order?.order_number ?? "—")}</strong>. Please review the terms below and respond before the offer expires.`
      : `You have been directly assigned to a new job for order <strong>${escapeHtml(order?.order_number ?? "—")}</strong>. Please accept the assignment in the vendor portal to get started.`;

    const headerSubtitle = isOffer ? "New job offer" : "New job assignment";
    const accentColor = "#0f766e"; // Cethos teal

    const htmlContent = `
<!doctype html>
<html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:${accentColor};padding:28px 28px 22px;color:#ffffff;">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.2px;opacity:0.85;">Cethos Translation Services</div>
          <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;line-height:1.3;">${escapeHtml(headerSubtitle)}</h1>
          ${
            languagePairLabel
              ? `<div style="margin-top:8px;font-size:14px;opacity:0.95;">${escapeHtml(languagePairLabel)}</div>`
              : ""
          }
        </td></tr>
        <tr><td style="padding:24px 28px 8px;color:#111827;">
          <p style="margin:0 0 16px;font-size:14px;line-height:1.55;">Hello ${escapeHtml(vendor.full_name || "there")},</p>
          <p style="margin:0 0 18px;font-size:14px;line-height:1.55;">${lead}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 8px;" />
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${detailsHtml}</table>
          ${instructionsBlock}
          <div style="margin:28px 0 8px;text-align:center;">
            <a href="${escapeHtml(portalLink)}" style="display:inline-block;background:${accentColor};color:#ffffff;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(ctaLabel)}</a>
          </div>
        </td></tr>
        <tr><td style="padding:18px 28px 24px;border-top:1px solid #e5e7eb;background:#f9fafb;color:#6b7280;font-size:12px;line-height:1.55;text-align:center;">
          You're receiving this because you're a registered Cethos vendor.<br />
          Questions? Reply to this email or contact <a href="mailto:vendor@cethos.com" style="color:${accentColor};text-decoration:none;">vendor@cethos.com</a>.
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
    const eventType = isOffer ? "vendor_offer" : "vendor_assignment";

    if (!res.ok) {
      console.error("notify-vendor-assignment Brevo error:", JSON.stringify(result));
      await logNotification(supabase, {
        event_type: eventType,
        recipient_email: vendor.email,
        recipient_name: vendor.full_name ?? null,
        recipient_id: vendor_id,
        order_id: workflow?.order_id ?? null,
        step_id: step?.id ?? null,
        offer_id: args.offer_id ?? null,
        subject,
        status: "failed",
        error_message: `Brevo ${res.status}: ${JSON.stringify(result).slice(0, 500)}`,
        metadata: {
          kind,
          order_number: order?.order_number ?? null,
          step_name: step?.name ?? null,
          cc: ccList,
        },
      });
      return;
    }

    console.log(
      `notify-vendor-assignment ${kind} sent to ${vendor.email} (msg ${result?.messageId})`,
    );
    await logNotification(supabase, {
      event_type: eventType,
      recipient_email: vendor.email,
      recipient_name: vendor.full_name ?? null,
      recipient_id: vendor_id,
      order_id: workflow?.order_id ?? null,
      step_id: step?.id ?? null,
      offer_id: args.offer_id ?? null,
      subject,
      status: "sent",
      metadata: {
        kind,
        order_number: order?.order_number ?? null,
        step_name: step?.name ?? null,
        brevo_message_id: result?.messageId ?? null,
        cc: ccList,
      },
    });
  } catch (err: any) {
    console.error("notify-vendor-assignment threw:", err?.message || err);
    // Best-effort: log the throw if we know enough.
    try {
      const { data: vendorRow } = await args.supabase
        .from("vendors").select("email, full_name").eq("id", args.vendor_id).maybeSingle();
      if (vendorRow?.email) {
        await logNotification(args.supabase, {
          event_type: args.kind === "offer_vendor" ? "vendor_offer" : "vendor_assignment",
          recipient_email: vendorRow.email,
          recipient_name: vendorRow.full_name ?? null,
          recipient_id: args.vendor_id,
          order_id: args.workflow?.order_id ?? null,
          step_id: args.step?.id ?? null,
          offer_id: args.offer_id ?? null,
          subject: `(threw) ${args.kind} for vendor ${args.vendor_id}`,
          status: "failed",
          error_message: err?.message || String(err),
        });
      }
    } catch {
      /* swallow */
    }
  }
}
