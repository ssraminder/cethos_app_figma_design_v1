// ============================================================================
// vendor-send-cv-nda-reminder
//
// Targeted follow-up email for active vendors who still haven't uploaded a
// CV and/or signed the current NDA. Distinct from vendor-send-activation-
// emails (the migration-narrative email): this is a short, direct prompt
// focused on the two specific gates, sent after the migration push has
// already gone out and the vendor still hasn't completed the steps.
//
// Audience filter is identical to the migration emailer:
//   - status NOT IN (suspended, inactive)
//   - email IS NOT NULL
//   - missing CV OR missing current NDA (agencies are CV-exempt)
//
// Dedup uses a separate notification_log event_type so it does NOT
// collide with vendor_activation_email — admins can send both without
// double-counting against the activation drip's quota.
//
// POST /functions/v1/vendor-send-cv-nda-reminder
// Body:
//   {
//     dry_run?: boolean         — report who would be emailed, send nothing
//     vendor_ids?: string[]     — limit to specific vendors (admin override)
//     force_resend?: boolean    — ignore the dedup window
//     test_email?: string       — preview by sending one copy to this address
//     subject_override?: string — for global subject experiments
//     body_html_override?: string — for global body experiments
//   }
//
// Auth: deploy with --no-verify-jwt. Used both from the admin UI button
// and from a future pg_cron schedule once we're comfortable with cadence.
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
const EVENT_TYPE = "vendor_cv_nda_reminder";

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

