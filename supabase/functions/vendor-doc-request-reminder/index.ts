// ============================================================================
// vendor-doc-request-reminder
//
// Cron: daily 14:00 UTC. Tiered reminders for sent / partial requests:
//   day 3  → reminder 1
//   day 7  → reminder 2
//   day 12 → reminder 3 (final — request expires day 14)
//
// For each due request:
//   1) Re-sync items against live vendor state.
//   2) If now fully resolved, flip to completed + trigger reassess, no email.
//   3) Else build a reminder email listing still-pending items with
//      per-item alternate-paths guidance + "I don't have this" pointer
//      back to the iso-evidence page with ?explain=<slug>.
//   4) Increment reminder_count, stamp last_reminder_at, log to notification_log.
//
// Body: {} — no parameters. Deploy --no-verify-jwt for the pg_cron call.
// Optional body: { vendor_id }  — manual trigger for a single vendor (admin use).
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  recomputeItems,
  nextStatusFromItems,
  type RequestedItem,
} from "../_shared/iso-recheck.ts";
import { alternatePathFor } from "../_shared/iso-alternate-paths.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VENDOR_URL_FALLBACK = "https://vendor.cethos.com";

interface ReminderTier {
  tier: 1 | 2 | 3;
  /** Days since request creation that gate this tier. */
  daysSinceCreated: number;
  /** Minimum days since the previous reminder so we don't double-send. */
  daysSinceLast: number;
  headline: (firstName: string) => string;
  preamble: string;
}

