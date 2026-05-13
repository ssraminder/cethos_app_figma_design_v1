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
  const portal = escapeHtml(args.vendorPortalUrl);
  const html = `<!doctype html><html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
<tr><td style="padding:20px 24px;background:#0f766e;color:#ffffff;">
  <div style="font-size:18px;font-weight:600;">Cethos Translation Services</div>
  <div style="font-size:13px;opacity:0.85;margin-top:2px;">Activate your vendor profile</div>
</td></tr>
<tr><td style="padding:24px;color:#111827;font-size:14px;line-height:1.6;">
  <p style="margin:0 0 12px;">Hi ${escapeHtml(args.firstName) || "there"},</p>
  <p style="margin:0 0 12px;">
    We've upgraded the Cethos vendor portal to align with <strong>ISO 17100:2015</strong>, the translator-services standard our clients audit us against. To keep receiving job offers, please finish a short setup. Most vendors complete it in 15–20 minutes.
  </p>

  <h2 style="font-size:15px;color:#0f766e;margin:24px 0 6px;">How sign-in works (no password)</h2>
  <p style="margin:0 0 8px;">
    The portal uses <strong>passwordless login</strong> — you don't set a password and never need to remember one.
  </p>
  <ol style="margin:0 0 12px;padding-left:18px;">
    <li>Go to <a href="${portal}/login" style="color:#0891B2;">${portal}/login</a> and enter the email address this message was sent to.</li>
    <li>We email you a <strong>6-digit code</strong> (valid 10 minutes).</li>
    <li>Type the code in the portal — you're signed in. Sessions stay active for ~14 days per device.</li>
  </ol>
  <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">
    If a code doesn't arrive: check spam, then click "Resend code". If you've changed email addresses, reply to this message and we'll update your record.
  </p>

  <h2 style="font-size:15px;color:#0f766e;margin:24px 0 6px;">Step 1 of 2 — Two activation gates</h2>
  <p style="margin:0 0 8px;">Until both of these are done your profile is locked from receiving jobs:</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
    <tr><td style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;">
      <strong>① Upload your CV</strong> &nbsp;<span style="color:#6b7280;">— PDF, up to 10 MB</span><br/>
      <span style="color:#6b7280;font-size:13px;">From the Documents page, or directly on the onboarding page.</span>
    </td></tr>
    <tr><td style="height:8px;"></td></tr>
    <tr><td style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;">
      <strong>② Sign the NDA</strong> &nbsp;<span style="color:#6b7280;">— in-portal e-signature with email OTP</span><br/>
      <span style="color:#6b7280;font-size:13px;">From the NDA page in the sidebar. Takes about a minute.</span>
    </td></tr>
  </table>
  <p style="margin:0 0 0;text-align:center;">
    <a href="${portal}/onboarding" style="display:inline-block;padding:11px 22px;background:#0891B2;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Complete the 2 gates</a>
  </p>

  <h2 style="font-size:15px;color:#0f766e;margin:28px 0 6px;">Step 2 of 2 — Finish your working profile</h2>
  <p style="margin:0 0 8px;">
    Once the two gates are cleared, work through the rest of the sidebar so we can match you to the right jobs and pay you on time:
  </p>
  <ul style="padding-left:18px;margin:0 0 12px;">
    <li><strong><a href="${portal}/profile" style="color:#0891B2;">Profile</a></strong> — full name, country, native language, specializations, ISO §3.1.4 qualifying route.</li>
    <li><strong><a href="${portal}/languages" style="color:#0891B2;">Languages</a></strong> — the language pairs you translate, with direction and proficiency.</li>
    <li><strong><a href="${portal}/rates" style="color:#0891B2;">Services &amp; Rates</a></strong> — your per-page translation rate and certification fee (so we can quote your jobs automatically).</li>
    <li><strong><a href="${portal}/payment" style="color:#0891B2;">Payment</a></strong> — bank / PayPal / Wise details so invoices clear without delay.</li>
    <li><strong><a href="${portal}/documents" style="color:#0891B2;">Documents</a></strong> — degree, certifications, professional-membership proof (these support your ISO qualifying route).</li>
    <li><strong><a href="${portal}/request-test" style="color:#0891B2;">Competence tests</a></strong> — short MCQ quizzes covering the six ISO competences. Most vendors finish in 20–30 minutes; you can save and resume.</li>
  </ul>
  <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">
    The portal also collects 2–3 brief references in your profile. We email each one a short questionnaire — nothing for you to do beyond entering their contact info.
  </p>

  <h2 style="font-size:15px;color:#0f766e;margin:24px 0 6px;">Heads-up: what we do with this</h2>
  <p style="margin:0 0 12px;">
    Every item above feeds the ISO 17100 evidence pack we maintain for each vendor. Your CV, NDA, references, documents, and competence-test results are stored privately in our portal; only Cethos staff with vendor-management access can see them.
  </p>

  <p style="margin:24px 0 0;text-align:center;">
    <a href="${portal}/login" style="display:inline-block;padding:11px 22px;background:#0891B2;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Sign in to ${portal.replace("https://", "").replace("http://", "")}</a>
  </p>

  <p style="color:#6B7280;font-size:13px;margin-top:24px;">
    Already finished? Great — you can ignore this email. Questions? Reply here or write to <a href="mailto:vendor@cethos.com" style="color:#0891B2;">vendor@cethos.com</a>.
  </p>
  <p style="margin-top:24px;">Thanks,<br/>Cethos Vendor Management</p>
</td></tr>
<tr><td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
  You're receiving this because you're a registered Cethos vendor. Reply if you have questions or no longer wish to receive job offers.
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: "Activate your Cethos vendor profile — 2 gates + sign-in instructions", html };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: {
    dry_run?: boolean;
    vendor_ids?: string[];
    force_resend?: boolean;
    test_email?: string;             // send a single test to this address
    subject_override?: string;       // override the default subject
    body_html_override?: string;     // override the default body html
  } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // ── Test-send mode: one email to the requested address, no DB lookups,
  // no notification_log row. Used by the admin modal's "Send test"
  // button to preview the actual delivered email.
  if (body.test_email) {
    const vendorPortalUrl = Deno.env.get("VENDOR_PORTAL_URL") ?? VENDOR_URL_FALLBACK;
    const defaults = buildEmail({ firstName: "(test)", vendorPortalUrl });
    const subject = body.subject_override?.trim() || defaults.subject;
    const html = body.body_html_override?.trim() || defaults.html;

    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) return json({ success: false, error: "BREVO_API_KEY not configured" }, 500);
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          to: [{ email: body.test_email }],
          sender: { name: "Cethos Translation Services", email: "donotreply@cethos.com" },
          replyTo: { email: "vendor@cethos.com", name: "Cethos Vendor Ops" },
          subject: `[TEST] ${subject}`,
          htmlContent: html,
          tags: ["vendor-activation-email-test"],
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) return json({ success: false, error: `Brevo ${res.status}: ${JSON.stringify(result).slice(0, 500)}` }, 502);
      return json({ success: true, data: { test_sent_to: body.test_email, brevo_message_id: (result as Record<string, unknown>)?.messageId ?? null } });
    } catch (e) {
      return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

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
    const defaults = buildEmail({ firstName, vendorPortalUrl });
    // Per-vendor overrides: %FIRSTNAME% substitution is supported so a
    // global override template can still personalise.
    const subject = body.subject_override?.trim()
      ? body.subject_override.replace(/%FIRSTNAME%/g, firstName)
      : defaults.subject;
    const html = body.body_html_override?.trim()
      ? body.body_html_override.replace(/%FIRSTNAME%/g, firstName)
      : defaults.html;

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
