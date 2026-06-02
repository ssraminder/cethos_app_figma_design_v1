// ============================================================================
// notify-vendor-assignment
// Shared helper used by update-workflow-step to send a Brevo email when
// a vendor is offered or directly assigned to a workflow step. Failures
// are swallowed so they don't block the assignment write.
//
// Renders through the shared `_shared/email-shell.ts`.
// ============================================================================

import {
  brevoPayload,
  callout,
  ctaButton,
  detailsTable,
  emailShell,
  esc,
  eyebrow,
  lead,
  REPLY,
  title,
  type TemplateMeta,
} from "./email-shell.ts";
import { buildEmailSubject } from "./email-subject.ts";

const TPL_OFFER:        TemplateMeta = { name: "Vendor — New Offer",         version: "2.0", updatedAt: "2026-05-28" };
const TPL_ASSIGN:       TemplateMeta = { name: "Vendor — Direct Assign",     version: "2.0", updatedAt: "2026-05-28" };
const TPL_BATCH_SUMMARY: TemplateMeta = { name: "Staff — Vendor Offer Batch", version: "1.0", updatedAt: "2026-06-02" };

// Internal staff CC for every vendor job-assignment / offer email — the team
// sees a copy so they know the vendor email actually went out. For batch
// (offer_multiple) sends we suppress this per-vendor CC and send one summary
// email instead — see notifyVendorOfferBatchSummary below.
const PM_CC_EMAIL = "pm@cethoscorp.com";

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
  suppressPmCc?: boolean;
}

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

