// cvp-tms-migration-send
//
// Cron worker (pg_cron schedule: */3 * * * *). Sends at most ONE queued
// announcement per tick, yielding 20 sends per hour. Brevo transport with
// custom sender override. Branded shell with Cethos logo. Per-vendor
// unsubscribe link + List-Unsubscribe headers for Gmail/Yahoo one-click.
//
// From:     Cethos Solutions Inc. — Vendor Manager <recruiting@vendors.cethos.com>
// Reply-To: vm@cethos.com
// Legal:    Cethos Solutions Inc.
//
// verify_jwt=false because pg_cron invokes this without a JWT.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireCronSecret } from "../_shared/require-cron-secret.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SENDER = { email: "recruiting@vendors.cethos.com", name: "Cethos Solutions Inc. — Vendor Manager" };
const REPLY_TO = "vm@cethos.com";
const PORTAL_URL = Deno.env.get("VENDOR_PORTAL_URL") ?? "https://vendor.cethos.com";
const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "https://lmzoyezvsjgsxveoakdr.supabase.co";

// Brand tokens — match supabase/functions/_shared/email-templates.ts shell.
const BRAND_TEAL = "#0891B2";
const BRAND_TEXT = "#111827";
const BRAND_MUTED = "#6B7280";
const BRAND_BORDER = "#E5E7EB";
const BRAND_BG = "#F9FAFB";
const LOGO_URL =
  "https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/final_logo_light_bg_cethosAsset%201.svg";

const STALE_CLAIM_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;

