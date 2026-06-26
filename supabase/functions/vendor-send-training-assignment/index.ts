// ============================================================================
// vendor-send-training-assignment
//
// Emails vendors (linguists) that a training has been assigned to them.
// Designed to be called from the admin "Assign to vendors" flow right after
// the bulk assignment is written, and reusable from a future reminder cron.
//
// Transport: Mailgun (same env/contract as _shared/mailgun.ts) using Mailgun
// BATCH SENDING (recipient-variables). A full-roster rollout (~1,577 active
// vendors) goes out in ceil(N/1000) API calls — NOT a per-record loop, which
// would blow the edge-function wall-clock limit / hit RateLimitError (see
// CLAUDE.md: "Bulk emails: send via the ESP directly, throttled — do NOT loop
// a per-record edge function"). Each recipient gets an individual copy and
// only sees their own address.
//
// Self-contained (inlines a trimmed Cethos email shell) so the deployed bundle
// is a single file and matches the committed source exactly.
//
// POST /functions/v1/vendor-send-training-assignment
// Body:
//   {
//     training_id?: string      // training to notify about (uuid)
//     training_slug?: string    // alternative to training_id
//     vendor_ids?: string[]     // vendors to notify (the ones just assigned)
//     due_at?: string | null    // optional due date shown in the email
//     test_email?: string       // TEST: render + send one copy here, no DB writes
//     dry_run?: boolean         // report who would be emailed, send nothing
//   }
//
// Auth: deploy with --no-verify-jwt. Invoked from the admin UI via
// supabase.functions.invoke.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VENDOR_URL_FALLBACK = "https://vendor.cethos.com";
const EVENT_TYPE = "vendor_training_assignment";
const MAILGUN_BATCH_MAX = 1000; // Mailgun hard cap on recipients per batch send.

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ───────────────────────── Email shell (trimmed, brand-faithful) ──────────────
const C = {
  navy: "#0C2340",
  teal: "#0891B2",
  tealDeep: "#0E7490",
  tealBg: "#E0F2FE",
  gray: "#4B5563",
  muted: "#64748B",
  border: "#E5E7EB",
  slate50: "#F8FAFC",
  slate200: "#E2E8F0",
  slate300: "#CBD5E1",
  white: "#FFFFFF",
} as const;
const FONT =
  "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
const LOGO_URL =
  Deno.env.get("CETHOS_EMAIL_LOGO_URL") ||
  "https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/png_logo_cethos_light_bg.png";
const COMPANY = {
  legalName: "Cethos Solutions Inc.",
  address: "421 7 Avenue SW, Floor 30, Calgary, AB T2P 4K9",
  website: "https://cethos.com",
};
const TEMPLATE = { name: "Vendor Training Assignment", version: "1.0", updatedAt: "2026-06-26" };

function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;"
      : c === "<" ? "&lt;"
      : c === ">" ? "&gt;"
      : c === '"' ? "&quot;"
      : "&#39;",
  );
}
const eyebrow = (t: string) =>
  `<div style="font-size:11px;font-weight:700;color:${C.teal};text-transform:uppercase;letter-spacing:0.12em;margin:0 0 10px;">${t}</div>`;
const title = (t: string) =>
  `<h1 style="margin:0 0 14px;font-size:24px;font-weight:700;line-height:1.25;color:${C.navy};letter-spacing:-0.005em;font-family:${FONT};">${t}</h1>`;
const lead = (t: string) =>
  `<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${C.gray};">${t}</p>`;
const paragraph = (t: string) =>
  `<p style="margin:0 0 16px;font-size:14.5px;line-height:1.6;color:${C.gray};">${t}</p>`;
const hint = (t: string) =>
  `<p style="margin:20px 0 0;font-size:12.5px;color:${C.muted};line-height:1.55;">${t}</p>`;
const strong = (t: string) => `<span style="color:${C.navy};font-weight:700;">${t}</span>`;

