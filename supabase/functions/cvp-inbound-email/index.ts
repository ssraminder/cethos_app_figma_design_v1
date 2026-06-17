/**
 * cvp-inbound-email
 *
 * Mailgun webhook receiver. Handles inbound email from recruiting@vendors.cethos.com.
 *
 * Phase 1 behavior:
 *   1. Verify Mailgun signature (HMAC-SHA256 of timestamp+token with MAILGUN_WEBHOOK_SIGNING_KEY).
 *   2. Parse multipart form into structured fields.
 *   3. Match sender to a cvp_applications row.
 *   4. Regex pre-filter for unsubscribe intent → confirm via Claude → set do_not_contact + confirmation reply.
 *   5. Everything else → AI-generated auto-reply pointing to CVP_SUPPORT_EMAIL (default vm@cethos.com),
 *      in the sender's language when detected.
 *   6. Log every inbound to cvp_inbound_emails.
 *
 * JWT verification is disabled on this function (Mailgun posts directly).
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunOperationalEmail } from "../_shared/mailgun.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UNSUBSCRIBE_REGEX =
  /\b(unsubscribe|remove[\s-]+me|take[\s-]+me[\s-]+off|opt[\s-]?out|do[\s-]+not[\s-]+(email|contact|message)|stop[\s-]+(email(ing)?|contact(ing)?|messag(ing)?)|desubs?cribir|eliminar[\s-]+me|no[\s-]+me[\s-]+envie)\b/i;

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/plain" },
  });
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    enc.encode(message),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyMailgunSignature(
  timestamp: string,
  token: string,
  signature: string,
  signingKey: string,
): Promise<boolean> {
  if (!timestamp || !token || !signature) return false;
  // Reject stale (>5 min) to block replay
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > 300) return false;

  const expected = await hmacSha256Hex(signingKey, `${timestamp}${token}`);
  // constant-time-ish compare
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

interface InboundFields {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  bodyPlain: string;
  bodyHtml: string;
  strippedText: string;
  messageId: string;
  inReplyTo: string;
  referencesHeader: string;
  raw: Record<string, string>;
}

async function parseForm(req: Request): Promise<{
  fields: InboundFields;
  timestamp: string;
  token: string;
  signature: string;
}> {
  const form = await req.formData();
  const raw: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") raw[k] = v;
  }

  const parseAddress = (s: string): { email: string; name: string } => {
    if (!s) return { email: "", name: "" };
    const m = s.match(/^(.*?)\s*<([^>]+)>$/);
    if (m) return { name: m[1].trim().replace(/^"|"$/g, ""), email: m[2].trim() };
    return { email: s.trim(), name: "" };
  };

  const fromParts = parseAddress(raw["from"] ?? raw["From"] ?? raw["sender"] ?? "");
  const toParts = parseAddress(raw["recipient"] ?? raw["To"] ?? raw["to"] ?? "");

  const fields: InboundFields = {
    fromEmail: (raw["sender"] ?? fromParts.email).toLowerCase(),
    fromName: fromParts.name,
    toEmail: (toParts.email || raw["recipient"] || "").toLowerCase(),
    subject: raw["subject"] ?? raw["Subject"] ?? "",
    bodyPlain: raw["body-plain"] ?? "",
    bodyHtml: raw["body-html"] ?? "",
    strippedText: raw["stripped-text"] ?? "",
    messageId: raw["Message-Id"] ?? raw["message-id"] ?? "",
    inReplyTo: raw["In-Reply-To"] ?? raw["in-reply-to"] ?? "",
    referencesHeader: raw["References"] ?? raw["references"] ?? "",
    raw,
  };

  return {
    fields,
    timestamp: raw["timestamp"] ?? "",
    token: raw["token"] ?? "",
    signature: raw["signature"] ?? "",
  };
}

interface ClassificationResult {
  isUnsubscribe: boolean;
  language: string; // ISO-639-1, best-effort
  intent: string;
  summary: string;
  replyHtml: string;
  replySubject: string;
}

async function classifyAndDraft(
  fields: InboundFields,
  regexFlaggedUnsubscribe: boolean,
  supportEmail: string,
): Promise<ClassificationResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const bodyForAI = (fields.strippedText || fields.bodyPlain || "").slice(0, 4000);

  // Deterministic fallback (AI failure or no key)
  const fallback: ClassificationResult = {
    isUnsubscribe: regexFlaggedUnsubscribe,
    language: "en",
    intent: regexFlaggedUnsubscribe ? "unsubscribe" : "other",
    summary: "AI unavailable — fallback classification.",
    replySubject: regexFlaggedUnsubscribe
      ? `Re: ${fields.subject || "Your request"}`
      : `Re: ${fields.subject || "Your message"}`,
    replyHtml: regexFlaggedUnsubscribe
      ? `<p>Thank you — you've been removed from our recruitment list. You will not receive further emails from CETHOS recruitment. If this was a mistake, reply to this email.</p>`
      : `<p>Thanks for writing to CETHOS. This inbox is not actively monitored yet — please email <a href="mailto:${supportEmail}">${supportEmail}</a> and our vendor management team will get back to you.</p>`,
  };

  if (!apiKey) return fallback;

  const prompt = `You receive a reply to an automated email from CETHOS vendor recruitment.
Decide:
1. Is this a request to be removed / unsubscribe / stop receiving emails? (answer YES or NO)
2. What language is the message written in? (ISO-639-1 code, e.g. en, es, fr, de)
3. Brief one-sentence summary of what they wrote.

Then draft a short polite reply (2–4 sentences, plain text) in the SAME language as their message.
- If unsubscribe: confirm removal, apologise for any inconvenience, say they can reply to reverse.
- Otherwise: say this inbox is not actively monitored yet, ask them to email ${supportEmail} so our vendor management team can help.

Return STRICT JSON only, no markdown, no prose outside the object:
{"is_unsubscribe": true|false, "language": "xx", "summary": "...", "reply_subject": "Re: ...", "reply_body": "..."}

Regex pre-filter already flagged unsubscribe: ${regexFlaggedUnsubscribe ? "YES" : "NO"}

---
Subject: ${fields.subject}
From: ${fields.fromName} <${fields.fromEmail}>
Body:
${bodyForAI}
---`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) {
      console.error(`Anthropic call failed: ${resp.status} ${await resp.text()}`);
      return fallback;
    }
    const json = (await resp.json()) as {
      content: { type: string; text?: string }[];
    };
    const textOut = (json.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n")
      .trim();
    // Extract first {…} block if the model wrapped output
    const match = textOut.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as {
      is_unsubscribe?: boolean;
      language?: string;
      summary?: string;
      reply_subject?: string;
      reply_body?: string;
    };
    const body = (parsed.reply_body ?? "").trim();
    const replyHtml = body
      ? `<p>${body.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>")}</p>`
      : fallback.replyHtml;
    return {
      isUnsubscribe: Boolean(parsed.is_unsubscribe ?? regexFlaggedUnsubscribe),
      language: parsed.language ?? "en",
      intent: parsed.is_unsubscribe ? "unsubscribe" : "other",
      summary: parsed.summary ?? "",
      replySubject:
        parsed.reply_subject ?? `Re: ${fields.subject || "Your message"}`,
      replyHtml,
    };
  } catch (err) {
    console.error("Anthropic classification error:", err);
    return fallback;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return textResponse("Method not allowed", 405);
  }

  const signingKey = Deno.env.get("MAILGUN_WEBHOOK_SIGNING_KEY") ?? "";
  if (!signingKey) {
    console.error("MAILGUN_WEBHOOK_SIGNING_KEY not configured");
    return textResponse("Server config error", 500);
  }

  let parsed;
  try {
    parsed = await parseForm(req);
  } catch (err) {
    console.error("Failed to parse inbound form:", err);
    return textResponse("Bad request", 400);
  }
  const { fields, timestamp, token, signature } = parsed;

  const sigOk = await verifyMailgunSignature(
    timestamp,
    token,
    signature,
    signingKey,
  );
  if (!sigOk) {
    console.warn(`Signature verification failed for ${fields.fromEmail}`);
    return textResponse("Invalid signature", 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // ---- Thread detection: does In-Reply-To match a known outbound? ----
  let matchedOutboundId: string | null = null;
  let matchedOutboundApplicationId: string | null = null;
  let matchedOutboundTag: string | null = null;
  let matchedOutboundSubject: string | null = null;
  let matchedOutboundBody: string | null = null;
  const normalizedInReplyTo = (fields.inReplyTo ?? "")
    .replace(/^<|>$/g, "")
    .trim();
  // Fallback: References header often contains the thread root; try the last id in it.
  let threadLookupId = normalizedInReplyTo;
  if (!threadLookupId && fields.referencesHeader) {
    const refIds = (fields.referencesHeader.match(/<([^>]+)>/g) ?? [])
      .map((s) => s.replace(/^<|>$/g, ""));
    threadLookupId = refIds[refIds.length - 1] ?? "";
  }
  if (threadLookupId) {
    const { data: outboundRow } = await supabase
      .from("cvp_outbound_messages")
      .select("id, application_id, template_tag, subject, body_text")
      .eq("message_id", threadLookupId)
      .maybeSingle();
    if (outboundRow) {
      matchedOutboundId = (outboundRow as { id: string }).id;
      matchedOutboundApplicationId =
        (outboundRow as { application_id: string | null }).application_id;
      matchedOutboundTag =
        (outboundRow as { template_tag: string | null }).template_tag;
      matchedOutboundSubject =
        (outboundRow as { subject: string | null }).subject;
      matchedOutboundBody =
        (outboundRow as { body_text: string | null }).body_text;
    }
  }

  // Match applicant — prefer threaded match, fallback to email lookup.
  let matchedApplicationId: string | null = matchedOutboundApplicationId;
  if (!matchedApplicationId && fields.fromEmail) {
    const { data } = await supabase
      .from("cvp_applications")
      .select("id")
      .eq("email", fields.fromEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) matchedApplicationId = (data as { id: string }).id;
  }

  const regexHit = UNSUBSCRIBE_REGEX.test(
    `${fields.subject}\n${fields.bodyPlain || fields.strippedText}`,
  );

  const supportEmail = Deno.env.get("CVP_SUPPORT_EMAIL") ?? "vm@cethos.com";

  const isThreadedReply = Boolean(matchedOutboundId);

  // Classification: threaded replies always go through Opus analysis; non-
  // threaded go through the existing classify-and-draft path (Haiku).
  let isUnsubscribe = false;
  let replyAnalysis: Record<string, unknown> | null = null;
  let classificationSummary = "";
  let classificationLanguage = "en";

  if (isThreadedReply) {
    // Analyze the reply with Opus given the original outbound as context.
    replyAnalysis = await analyzeThreadedReply({
      inbound: fields,
      outboundSubject: matchedOutboundSubject ?? "",
      outboundBody: matchedOutboundBody ?? "",
      outboundTag: matchedOutboundTag ?? "",
      regexHit,
    });
    if (replyAnalysis) {
      isUnsubscribe = Boolean(replyAnalysis.is_unsubscribe) || regexHit;
      classificationSummary = String(replyAnalysis.summary ?? "");
      classificationLanguage = String(replyAnalysis.language ?? "en");
    }
  } else {
    // Pre-existing non-threaded path
    const classification = await classifyAndDraft(fields, regexHit, supportEmail);
    isUnsubscribe = classification.isUnsubscribe;
    classificationSummary = classification.summary;
    classificationLanguage = classification.language;
  }

  let actionTaken:
    | "do_not_contact_set"
    | "auto_reply_sent"
    | "auto_reply_failed"
    | "noop"
    | "threaded_received" = "noop";
  let autoReplySentAt: string | null = null;

  // Auto-reply policy:
  //   - Threaded reply + unsubscribe: send removal confirmation (applicant expects
  //     acknowledgement).
  //   - Threaded reply + NOT unsubscribe: silent; staff handles via admin.
  //   - Non-threaded: existing behaviour — send the "not monitored" auto-reply
  //     (or unsubscribe confirmation).
  if (isThreadedReply && !isUnsubscribe) {
    actionTaken = "threaded_received";
  } else {
    const { replySubject, replyHtml } = isThreadedReply
      ? buildUnsubscribeConfirmationReply(fields, classificationLanguage)
      : await (async () => {
          // For non-threaded, reuse classifyAndDraft output (already computed
          // above as `classification`). Re-derive the subject/html here.
          const classification = await classifyAndDraft(
            fields,
            regexHit,
            supportEmail,
          );
          return {
            replySubject: classification.replySubject,
            replyHtml: classification.replyHtml,
          };
        })();
    const sendResult = await sendMailgunOperationalEmail({
      to: { email: fields.fromEmail, name: fields.fromName || undefined },
      subject: replySubject,
      html: replyHtml,
      tags: ["inbound-autoreply", isUnsubscribe ? "unsubscribe" : "other"],
    });
    if (sendResult.sent) {
      autoReplySentAt = new Date().toISOString();
      actionTaken = "auto_reply_sent";
    } else {
      actionTaken = "auto_reply_failed";
    }
  }

  // Apply do_not_contact after reply is sent (confirmation reaches them first).
  if (isUnsubscribe && matchedApplicationId) {
    const { error: dncErr } = await supabase
      .from("cvp_applications")
      .update({
        do_not_contact: true,
        do_not_contact_at: new Date().toISOString(),
        do_not_contact_source: "inbound_email",
      })
      .eq("email", fields.fromEmail);
    if (dncErr) console.error("Failed to set do_not_contact:", dncErr.message);
    else actionTaken = "do_not_contact_set";
  }

  // Log to cvp_inbound_emails
  const intent = isThreadedReply && !isUnsubscribe
    ? "reply_to_outbound"
    : matchedApplicationId
    ? isUnsubscribe
      ? "unsubscribe"
      : "other"
    : "unmatched";

  const { error: logErr } = await supabase.from("cvp_inbound_emails").insert({
    from_email: fields.fromEmail,
    from_name: fields.fromName,
    to_email: fields.toEmail,
    subject: fields.subject,
    body_plain: fields.bodyPlain,
    body_html: fields.bodyHtml,
    stripped_text: fields.strippedText,
    message_id: fields.messageId,
    in_reply_to: fields.inReplyTo,
    references_header: fields.referencesHeader,
    matched_application_id: matchedApplicationId,
    matched_outbound_id: matchedOutboundId,
    classified_intent: intent,
    ai_classification: {
      language: classificationLanguage,
      summary: classificationSummary,
      regex_flagged_unsubscribe: regexHit,
      is_threaded: isThreadedReply,
      outbound_tag: matchedOutboundTag,
    },
    ai_reply_analysis: replyAnalysis,
    action_taken: actionTaken,
    auto_reply_sent_at: autoReplySentAt,
    raw_payload: fields.raw,
  });
  if (logErr) console.error("Failed to log inbound email:", logErr.message);

  console.log(
    `cvp-inbound-email: from=${fields.fromEmail} matched=${matchedApplicationId ?? "none"} threaded=${isThreadedReply} intent=${intent} action=${actionTaken}`,
  );

  return jsonResponse({
    success: true,
    data: {
      intent,
      action: actionTaken,
      matched: matchedApplicationId,
      threaded: isThreadedReply,
      outboundId: matchedOutboundId,
    },
  });
});

// ---------- Opus-powered threaded-reply analysis ----------

const THREADED_REPLY_SYSTEM_PROMPT = `You are analyzing an applicant's reply to a recruitment email from CETHOS. Produce a structured JSON analysis that will help staff decide the next action.

Return ONLY valid JSON matching this shape:
{
  "is_unsubscribe": boolean,
  "language": "xx",
  "sentiment": "positive" | "neutral" | "confused" | "frustrated" | "negative",
  "addresses_question": "yes" | "partial" | "no" | "na",
  "summary": "one-sentence summary of what they said",
  "answers_provided": ["..."],
  "open_questions": ["..."],
  "recommended_next_action": "approve" | "reject" | "request_more_info" | "acknowledge" | "send_test" | "escalate" | "none",
  "staff_attention_needed": boolean,
  "notes_for_staff": "one or two sentences of context for the reviewer"
}

Use "addresses_question" = "na" when the outbound wasn't a question. Use "is_unsubscribe": true ONLY if the applicant explicitly asks to be removed; negative sentiment alone is not enough. If the reply is confused or asks clarifying questions of us, set staff_attention_needed = true and recommended_next_action = "request_more_info" or "acknowledge".`;

async function analyzeThreadedReply(args: {
  inbound: InboundFields;
  outboundSubject: string;
  outboundBody: string;
  outboundTag: string;
  regexHit: boolean;
}): Promise<Record<string, unknown> | null> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return null;

  const inboundBody = (args.inbound.strippedText || args.inbound.bodyPlain || "").slice(0, 5000);
  const outboundSnippet = (args.outboundBody || "").slice(0, 2000);

  const userMessage = `Outbound email CETHOS sent earlier:
Subject: ${args.outboundSubject}
Template: ${args.outboundTag}
Body:
${outboundSnippet}

---
Applicant's reply:
Subject: ${args.inbound.subject}
From: ${args.inbound.fromName} <${args.inbound.fromEmail}>
Body:
${inboundBody}
---
Regex pre-filter flagged unsubscribe: ${args.regexHit ? "YES" : "NO"}`;

  const model = Deno.env.get("CVP_MODEL_QUALITY") ?? "claude-opus-4-7";

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        system: THREADED_REPLY_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!resp.ok) {
      console.error(`Opus analysis failed: ${resp.status} ${await resp.text()}`);
      return null;
    }
    const json = (await resp.json()) as { content: { type: string; text?: string }[] };
    const text = (json.content ?? []).find((c) => c.type === "text")?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    parsed.model_used = model;
    return parsed;
  } catch (err) {
    console.error("Opus analysis exception:", err);
    return null;
  }
}

// ---------- Threaded unsubscribe confirmation builder ----------

function buildUnsubscribeConfirmationReply(
  fields: InboundFields,
  _language: string,
): { replySubject: string; replyHtml: string } {
  // Keep it short + English for now; could localise later.
  return {
    replySubject: `Re: ${fields.subject || "Your request"}`,
    replyHtml: `<p>Thank you — you've been removed from our recruitment list. You will not receive further emails from CETHOS recruitment. If this was a mistake, reply to this email and we'll restore you.</p>`,
  };
}
