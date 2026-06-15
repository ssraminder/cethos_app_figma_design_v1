// ============================================================================
// vendor-request-documents v1
//
// Admin invokes this from the vendor-detail Documents tab to ask an
// already-onboarded vendor for ISO 17100 evidence (file uploads + profile
// fields). Parallel to cvp-request-documents (which targets recruitment-
// stage applicants) and vendor-request-references (which targets refs).
//
// POST /functions/v1/vendor-request-documents
// Body: {
//   vendor_id: string,                    // required
//   requested_items: Array<{              // required, non-empty
//     slug: string,
//     label: string,
//     kind: "file" | "profile_field",
//     profile_column?: string
//   }>,
//   subject?: string,                     // override default
//   body_html?: string,                   // override default body
//   staff_message?: string,               // optional, surfaces in the body
//   staff_id?: string,                    // admin who clicked send
//   source_assessment_id?: string,        // link back to ISO assessment
//   expiry_days?: number,                 // default 14, clamp 1..60
//   dry_run?: boolean                     // skip insert + send, return preview
// }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  bulletList,
  ctaButton,
  emailShell,
  esc as escShell,
  eyebrow,
  hint,
  lead,
  REPLY,
  title,
  type TemplateMeta,
} from "../_shared/email-shell.ts";

const TEMPLATE: TemplateMeta = {
  name: "Vendor — ISO 17100 Documents Request",
  version: "2.0",
  updatedAt: "2026-05-28",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VENDOR_URL_FALLBACK = "https://vendor.cethos.com";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface RequestedItem {
  slug: string;
  label: string;
  kind: "file" | "profile_field" | "quiz";
  profile_column?: string;
  rationale?: string;
  quiz_competence?: string;
  quiz_domain?: string | null;
}

function defaultEmailBody(args: {
  vendorFirstName: string;
  items: RequestedItem[];
  uploadLinkUrl: string;
  expiryDays: number;
  staffMessage: string | null;
  aiGenerated?: boolean;
}): { subject: string; html: string } {
  const seen = new Set<string>();
  const itemsHtml = args.items
    .map((it) => {
      if (seen.has(it.slug)) return "";
      seen.add(it.slug);
      const tag = it.kind === "profile_field"
        ? `<span style="color:#888;font-size:11px;">[fill in profile]</span>`
        : `<span style="color:#888;font-size:11px;">[upload PDF]</span>`;
      return `<li><strong>${escapeHtml(it.label)}</strong> ${tag}${it.rationale ? `<br/><span style="color:#666">${escapeHtml(it.rationale)}</span>` : ""}</li>`;
    })
    .filter(Boolean)
    .join("\n");

  // Render the list of requested items as a HTML string for bulletList.
  const itemBullets = args.items
    .map((it) => {
      const seen = new Set<string>();
      if (seen.has(it.slug)) return null;
      seen.add(it.slug);
      const tag = it.kind === "profile_field"
        ? `<span style="color:#9CA3AF;font-size:11px;">[fill in profile]</span>`
        : `<span style="color:#9CA3AF;font-size:11px;">[upload PDF]</span>`;
      return `${escShell(it.label)} ${tag}${it.rationale ? `<br /><span style="color:#6B7280;font-size:12.5px;">${escShell(it.rationale)}</span>` : ""}`;
    })
    .filter((s): s is string => Boolean(s));

  const leadCopy = args.staffMessage
    ? escShell(args.staffMessage).replace(/\n/g, "<br />")
    : `Hi ${escShell(args.vendorFirstName) || "there"}, to keep your Cethos vendor profile aligned with ISO 17100:2015 (the translator-services standard our clients audit us against), we need a few items on file. Some are document uploads, some are short profile fields you can fill in directly.`;

  const html = emailShell(
    [
      eyebrow("ISO 17100 evidence"),
      title("Documents needed for your translator profile"),
      lead(leadCopy),
      bulletList("Please complete the following", itemBullets),
      ctaButton({ label: "Open my evidence checklist", url: args.uploadLinkUrl }),
      hint(`This link expires in ${args.expiryDays} days. If you're missing any specific document, just reply and let us know — we can usually find an alternative.`),
      ...(args.aiGenerated
        ? [hint(`Please note: this message was generated using AI and may contain errors. If this request doesn't apply to you, please email <a href="mailto:vendor@cethos.com" style="color:#0d9488;">vendor@cethos.com</a>.`)]
        : []),
    ].join(""),
    { replyTo: REPLY.vendorMgmt, template: TEMPLATE, preheader: `ISO 17100 evidence needed for your Cethos vendor profile.` },
  );

  return {
    subject: "Cethos — documents needed for your translator profile (ISO 17100)",
    html,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: {
    vendor_id?: string;
    requested_items?: RequestedItem[];
    subject?: string;
    body_html?: string;
    staff_message?: string;
    staff_id?: string;
    source_assessment_id?: string;
    expiry_days?: number;
    dry_run?: boolean;
    ai_generated?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }

  const vendorId = body.vendor_id;
  if (!vendorId) return json({ success: false, error: "vendor_id_required" }, 400);

  const items = Array.isArray(body.requested_items) ? body.requested_items : [];
  if (items.length === 0) return json({ success: false, error: "requested_items_required" }, 400);
  for (const it of items) {
    if (!it.slug || !it.label || !["file", "profile_field", "quiz"].includes(it.kind)) {
      return json({ success: false, error: "invalid_requested_item", detail: it }, 400);
    }
    if (it.kind === "quiz" && !it.quiz_competence) {
      return json({ success: false, error: "quiz_competence_required", detail: it }, 400);
    }
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: vendor, error: vErr } = await sb
    .from("vendors")
    .select("id, full_name, email, additional_emails")
    .eq("id", vendorId)
    .maybeSingle();
  if (vErr || !vendor) return json({ success: false, error: "vendor_not_found" }, 404);
  if (!vendor.email) return json({ success: false, error: "vendor_has_no_email" }, 400);

  const expiryDays = Math.min(Math.max(Number(body.expiry_days ?? 14), 1), 60);
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
  const staffMessage = (body.staff_message ?? "").trim() || null;
  const vendorPortalUrl = Deno.env.get("VENDOR_PORTAL_URL") ?? VENDOR_URL_FALLBACK;
  const firstName = (vendor.full_name || "").split(" ")[0] || "";

  // Stamp each item with completed_at:null so the vendor portal can flip it
  // to a timestamp as each one is satisfied. Quiz items also carry their
  // competence/domain so the vendor portal can route to the right pool.
  const itemsForStorage = items.map((it) => ({
    slug: it.slug,
    label: it.label,
    kind: it.kind,
    profile_column: it.profile_column ?? null,
    rationale: it.rationale ?? null,
    completed_at: null as string | null,
    ...(it.kind === "quiz"
      ? {
          quiz_competence: it.quiz_competence,
          quiz_domain: it.quiz_domain ?? null,
        }
      : {}),
  }));

  if (body.dry_run) {
    const preview = body.body_html && body.subject
      ? { subject: body.subject, html: body.body_html }
      : defaultEmailBody({
          vendorFirstName: firstName,
          items,
          uploadLinkUrl: `${vendorPortalUrl}/iso-evidence/PREVIEW-TOKEN`,
          expiryDays,
          staffMessage,
          aiGenerated: body.ai_generated === true,
        });
    return json({ success: true, data: { dry_run: true, ...preview } });
  }

  // Insert the request row. The supersede trigger will mark any older
  // open requests as 'superseded' once status='sent' is committed.
  const { data: requestRow, error: insErr } = await sb
    .from("vendor_document_requests")
    .insert({
      vendor_id: vendorId,
      request_token_expires_at: expiresAt,
      staff_id: body.staff_id ?? null,
      staff_message: staffMessage,
      ai_drafted_message: body.ai_generated ? staffMessage : null,
      subject: body.subject ?? null,
      body_html: body.body_html ?? null,
      requested_items: itemsForStorage,
      source_assessment_id: body.source_assessment_id ?? null,
      status: "sent",
    })
    .select("id, request_token, request_token_expires_at")
    .single();
  if (insErr || !requestRow) {
    return json({ success: false, error: "request_create_failed", detail: insErr?.message }, 500);
  }

  const uploadLinkUrl = `${vendorPortalUrl}/iso-evidence/${requestRow.request_token}`;
  const { subject, html } = body.body_html && body.subject
    ? { subject: body.subject, html: body.body_html.replace(/PREVIEW-TOKEN/g, requestRow.request_token) }
    : defaultEmailBody({
        vendorFirstName: firstName,
        items,
        uploadLinkUrl,
        expiryDays,
        staffMessage,
        aiGenerated: body.ai_generated === true,
      });

  // Send via Brevo. Failures don't roll back the request row — the admin
  // can resend by deleting the row or sending a fresh request. We log
  // every attempt to notification_log for the standard audit pattern.
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  let emailSent = false;
  let emailError: string | null = null;
  let brevoMessageId: string | null = null;

  if (!BREVO_API_KEY) {
    emailError = "BREVO_API_KEY not configured";
  } else {
    const ccList: string[] = Array.isArray(vendor.additional_emails)
      ? (vendor.additional_emails as unknown[])
          .map((e) => String(e ?? "").trim())
          .filter((e) => e && e.toLowerCase() !== String(vendor.email).toLowerCase())
      : [];

    const payload: Record<string, unknown> = {
      to: [{ email: vendor.email, name: vendor.full_name || vendor.email }],
      sender: { name: "Cethos Translation Services", email: "donotreply@cethos.com" },
      replyTo: { email: "vendor@cethos.com", name: "Cethos Vendor Ops" },
      subject,
      htmlContent: html,
      tags: ["vendor-document-request", `vendor-${vendorId}`],
    };
    if (ccList.length > 0) payload.cc = ccList.map((e) => ({ email: e }));

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
      if (res.ok) {
        emailSent = true;
        brevoMessageId = (result as Record<string, unknown>)?.messageId as string ?? null;
      } else {
        emailError = `Brevo ${res.status}: ${JSON.stringify(result).slice(0, 500)}`;
      }
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
    }
  }

  // Audit row in notification_log so the existing Brevo log modal surfaces
  // this send alongside vendor offer / assignment emails.
  try {
    await sb.from("notification_log").insert({
      event_type: "vendor_document_request",
      recipient_type: "vendor",
      recipient_email: vendor.email,
      recipient_name: vendor.full_name ?? null,
      recipient_id: vendorId,
      subject,
      status: emailSent ? "sent" : "failed",
      error_message: emailError,
      metadata: {
        request_id: requestRow.id,
        request_token: requestRow.request_token,
        expires_at: requestRow.request_token_expires_at,
        item_count: items.length,
        item_slugs: items.map((i) => i.slug),
        brevo_message_id: brevoMessageId,
      },
    });
  } catch (logErr) {
    console.error("vendor-request-documents: notification_log insert failed", logErr);
  }

  return json({
    success: true,
    data: {
      request_id: requestRow.id,
      request_token: requestRow.request_token,
      expires_at: requestRow.request_token_expires_at,
      upload_link_url: uploadLinkUrl,
      email_sent: emailSent,
      email_error: emailError,
    },
  });
});