// Subject + body are dynamic over what's missing. Three cases:
//   missingCv && missingNda → "Two quick steps before we can route work to you"
//   missingCv && !missingNda → "One last step: upload your CV"
//   !missingCv && missingNda → "One last step: sign the CETHOS NDA"
function buildEmail(args: {
  firstName: string;
  vendorPortalUrl: string;
  unsubscribeUrl: string;
  missingCv: boolean;
  missingNda: boolean;
}): { subject: string; html: string } {
  const portal = escapeHtml(args.vendorPortalUrl);
  const portalDomain = portal.replace("https://", "").replace("http://", "");
  const unsub = escapeHtml(args.unsubscribeUrl);
  const name = escapeHtml(args.firstName) || "there";

  let subject: string;
  let leadLine: string;
  let cvStep = "";
  let ndaStep = "";
  if (args.missingCv && args.missingNda) {
    subject = "Two quick steps before we can route CETHOS work to you";
    leadLine =
      "Two short items are still outstanding on your CETHOS vendor profile. Both can be completed in about 2 minutes from the portal — and once they're done, your profile is eligible to receive job offers again.";
  } else if (args.missingCv) {
    subject = "One last step: upload your CV to receive CETHOS jobs";
    leadLine =
      "Almost there — there's one outstanding item on your CETHOS vendor profile. Once it's done your profile is eligible to receive job offers again.";
  } else {
    subject = "One last step: sign the CETHOS NDA to receive jobs";
    leadLine =
      "Almost there — there's one outstanding item on your CETHOS vendor profile. Once it's done your profile is eligible to receive job offers again.";
  }

  if (args.missingCv) {
    cvStep = `
    <li style="margin-bottom:14px;">
      <strong style="color:#0f766e;">Upload your CV</strong> &mdash;
      PDF, up to 10&nbsp;MB. Your CV is what our project managers and quality
      reviewers look at when picking the right linguist for a job; an
      up-to-date one means more relevant offers and less back-and-forth.
      <br/>
      <a href="${portal}/profile" style="color:#0891B2;display:inline-block;margin-top:4px;">
        Go to your profile &rarr; CV upload
      </a>
    </li>`;
  }
  if (args.missingNda) {
    ndaStep = `
    <li style="margin-bottom:14px;">
      <strong style="color:#0f766e;">Sign the CETHOS NDA</strong> &mdash;
      a one-page non-disclosure agreement protecting our clients' content
      while it's in your hands. You can sign it digitally in the portal in
      under a minute &mdash; no printing or scanning required.
      <br/>
      <a href="${portal}/nda" style="color:#0891B2;display:inline-block;margin-top:4px;">
        Go to the NDA &rarr; sign now
      </a>
    </li>`;
  }

  const stepsBlock = `<ol style="padding-left:18px;margin:0 0 16px;">${cvStep}${ndaStep}</ol>`;

  const html = `<!doctype html><html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
<tr><td style="padding:18px 24px;border-bottom:1px solid #e5e7eb;">
  <img src="https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/png_logo_cethos_light_bg.png" alt="CETHOS" style="height:28px;display:block;" />
</td></tr>
<tr><td style="padding:24px;font-size:14px;line-height:1.6;color:#111827;">
  <h1 style="font-size:18px;font-weight:600;color:#0f766e;margin:0 0 16px;">${args.missingCv && args.missingNda ? "Two quick steps before we can send you work" : args.missingCv ? "One step left: upload your CV" : "One step left: sign your NDA"}</h1>

  <p style="margin:0 0 12px;">Hi ${name},</p>
  <p style="margin:0 0 14px;">${escapeHtml(leadLine)}</p>

  ${stepsBlock}

  <p style="margin:18px 0;text-align:center;">
    <a href="${portal}/login" style="display:inline-block;padding:11px 22px;background:#0891B2;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Sign in to the Vendor Portal</a>
  </p>

  <p style="margin:0 0 12px;">
    If you've already signed in before, the link above goes straight to your one-time-code sign in. We don't use passwords &mdash; just enter your email and we'll mail you a 6-digit code.
  </p>

  <h2 style="font-size:14px;color:#0f766e;margin:22px 0 6px;">Why these two specifically</h2>
  <p style="margin:0 0 8px;">
    The CV and NDA are the two requirements ISO 17100 (the translation-services quality standard we work to) places on every linguist who handles client work. We can't route a paid job to your profile until both are on file &mdash; not a policy choice on our side, just how the audit works.
  </p>

  <h2 style="font-size:14px;color:#0f766e;margin:22px 0 6px;">If anything goes wrong</h2>
  <p style="margin:0 0 8px;">
    Reply to this email or write to <a href="mailto:vm@cethos.com" style="color:#0891B2;">vm@cethos.com</a> and we'll sort it out the same day. Common gotchas: <em>the one-time code can land in spam</em>; <em>the CV needs to be a PDF</em> (we accept DOCX too, but PDF is faster to review); <em>the NDA signature is a typed full name plus a click</em> &mdash; no upload required.
  </p>

  <p style="margin:18px 0 0;">
    Thanks,<br/>
    <strong>Vendor Manager</strong><br/>
    Cethos Solutions Inc.<br/>
    <a href="mailto:vm@cethos.com" style="color:#0891B2;">vm@cethos.com</a>
  </p>
</td></tr>
<tr><td style="padding:14px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
  Sent by Cethos Solutions Inc. You're receiving this because you have an active vendor profile with CETHOS that's missing CV / NDA. <a href="${unsub}" style="color:#0891B2;">Unsubscribe in one click</a> &mdash; note that unsubscribing will also deactivate your vendor profile, so we won't route new job offers to you until you ask us to reactivate it.
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html };
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
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  const vendorPortalUrl = Deno.env.get("VENDOR_PORTAL_URL") ?? VENDOR_URL_FALLBACK;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

  // ── Test-send mode: single email to the requested address, no DB lookups,
  //    no notification_log row. Both gates render in the preview so the
  //    admin can see the longest version of the email.
  if (body.test_email) {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const unsubUrl = unsubscribeLink(vendorPortalUrl, fakeId);
    const defaults = buildEmail({
      firstName: "Test",
      vendorPortalUrl,
      unsubscribeUrl: unsubUrl,
      missingCv: true,
      missingNda: true,
    });
    const subject = (body.subject_override?.trim() || defaults.subject)
      .replace(/%FIRSTNAME%/g, "Test")
      .replace(/%UNSUBSCRIBE_URL%/g, unsubUrl);
    const html = (body.body_html_override?.trim() || defaults.html)
      .replace(/%FIRSTNAME%/g, "Test")
      .replace(/%UNSUBSCRIBE_URL%/g, unsubUrl);
    if (!BREVO_API_KEY) {
      return json({ success: false, error: "BREVO_API_KEY not configured" }, 500);
    }
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to: [{ email: body.test_email }],
        sender: { name: "Cethos Vendor Management", email: "donotreply@cethos.com" },
        replyTo: { email: "vm@cethos.com", name: "Cethos Vendor Manager" },
        subject: `[TEST] ${subject}`,
        htmlContent: html,
        tags: ["vendor-cv-nda-reminder", "test"],
      }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) return json({ success: false, error: `Brevo ${res.status}: ${JSON.stringify(result).slice(0, 500)}` }, 502);
    return json({ success: true, data: { test: true, sent_to: body.test_email } });
  }

  // ── Resolve the candidate vendors. Same status / email gates as the
  //    migration emailer. Paginate explicitly — the default PostgREST
  //    response cap of 1000 rows would truncate our audience (~1,121
  //    today) and silently undercount the candidates dry-run.
  type VendorRow = { id: string; full_name: string | null; email: string; status: string; vendor_type: string | null };
  const vendors: VendorRow[] = [];
  let vErr: { message: string } | null = null;
  const PAGE = 1000;
  for (let page = 0; page < 10; page++) {
    let pageQ = sb
      .from("vendors")
      .select("id, full_name, email, status, vendor_type")
      .not("status", "in", "(suspended,inactive)")
      .not("email", "is", null)
      .order("created_at", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (body.vendor_ids && body.vendor_ids.length > 0) {
      pageQ = pageQ.in("id", body.vendor_ids);
    }
    const { data: pageRows, error: pageErr } = await pageQ;
    if (pageErr) { vErr = pageErr; break; }
    if (!pageRows || pageRows.length === 0) break;
    vendors.push(...(pageRows as VendorRow[]));
    if (pageRows.length < PAGE) break;
  }
  if (vErr) return json({ success: false, error: "vendor_lookup_failed", detail: vErr.message }, 500);

  const ids = vendors.map((v) => v.id);
  if (ids.length === 0) {
    return json({ success: true, data: { candidates: 0, sent: 0, skipped: 0, errors: [] } });
  }

  // CV + NDA presence in bulk. We deliberately DON'T pass `.in("vendor_id", ids)`
  // here — once the audience grows past ~200 vendors the URL-encoded UUID
  // list blows past PostgREST's URL-length limit and the request silently
  // returns 0 rows, which made the function flag every vendor as missing
  // CV (resulting in candidates == total in the dry-run). Both source
  // tables are small (~300 active rows each), so fetching them in full
  // and filtering in memory is cheaper than chunking the IN list.
  const { data: cvRows } = await sb.from("vendor_cvs").select("vendor_id");
  const candidateIdSet = new Set(ids);
  const cvVendorIds = new Set<string>();
  for (const r of cvRows ?? []) {
    const vid = (r as { vendor_id: string }).vendor_id;
    if (vid && candidateIdSet.has(vid)) cvVendorIds.add(vid);
  }

  const { data: ndaRows } = await sb
    .from("vendor_nda_signatures")
    .select("vendor_id")
    .eq("is_current", true);
  const ndaVendorIds = new Set<string>();
  for (const r of ndaRows ?? []) {
    const vid = (r as { vendor_id: string }).vendor_id;
    if (vid && candidateIdSet.has(vid)) ndaVendorIds.add(vid);
  }

  // Dedup against notification_log entries for THIS event_type only.
  // Same URL-length trap as the CV/NDA queries: don't pass an .in() over
  // every vendor id — fetch the entire window for this event_type and
  // filter in memory to the candidate set. notification_log gets paginated
  // because it can exceed PostgREST's 1000-row default once we send a
  // few batches.
  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const recentlyEmailedIds = new Set<string>();
  if (!body.force_resend) {
    const PAGE_LOG = 1000;
    for (let page = 0; page < 10; page++) {
      const from = page * PAGE_LOG;
      const { data: recent, error: recentErr } = await sb
        .from("notification_log")
        .select("recipient_id")
        .eq("event_type", EVENT_TYPE)
        .gte("created_at", dedupSince)
        .not("recipient_id", "is", null)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE_LOG - 1);
      if (recentErr) break;
      if (!recent || recent.length === 0) break;
      for (const r of recent) {
        const rid = (r as { recipient_id: string | null }).recipient_id;
        if (rid && candidateIdSet.has(rid)) recentlyEmailedIds.add(rid);
      }
      if (recent.length < PAGE_LOG) break;
    }
  }

  // Build the gate-aware candidate list. Agencies skip the CV requirement.
  type Cand = {
    id: string;
    full_name: string | null;
    email: string;
    vendor_type: string | null;
    missing_cv: boolean;
    missing_nda: boolean;
  };
  const candidates: Cand[] = [];
  for (const v of vendors) {
    const isAgency = ((v as { vendor_type?: string | null }).vendor_type ?? "").toLowerCase() === "agency";
    const missingCv = !isAgency && !cvVendorIds.has(v.id);
    const missingNda = !ndaVendorIds.has(v.id);
    if (!(missingCv || missingNda)) continue;
    if (recentlyEmailedIds.has(v.id)) continue;
    candidates.push({
      id: v.id,
      full_name: v.full_name,
      email: v.email,
      vendor_type: (v as { vendor_type?: string | null }).vendor_type ?? null,
      missing_cv: missingCv,
      missing_nda: missingNda,
    });
  }

  if (body.dry_run) {
    return json({
      success: true,
      data: {
        dry_run: true,
        total_vendors: vendors.length,
        candidates: candidates.length,
        skipped_recently_emailed: recentlyEmailedIds.size,
        sample: candidates.slice(0, 10).map((c) => ({
          id: c.id,
          email: c.email,
          missing_cv: c.missing_cv,
          missing_nda: c.missing_nda,
        })),
      },
    });
  }

  const errors: string[] = [];
  let sent = 0;

  for (const c of candidates) {
    const firstName = (c.full_name || "").split(" ")[0] || "";
    const unsubUrl = unsubscribeLink(vendorPortalUrl, c.id);
    const defaults = buildEmail({
      firstName,
      vendorPortalUrl,
      unsubscribeUrl: unsubUrl,
      missingCv: c.missing_cv,
      missingNda: c.missing_nda,
    });
    const subject = (body.subject_override?.trim() || defaults.subject)
      .replace(/%FIRSTNAME%/g, firstName)
      .replace(/%UNSUBSCRIBE_URL%/g, unsubUrl);
    const html = (body.body_html_override?.trim() || defaults.html)
      .replace(/%FIRSTNAME%/g, firstName)
      .replace(/%UNSUBSCRIBE_URL%/g, unsubUrl);

    const listUnsubHeader = `<${unsubscribePostEndpoint(supabaseUrl, c.id)}>, <mailto:vm@cethos.com?subject=unsubscribe>`;

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
            to: [{ email: c.email, name: c.full_name || c.email }],
            sender: { name: "Cethos Vendor Management", email: "donotreply@cethos.com" },
            replyTo: { email: "vm@cethos.com", name: "Cethos Vendor Manager" },
            subject,
            htmlContent: html,
            tags: ["vendor-cv-nda-reminder", `vendor-${c.id}`],
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
        event_type: EVENT_TYPE,
        recipient_type: "vendor",
        recipient_email: c.email,
        recipient_name: c.full_name ?? null,
        recipient_id: c.id,
        subject,
        status: emailSent ? "sent" : "failed",
        error_message: emailError,
        metadata: {
          vendor_type: c.vendor_type,
          missing_cv: c.missing_cv,
          missing_nda: c.missing_nda,
          brevo_message_id: brevoMessageId,
        },
      });
    } catch (logErr) {
      console.error("vendor-send-cv-nda-reminder: notification_log insert failed", logErr);
    }

    if (emailSent) sent++;
    else errors.push(`${c.email}: ${emailError}`);
  }

  return json({
    success: true,
    data: {
      total_vendors: vendors.length,
      candidates: candidates.length,
      sent,
      failed: errors.length,
      skipped_recently_emailed: recentlyEmailedIds.size,
      errors: errors.slice(0, 20),
    },
  });
});
