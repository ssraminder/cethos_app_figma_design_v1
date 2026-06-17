// One-shot recovery email sender for the 2026-05-19 TM-callback incident.
// Uses the established cron-secret auth pattern (verify_jwt=false + internal
// x-cron-secret header check) so staff can invoke it from a SQL session
// without service-role key handling.
//
// Body: { items: [{ applicationId, email, fullName, applicationNumber, hadDuplicateV3 }], dryRun?: boolean }

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

interface Item {
  applicationId: string;
  email: string;
  fullName: string;
  applicationNumber: string;
  hadDuplicateV3: boolean;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function requireCronSecret(req: Request, admin: ReturnType<typeof createClient>): Promise<{ ok: boolean; status?: number; error?: string }> {
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!provided) return { ok: false, status: 401, error: "missing_cron_secret" };
  const { data, error } = await admin.rpc("get_cron_shared_secret");
  if (error || typeof data !== "string" || !data) return { ok: false, status: 503, error: "cron_secret_unavailable" };
  if (!timingSafeEqual(provided, data)) return { ok: false, status: 401, error: "invalid_cron_secret" };
  return { ok: true };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildEmail(item: Item): { subject: string; html: string; text: string } {
  const greet = `Hi ${esc(item.fullName.trim() || "there")},`;
  const apologyHtml = item.hadDuplicateV3
    ? `<p>You may have also received a <strong>second test invitation on May 15</strong>. That was sent in error — you can safely <strong>ignore it</strong>. Your original submission is the one we're grading.</p>`
    : "";
  const apologyText = item.hadDuplicateV3
    ? `\n\nYou may have also received a second test invitation on May 15 — that was sent in error. Please ignore it; your original submission is the one we're grading.\n`
    : "";

  const subject = `We've received your CETHOS test — ${item.applicationNumber}`;
  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; max-width: 560px;">
    <p>${greet}</p>
    <p>Quick note: due to a sync issue on our side, your test submission for application <strong>${esc(item.applicationNumber)}</strong> wasn't acknowledged at the time you submitted it. We've now found and recorded it, and it's been queued for grading.</p>
    ${apologyHtml}
    <p><strong>What happens next:</strong> our review team will get back to you with your result within a few business days. You don't need to do anything.</p>
    <p>Sorry for the confusion this caused. If you have any questions, just reply to this email.</p>
    <p>— The CETHOS Team</p>
    <p style="font-size: 12px; color: #6B7280; margin-top: 24px;">CETHOS Translation Services · Calgary, Canada</p>
  </div>`;
  const greetPlain = `Hi ${item.fullName.trim() || "there"},`;
  const text =
    `${greetPlain}\n\n` +
    `Quick note: due to a sync issue on our side, your test submission for application ${item.applicationNumber} wasn't acknowledged at the time you submitted it. We've now found and recorded it, and it's been queued for grading.` +
    apologyText +
    `\nWhat happens next: our review team will get back to you with your result within a few business days. You don't need to do anything.\n\n` +
    `Sorry for the confusion this caused. If you have any questions, just reply to this email.\n\n` +
    `— The CETHOS Team\n`;
  return { subject, html, text };
}

async function sendMailgun(
  to: { email: string; name: string },
  subject: string,
  html: string,
  text: string,
  tags: string[],
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const apiKey = Deno.env.get("MAILGUN_API_KEY") ?? "";
  const domain = Deno.env.get("MAILGUN_DOMAIN") ?? "";
  const region = (Deno.env.get("MAILGUN_REGION") ?? "us").toLowerCase();
  const fromEmail = Deno.env.get("MAILGUN_FROM_EMAIL") ?? `noreply@${domain}`;
  const fromName = Deno.env.get("MAILGUN_FROM_NAME") ?? "CETHOS Vendor Portal";
  const replyTo = Deno.env.get("MAILGUN_REPLY_TO") ?? `recruiting@${domain}`;

  if (!apiKey || !domain) return { ok: false, error: "mailgun_not_configured" };

  const base = region === "eu" ? "https://api.eu.mailgun.net/v3" : "https://api.mailgun.net/v3";
  const url = `${base}/${domain}/messages`;

  const form = new FormData();
  form.append("from", `${fromName} <${fromEmail}>`);
  form.append("to", to.name ? `${to.name} <${to.email}>` : to.email);
  form.append("h:Reply-To", replyTo);
  form.append("subject", subject);
  form.append("html", html);
  form.append("text", text);
  for (const t of tags.slice(0, 3)) form.append("o:tag", t);

  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`api:${apiKey}`)}` },
    body: form,
  });
  if (!resp.ok) {
    const errBody = await resp.text();
    return { ok: false, error: `mailgun_${resp.status}: ${errBody.slice(0, 300)}` };
  }
  const j = await resp.json().catch(() => ({}));
  return { ok: true, messageId: (j as Record<string, string>).id };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const authed = await requireCronSecret(req, supabase);
  if (!authed.ok) return json({ success: false, error: authed.error }, authed.status ?? 401);

  let body: { items?: Item[]; dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return json({ success: false, error: "items required" }, 400);
  const dryRun = body.dryRun === true;

  const results: Array<Record<string, unknown>> = [];
  for (const item of items) {
    const tpl = buildEmail(item);
    if (dryRun) {
      results.push({ applicationNumber: item.applicationNumber, email: item.email, action: "dryrun", subject: tpl.subject, hadDuplicateV3: item.hadDuplicateV3 });
      continue;
    }
    const r = await sendMailgun(
      { email: item.email, name: item.fullName },
      tpl.subject,
      tpl.html,
      tpl.text,
      ["v7-recovery", item.applicationId],
    );
    if (!r.ok) {
      results.push({ applicationNumber: item.applicationNumber, email: item.email, action: "error", error: r.error });
      continue;
    }
    await supabase.from("cvp_outbound_messages").insert({
      application_id: item.applicationId,
      message_id: r.messageId ?? null,
      recipient_email: item.email,
      subject: tpl.subject,
      body_html: tpl.html,
      body_text: tpl.text,
      template_tag: "v7-recovery",
      sent_at: new Date().toISOString(),
    });
    results.push({ applicationNumber: item.applicationNumber, email: item.email, action: "sent", messageId: r.messageId });
  }

  return json({ success: true, results });
});