type QueueRow = {
  id: string;
  vendor_id: string;
  email: string;
  full_name: string | null;
  wave: "dutch_to_english" | "arabic" | "ccjk";
  attempts: number;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function firstName(fullName: string | null): string {
  if (!fullName) return "there";
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || "there";
}

interface BrevoSendResult { sent: boolean; messageId?: string; reason?: string; }
async function sendBrevoRawEmail(options: {
  to: { email: string; name: string }[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  sender?: { email: string; name: string };
  replyTo?: { email: string; name?: string };
  tags?: string[];
  headers?: Record<string, string>;
}): Promise<BrevoSendResult> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) {
    console.error("BREVO_API_KEY not configured — skipping email send");
    return { sent: false, reason: "config_missing" };
  }
  const sender = options.sender ?? {
    email: Deno.env.get("BREVO_SENDER_EMAIL") ?? "noreply@cethos.com",
    name: Deno.env.get("BREVO_SENDER_NAME") ?? "CETHOS Vendor Portal",
  };
  const payload: Record<string, unknown> = {
    sender, to: options.to, subject: options.subject, htmlContent: options.htmlContent,
  };
  if (options.textContent) payload.textContent = options.textContent;
  if (options.replyTo) payload.replyTo = options.replyTo;
  if (options.tags?.length) payload.tags = options.tags.slice(0, 10);
  if (options.headers && Object.keys(options.headers).length > 0) {
    payload.headers = options.headers;
  }
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Brevo raw send failed (${options.subject}): ${response.status} — ${errorBody}`);
      return { sent: false, reason: `http_${response.status}` };
    }
    const j = (await response.json().catch(() => ({}))) as { messageId?: string };
    return { sent: true, messageId: j.messageId };
  } catch (err) {
    console.error(`Brevo raw send error (${options.subject}):`, err);
    return { sent: false, reason: "exception" };
  }
}

// Frontend page link (visible in the email body — branded URL the user clicks).
function unsubscribeUrl(vendorId: string): string {
  return `${PORTAL_URL}/unsubscribe?token=${vendorId}`;
}

// Edge-function endpoint (used by Gmail/Yahoo one-click List-Unsubscribe-Post).
// Not user-facing — mail clients POST here without browser navigation.
function listUnsubscribeEndpoint(vendorId: string): string {
  return `${PROJECT_URL}/functions/v1/cvp-unsubscribe?token=${vendorId}`;
}

function renderAnnouncementEmail(args: {
  firstNameVal: string;
  vendorId: string;
}): { subject: string; html: string; text: string; unsubscribeUrl: string } {
  const subject =
    "Cethos Solutions Inc. — We're moving to a new vendor portal, please sign in this week";
  const unsub = unsubscribeUrl(args.vendorId);

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:${BRAND_BG};padding:24px 12px;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">A phased 2–3 week move from XTRF to the CETHOS Vendor Portal. Quick sign-in and short training inside.</div>
<div style="max-width:640px;margin:0 auto;background:#fff;padding:24px 28px 32px;border:1px solid ${BRAND_BORDER};border-radius:8px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${BRAND_TEXT};line-height:1.55;">
  <div style="margin:0 0 20px;padding-bottom:16px;border-bottom:1px solid ${BRAND_BORDER};">
    <img src="${LOGO_URL}" alt="Cethos" width="120" height="auto" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:120px;">
  </div>

  <h1 style="color:${BRAND_TEAL};font-size:20px;margin:0 0 16px;">We're moving to a new vendor portal</h1>

  <p>Hi ${args.firstNameVal},</p>

  <p>We're writing to let you know that <strong>CETHOS is moving to a new Translation Management System</strong> — our own <strong>CETHOS Vendor Portal</strong>. You're in one of the first language pools we're rolling this out to, because your work matters to us and we want you set up early.</p>

  <h3 style="color:${BRAND_TEAL};font-size:16px;margin:24px 0 8px;">The move is phased — over the next 2–3 weeks</h3>
  <p>During this window, please expect the following:</p>
  <ul style="padding-left:20px;margin:8px 0 16px;">
    <li>You may receive <strong>job offers from the new Vendor Portal</strong> at <a href="${PORTAL_URL}" style="color:${BRAND_TEAL};">${PORTAL_URL}</a>.</li>
    <li>You may <strong>still receive offers from XTRF</strong> for some projects until we complete the cutover.</li>
    <li>Both are real CETHOS offers — please continue to accept and deliver through whichever system the offer arrives in. We'll confirm by email once XTRF is retired for your language pair.</li>
  </ul>

  <h3 style="color:${BRAND_TEAL};font-size:16px;margin:24px 0 8px;">Two quick things we'd like you to do this week</h3>
  <ol style="padding-left:20px;margin:8px 0 16px;">
    <li><strong>Sign in to the Vendor Portal:</strong> go to <a href="${PORTAL_URL}" style="color:${BRAND_TEAL};">${PORTAL_URL}</a> and enter the email address this message was sent to. You'll receive a <strong>one-time code by email</strong> — paste it in and you're in. <strong>No password needed.</strong></li>
    <li><strong>Complete the short in-portal training</strong> (about 15–20 minutes). It's the first thing you'll see after sign-in and walks you through accepting jobs, downloading files, delivering, and getting paid. While you're there, please confirm your profile details — rates, language pairs, specializations, and payout method — so offers route to you cleanly.</li>
  </ol>

  <p style="margin:24px 0;">
    <a href="${PORTAL_URL}" style="display:inline-block;background:${BRAND_TEAL};color:#fff;text-decoration:none;padding:11px 22px;border-radius:6px;font-weight:600;font-size:14px;">Sign in to the Vendor Portal</a>
  </p>

  <h3 style="color:${BRAND_TEAL};font-size:16px;margin:24px 0 8px;">A note on why we're doing this</h3>
  <p>Building our own portal lets us pay faster, brief you better on each job, and reduce the back-and-forth that XTRF often creates. It's a meaningful investment, and your early feedback in these first weeks will directly shape how it works for everyone who follows.</p>

  <h3 style="color:${BRAND_TEAL};font-size:16px;margin:24px 0 8px;">If anything goes wrong</h3>
  <p>Reply to this email or write to <a href="mailto:${REPLY_TO}" style="color:${BRAND_TEAL};">${REPLY_TO}</a> and we'll sort it out the same day. If you don't receive your one-time code within a couple of minutes, please check spam — and let us know if it's still not arriving.</p>

  <p>Thank you for the work you do with us. We're glad to have you with us on this next chapter.</p>

  <p style="margin-top:24px;">Warm regards,<br/>
  <strong>Vendor Manager</strong><br/>
  Cethos Solutions Inc.<br/>
  <a href="mailto:${REPLY_TO}" style="color:${BRAND_TEAL};">${REPLY_TO}</a></p>

  <p style="color:${BRAND_MUTED};font-size:12px;margin-top:32px;border-top:1px solid ${BRAND_BORDER};padding-top:16px;">
    Sent by Cethos Solutions Inc. You're receiving this because you've worked with CETHOS as a freelance linguist.
    Prefer not to receive announcements like this? <a href="${unsub}" style="color:${BRAND_TEAL};">Unsubscribe in one click</a>.
  </p>
</div>
</body></html>`;

  const text = [
    `Hi ${args.firstNameVal},`, "",
    "We're writing to let you know that CETHOS is moving to a new Translation Management System — our own CETHOS Vendor Portal. You're in one of the first language pools we're rolling this out to, because your work matters to us and we want you set up early.", "",
    "THE MOVE IS PHASED — OVER THE NEXT 2-3 WEEKS", "",
    "During this window, please expect the following:",
    `  - You may receive job offers from the new Vendor Portal at ${PORTAL_URL}.`,
    "  - You may still receive offers from XTRF for some projects until we complete the cutover.",
    "  - Both are real CETHOS offers — please continue to accept and deliver through whichever system the offer arrives in. We'll confirm by email once XTRF is retired for your language pair.", "",
    "TWO QUICK THINGS WE'D LIKE YOU TO DO THIS WEEK", "",
    `  1. Sign in to the Vendor Portal at ${PORTAL_URL} — enter the email this message was sent to and you'll receive a one-time code. No password needed.`,
    "  2. Complete the short in-portal training (about 15–20 minutes). It's the first thing you'll see after sign-in. While you're there, please confirm your profile details — rates, language pairs, specializations, and payout method.", "",
    "A NOTE ON WHY WE'RE DOING THIS", "",
    "Building our own portal lets us pay faster, brief you better on each job, and reduce the back-and-forth that XTRF often creates. Your early feedback in these first weeks will shape how it works for everyone who follows.", "",
    "IF ANYTHING GOES WRONG", "",
    `Reply to this email or write to ${REPLY_TO} and we'll sort it out the same day. If you don't receive your one-time code within a couple of minutes, check spam.`, "",
    "Thank you for the work you do with us. We're glad to have you with us on this next chapter.", "",
    "Warm regards,", "Vendor Manager", "Cethos Solutions Inc.", REPLY_TO, "", "—",
    "Sent by Cethos Solutions Inc. You're receiving this because you've worked with CETHOS as a freelance linguist.",
    `Unsubscribe in one click: ${unsub}`,
  ].join("\n");

  return { subject, html, text, unsubscribeUrl: unsub };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authed = await requireCronSecret(req);
  if (!authed.ok) return new Response(
    JSON.stringify({ success: false, error: authed.error }),
    { status: authed.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const staleClaimCutoff = new Date(Date.now() - STALE_CLAIM_MS).toISOString();

  const { data: candidate, error: pickErr } = await supabase
    .from("cvp_tms_migration_queue")
    .select("id, vendor_id, email, full_name, wave, attempts, send_status, claimed_at")
    .or(`send_status.eq.pending,and(send_status.eq.claimed,claimed_at.lt.${staleClaimCutoff})`)
    .lt("attempts", MAX_ATTEMPTS)
    .order("queued_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (pickErr) return json({ success: false, error: pickErr.message }, 500);
  if (!candidate) return json({ success: true, data: { dispatched: 0, reason: "queue_empty" } });

  const nowIso = new Date().toISOString();
  const prevStatus = candidate.send_status as string;
  const prevClaimedAt = candidate.claimed_at as string | null;

  const claimQuery = supabase
    .from("cvp_tms_migration_queue")
    .update({
      send_status: "claimed",
      claimed_at: nowIso,
      attempts: (candidate.attempts ?? 0) + 1,
    })
    .eq("id", candidate.id)
    .eq("send_status", prevStatus);

  const claimQueryFinal = prevClaimedAt
    ? claimQuery.eq("claimed_at", prevClaimedAt)
    : claimQuery.is("claimed_at", null);

  const { data: claimed, error: claimErr } = await claimQueryFinal.select("id");

  if (claimErr) return json({ success: false, error: claimErr.message }, 500);
  if (!claimed || claimed.length === 0) {
    return json({ success: true, data: { dispatched: 0, reason: "lost_race" } });
  }

  const row: QueueRow = {
    id: candidate.id as string,
    vendor_id: candidate.vendor_id as string,
    email: candidate.email as string,
    full_name: (candidate.full_name as string | null) ?? null,
    wave: candidate.wave as QueueRow["wave"],
    attempts: (candidate.attempts ?? 0) + 1,
  };

  // Opt-out gate. Check by vendor_id (most direct) AND email (in case the
  // vendor opted out under a different vendor_id alias somehow).
  const { data: optOut } = await supabase
    .from("cvp_vendor_email_opt_outs")
    .select("vendor_id, email, opted_out_at")
    .or(`vendor_id.eq.${row.vendor_id},email.eq.${row.email}`)
    .limit(1)
    .maybeSingle();

  if (optOut) {
    await supabase
      .from("cvp_tms_migration_queue")
      .update({
        send_status: "suppressed",
        sent_at: new Date().toISOString(),
        last_error: "opted_out",
      })
      .eq("id", row.id);
    return json({
      success: true,
      data: { dispatched: 0, id: row.id, wave: row.wave, reason: "opted_out" },
    });
  }

  const tpl = renderAnnouncementEmail({
    firstNameVal: firstName(row.full_name),
    vendorId: row.vendor_id,
  });

  // One-click List-Unsubscribe per RFC 8058 — Gmail/Yahoo bulk-sender required.
  const listUnsubHeader = `<${listUnsubscribeEndpoint(row.vendor_id)}>, <mailto:${REPLY_TO}?subject=unsubscribe>`;

  const result = await sendBrevoRawEmail({
    to: [{ email: row.email, name: row.full_name ?? row.email }],
    sender: SENDER,
    replyTo: { email: REPLY_TO, name: "Cethos Solutions Inc. — Vendor Manager" },
    subject: tpl.subject,
    htmlContent: tpl.html,
    textContent: tpl.text,
    tags: ["tms-migration", row.wave],
    headers: {
      "List-Unsubscribe": listUnsubHeader,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  if (result.sent) {
    await supabase
      .from("cvp_tms_migration_queue")
      .update({
        send_status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: result.messageId ?? null,
        last_error: null,
      })
      .eq("id", row.id);
    return json({
      success: true,
      data: { dispatched: 1, id: row.id, wave: row.wave, brevo_message_id: result.messageId },
    });
  }

  const giveUp = row.attempts >= MAX_ATTEMPTS;
  await supabase
    .from("cvp_tms_migration_queue")
    .update({
      send_status: giveUp ? "failed" : "pending",
      claimed_at: null,
      last_error: result.reason ?? "send_failed",
    })
    .eq("id", row.id);

  return json({
    success: false,
    data: {
      dispatched: 0,
      id: row.id,
      wave: row.wave,
      reason: result.reason ?? "send_failed",
      gave_up: giveUp,
    },
  });
});