const fmtRateUnit = (unit: string | null | undefined): string => {
  switch (unit) {
    case "per_word": return "per word";
    case "per_page": return "per page";
    case "per_hour": return "per hour";
    case "flat": return "flat";
    default: return unit ? unit.replace(/_/g, " ") : "unit";
  }
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveLanguagePair(
  supabase: any,
  sourceVal: string | null | undefined,
  targetVal: string | null | undefined,
): Promise<{ source: string | null; target: string | null }> {
  const ids = [sourceVal, targetVal].filter(
    (v): v is string => typeof v === "string" && UUID_RE.test(v),
  );
  const nameMap = new Map<string, string>();
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

function firstName(full: string | null | undefined): string {
  if (!full) return "there";
  const trimmed = full.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

export async function notifyVendorAssignment(args: NotifyArgs): Promise<void> {
  try {
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) {
      console.warn("notify-vendor-assignment: BREVO_API_KEY not set, skipping");
      return;
    }

    const { supabase, vendor_id, step, workflow, kind } = args;
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
        .select("id, order_number, internal_project_id, customer_id, internal_project:internal_projects(project_number), customer:customers(company_name)")
        .eq("id", workflow?.order_id)
        .maybeSingle(),
      serviceId
        ? supabase.from("services").select("name").eq("id", serviceId).maybeSingle()
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
    const projectNumber = (order as any)?.internal_project?.project_number ?? null;
    const companyName = (order as any)?.customer?.company_name ?? null;

    if (!vendor?.email) {
      console.warn(`notify-vendor-assignment: vendor ${vendor_id} has no email`);
      return;
    }

    const ccList: string[] = Array.isArray(vendor.additional_emails)
      ? vendor.additional_emails
          .map((e: any) => String(e || "").trim())
          .filter((e: string) => e && e.toLowerCase() !== String(vendor.email).toLowerCase())
      : [];

    if (!args.suppressPmCc) {
      const vendorEmailLc = String(vendor.email).toLowerCase();
      const pmLc = PM_CC_EMAIL.toLowerCase();
      const alreadyInCc = ccList.some((e) => e.toLowerCase() === pmLc);
      if (vendorEmailLc !== pmLc && !alreadyInCc) {
        ccList.push(PM_CC_EMAIL);
      }
    }

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

    const subject = buildEmailSubject({
      eventLabel: isOffer ? "New offer" : "Assigned",
      orderNumber: order?.order_number ?? null,
      projectNumber,
      companyName,
      sourceLangName: languagePair.source,
      targetLangName: languagePair.target,
      stepName: stepDisplayName,
    });

    const portalLink = `${VENDOR_PORTAL_URL}/jobs`;
    const ctaLabel = isOffer ? "Review offer" : "Accept assignment";

    const detailRows: Array<[string, string]> = [
      ["Order", order?.order_number ?? "—"],
      ["Step", stepRowValue],
    ];
    if (languagePairLabel) detailRows.push(["Languages", languagePairLabel]);
    if (service?.name) detailRows.push(["Service", service.name]);
    if (args.vendor_rate != null && args.vendor_total != null) {
      const rateUnitLabel = fmtRateUnit(args.vendor_rate_unit);
      const rateText =
        args.vendor_rate_unit === "flat"
          ? `${fmtMoney(args.vendor_rate, args.vendor_currency)} (flat)`
          : `${fmtMoney(args.vendor_rate, args.vendor_currency)} / ${rateUnitLabel}`;
      detailRows.push(["Rate", rateText]);
      detailRows.push(["Total", fmtMoney(args.vendor_total, args.vendor_currency)]);
    }
    if (args.deadline) detailRows.push(["Deadline", fmtDate(args.deadline)]);
    if (isOffer && args.expires_at) {
      detailRows.push(["Offer expires", fmtDate(args.expires_at)]);
    }

    const leadCopy = isOffer
      ? `Hi ${esc(firstName(vendor.full_name))}, you have a new offer for order <strong>${esc(order?.order_number ?? "—")}</strong>. Please review the terms below and respond before the offer expires.`
      : `Hi ${esc(firstName(vendor.full_name))}, you have been directly assigned to a new job for order <strong>${esc(order?.order_number ?? "—")}</strong>. Please accept the assignment in the vendor portal to get started.`;

    const headerEyebrow = isOffer ? "New job offer" : "New job assignment";

    const instructionsCallout = args.instructions
      ? callout({
          tone: "info",
          title: "Instructions",
          body: esc(args.instructions).replace(/\n/g, "<br />"),
        })
      : "";

    const body = [
      eyebrow(headerEyebrow, "teal"),
      title(
        isOffer
          ? `New offer: ${esc(stepDisplayName ?? "step")}`
          : `New assignment: ${esc(stepDisplayName ?? "step")}`,
      ),
      lead(leadCopy),
      detailsTable(detailRows),
      instructionsCallout,
      ctaButton({ label: ctaLabel, url: portalLink, align: "full" }),
    ].join("");

    const htmlContent = emailShell(body, {
      replyTo: REPLY.vendor,
      template: isOffer ? TPL_OFFER : TPL_ASSIGN,
    });

    const payload = brevoPayload({
      to: [{ email: vendor.email, name: vendor.full_name || vendor.email }],
      subject,
      html: htmlContent,
      replyTo: REPLY.vendor,
      cc: ccList.length > 0 ? ccList.map((e) => ({ email: e })) : undefined,
      senderName: "Cethos Translation Services",
      tags: [`vendor-assignment-${kind}`, `order-${order?.order_number ?? "unknown"}`],
    });

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

// ============================================================================
// notifyVendorOfferBatchSummary
// One staff-facing email to PM_CC_EMAIL summarising a batch offer_multiple
// send. Called once per batch (after Promise.all of per-vendor notifies)
// so the team gets a single notification regardless of how many vendors
// were offered. Failures are swallowed.
// ============================================================================

interface BatchVendorEntry {
  vendor_id: string;
  vendor_rate?: number | null;
  vendor_total?: number | null;
}

interface BatchSummaryArgs {
  supabase: any;
  step: any;
  workflow: any;
  vendorList: BatchVendorEntry[];
  vendor_rate?: number | null;
  vendor_rate_unit?: string | null;
  vendor_currency?: string | null;
  vendor_total?: number | null;
  deadline?: string | null;
  expires_at?: string | null;
}

export async function notifyVendorOfferBatchSummary(
  args: BatchSummaryArgs,
): Promise<void> {
  try {
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) {
      console.warn("notifyVendorOfferBatchSummary: BREVO_API_KEY not set, skipping");
      return;
    }

    const { supabase, step, workflow, vendorList } = args;
    const serviceId: string | null = step?.service_id ?? null;
    const workflowId: string | null = step?.workflow_id ?? workflow?.id ?? null;
    const vendorIds = vendorList.map((v) => v.vendor_id).filter(Boolean);

    const [
      { data: vendors },
      { data: order },
      { data: service },
      languagePair,
      { count: totalStepsRaw },
    ] = await Promise.all([
      vendorIds.length > 0
        ? supabase
            .from("vendors")
            .select("id, full_name, email")
            .in("id", vendorIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from("orders")
        .select("id, order_number, internal_project_id, customer_id, internal_project:internal_projects(project_number), customer:customers(company_name)")
        .eq("id", workflow?.order_id)
        .maybeSingle(),
      serviceId
        ? supabase.from("services").select("name").eq("id", serviceId).maybeSingle()
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
    const projectNumberB = (order as any)?.internal_project?.project_number ?? null;
    const companyNameB = (order as any)?.customer?.company_name ?? null;

    const vendorMap = new Map<string, { full_name: string | null; email: string | null }>();
    for (const v of (vendors ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      vendorMap.set(v.id, { full_name: v.full_name, email: v.email });
    }

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

    const n = vendorList.length;
    const subject = buildEmailSubject({
      eventLabel: `Batch offer sent (${n} vendor${n === 1 ? "" : "s"})`,
      orderNumber: order?.order_number ?? null,
      projectNumber: projectNumberB,
      companyName: companyNameB,
      sourceLangName: languagePair.source,
      targetLangName: languagePair.target,
      stepName: stepDisplayName,
    });

    const detailRows: Array<[string, string]> = [
      ["Order", order?.order_number ?? "—"],
      ["Step", stepRowValue],
    ];
    if (languagePairLabel) detailRows.push(["Languages", languagePairLabel]);
    if (service?.name) detailRows.push(["Service", service.name]);
    if (args.deadline) detailRows.push(["Deadline", fmtDate(args.deadline)]);
    if (args.expires_at) detailRows.push(["Offer expires", fmtDate(args.expires_at)]);
    detailRows.push(["Vendors offered", String(n)]);

    const rateUnitLabel = fmtRateUnit(args.vendor_rate_unit);
    const vendorRowsHtml = vendorList
      .map((v) => {
        const profile = vendorMap.get(v.vendor_id) ?? { full_name: null, email: null };
        const name = profile.full_name || "Unknown vendor";
        const email = profile.email || "—";
        const rateNum = v.vendor_rate ?? args.vendor_rate ?? null;
        const totalNum = v.vendor_total ?? args.vendor_total ?? null;
        const rateText =
          rateNum != null
            ? args.vendor_rate_unit === "flat"
              ? `${fmtMoney(rateNum, args.vendor_currency)} (flat)`
              : `${fmtMoney(rateNum, args.vendor_currency)} / ${rateUnitLabel}`
            : "—";
        const totalText = totalNum != null ? fmtMoney(totalNum, args.vendor_currency) : "—";
        return `<tr><td style="padding:6px 12px 6px 0;color:#0C2340;font-weight:600;">${esc(name)}</td><td style="padding:6px 12px 6px 0;color:#4B5563;">${esc(email)}</td><td style="padding:6px 12px 6px 0;color:#4B5563;">${esc(rateText)}</td><td style="padding:6px 0;color:#4B5563;">${esc(totalText)}</td></tr>`;
      })
      .join("");

    const vendorTableHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 22px;font-size:14px;"><thead><tr><th align="left" style="padding:6px 12px 6px 0;color:#64748B;font-weight:600;border-bottom:1px solid #E5E7EB;">Vendor</th><th align="left" style="padding:6px 12px 6px 0;color:#64748B;font-weight:600;border-bottom:1px solid #E5E7EB;">Email</th><th align="left" style="padding:6px 12px 6px 0;color:#64748B;font-weight:600;border-bottom:1px solid #E5E7EB;">Rate</th><th align="left" style="padding:6px 0;color:#64748B;font-weight:600;border-bottom:1px solid #E5E7EB;">Total</th></tr></thead><tbody>${vendorRowsHtml}</tbody></table>`;

    const body = [
      eyebrow("Batch offer sent", "teal"),
      title(`Offer sent to ${n} vendor${n === 1 ? "" : "s"}`),
      lead(`Order <strong>${esc(order?.order_number ?? "—")}</strong> — step <strong>${esc(stepDisplayName ?? "—")}</strong>. Vendors below received their offer emails individually; this is a single internal summary so the team knows the batch went out.`),
      detailsTable(detailRows),
      vendorTableHtml,
    ].join("");

    const htmlContent = emailShell(body, {
      replyTo: REPLY.vendorMgmt,
      template: TPL_BATCH_SUMMARY,
    });

    const payload = brevoPayload({
      to: [{ email: PM_CC_EMAIL }],
      subject,
      html: htmlContent,
      replyTo: REPLY.vendorMgmt,
      senderName: "Cethos Translation Services",
      tags: [
        "vendor-assignment-batch-summary",
        `order-${order?.order_number ?? "unknown"}`,
      ],
    });

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
      console.error("notifyVendorOfferBatchSummary Brevo error:", JSON.stringify(result));
      try {
        await supabase.from("notification_log").insert({
          event_type: "vendor_offer_batch_summary",
          recipient_type: "staff",
          recipient_email: PM_CC_EMAIL,
          recipient_name: null,
          recipient_id: null,
          order_id: workflow?.order_id ?? null,
          step_id: step?.id ?? null,
          offer_id: null,
          subject,
          status: "failed",
          error_message: `Brevo ${res.status}: ${JSON.stringify(result).slice(0, 500)}`,
          metadata: {
            order_number: order?.order_number ?? null,
            step_name: step?.name ?? null,
            vendor_count: n,
            vendor_ids: vendorIds,
          },
        });
      } catch (logErr: any) {
        console.error("notifyVendorOfferBatchSummary notification_log insert failed:", logErr?.message || logErr);
      }
      return;
    }

    console.log(
      `notifyVendorOfferBatchSummary sent to ${PM_CC_EMAIL} for ${n} vendors (msg ${result?.messageId})`,
    );
    try {
      await supabase.from("notification_log").insert({
        event_type: "vendor_offer_batch_summary",
        recipient_type: "staff",
        recipient_email: PM_CC_EMAIL,
        recipient_name: null,
        recipient_id: null,
        order_id: workflow?.order_id ?? null,
        step_id: step?.id ?? null,
        offer_id: null,
        subject,
        status: "sent",
        metadata: {
          order_number: order?.order_number ?? null,
          step_name: step?.name ?? null,
          vendor_count: n,
          vendor_ids: vendorIds,
          brevo_message_id: result?.messageId ?? null,
        },
      });
    } catch (logErr: any) {
      console.error("notifyVendorOfferBatchSummary notification_log insert failed:", logErr?.message || logErr);
    }
  } catch (err: any) {
    console.error("notifyVendorOfferBatchSummary threw:", err?.message || err);
  }
}
