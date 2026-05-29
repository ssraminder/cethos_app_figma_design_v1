// ============================================================================
// notify-staff-new-lead
// ----------------------------------------------------------------------------
// Source-controlled replacement for the zombie `send-staff-notification`.
// Notifies internal pricing staff when a new lead has come in or an existing
// quote needs human review.
//
// History: `send-staff-notification` is a zombie bundle on Supabase — the
// source is unrecoverable (`get_edge_function` returns "Failed to retrieve
// function bundle", per CLAUDE.md memory `feedback_supabase_bundle_loss_pattern`).
// The bundle still fires from `main_web/process-quote-documents/index.ts:294`
// but nobody can edit the template. This function rebuilds it in-repo.
//
// Caller payload (matches the zombie's contract so the caller can swap with
// a single URL change):
//   {
//     quote_id: string,
//     trigger_type: "new_lead" | "review_required" | "high_billable_ratio" | string,
//     quote_number?: string,    // optional — re-fetched from quote_id
//     reason?: string,           // optional — surfaced as a Hint
//   }
//
// Audience: customers in `notification_recipients` flagged for 'all' or
// 'new_quotes'. Falls back to `ops@cethos.com` if no recipients configured.
//
// Reply-to: ops@cethos.com.
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
  hint,
  lead,
  REPLY,
  statusBadge,
  strong,
  title,
  type TemplateMeta,
} from "../_shared/email-shell.ts";

