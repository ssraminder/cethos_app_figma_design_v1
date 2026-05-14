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

// Per-vendor unsubscribe links. The portal URL is what the recipient
// sees and clicks; the edge-function URL is what Gmail/Yahoo POST to
// for the RFC 8058 one-click List-Unsubscribe header.
function unsubscribeLink(vendorPortalUrl: string, vendorId: string): string {
  return `${vendorPortalUrl}/unsubscribe?token=${vendorId}`;
}
function unsubscribePostEndpoint(supabaseUrl: string, vendorId: string): string {
  return `${supabaseUrl}/functions/v1/cvp-unsubscribe?token=${vendorId}`;
}

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

function buildEmail(args: { firstName: string; vendorPortalUrl: string; unsubscribeUrl: string }): { subject: string; html: string } {
  const portal = escapeHtml(args.vendorPortalUrl);
  const portalDomain = portal.replace("https://", "").replace("http://", "");
  const unsub = escapeHtml(args.unsubscribeUrl);
  const html = `<!doctype html><html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
<tr><td style="padding:18px 24px;border-bottom:1px solid #e5e7eb;">
  <img src="https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/png_logo_cethos_light_bg.png" alt="CETHOS" style="height:28px;display:block;" />
</td></tr>
<tr><td style="padding:24px;font-size:14px;line-height:1.6;color:#111827;">
  <h1 style="font-size:18px;font-weight:600;color:#0f766e;margin:0 0 16px;">We're moving to a new vendor portal</h1>

  <p style="margin:0 0 12px;">Hi ${escapeHtml(args.firstName) || "there"},</p>
  <p style="margin:0 0 12px;">
    We're writing to let you know that <strong>CETHOS</strong> is moving to a new Translation Management System — our own <strong>CETHOS Vendor Portal</strong>. You're in one of the first language pools we're rolling this out to, because your work matters to us and we want you set up early.
  </p>

  <h2 style="font-size:15px;color:#0f766e;margin:22px 0 8px;">The move is phased — over the next 2–3 weeks</h2>
  <p style="margin:0 0 6px;">During this window, please expect the following:</p>
  <ul style="padding-left:18px;margin:0 0 12px;">
    <li>You may receive <strong>job offers from the new Vendor Portal</strong> at <a href="${portal}" style="color:#0891B2;">${portalDomain}</a>.</li>
    <li>You may still receive offers from <strong>XTRF</strong> for some projects until we complete the cutover.</li>
    <li>Both are real CETHOS offers — please continue to accept and deliver through whichever system the offer arrives in. We'll confirm by email once XTRF is retired for your language pair.</li>
  </ul>

  <h2 style="font-size:15px;color:#0f766e;margin:22px 0 8px;">Three quick things we'd like you to do this week</h2>
  <ol style="padding-left:18px;margin:0 0 16px;">
    <li style="margin-bottom:10px;">
      <strong>Sign in to the Vendor Portal</strong> — go to <a href="${portal}" style="color:#0891B2;">${portalDomain}</a> and enter the email address this message was sent to. You'll receive a <strong>one-time code by email</strong> — paste it in and you're in. <strong>No password needed.</strong>
    </li>
    <li style="margin-bottom:10px;">
      <strong>Complete the two activation steps</strong> (about 2 minutes). After sign-in we'll ask you to <strong>upload a current CV</strong> (PDF, up to 10 MB) and <strong>sign the NDA</strong> in the portal. These two are required before job offers route to you — both can be done in a single sitting from the onboarding page.
    </li>
    <li style="margin-bottom:10px;">
      <strong>Complete your profile.</strong> Confirm or update your <strong>rates, language pairs, specializations, certifications, availability, and payout method</strong>. This is what we use to route offers to you, so a complete profile means more relevant jobs and faster turnaround on assignment.
    </li>
  </ol>

  <p style="margin:18px 0;text-align:center;">
    <a href="${portal}/login" style="display:inline-block;padding:11px 22px;background:#0891B2;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Sign in to the Vendor Portal</a>
  </p>

  <h2 style="font-size:15px;color:#0f766e;margin:24px 0 8px;">A note on why we're doing this</h2>
  <p style="margin:0 0 8px;">
    Building our own Portal lets us pay faster, brief you better on each job, and reduce the back and forth that XTRF often creates. Concretely, that means:
  </p>
  <ul style="padding-left:18px;margin:0 0 12px;">
    <li><strong>Faster payment</strong> — invoices generate automatically when your delivery is approved, on a shorter payment window than XTRF's defaults.</li>
    <li><strong>One place for everything on a job</strong> — source files, reference materials, glossary, deadline in your timezone, and special instructions on a single screen.</li>
    <li><strong>Self-serve profile</strong> — update rates, language pairs, certifications, and payout details whenever you want, without waiting on a vendor manager.</li>
    <li><strong>Counter-offers in one click</strong> — propose a different rate or deadline and it routes straight to the project manager with full context, no email threads.</li>
    <li><strong>No more passwords</strong> — sign in with a one-time code emailed to you. Your email is your account.</li>
    <li><strong>Better records</strong> — your full work history, quality feedback, certifications, and earnings all in one place. Useful for you when invoicing or reapplying anywhere; useful for us when matching the right linguist to a job quickly.</li>
  </ul>
  <p style="margin:0 0 12px;">
    It's a meaningful investment, and your early feedback in these first weeks will directly shape what comes next. If something's clunky or missing, please tell us.
  </p>

  <h2 style="font-size:15px;color:#0f766e;margin:24px 0 8px;">If anything goes wrong</h2>
  <p style="margin:0 0 8px;">
    Reply to this email or write to <a href="mailto:vm@cethos.com" style="color:#0891B2;">vm@cethos.com</a> and we'll sort it out the same day. If you don't receive your one-time code within a couple of minutes, please check spam — and let us know if it's still not arriving.
  </p>
  <p style="margin:0 0 18px;">
    Thank you for the work you do with us. We're glad to have you with us on this next chapter.
  </p>

  <p style="margin:18px 0 0;">
    Warm regards,<br/>
    <strong>Vendor Manager</strong><br/>
    Cethos Solutions Inc.<br/>
    <a href="mailto:vm@cethos.com" style="color:#0891B2;">vm@cethos.com</a>
  </p>
</td></tr>
<tr><td style="padding:14px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
  Sent by Cethos Solutions Inc. You're receiving this because you've worked with CETHOS as a freelance linguist. Prefer not to receive announcements like this? <a href="${unsub}" style="color:#0891B2;">Unsubscribe in one click</a> — note that unsubscribing will also deactivate your vendor profile, so we won't route new job offers to you until you ask us to reactivate it.
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: "We're moving to a new vendor portal — your sign-in is ready", html };
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
    // Test mode: synthetic vendor id so the unsubscribe link still
    // renders. The cvp-unsubscribe endpoint rejects unknown tokens
    // so this is a no-op if clicked.
    const testVendorId = "00000000-0000-0000-0000-000000000000";
    const unsubUrl = unsubscribeLink(vendorPortalUrl, testVendorId);
    const defaults = buildEmail({ firstName: "(test)", vendorPortalUrl, unsubscribeUrl: unsubUrl });
    const subjectRaw = body.subject_override?.trim() || defaults.subject;
    const subject = subjectRaw.replace(/%UNSUBSCRIBE_URL%/g, unsubUrl);
    const html = (body.body_html_override?.trim() || defaults.html)
      .replace(/%UNSUBSCRIBE_URL%/g, unsubUrl)
      .replace(/%FIRSTNAME%/g, "(test)");

    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) return json({ success: false, error: "BREVO_API_KEY not configured" }, 500);
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          to: [{ email: body.test_email }],
          sender: { name: "Cethos Vendor Management", email: "donotreply@cethos.com" },
          replyTo: { email: "vm@cethos.com", name: "Cethos Vendor Manager" },
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
    .select("id, full_name, email, status, vendor_type")
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

  // Filter to vendors actually missing at least one *required* gate AND
  // not recently emailed. Agencies are exempt from the CV requirement —
  // only NDA gates them. Freelancers / in-house / unknown types still
  // need both.
  const needsActivation = (vendors ?? []).filter((v) => {
    const isAgency = ((v as { vendor_type?: string | null }).vendor_type ?? "").toLowerCase() === "agency";
    const cvOk = isAgency || cvVendorIds.has(v.id);
    const ndaOk = ndaVendorIds.has(v.id);
    const hasOutstandingGate = !(cvOk && ndaOk);
    return hasOutstandingGate && !recentlyEmailedIds.has(v.id);
  });

  if (body.dry_run) {
    return json({
      success: true,
      data: {
        dry_run: true,
        total_vendors: vendors!.length,
        candidates: needsActivation.length,
        skipped_recently_emailed: recentlyEmailedIds.size,
        sample: needsActivation.slice(0, 10).map((v) => {
          const isAgency = ((v as { vendor_type?: string | null }).vendor_type ?? "").toLowerCase() === "agency";
          return {
            id: v.id,
            email: v.email,
            vendor_type: (v as { vendor_type?: string | null }).vendor_type ?? null,
            // Agencies are CV-exempt — report missing_cv=false even if no
            // CV is on file, because we don't require one.
            missing_cv: !isAgency && !cvVendorIds.has(v.id),
            missing_nda: !ndaVendorIds.has(v.id),
          };
        }),
      },
    });
  }

  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  const vendorPortalUrl = Deno.env.get("VENDOR_PORTAL_URL") ?? VENDOR_URL_FALLBACK;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

  const errors: string[] = [];
  let sent = 0;

  for (const v of needsActivation) {
    const firstName = (v.full_name || "").split(" ")[0] || "";
    const unsubUrl = unsubscribeLink(vendorPortalUrl, v.id);
    const defaults = buildEmail({ firstName, vendorPortalUrl, unsubscribeUrl: unsubUrl });
    // Per-vendor overrides: %FIRSTNAME% and %UNSUBSCRIBE_URL% substitution
    // is supported so a global override template can still personalise.
    const subject = (body.subject_override?.trim() || defaults.subject)
      .replace(/%FIRSTNAME%/g, firstName)
      .replace(/%UNSUBSCRIBE_URL%/g, unsubUrl);
    const html = (body.body_html_override?.trim() || defaults.html)
      .replace(/%FIRSTNAME%/g, firstName)
      .replace(/%UNSUBSCRIBE_URL%/g, unsubUrl);

    // RFC 8058 one-click unsubscribe header — required for Gmail/Yahoo
    // bulk-sender compliance. Mail clients POST to this without browser
    // navigation; the cvp-unsubscribe edge function handles the token.
    const listUnsubHeader = `<${unsubscribePostEndpoint(supabaseUrl, v.id)}>, <mailto:vm@cethos.com?subject=unsubscribe>`;

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
            sender: { name: "Cethos Vendor Management", email: "donotreply@cethos.com" },
            replyTo: { email: "vm@cethos.com", name: "Cethos Vendor Manager" },
            subject,
            htmlContent: html,
            tags: ["vendor-activation-email", `vendor-${v.id}`],
            headers: {
              "List-Unsubscribe": listUnsubHeader,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
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
          vendor_type: (v as { vendor_type?: string | null }).vendor_type ?? null,
          // Agencies don't need a CV — record false to keep the metric
          // honest for "vendors with outstanding CV requirements".
          missing_cv: ((v as { vendor_type?: string | null }).vendor_type ?? "").toLowerCase() !== "agency"
            && !cvVendorIds.has(v.id),
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
