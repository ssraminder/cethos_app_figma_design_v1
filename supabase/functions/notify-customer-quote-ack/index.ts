// ============================================================================
// notify-customer-quote-ack
// ----------------------------------------------------------------------------
// Auto-sent immediately when a customer submits a quote request, so they
// don't go silent until a staff member manually sends the priced quote.
// Closes the comms gap identified in `reports/email-templates-inventory.md`.
//
// Triggers:
//   - customer-quote-finalize-files (customer-self-serve upload completion)
//   - process-quote-documents (main_web) once analysis is locked
//
// Caller payload:
//   { quote_id: string }
// All other fields are re-fetched from the quote row.
//
// Reply-to: support@cethos.com. Idempotent — checks notification_log for an
// existing quote_acknowledgment row tagged with the same quote_id metadata.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  brevoPayload,
  callout,
  detailsTable,
  emailShell,
  esc,
  eyebrow,
  hint,
  lead,
  REPLY,
  strong,
  title,
  type TemplateMeta,
} from "../_shared/email-shell.ts";
import { prefixWithProject } from "../_shared/email-subject.ts";

const TEMPLATE: TemplateMeta = {
  name: "Customer — Quote Acknowledgment",
  version: "1.0",
  updatedAt: "2026-05-28",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPPORT_PHONE = Deno.env.get("CETHOS_SUPPORT_PHONE") || "(587) 600-0786";

interface RequestBody {
  quote_id?: string;
  override_email?: string;
  override_name?: string;
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

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Edmonton",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return String(iso);
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
  if (!quoteId) return json({ success: false, error: "quote_id required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Load quote + customer + service + language pair.
  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select(
      `id, quote_number, created_at, customer_id, service_id, internal_project_id,
       source_language_id, target_language_id, target_language_other,
       customers (id, full_name, email, company_name),
       internal_project:internal_projects!internal_project_id(project_number)`,
    )
    .eq("id", quoteId)
    .maybeSingle();
  if (qErr || !quote) {
    console.error("notify-customer-quote-ack: quote fetch failed", qErr);
    return json({ success: false, error: "quote_not_found" }, 404);
  }

  const customer = (Array.isArray((quote as any).customers)
    ? (quote as any).customers[0]
    : (quote as any).customers) as
    | { id: string; full_name: string | null; email: string | null; company_name: string | null }
    | null;
  const internalProject = (Array.isArray((quote as any).internal_project)
    ? (quote as any).internal_project[0]
    : (quote as any).internal_project) as
    | { project_number: string | null }
    | null;
  const projectNumber = internalProject?.project_number ?? null;
  const companyName = customer?.company_name ?? null;

  const recipientEmail = body.override_email || customer?.email || null;
  const recipientName = body.override_name || customer?.full_name || null;

  if (!recipientEmail) {
    return json({ success: false, error: "no_recipient_email" }, 400);
  }

  // De-duplicate: if we've already acknowledged this quote, skip.
  const { data: existingLog } = await supabase
    .from("notification_log")
    .select("id")
    .eq("event_type", "quote_acknowledgment")
    .filter("metadata->>quote_id", "eq", quoteId)
    .limit(1)
    .maybeSingle();
  if (existingLog) {
    return json({
      success: true,
      skipped: true,
      reason: "already_acknowledged",
      log_id: existingLog.id,
    });
  }

  // 2. Resolve language + service display names.
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
      : sourceLangName || targetLangName || null;

  let serviceName: string | null = null;
  if (quote.service_id) {
    const { data: svc } = await supabase
      .from("services")
      .select("name")
      .eq("id", quote.service_id)
      .maybeSingle();
    serviceName = svc?.name ?? null;
  }

  // 3. File counts + total size.
  const { data: files } = await supabase
    .from("quote_files")
    .select("id, file_size")
    .eq("quote_id", quoteId);
  const fileCount = files?.length ?? 0;
  const totalSize = (files ?? []).reduce(
    (s: number, r: { file_size: number | null }) => s + Number(r.file_size ?? 0),
    0,
  );

  // 4. Build the email body.
  const customerFirstName =
    (recipientName || "").trim().split(/\s+/)[0] || "there";

  const serviceLabel =
    serviceName && langLabel
      ? `${serviceName} · ${langLabel}`
      : serviceName || langLabel || "Translation services";

  const rows: Array<[string, string]> = [
    ["Reference", quote.quote_number],
    ["Service", serviceLabel],
    ["Received", fmtDateTime(quote.created_at)],
  ];
  if (fileCount > 0) {
    rows.push([
      "Files received",
      totalSize > 0
        ? `${fileCount} · ${fmtFileSize(totalSize)}`
        : String(fileCount),
    ]);
  }

  const ackBody = [
    eyebrow("We've got your request"),
    title("Thanks — we've received your translation request"),
    lead(
      `Hi ${esc(customerFirstName)}, thanks for reaching out to Cethos. Your request is in our queue and a project manager is reviewing the details now. We'll follow up with a detailed quote within 2 business hours.`,
    ),
    detailsTable(rows),
    callout({
      tone: "info",
      title: "What happens next",
      body: "A project manager reviews your files, confirms scope, and sends a fixed quote with delivery dates. Nothing is charged until you accept.",
    }),
    hint(
      `Need it urgently? Reply to this email or call ${strong(esc(SUPPORT_PHONE))} and we'll prioritize your request.`,
    ),
  ].join("");

  const html = emailShell(ackBody, {
    replyTo: REPLY.customer,
    template: TEMPLATE,
    preheader: `Quote ${quote.quote_number} received — we'll follow up within 2 business hours.`,
  });

  // 5. Send through Brevo.
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  let status: "sent" | "failed" | "skipped" = "skipped";
  let brevoMessageId: string | null = null;
  let errorMessage: string | null = null;

  if (!BREVO_API_KEY) {
    errorMessage = "BREVO_API_KEY not configured";
  } else {
    const payload = brevoPayload({
      to: [{ email: recipientEmail, name: recipientName || recipientEmail }],
      subject: prefixWithProject(`We've got your request — ${quote.quote_number}`, { companyName, projectNumber }),
      html,
      replyTo: REPLY.customer,
      tags: ["quote-acknowledgment", `quote-${quote.quote_number}`],
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

  // 6. Audit row.
  try {
    await supabase.from("notification_log").insert({
      event_type: "quote_acknowledgment",
      recipient_type: "customer",
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      recipient_id: customer?.id ?? null,
      order_id: null,
      step_id: null,
      subject: prefixWithProject(`We've got your request — ${quote.quote_number}`, { companyName, projectNumber }),
      status,
      error_message: errorMessage,
      metadata: {
        quote_id: quoteId,
        quote_number: quote.quote_number,
        brevo_message_id: brevoMessageId,
        source_language: sourceLangName,
        target_language: targetLangName,
        service: serviceName,
        file_count: fileCount,
        file_total_bytes: totalSize,
      },
    });
  } catch (e: any) {
    console.error("notify-customer-quote-ack log insert failed:", e?.message || e);
  }

  return json({
    success: status === "sent",
    status,
    brevo_message_id: brevoMessageId,
    error: errorMessage,
  });
});