const TIERS: ReminderTier[] = [
  {
    tier: 1,
    daysSinceCreated: 3,
    daysSinceLast: 0,
    headline: (n) => `Hi ${n || "there"} — friendly nudge on your ISO 17100 evidence`,
    preamble:
      "We're still missing a few items below. No pressure — most vendors finish in a single sitting. If any document is hard to obtain, take a look at the alternate paths next to each item, or hit <strong>I don't have this</strong> and tell us what you do have.",
  },
  {
    tier: 2,
    daysSinceCreated: 7,
    daysSinceLast: 3,
    headline: (n) => `Hi ${n || "there"} — your evidence checklist is still open`,
    preamble:
      "A week in and these items are still pending. We genuinely want to keep working with you. If any of these are blockers, the alternate paths below cover the most common substitutes — or click <strong>I don't have this</strong> on the page and we'll figure it out together.",
  },
  {
    tier: 3,
    daysSinceCreated: 12,
    daysSinceLast: 4,
    headline: (n) => `${n || "Hi there"} — your evidence link expires in 2 days`,
    preamble:
      "Final reminder: your link expires soon. If you've hit a wall on any item, please don't drop the thread — reply to this email, or click <strong>I don't have this</strong> on the page and tell us what you have access to. We'll find a path.",
  },
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function buildReminderHtml(args: {
  firstName: string;
  tier: ReminderTier;
  pendingItems: RequestedItem[];
  uploadLinkUrl: string;
  expiresAt: string;
}): { subject: string; html: string } {
  const itemsHtml = args.pendingItems
    .map((it) => {
      const tag = it.kind === "profile_field" ? "[profile field]" : "[file upload]";
      const guidance = alternatePathFor(it.slug);
      const explainHref = `${args.uploadLinkUrl}?explain=${encodeURIComponent(it.slug)}`;
      return `<li style="margin-bottom:14px;">
  <div style="font-weight:600;color:#111827;">${escapeHtml(it.label)} <span style="color:#9ca3af;font-size:11px;font-weight:400;">${tag}</span></div>
  <div style="color:#4b5563;font-size:13px;margin-top:3px;">${escapeHtml(guidance)}</div>
  <div style="margin-top:6px;"><a href="${escapeHtml(explainHref)}" style="color:#0891B2;font-size:12px;">I don't have this — let me explain</a></div>
</li>`;
    })
    .join("\n");

  const html = `<!doctype html><html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
<tr><td style="padding:20px 24px;background:#0f766e;color:#ffffff;">
  <div style="font-size:18px;font-weight:600;">Cethos Translation Services</div>
  <div style="font-size:13px;opacity:0.85;margin-top:2px;">Reminder ${args.tier.tier} of 3 — ISO 17100 evidence</div>
</td></tr>
<tr><td style="padding:24px;color:#111827;font-size:14px;line-height:1.55;">
  <p>${args.tier.preamble}</p>
  <p><strong>Still pending:</strong></p>
  <ul style="padding-left:18px;">${itemsHtml}</ul>
  <p style="margin:24px 0 0;text-align:center;">
    <a href="${escapeHtml(args.uploadLinkUrl)}" style="display:inline-block;padding:11px 22px;background:#0891B2;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Open my evidence checklist</a>
  </p>
  <p style="color:#6B7280;font-size:13px;margin-top:24px;">Link expires ${new Date(args.expiresAt).toLocaleDateString()}.</p>
</td></tr>
<tr><td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
  Reply to this email if anything is blocking you — we'll figure out a path. You can also click "I don't have this" on any item.
</td></tr>
</table></td></tr></table></body></html>`;

  return {
    subject: args.tier.tier === 3
      ? `Final reminder — Cethos ISO 17100 evidence (link expires soon)`
      : `Reminder — Cethos ISO 17100 evidence still needed`,
    html,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let manualVendorId: string | undefined;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      manualVendorId = body?.vendor_id;
    } catch { /* empty body is fine */ }
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = Date.now();
  const sent: string[] = [];
  const closedByResync: string[] = [];
  const errors: string[] = [];

  let query = sb
    .from("vendor_document_requests")
    .select("id, vendor_id, requested_items, request_token, request_token_expires_at, created_at, status, reminder_count, last_reminder_at")
    .in("status", ["sent", "partial"]);
  if (manualVendorId) query = query.eq("vendor_id", manualVendorId);

  const { data: requests, error: fetchErr } = await query;
  if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);

  for (const r of requests ?? []) {
    try {
      // Resolve which tier this request is due for (if any).
      const daysSinceCreated = (now - new Date(r.created_at).getTime()) / 86_400_000;
      const lastReminderTs = r.last_reminder_at ? new Date(r.last_reminder_at).getTime() : 0;
      const daysSinceLast = lastReminderTs ? (now - lastReminderTs) / 86_400_000 : Infinity;
      const nextTierIdx = r.reminder_count as number; // 0 → tier 1, 1 → tier 2, 2 → tier 3
      const tier = TIERS[nextTierIdx];
      const dueForCron =
        !!tier &&
        daysSinceCreated >= tier.daysSinceCreated &&
        daysSinceLast >= tier.daysSinceLast;
      if (!manualVendorId && !dueForCron) continue;
      if (!tier) continue; // No more tiers; rely on expiry sweep.

      // Re-sync items first.
      const items = (r.requested_items as RequestedItem[]) ?? [];
      const [{ data: vendor }, { count: cvCount }] = await Promise.all([
        sb.from("vendors")
          .select("id, full_name, email, additional_emails, native_languages, years_experience, specializations, certifications")
          .eq("id", r.vendor_id)
          .maybeSingle(),
        sb.from("vendor_cvs")
          .select("id", { count: "exact", head: true })
          .eq("vendor_id", r.vendor_id),
      ]);
      if (!vendor?.email) continue;

      const updatedItems = recomputeItems(items, vendor, cvCount ?? 0);
      const { status: computedStatus, allDone } = nextStatusFromItems(updatedItems);

      if (allDone) {
        // Re-sync closed the request — skip the email, flip status, reassess.
        await sb
          .from("vendor_document_requests")
          .update({
            requested_items: updatedItems,
            status: "completed",
            completed_at: new Date(now).toISOString(),
            auto_synced_at: new Date(now).toISOString(),
          })
          .eq("id", r.id);
        closedByResync.push(r.id);

        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (supabaseUrl && serviceRole) {
          fetch(`${supabaseUrl}/functions/v1/vendor-iso17100-assess`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRole}`, apikey: serviceRole },
            body: JSON.stringify({ vendor_id: r.vendor_id }),
          }).catch(() => undefined);
        }
        continue;
      }

      // Trigger Claude assessment in the background so the admin sees a
      // fresh verdict by the time the vendor responds.
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && serviceRole) {
        fetch(`${supabaseUrl}/functions/v1/vendor-iso17100-assess`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRole}`, apikey: serviceRole },
          body: JSON.stringify({ vendor_id: r.vendor_id }),
        }).catch(() => undefined);
      }

      // Build + send the reminder.
      const vendorPortalUrl = Deno.env.get("VENDOR_PORTAL_URL") ?? VENDOR_URL_FALLBACK;
      const uploadLinkUrl = `${vendorPortalUrl}/iso-evidence/${r.request_token}`;
      const firstName = (vendor.full_name || "").split(" ")[0] || "";
      const pendingItems = updatedItems.filter((it) => !it.completed_at && !it.declined_at);

      const { subject, html } = buildReminderHtml({
        firstName,
        tier,
        pendingItems,
        uploadLinkUrl,
        expiresAt: r.request_token_expires_at,
      });

      const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
      let emailSent = false;
      let emailError: string | null = null;
      let brevoMessageId: string | null = null;
      if (!BREVO_API_KEY) emailError = "BREVO_API_KEY not configured";
      else {
        const ccList = Array.isArray(vendor.additional_emails)
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
          tags: [`vendor-doc-request-reminder-${tier.tier}`, `vendor-${r.vendor_id}`],
        };
        if (ccList.length > 0) payload.cc = ccList.map((e) => ({ email: e }));
        try {
          const res = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(payload),
          });
          const result = await res.json().catch(() => ({}));
          if (res.ok) { emailSent = true; brevoMessageId = (result as Record<string, unknown>)?.messageId as string ?? null; }
          else emailError = `Brevo ${res.status}: ${JSON.stringify(result).slice(0, 500)}`;
        } catch (e) {
          emailError = e instanceof Error ? e.message : String(e);
        }
      }

      // Bump counter regardless of email success so we don't loop the
      // same vendor every cron tick on a Brevo outage. Errors go to
      // notification_log for diagnosis.
      const updatePayload: Record<string, unknown> = {
        requested_items: updatedItems,
        status: computedStatus,
        auto_synced_at: new Date(now).toISOString(),
        reminder_count: (r.reminder_count as number) + 1,
        last_reminder_at: new Date(now).toISOString(),
      };
      await sb.from("vendor_document_requests").update(updatePayload).eq("id", r.id);

      try {
        await sb.from("notification_log").insert({
          event_type: "vendor_document_request_reminder",
          recipient_type: "vendor",
          recipient_email: vendor.email,
          recipient_name: vendor.full_name ?? null,
          recipient_id: r.vendor_id,
          subject,
          status: emailSent ? "sent" : "failed",
          error_message: emailError,
          metadata: {
            request_id: r.id,
            tier: tier.tier,
            pending_count: pendingItems.length,
            pending_slugs: pendingItems.map((it) => it.slug),
            brevo_message_id: brevoMessageId,
          },
        });
      } catch (logErr) {
        console.error("notification_log insert failed:", logErr);
      }

      if (emailSent) sent.push(r.id);
      else errors.push(`req ${r.id} email: ${emailError}`);
    } catch (e) {
      errors.push(`req ${r.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return json({
    ok: errors.length === 0,
    candidates: requests?.length ?? 0,
    sent: sent.length,
    closed_by_resync: closedByResync.length,
    errors,
  });
});
