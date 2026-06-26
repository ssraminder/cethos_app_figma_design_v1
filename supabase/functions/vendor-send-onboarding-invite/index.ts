// ============================================================================
// vendor-send-onboarding-invite
//
// Emails external contractors a link to review + e-sign their Onboarding &
// Compliance Package (the 7-document IQVIA package) in the vendor portal at
// vendor.cethos.com/onboarding-package.
//
// Audience: vendors that HAVE a current vendor_onboarding_packages row and
// have NOT yet signed it (no current vendor_nda_signatures row with
// agreement_type='onboarding'). Unlike the CV/NDA reminder, this does NOT
// exclude inactive vendors — the cohort is onboarded while still inactive and
// activated only after signing.
//
// POST /functions/v1/vendor-send-onboarding-invite
// Body:
//   dry_run?: boolean          — report who would be emailed, send nothing
//   vendor_ids?: string[]      — limit to specific vendors (admin override)
//   force_resend?: boolean     — ignore the 7-day dedup window
//   test_email?: string        — send ONE preview copy to this address, no DB writes
//   subject_override?, body_html_override? — global experiments
//
// Deploy with --no-verify-jwt. Send via Brevo, throttled (one at a time).
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
const EVENT_TYPE = "vendor_onboarding_invite";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildEmail(args: { firstName: string; vendorPortalUrl: string; referenceCode: string | null }): { subject: string; html: string } {
  const portal = escapeHtml(args.vendorPortalUrl);
  const name = escapeHtml(args.firstName) || "there";
  const ref = args.referenceCode ? escapeHtml(args.referenceCode) : null;
  const subject = "Action needed: review and e-sign your Cethos onboarding package";

  const html = `<!doctype html><html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
<tr><td style="padding:18px 24px;border-bottom:1px solid #e5e7eb;">
  <img src="https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/png_logo_cethos_light_bg.png" alt="CETHOS" style="height:28px;display:block;" />
</td></tr>
<tr><td style="padding:24px;font-size:14px;line-height:1.6;color:#111827;">
  <h1 style="font-size:18px;font-weight:600;color:#0f766e;margin:0 0 16px;">Your onboarding package is ready to sign</h1>

  <p style="margin:0 0 12px;">Hi ${name},</p>
  <p style="margin:0 0 14px;">
    As part of formalising our records, we've prepared your <strong>Onboarding &amp; Compliance Package</strong>${ref ? ` (reference ${ref})` : ""}.
    It brings together, in one place, the agreements that govern your work with Cethos &mdash; your independent contractor
    services agreement, confidentiality &amp; non-disclosure agreement, data-security attestation, conflict-of-interest
    declaration, training and code-of-conduct acknowledgements, and your working-languages declaration.
  </p>
  <p style="margin:0 0 14px;">
    Please review and sign it online &mdash; it takes about two minutes, with no printing or scanning. Your CV is already
    on file with us, so there is nothing to upload.
  </p>

  <p style="margin:20px 0;text-align:center;">
    <a href="${portal}/onboarding-package" style="display:inline-block;padding:12px 24px;background:#0891B2;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Review &amp; sign your onboarding package</a>
  </p>

  <p style="margin:0 0 12px;">
    The link opens the Cethos vendor portal. We don't use passwords &mdash; sign in with this email address and we'll send
    you a 6-digit code. For your security, we re-confirm your identity with a one-time code again at the moment you sign.
  </p>

  <h2 style="font-size:14px;color:#0f766e;margin:22px 0 6px;">Why we're asking</h2>
  <p style="margin:0 0 8px;">
    A single, current signed agreement on file for every contractor is part of how we work to the ISO 17100 translation-services
    quality standard and meet our clients' audit requirements. Once signed, this package supersedes any earlier agreements you
    had with Cethos (or its predecessor) for the same work.
  </p>

  <h2 style="font-size:14px;color:#0f766e;margin:22px 0 6px;">If anything goes wrong</h2>
  <p style="margin:0 0 8px;">
    Reply to this email or write to <a href="mailto:vm@cethos.com" style="color:#0891B2;">vm@cethos.com</a> and we'll help the
    same day. Common gotcha: the one-time code can land in your spam folder.
  </p>

  <p style="margin:18px 0 0;">
    Thank you,<br/>
    <strong>Vendor Management</strong><br/>
    Cethos Solutions Inc.<br/>
    <a href="mailto:vm@cethos.com" style="color:#0891B2;">vm@cethos.com</a>
  </p>
</td></tr>
<tr><td style="padding:14px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
  Sent by Cethos Solutions Inc., Calgary, Alberta, Canada. You're receiving this because you have an active engagement with
  Cethos that requires a signed onboarding package on file.
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html };
}

async function sendBrevo(apiKey: string, to: { email: string; name?: string }, subject: string, html: string, tags: string[]) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      to: [to],
      sender: { name: "Cethos Vendor Management", email: "donotreply@cethos.com" },
      replyTo: { email: "vm@cethos.com", name: "Cethos Vendor Manager" },
      subject,
      htmlContent: html,
      tags,
    }),
  });
  const result = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, result };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: {
    dry_run?: boolean;
    vendor_ids?: string[];
    force_resend?: boolean;
    test_email?: string;
    subject_override?: string;
    body_html_override?: string;
  } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  const vendorPortalUrl = Deno.env.get("VENDOR_PORTAL_URL") ?? VENDOR_URL_FALLBACK;

  // ── Test-send mode: one preview to the requested address, no DB writes.
  if (body.test_email) {
    if (!BREVO_API_KEY) return json({ success: false, error: "BREVO_API_KEY not configured" }, 500);
    const defaults = buildEmail({ firstName: "Test", vendorPortalUrl, referenceCode: "CSV0000" });
    const subject = (body.subject_override?.trim() || defaults.subject).replace(/%FIRSTNAME%/g, "Test");
    const html = (body.body_html_override?.trim() || defaults.html).replace(/%FIRSTNAME%/g, "Test");
    const r = await sendBrevo(BREVO_API_KEY, { email: body.test_email }, `[TEST] ${subject}`, html, ["vendor-onboarding-invite", "test"]);
    if (!r.ok) return json({ success: false, error: `Brevo ${r.status}: ${JSON.stringify(r.result).slice(0, 500)}` }, 502);
    return json({ success: true, data: { test: true, sent_to: body.test_email } });
  }

  // ── Resolve the cohort: vendors with a current onboarding package, not yet signed.
  const { data: pkgRows, error: pkgErr } = await sb
    .from("vendor_onboarding_packages")
    .select("vendor_id, reference_code")
    .eq("is_current", true);
  if (pkgErr) return json({ success: false, error: "package_lookup_failed", detail: pkgErr.message }, 500);

  let pkgVendorIds = (pkgRows ?? []).map((r) => (r as { vendor_id: string }).vendor_id);
  if (body.vendor_ids && body.vendor_ids.length > 0) {
    const allow = new Set(body.vendor_ids);
    pkgVendorIds = pkgVendorIds.filter((id) => allow.has(id));
  }
  if (pkgVendorIds.length === 0) return json({ success: true, data: { candidates: 0, sent: 0, skipped: 0, errors: [] } });

  const refByVendor = new Map<string, string | null>();
  for (const r of pkgRows ?? []) {
    const row = r as { vendor_id: string; reference_code: string | null };
    refByVendor.set(row.vendor_id, row.reference_code);
  }

  // Already-signed onboarding packages → exclude.
  const { data: signedRows } = await sb
    .from("vendor_nda_signatures")
    .select("vendor_id")
    .eq("is_current", true)
    .eq("agreement_type", "onboarding");
  const signedSet = new Set((signedRows ?? []).map((r) => (r as { vendor_id: string }).vendor_id));

  // Vendor contact rows.
  const { data: vendorRows, error: vErr } = await sb
    .from("vendors")
    .select("id, full_name, email, status")
    .in("id", pkgVendorIds);
  if (vErr) return json({ success: false, error: "vendor_lookup_failed", detail: vErr.message }, 500);

  // Dedup against recent invites for this event type.
  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const recentlyEmailed = new Set<string>();
  if (!body.force_resend) {
    const { data: recent } = await sb
      .from("notification_log")
      .select("recipient_id")
      .eq("event_type", EVENT_TYPE)
      .gte("created_at", dedupSince)
      .not("recipient_id", "is", null);
    for (const r of recent ?? []) {
      const rid = (r as { recipient_id: string | null }).recipient_id;
      if (rid) recentlyEmailed.add(rid);
    }
  }

  type Cand = { id: string; full_name: string | null; email: string; status: string | null; reference_code: string | null };
  const candidates: Cand[] = [];
  for (const v of vendorRows ?? []) {
    const row = v as { id: string; full_name: string | null; email: string | null; status: string | null };
    if (!row.email) continue;
    if (signedSet.has(row.id)) continue;
    if (recentlyEmailed.has(row.id)) continue;
    candidates.push({
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      status: row.status,
      reference_code: refByVendor.get(row.id) ?? null,
    });
  }

  if (body.dry_run) {
    return json({
      success: true,
      data: {
        dry_run: true,
        with_package: pkgVendorIds.length,
        candidates: candidates.length,
        skipped_signed: signedSet.size,
        skipped_recently_emailed: recentlyEmailed.size,
        sample: candidates.slice(0, 25).map((c) => ({ id: c.id, email: c.email, ref: c.reference_code, status: c.status })),
      },
    });
  }

  if (!BREVO_API_KEY) return json({ success: false, error: "BREVO_API_KEY not configured" }, 500);

  const errors: string[] = [];
  let sent = 0;
  for (const c of candidates) {
    const firstName = (c.full_name || "").split(" ")[0] || "";
    const defaults = buildEmail({ firstName, vendorPortalUrl, referenceCode: c.reference_code });
    const subject = (body.subject_override?.trim() || defaults.subject).replace(/%FIRSTNAME%/g, firstName);
    const html = (body.body_html_override?.trim() || defaults.html).replace(/%FIRSTNAME%/g, firstName);

    let emailSent = false;
    let emailError: string | null = null;
    let brevoMessageId: string | null = null;
    try {
      const r = await sendBrevo(BREVO_API_KEY, { email: c.email, name: c.full_name || c.email }, subject, html, ["vendor-onboarding-invite", `vendor-${c.id}`]);
      if (r.ok) { emailSent = true; brevoMessageId = (r.result as Record<string, unknown>)?.messageId as string ?? null; }
      else emailError = `Brevo ${r.status}: ${JSON.stringify(r.result).slice(0, 500)}`;
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
    }

    try {
      await sb.from("notification_log").insert({
        event_type: EVENT_TYPE,
        recipient_type: "vendor",
        recipient_email: c.email,
        recipient_name: c.full_name ?? null,
        recipient_id: c.id,
        subject,
        status: emailSent ? "sent" : "failed",
        error_message: emailError,
        metadata: { reference_code: c.reference_code, status: c.status, brevo_message_id: brevoMessageId },
      });
    } catch (logErr) {
      console.error("vendor-send-onboarding-invite: notification_log insert failed", logErr);
    }

    if (emailSent) sent++;
    else errors.push(`${c.email}: ${emailError}`);
  }

  return json({ success: true, data: { candidates: candidates.length, sent, failed: errors.length, errors: errors.slice(0, 25) } });
});
