// ============================================================================
// vendor-send-activation-emails
//
// One-shot bulk emailer: finds every vendor missing the new onboarding
// gates (CV upload + signed NDA) and sends an activation email pointing
// them to the vendor portal's /onboarding page.
//
// Excludes vendors with status in (suspended, inactive). Skips anyone
// who has already received an activation email in the last 7 days
// (deduped via notification_log).
//
// POST /functions/v1/vendor-send-activation-emails
// Body:
//   {
//     dry_run?: boolean        — report who would be emailed, send nothing
//     vendor_ids?: string[]    — limit to specific vendors (admin override)
//     force_resend?: boolean   — ignore the 7-day dedup window
//   }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VENDOR_URL_FALLBACK = "https://vendor.cethos.com";
const DEDUP_WINDOW_DAYS = 7;

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

function buildEmail(args: { firstName: string; vendorPortalUrl: string }): { subject: string; html: string } {
  const html = `<!doctype html><html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
<tr><td style="padding:20px 24px;background:#0f766e;color:#ffffff;">
  <div style="font-size:18px;font-weight:600;">Cethos Translation Services</div>
  <div style="font-size:13px;opacity:0.85;margin-top:2px;">Activate your vendor profile</div>
</td></tr>
<tr><td style="padding:24px;color:#111827;font-size:14px;line-height:1.55;">
  <p>Hi ${escapeHtml(args.firstName) || "there"},</p>
  <p>
    We've updated the Cethos vendor portal with two new requirements to keep our network aligned with ISO 17100:2015 (the translator-services standard our clients audit us against). To continue receiving job offers and using the portal, please complete two short steps:
  </p>
  <ul style="padding-left:18px;">
    <li><strong>Upload your CV</strong> — PDF up to 10 MB</li>
    <li><strong>Sign the NDA</strong> — two-factor verification via email or phone OTP</li>
  </ul>
  <p>Both can be done in under five minutes from the onboarding page below.</p>
  <p style="margin:24px 0 0;text-align:center;">
    <a href="${escapeHtml(args.vendorPortalUrl)}/onboarding" style="display:inline-block;padding:11px 22px;background:#0891B2;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Activate my profile</a>
  </p>
  <p style="color:#6B7280;font-size:13px;margin-top:24px;">
    If you've already completed both steps, you can ignore this email — your profile is already active. Questions? Reply to this email or contact vendor@cethos.com.
  </p>
  <p style="margin-top:24px;">Thanks,<br/>Cethos Vendor Management</p>
</td></tr>
<tr><td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
  You're receiving this because you're a registered Cethos vendor. Reply to this email if you have questions.
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: "Action needed — activate your Cethos vendor profile", html };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: { dry_run?: boolean; vendor_ids?: string[]; force_resend?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Pull candidate vendors. Exclude suspended/inactive. Optional filter
  // to specific IDs.
  let vendorQ = sb
    .from("vendors")
    .select("id, full_name, email, status")
    .not("status", "in", "(suspended,inactive)")
    .not("email", "is", null);
  if (body.vendor_ids && body.vendor_ids.length > 0) {
    vendorQ = vendorQ.in("id", body.vendor_ids);
  }
  const { data: vendors, error: vErr } = await vendorQ;
  if (vErr) return json({ success: false, error: "vendor_lookup_failed", detail: vErr.message }, 500);

  // Pull CV counts + NDA signatures in bulk so we don't fan out N queries.
  const ids = (vendors ?? []).map((v) => v.id);
  if (ids.length === 0) return json({ success: true, data: { candidates: 0, sent: 0, skipped: 0, errors: [] } });

  const { data: cvRows } = await sb
    .from("vendor_cvs")
    .select("vendor_id")
    .in("vendor_id", ids);
  const cvVendorIds = new Set((cvRows ?? []).map((r) => r.vendor_id as string));

  const { data: ndaRows } = await sb
    .from("vendor_nda_signatures")
    .select("vendor_id, is_current")
    .in("vendor_id", ids)
    .eq("is_current", true);
  const ndaVendorIds = new Set((ndaRows ?? []).map((r) => r.vendor_id as string));

  // Dedup against recent activation emails.
  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let recentlyEmailedIds = new Set<string>();
  if (!body.force_resend) {
    const { data: recent } = await sb
      .from("notification_log")
      .select("recipient_id")
      .eq("event_type", "vendor_activation_email")
      .gte("created_at", dedupSince)
      .in("recipient_id", ids);
    recentlyEmailedIds = new Set((recent ?? []).map((r) => r.recipient_id as string));
  }

  // Filter to vendors actually missing at least one gate AND not recently emailed.
  const needsActivation = (vendors ?? []).filter(
    (v) =>
      (!cvVendorIds.has(v.id) || !ndaVendorIds.has(v.id))
      && !recentlyEmailedIds.has(v.id),
  );

  if (body.dry_run) {
    return json({
      success: true,
      data: {
        dry_run: true,
        total_vendors: vendors!.length,
        candidates: needsActivation.length,
        skipped_recently_emailed: recentlyEmailedIds.size,
        sample: needsActivation.slice(0, 10).map((v) => ({
          id: v.id,
          email: v.email,
          missing_cv: !cvVendorIds.has(v.id),
          missing_nda: !ndaVendorIds.has(v.id),
        })),
      },
    });
  }

  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  const vendorPortalUrl = Deno.env.get("VENDOR_PORTAL_URL") ?? VENDOR_URL_FALLBACK;

  const errors: string[] = [];
  let sent = 0;

  for (const v of needsActivation) {
    const firstName = (v.full_name || "").split(" ")[0] || "";
    const { subject, html } = buildEmail({ firstName, vendorPortalUrl });

    let emailSent = false;
    let emailError: string | null = null;
    let brevoMessageId: string | null = null;

    if (!BREVO_API_KEY) {
      emailError = "BREVO_API_KEY not configured";
    } else {
      try {
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": BREVO_API_KEY,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            to: [{ email: v.email, name: v.full_name || v.email }],
            sender: { name: "Cethos Translation Services", email: "donotreply@cethos.com" },
            replyTo: { email: "vendor@cethos.com", name: "Cethos Vendor Ops" },
            subject,
            htmlContent: html,
            tags: ["vendor-activation-email", `vendor-${v.id}`],
          }),
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

    try {
      await sb.from("notification_log").insert({
        event_type: "vendor_activation_email",
        recipient_type: "vendor",
        recipient_email: v.email,
        recipient_name: v.full_name ?? null,
        recipient_id: v.id,
        subject,
        status: emailSent ? "sent" : "failed",
        error_message: emailError,
        metadata: {
          missing_cv: !cvVendorIds.has(v.id),
          missing_nda: !ndaVendorIds.has(v.id),
          brevo_message_id: brevoMessageId,
        },
      });
    } catch (logErr) {
      console.error("vendor-send-activation-emails: notification_log insert failed", logErr);
    }

    if (emailSent) sent++;
    else errors.push(`${v.email}: ${emailError}`);
  }

  return json({
    success: true,
    data: {
      total_vendors: vendors!.length,
      candidates: needsActivation.length,
      sent,
      failed: errors.length,
      skipped_recently_emailed: recentlyEmailedIds.size,
      errors: errors.slice(0, 20),
    },
  });
});