function detailsTable(rows: [string, string][]): string {
  const inner = rows
    .map(([k, v], i) => {
      const border = i < rows.length - 1 ? `border-bottom:1px solid ${C.slate200};` : "";
      return `<tr style="${border}"><td style="padding:10px 16px;color:${C.muted};font-size:13px;width:40%;vertical-align:top;">${esc(k)}</td><td style="padding:10px 16px;color:${C.navy};font-size:13.5px;font-weight:500;">${v}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 24px;background:${C.slate50};border-radius:8px;overflow:hidden;"><tbody>${inner}</tbody></table>`;
}
function ctaButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="left" style="margin:8px 0 4px;border-collapse:separate;"><tbody><tr><td align="center" bgcolor="${C.teal}" style="background:${C.teal};border-radius:8px;"><a href="${esc(url)}" target="_blank" style="display:inline-block;padding:14px 28px;color:${C.white};text-decoration:none;font-weight:600;font-size:15px;font-family:${FONT};text-align:center;border-radius:8px;">${esc(label)}</a></td></tr></tbody></table>`;
}
function callout(titleText: string, body: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 22px;"><tbody><tr><td style="background:${C.tealBg};border-left:3px solid ${C.teal};border-radius:0 8px 8px 0;padding:12px 16px;"><div style="font-weight:600;font-size:13px;color:${C.navy};margin:0 0 4px;">${esc(titleText)}</div><div style="font-size:13px;color:${C.tealDeep};line-height:1.55;">${body}</div></td></tr></tbody></table>`;
}

function emailShell(bodyHtml: string, preheader: string, replyTo: string): string {
  const year = new Date().getFullYear();
  const pre = preheader
    ? `<div style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</div>`
    : "";
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only"><title>Cethos</title>
<style type="text/css">html,body{margin:0!important;padding:0!important;width:100%!important;}a{text-decoration:none;}@media only screen and (max-width:620px){.cethos-card{width:100%!important;max-width:100%!important;border-radius:0!important;}.cethos-pad{padding-left:20px!important;padding-right:20px!important;}}</style>
</head>
<body style="margin:0;padding:0;width:100%;background:${C.slate50};font-family:${FONT};color:${C.gray};font-size:15px;line-height:1.55;">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.slate50};padding:32px 16px;"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="cethos-card" style="background:${C.white};border-radius:12px;overflow:hidden;border:1px solid ${C.border};max-width:600px;box-shadow:0 1px 3px rgba(12,35,64,0.06);">
    <tr><td class="cethos-pad" style="padding:26px 32px 22px;border-bottom:2px solid ${C.teal};background:${C.white};"><img src="${LOGO_URL}" alt="Cethos" height="32" style="height:32px;display:block;border:0;outline:none;text-decoration:none;" /></td></tr>
    <tr><td class="cethos-pad" style="padding:32px 32px 28px;color:${C.gray};font-size:15px;line-height:1.6;font-family:${FONT};">${bodyHtml}</td></tr>
    <tr><td class="cethos-pad" style="padding:18px 32px;border-top:1px solid ${C.border};background:${C.slate50};font-size:11.5px;color:${C.muted};line-height:1.6;">
      <div>${esc(COMPANY.legalName)} · ${esc(COMPANY.address)}</div>
      <div style="margin-top:2px;">Reply to <a href="mailto:${esc(replyTo)}" style="color:${C.tealDeep};text-decoration:none;">${esc(replyTo)}</a> · <a href="${esc(COMPANY.website)}" style="color:${C.tealDeep};text-decoration:none;">cethos.com</a></div>
      <div style="margin-top:6px;color:${C.slate300};">© ${year} ${esc(COMPANY.legalName)}. All rights reserved. · <span style="color:${C.muted};">${esc(TEMPLATE.name)} v${esc(TEMPLATE.version)} · Updated ${esc(TEMPLATE.updatedAt)}</span></div>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

// ───────────────────────── Email body ────────────────────────────────────────
interface TrainingInfo {
  title: string;
  description: string | null;
  lessons: number;
  minutes: number;
  slug: string;
}

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// Builds the email. The greeting uses the literal Mailgun batch token
// %recipient.first_name% — Mailgun substitutes each recipient's value at send.
function buildEmail(t: TrainingInfo, dueAt: string | null, portal: string, replyTo: string): {
  subject: string;
  html: string;
} {
  const due = fmtDate(dueAt);
  const lessonsLine = `${t.lessons} short lesson${t.lessons === 1 ? "" : "s"}${t.minutes ? ` · about ${t.minutes} min total` : ""}`;
  const rows: [string, string][] = [
    ["Training", esc(t.title)],
    ["Format", lessonsLine],
    ["Due", due ? strong(esc(due)) : "No fixed deadline — please complete soon"],
  ];
  const body = [
    eyebrow("Required training"),
    title("A new training has been assigned to you"),
    paragraph("Hi %recipient.first_name%,"),
    lead(
      `As part of your work with Cethos, you've been assigned a required training: ${strong(esc(t.title))}.` +
        (due ? ` Please complete it by ${strong(esc(due))}.` : " Please complete it at your earliest convenience."),
    ),
    detailsTable(rows),
    t.description ? paragraph(esc(t.description)) : "",
    ctaButton("Go to your trainings", `${portal}/trainings`),
    callout(
      "How to access it",
      `Sign in to the vendor portal with your email — we'll send you a one-time code (no password needed). Your assigned training appears at the top of your ${strong("Trainings")} list with a ${strong("Required")} badge.`,
    ),
    hint(
      `Questions about this training? Just reply to this email — our vendor management team will help you out.`,
    ),
  ].join("");

  const subject = due
    ? `Required training assigned: ${t.title} (due ${due})`
    : `Required training assigned: ${t.title}`;
  return { subject, html: emailShell(body, `A required training has been assigned to your Cethos vendor profile.`, replyTo) };
}

// ───────────────────────── Mailgun batch transport ───────────────────────────
async function mailgunBatchSend(opts: {
  recipients: { email: string; firstName: string }[];
  subject: string;
  html: string;
  tags: string[];
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const apiKey = Deno.env.get("MAILGUN_API_KEY");
  const domain = Deno.env.get("MAILGUN_DOMAIN");
  if (!apiKey || !domain) return { ok: false, error: "mailgun_config_missing" };
  const region = (Deno.env.get("MAILGUN_REGION") ?? "us").toLowerCase();
  const base = region === "eu" ? "https://api.eu.mailgun.net/v3" : "https://api.mailgun.net/v3";
  const fromEmail = Deno.env.get("MAILGUN_FROM_EMAIL") ?? `noreply@${domain}`;
  const fromName = Deno.env.get("MAILGUN_FROM_NAME") ?? "Cethos Vendor Management";
  const replyTo = Deno.env.get("MAILGUN_REPLY_TO") ?? "vm@cethos.com";

  const form = new FormData();
  form.append("from", `${fromName} <${fromEmail}>`);
  const varsMap: Record<string, { first_name: string }> = {};
  for (const r of opts.recipients) {
    form.append("to", r.email);
    // Escaped — Mailgun substitutes this value straight into the HTML.
    varsMap[r.email] = { first_name: esc(r.firstName) || "there" };
  }
  form.append("recipient-variables", JSON.stringify(varsMap));
  form.append("h:Reply-To", replyTo);
  form.append("subject", opts.subject);
  form.append("html", opts.html);
  for (const tag of opts.tags.slice(0, 3)) form.append("o:tag", tag);

  try {
    const res = await fetch(`${base}/${domain}/messages`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`api:${apiKey}`)}` },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `http_${res.status}: ${text.slice(0, 300)}` };
    }
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: j.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ───────────────────────── Handler ───────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: {
    training_id?: string;
    training_slug?: string;
    vendor_ids?: string[];
    due_at?: string | null;
    test_email?: string;
    dry_run?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const portal = (Deno.env.get("VENDOR_PORTAL_URL") ?? VENDOR_URL_FALLBACK).replace(/\/+$/, "");
  const replyTo = Deno.env.get("MAILGUN_REPLY_TO") ?? "vm@cethos.com";

  // Resolve the training (fail loud — never email about a training we can't find).
  if (!body.training_id && !body.training_slug) {
    return json({ success: false, error: "training_id or training_slug is required" }, 400);
  }
  let tq = sb
    .from("cvp_trainings")
    .select("id, slug, title, description, audience, is_active")
    .limit(1);
  tq = body.training_id ? tq.eq("id", body.training_id) : tq.eq("slug", body.training_slug);
  const { data: trainingRow, error: tErr } = await tq.maybeSingle();
  if (tErr) return json({ success: false, error: "training_lookup_failed", detail: tErr.message }, 500);
  if (!trainingRow) return json({ success: false, error: "training_not_found" }, 404);
  if (!trainingRow.is_active) return json({ success: false, error: "training_inactive" }, 400);

  const { data: lessonRows } = await sb
    .from("cvp_training_lessons")
    .select("estimated_minutes")
    .eq("training_id", trainingRow.id);
  const lessons = lessonRows?.length ?? 0;
  const minutes = (lessonRows ?? []).reduce(
    (s, r) => s + (Number((r as { estimated_minutes: number }).estimated_minutes) || 0),
    0,
  );

  const training: TrainingInfo = {
    title: trainingRow.title,
    description: trainingRow.description,
    lessons,
    minutes,
    slug: trainingRow.slug,
  };
  const { subject, html } = buildEmail(training, body.due_at ?? null, portal, replyTo);

  // ── Test mode: one copy to the requested address, no DB writes.
  if (body.test_email) {
    const r = await mailgunBatchSend({
      recipients: [{ email: body.test_email, firstName: "there" }],
      subject: `[TEST] ${subject}`,
      html,
      tags: ["vendor-training-assignment", "test"],
    });
    if (!r.ok) return json({ success: false, error: r.error }, 502);
    return json({
      success: true,
      data: { test: true, sent_to: body.test_email, mailgun_id: r.id, subject: `[TEST] ${subject}` },
    });
  }

  // ── Real send: resolve the target vendors (name + email).
  if (!body.vendor_ids || body.vendor_ids.length === 0) {
    return json({ success: false, error: "vendor_ids is required for a real send" }, 400);
  }
  // Fetch in id-chunks of 100: a single .in() over a large UUID list overruns
  // PostgREST's URL length and silently returns nothing.
  type VendorRow = { id: string; full_name: string | null; email: string | null };
  const vendors: VendorRow[] = [];
  for (const ids of chunk(body.vendor_ids, 100)) {
    const { data, error } = await sb
      .from("vendors")
      .select("id, full_name, email")
      .in("id", ids);
    if (error) return json({ success: false, error: "vendor_lookup_failed", detail: error.message }, 500);
    for (const v of data ?? []) vendors.push(v as VendorRow);
  }
  const recipients = vendors
    .filter((v) => v.email && v.email.includes("@"))
    .map((v) => ({
      id: v.id,
      email: v.email as string,
      firstName: (v.full_name || "").trim().split(/\s+/)[0] || "",
    }));
  const skippedNoEmail = vendors.length - recipients.length;

  if (body.dry_run) {
    return json({
      success: true,
      data: {
        dry_run: true,
        training: training.title,
        requested: body.vendor_ids.length,
        resolved: vendors.length,
        will_email: recipients.length,
        skipped_no_email: skippedNoEmail,
        batches: Math.ceil(recipients.length / MAILGUN_BATCH_MAX),
        sample: recipients.slice(0, 10).map((r) => r.email),
      },
    });
  }

  if (recipients.length === 0) {
    return json({ success: true, data: { sent: 0, failed: 0, skipped_no_email: skippedNoEmail, errors: [] } });
  }

  // ── Batch send + per-recipient audit log.
  let sent = 0;
  const errors: string[] = [];
  for (const batch of chunk(recipients, MAILGUN_BATCH_MAX)) {
    const r = await mailgunBatchSend({
      recipients: batch.map((b) => ({ email: b.email, firstName: b.firstName })),
      subject,
      html,
      tags: ["vendor-training-assignment", training.slug],
    });
    const status = r.ok ? "sent" : "failed";
    if (r.ok) sent += batch.length;
    else errors.push(r.error ?? "send_failed");

    // Per-recipient notification_log rows (auditable per ISO + powers dedup for
    // the future reminder cron). Chunked insert to stay under payload limits.
    const logRows = batch.map((b) => ({
      event_type: EVENT_TYPE,
      recipient_type: "vendor",
      recipient_email: b.email,
      recipient_name: vendors.find((v) => v.id === b.id)?.full_name ?? null,
      recipient_id: b.id,
      subject,
      status,
      error_message: r.ok ? null : (r.error ?? "send_failed"),
      metadata: {
        training_id: trainingRow.id,
        training_slug: training.slug,
        due_at: body.due_at ?? null,
        mailgun_message_id: r.id ?? null,
      },
    }));
    for (const lc of chunk(logRows, 500)) {
      try {
        await sb.from("notification_log").insert(lc);
      } catch (e) {
        console.error("notification_log insert failed (non-fatal):", e);
      }
    }
  }

  return json({
    success: true,
    data: {
      training: training.title,
      requested: body.vendor_ids.length,
      sent,
      failed: recipients.length - sent,
      skipped_no_email: skippedNoEmail,
      errors: errors.slice(0, 10),
    },
  });
});