const TEMPLATE: TemplateMeta = {
  name: "Staff — New Lead / Needs Review",
  version: "1.0",
  updatedAt: "2026-05-28",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ADMIN_PORTAL_URL =
  Deno.env.get("ADMIN_PORTAL_URL") || "https://portal.cethos.com";
const OPS_FALLBACK_EMAIL =
  Deno.env.get("OPS_FALLBACK_EMAIL") || "ops@cethos.com";

interface RequestBody {
  quote_id?: string;
  trigger_type?: string;
  quote_number?: string;
  reason?: string;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function fmtFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function badgeForTrigger(t: string): { tone: "info" | "warn" | "error"; label: string; titleVerb: string } {
  switch (t) {
    case "new_lead":
      return { tone: "info", label: "New lead", titleVerb: "needs a quote" };
    case "review_required":
      return { tone: "warn", label: "Needs review", titleVerb: "needs human pricing review" };
    case "high_billable_ratio":
      return { tone: "warn", label: "Pricing anomaly", titleVerb: "flagged for an unusual billable ratio" };
    case "failed_processing":
      return { tone: "error", label: "Processing failed", titleVerb: "failed automated processing" };
    default:
      return { tone: "info", label: t || "Lead", titleVerb: "needs your attention" };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }

  const quoteId = body.quote_id;
  const triggerType = body.trigger_type || "new_lead";
  if (!quoteId) return json({ success: false, error: "quote_id required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Load quote envelope.
  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select(
      `id, quote_number, created_at, customer_id,
       source_language_id, target_language_id, target_language_other,
       service_id, country_of_issue,
       customers (id, full_name, email, company_name, is_ar_customer)`,
    )
    .eq("id", quoteId)
    .maybeSingle();

  if (qErr || !quote) {
    console.error("notify-staff-new-lead: quote fetch failed", qErr);
    return json({ success: false, error: "quote_not_found" }, 404);
  }

  const customer = (Array.isArray((quote as any).customers)
    ? (quote as any).customers[0]
    : (quote as any).customers) as
    | {
        id: string;
        full_name: string | null;
        email: string | null;
        company_name: string | null;
        is_ar_customer: boolean | null;
      }
    | null;

  // 2. Resolve language pair + service.
  const langIds = [quote.source_language_id, quote.target_language_id]
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const langMap = new Map<string, string>();
  if (langIds.length > 0) {
    const { data: langs } = await supabase
      .from("languages")
      .select("id, name")
      .in("id", langIds);
    for (const r of (langs ?? []) as Array<{ id: string; name: string }>) {
      langMap.set(r.id, r.name);
    }
  }
  const sourceLangName = quote.source_language_id ? langMap.get(quote.source_language_id) ?? null : null;
  const targetLangName = quote.target_language_id
    ? langMap.get(quote.target_language_id) ?? null
    : quote.target_language_other ?? null;
  const langLabel =
    sourceLangName && targetLangName
      ? `${sourceLangName} → ${targetLangName}`
      : sourceLangName || targetLangName || "—";

  let serviceName: string | null = null;
  if (quote.service_id) {
    const { data: svc } = await supabase
      .from("services")
      .select("name")
      .eq("id", quote.service_id)
      .maybeSingle();
    serviceName = svc?.name ?? null;
  }

  // 3. File count + total size.
  const { data: files } = await supabase
    .from("quote_files")
    .select("id, file_size")
    .eq("quote_id", quoteId);
  const fileCount = files?.length ?? 0;
  const totalSize = (files ?? []).reduce(
    (s: number, r: { file_size: number | null }) => s + Number(r.file_size ?? 0),
    0,
  );

  // 4. Resolve admin recipients.
  const { data: recipientRows } = await supabase
    .from("notification_recipients")
    .select("email, name, notification_type, is_active")
    .eq("is_active", true)
    .in("notification_type", ["all", "new_quotes", "review_required"]);
  const recipients = (recipientRows ?? []).map((r: any) => ({ email: r.email as string, name: (r.name as string) ?? null }));
  if (recipients.length === 0) {
    recipients.push({ email: OPS_FALLBACK_EMAIL, name: "Cethos Ops" });
  }

  const meta = badgeForTrigger(triggerType);
  const quoteNumber = body.quote_number || quote.quote_number;
  const customerName = customer?.company_name || customer?.full_name || "(unknown customer)";

  const detailRows: Array<[string, string]> = [
    ["Quote #", quoteNumber],
    ["Customer", customerName],
  ];
  if (customer?.email) detailRows.push(["Email", customer.email]);
  if (customer?.is_ar_customer) detailRows.push(["Account", "AR approved"]);
  detailRows.push(["Project", serviceName ? `${serviceName} · ${langLabel}` : langLabel]);
  if (quote.country_of_issue) detailRows.push(["Country of issue", String(quote.country_of_issue)]);
  if (fileCount > 0) {
    detailRows.push([
      "Files",
      totalSize > 0
        ? `${fileCount} · ${fmtFileSize(totalSize)}`
        : String(fileCount),
    ]);
  }

  const reasonCallout = body.reason
    ? callout({
        tone: meta.tone,
        title: "Why this was flagged",
        body: esc(body.reason),
      })
    : "";

  const adminUrl = `${ADMIN_PORTAL_URL}/admin/quotes/${quote.id}`;

  const html = emailShell(
    [
      statusBadge(meta.tone, meta.label),
      title(`${esc(customerName)} ${meta.titleVerb}`),
      lead(
        `A new pricing request needs your attention. ${strong(`Quote ${esc(quoteNumber)}`)} just landed — review the details, confirm scope, and send a fixed quote.`,
      ),
      detailsTable(detailRows),
      reasonCallout,
      callout({
        tone: "warn",
        title: "SLA — 2 business hours",
        body: "Customers expect a priced quote within 2 business hours of submission. Lead conversion drops sharply after that.",
      }),
      ctaButton({
        label: "Review & price",
        url: adminUrl,
        variant: "primary",
        align: "full",
      }),
      hint(
        `If you can't get to this within 2 hours, please hand off in the team channel so someone else picks it up.`,
      ),
    ].join(""),
    {
      replyTo: REPLY.ops,
      template: TEMPLATE,
      preheader: `${meta.label} — ${customerName} · Quote ${quoteNumber}`,
    },
  );

  const subject = `[${meta.label}] ${customerName} — Quote ${quoteNumber}`;

  // Send. Fan out to each recipient individually so an audit row lands per
  // recipient (rather than a single multi-to row).
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  let sentCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const r of recipients) {
    let status: "sent" | "failed" | "skipped" = "skipped";
    let brevoMessageId: string | null = null;
    let errorMessage: string | null = null;

    if (!BREVO_API_KEY) {
      errorMessage = "BREVO_API_KEY not configured";
    } else {
      const payload = brevoPayload({
        to: [{ email: r.email, name: r.name || r.email }],
        subject,
        html,
        replyTo: REPLY.ops,
        senderName: "Cethos Ops",
        senderEmail: "donotreply@cethos.com",
        tags: ["staff-new-lead", `trigger-${triggerType}`, `quote-${quoteNumber}`],
      });
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
          errorMessage = `Brevo ${res.status}: ${JSON.stringify(result).slice(0, 500)}`;
        } else {
          status = "sent";
          brevoMessageId = (result as any)?.messageId ?? null;
        }
      } catch (e: any) {
        status = "failed";
        errorMessage = e?.message || String(e);
      }
    }

    if (status === "sent") sentCount++;
    else failedCount++;
    if (errorMessage) errors.push(`${r.email}: ${errorMessage}`);

    try {
      await supabase.from("notification_log").insert({
        event_type: "staff_new_lead",
        recipient_type: "admin",
        recipient_email: r.email,
        recipient_name: r.name,
        recipient_id: null,
        order_id: null,
        step_id: null,
        subject,
        status,
        error_message: errorMessage,
        metadata: {
          quote_id: quoteId,
          quote_number: quoteNumber,
          trigger_type: triggerType,
          reason: body.reason ?? null,
          brevo_message_id: brevoMessageId,
        },
      });
    } catch (e: any) {
      console.error("notify-staff-new-lead log insert failed:", e?.message || e);
    }
  }

  return json({
    success: sentCount > 0,
    sent: sentCount,
    failed: failedCount,
    errors,
  });
});
