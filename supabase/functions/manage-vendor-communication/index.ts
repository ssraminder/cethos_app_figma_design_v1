/**
 * manage-vendor-communication
 *
 * Staff send a free-form (optionally AI-drafted) email to a vendor FROM
 * vm@cethos.com, and read the conversation thread. Replies land back at the
 * vm@cethos.com inbox and are captured against the vendor by cvp-inbound-email
 * (Phase 1: capture + notify; Phase 2 will add full auto-triage).
 *
 * Outbound carries a subject token [#VC-<token>] so the reply can be threaded
 * back to the vendor even if the mail client drops In-Reply-To.
 *
 * Actions:
 *   list    { vendorId }                                           -> { thread }
 *   preview { vendorId, body?, useAIDraft?, aiInstructions?, subject? } -> rendered + aiDraftPlain
 *   send    { vendorId, subject, body }                            -> { sent, via }
 *
 * Auth: requires a signed-in staff Authorization: Bearer JWT.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendBrevoRawEmail } from "../_shared/brevo.ts";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import { MODEL_QUALITY } from "../_shared/ai-models.ts";
import { requireStaff } from "../_shared/require-staff.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const REPLY_FROM = { email: "vm@cethos.com", name: "Cethos Vendor Management" };
const REPLY_TO_INBOX = "vm@cethos.com";
const BRAND_TEAL = "#0891B2", BRAND_BORDER = "#E5E7EB", BRAND_MUTED = "#6B7280";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function wrapEmail(plainBody: string): { html: string; text: string } {
  const paragraphs = plainBody.split(/\n\n+/).map((p) => `<p style="margin:8px 0;">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#F9FAFB;padding:24px 12px;">
<div style="max-width:640px;margin:0 auto;background:#fff;padding:28px;border:1px solid ${BRAND_BORDER};border-radius:8px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111827;">
  <div style="font-size:14px;line-height:1.55;">${paragraphs}</div>
  <p style="color:${BRAND_MUTED};font-size:12px;margin-top:24px;border-top:1px solid ${BRAND_BORDER};padding-top:12px;">
    Cethos Vendor Management &middot; reply to this email and our team will see it.
  </p>
</div></body></html>`;
  return { html, text: plainBody };
}

const VENDOR_DRAFT_SYSTEM_PROMPT = `You are drafting an email that CETHOS vendor-management staff will send to one of our approved translation vendors (a freelance linguist or a partner agency we work with).

Write 2-5 short, warm, professional paragraphs of plain text that carry out the staff member's intent.

Do NOT:
- Include a salutation ("Hi Name,") or a signoff — the template wraps them.
- Invent rates, deadlines, project details, or commitments unless the staff instructions explicitly include them.
- Use internal jargon or scoring/AI references.

Return ONLY the plain-text body. No markdown, no JSON, no preamble.`;

async function draftWithAI(args: { vendorName: string; staffInstructions: string; priorContext: string }): Promise<{ ok: boolean; text: string | null; error: string | null }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, text: null, error: "ANTHROPIC_API_KEY not configured" };
  const userMessage = `Vendor: ${args.vendorName}

--- Recent conversation (most recent last, may be empty) ---
${args.priorContext || "(no prior messages)"}

--- What staff want this email to say ---
${args.staffInstructions || "(none — write a brief, friendly check-in)"}`;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL_QUALITY, max_tokens: 800, system: VENDOR_DRAFT_SYSTEM_PROMPT, messages: [{ role: "user", content: userMessage }] }),
    });
    if (!resp.ok) return { ok: false, text: null, error: `${resp.status}: ${(await resp.text()).slice(0, 300)}` };
    const data = (await resp.json()) as { content: { type: string; text?: string }[] };
    const text = (data.content ?? []).find((c) => c.type === "text")?.text?.trim() ?? "";
    return text ? { ok: true, text, error: null } : { ok: false, text: null, error: "empty draft" };
  } catch (err) {
    return { ok: false, text: null, error: err instanceof Error ? err.message : String(err) };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const authed = await requireStaff(req);
  if (!authed.ok) return json({ success: false, error: authed.error }, authed.status);
  const staffId = authed.staff.staffId;

  let body: { action?: string; vendorId?: string; subject?: string; body?: string; useAIDraft?: boolean; aiInstructions?: string };
  try { body = await req.json(); } catch { return json({ success: false, error: "invalid_json" }, 400); }

  const action = body.action ?? "send";
  if (!body.vendorId) return json({ success: false, error: "vendorId_required" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  const { data: vendor, error: vErr } = await supabase
    .from("vendors").select("id, full_name, business_name, email").eq("id", body.vendorId).maybeSingle();
  if (vErr || !vendor) return json({ success: false, error: "vendor_not_found" }, 404);
  const vendorName = (vendor.business_name as string) || (vendor.full_name as string) || "there";

  // ---- list: merge outbound + inbound for this vendor, chronological ----
  if (action === "list") {
    const [ob, ib] = await Promise.all([
      supabase.from("cvp_outbound_messages")
        .select("id, sent_at, subject, body_html, body_text, sent_by_staff_id")
        .eq("vendor_id", body.vendorId).order("sent_at", { ascending: true }),
      supabase.from("cvp_inbound_emails")
        .select("id, received_at, from_email, from_name, subject, stripped_text, body_plain, ai_classification, acknowledged_at")
        .eq("matched_vendor_id", body.vendorId).order("received_at", { ascending: true }),
    ]);
    const outbound = (ob.data ?? []).map((r) => ({ kind: "outbound", id: r.id, at: r.sent_at, subject: r.subject, body: r.body_text ?? r.body_html }));
    const inbound = (ib.data ?? []).map((r) => ({
      kind: "inbound", id: r.id, at: r.received_at, subject: r.subject,
      from: r.from_name ? `${r.from_name} <${r.from_email}>` : r.from_email,
      body: r.stripped_text ?? r.body_plain,
      summary: (r.ai_classification as { summary?: string } | null)?.summary ?? null,
      acknowledged: Boolean(r.acknowledged_at),
    }));
    const thread = [...outbound, ...inbound].sort((a, b) => new Date(a.at as string).getTime() - new Date(b.at as string).getTime());
    return json({ success: true, data: { vendor: { id: vendor.id, name: vendorName, email: vendor.email }, thread } });
  }

  // Shared draft resolution for preview + send
  let draftPlain: string | null = null;
  let aiError: string | null = null;
  if (body.useAIDraft && (action === "preview")) {
    const { data: recent } = await supabase.from("cvp_outbound_messages")
      .select("subject, body_text, sent_at").eq("vendor_id", body.vendorId).order("sent_at", { ascending: false }).limit(3);
    const priorContext = (recent ?? []).reverse().map((m) => `Sent: ${m.subject}\n${(m.body_text as string ?? "").slice(0, 500)}`).join("\n---\n");
    const d = await draftWithAI({ vendorName, staffInstructions: body.aiInstructions ?? body.body ?? "", priorContext });
    draftPlain = d.ok ? d.text : null;
    aiError = d.ok ? null : d.error;
  }

  const finalBody = (body.body ?? draftPlain ?? "").trim();
  const subject = (body.subject ?? "").trim() || `A message from Cethos Vendor Management`;

  // ---- preview: render, no send ----
  if (action === "preview") {
    const rendered = wrapEmail(finalBody || "(empty body)");
    return json({ success: true, data: { preview: true, subject, aiDraftPlain: draftPlain, aiError, html: rendered.html, text: rendered.text } });
  }

  // ---- send ----
  if (!finalBody) return json({ success: false, error: "body_required" }, 400);
  if (!vendor.email) return json({ success: false, error: "vendor_has_no_email" }, 400);

  const token = crypto.randomUUID();
  const taggedSubject = `${subject} [#VC-${token.slice(0, 8)}]`;
  const rendered = wrapEmail(finalBody);

  // Primary: Brevo from vm@cethos.com (best inbox placement + the brand).
  let via: "brevo" | "mailgun" | "none" = "none";
  const brevoOk = await sendBrevoRawEmail({
    to: [{ email: vendor.email as string, name: vendorName }],
    subject: taggedSubject,
    htmlContent: rendered.html,
    sender: REPLY_FROM,
    replyTo: { email: REPLY_TO_INBOX, name: REPLY_FROM.name },
    tags: ["vendor-communication", String(body.vendorId)],
  });
  if (brevoOk) {
    via = "brevo";
  } else {
    // Fallback: Mailgun (vendors.cethos.com domain), Reply-To still vm@ so the
    // reply routes to the AI inbox.
    const mg = await sendMailgunEmail({
      to: { email: vendor.email as string, name: vendorName },
      subject: taggedSubject, html: rendered.html, text: rendered.text,
      replyTo: REPLY_TO_INBOX, tags: ["vendor-communication"],
    });
    via = mg.sent ? "mailgun" : "none";
  }

  if (via === "none") return json({ success: false, error: "send_failed" }, 502);

  // Log to the thread (message_id = token so inbound can match the reply back).
  const { error: logErr } = await supabase.from("cvp_outbound_messages").insert({
    vendor_id: body.vendorId,
    message_id: token,
    recipient_email: vendor.email,
    subject: taggedSubject,
    body_html: rendered.html,
    body_text: finalBody,
    template_tag: "vendor-communication",
    sent_by_staff_id: staffId,
  });
  if (logErr) console.error("vendor-comm outbound log failed (non-fatal):", logErr.message);

  return json({ success: true, data: { sent: true, via, subject: taggedSubject } });
});
