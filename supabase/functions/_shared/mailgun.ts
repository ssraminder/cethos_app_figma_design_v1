/**
 * Shared Mailgun transport for CVP edge functions.
 *
 * Replaces the older Brevo transport (_shared/brevo.ts). All outbound CVP email
 * now routes through Mailgun EU. Templates live in _shared/email-templates.ts;
 * this module only handles the HTTP POST to Mailgun + the do_not_contact gate.
 *
 * Required env vars (Supabase → Edge Functions → Secrets):
 *   MAILGUN_API_KEY
 *   MAILGUN_DOMAIN              e.g. vendors.cethos.com
 *   MAILGUN_REGION              'eu' (this project) or 'us'
 *   MAILGUN_FROM_EMAIL          e.g. noreply@vendors.cethos.com
 *   MAILGUN_FROM_NAME           e.g. CETHOS Vendor Portal
 *   MAILGUN_REPLY_TO            e.g. recruiting@vendors.cethos.com
 *   MAILGUN_WEBHOOK_SIGNING_KEY (inbound — used by cvp-inbound-email, not here)
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export interface MailgunSendOptions {
  to: { email: string; name?: string } | { email: string; name?: string }[];
  /**
   * CC recipients (visible to all recipients). Used when staff want to be
   * looped in on an applicant-facing send and OK with the applicant seeing
   * the cc.
   */
  cc?: string | string[];
  /**
   * BCC recipients. Useful for staff supervision of automated outbound
   * (e.g. backfill runs where staff want to see what was sent without
   * disclosing the cc to the applicant). Mailgun handles BCC silently —
   * the To: header doesn't list these.
   */
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  /**
   * Override the default Reply-To (MAILGUN_REPLY_TO). Rarely needed.
   */
  replyTo?: string;
  /**
   * Mailgun tags (o:tag) for analytics / log filtering. Max 3 per send.
   */
  tags?: string[];
  /**
   * When provided, skip the send if cvp_applications.do_not_contact=true for this email.
   * Pass the normalized recipient email you want gated (useful when `to` is a list).
   */
  respectDoNotContactFor?: string;
  /**
   * When provided, log the send to cvp_outbound_messages (keyed by Mailgun
   * Message-Id) so inbound replies can be threaded back to the originating
   * outbound + application. Skip for system/auto-reply sends.
   */
  trackContext?: {
    applicationId?: string;
    templateTag?: string;
    decisionId?: string;
    staffUserId?: string;
  };
  /**
   * When provided, these values are sent as In-Reply-To and References
   * headers so the applicant's mail client threads this reply into the
   * existing conversation. Pass the applicant's inbound Message-Id (with or
   * without angle brackets — we normalise) as inReplyTo. References can be
   * the full thread chain for long conversations.
   */
  inReplyTo?: string;
  references?: string[];
}

export interface MailgunSendResult {
  sent: boolean;
  suppressed: boolean;
  reason?: string;
  mailgunId?: string;
}

function apiBase(): string {
  const region = (Deno.env.get("MAILGUN_REGION") ?? "us").toLowerCase();
  return region === "eu"
    ? "https://api.eu.mailgun.net/v3"
    : "https://api.mailgun.net/v3";
}

function formatAddress(r: { email: string; name?: string }): string {
  return r.name ? `${r.name} <${r.email}>` : r.email;
}

async function isDoNotContact(
  supabase: SupabaseClient,
  email: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("cvp_applications")
    .select("do_not_contact")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`do_not_contact lookup failed for ${email}:`, error.message);
    return false; // fail-open — don't block delivery on an infra hiccup
  }
  return Boolean(data?.do_not_contact);
}

/**
 * Send a fully-rendered email via Mailgun.
 * Non-throwing: returns `{ sent: false, reason }` on failure and logs.
 */
export async function sendMailgunEmail(
  options: MailgunSendOptions,
): Promise<MailgunSendResult> {
  const apiKey = Deno.env.get("MAILGUN_API_KEY");
  const domain = Deno.env.get("MAILGUN_DOMAIN");
  if (!apiKey || !domain) {
    console.error("MAILGUN_API_KEY or MAILGUN_DOMAIN missing — skipping send");
    return { sent: false, suppressed: false, reason: "config_missing" };
  }

  const fromEmail = Deno.env.get("MAILGUN_FROM_EMAIL") ?? `noreply@${domain}`;
  const fromName = Deno.env.get("MAILGUN_FROM_NAME") ?? "CETHOS";
  const replyTo = options.replyTo ?? Deno.env.get("MAILGUN_REPLY_TO");

  // do_not_contact gate
  if (options.respectDoNotContactFor) {
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      const blocked = await isDoNotContact(
        supabase,
        options.respectDoNotContactFor,
      );
      if (blocked) {
        console.log(
          `Mailgun: suppressed (do_not_contact) for ${options.respectDoNotContactFor}`,
        );
        return { sent: false, suppressed: true, reason: "do_not_contact" };
      }
    } catch (err) {
      console.error("do_not_contact check errored — proceeding with send:", err);
    }
  }

  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  const form = new FormData();
  form.append("from", `${fromName} <${fromEmail}>`);
  for (const r of recipients) form.append("to", formatAddress(r));
  if (options.cc) {
    const ccList = Array.isArray(options.cc) ? options.cc : [options.cc];
    for (const c of ccList) form.append("cc", c);
  }
  if (options.bcc) {
    const bccList = Array.isArray(options.bcc) ? options.bcc : [options.bcc];
    for (const b of bccList) form.append("bcc", b);
  }
  if (replyTo) form.append("h:Reply-To", replyTo);
  form.append("subject", options.subject);
  form.append("html", options.html);
  if (options.text) form.append("text", options.text);
  if (options.tags?.length) {
    for (const tag of options.tags.slice(0, 3)) form.append("o:tag", tag);
  }
  // Threading headers — the applicant's mail client uses these to render a
  // coherent conversation view instead of a new orphaned thread.
  if (options.inReplyTo) {
    const n = String(options.inReplyTo).replace(/^<|>$/g, "");
    form.append("h:In-Reply-To", `<${n}>`);
  }
  if (options.references?.length) {
    const refs = options.references
      .map((r) => {
        const n = String(r).replace(/^<|>$/g, "");
        return `<${n}>`;
      })
      .join(" ");
    form.append("h:References", refs);
  }

  const url = `${apiBase()}/${domain}/messages`;
  const auth = `Basic ${btoa(`api:${apiKey}`)}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: auth },
      body: form,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `Mailgun send failed (${options.subject}): ${response.status} — ${errorBody}`,
      );
      return {
        sent: false,
        suppressed: false,
        reason: `http_${response.status}`,
      };
    }
    const json = (await response.json()) as { id?: string };

    // Log to cvp_outbound_messages when context provided — powers threading.
    if (options.trackContext && json.id) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );
        // Mailgun returns Message-Id wrapped in angle brackets; strip them so
        // inbound In-Reply-To lookup matches the canonical form.
        const normalizedMessageId = String(json.id).replace(/^<|>$/g, "");
        const primaryRecipient = recipients[0]?.email ?? null;
        const { error: logErr } = await supabase
          .from("cvp_outbound_messages")
          .insert({
            application_id: options.trackContext.applicationId ?? null,
            message_id: normalizedMessageId,
            recipient_email: primaryRecipient,
            subject: options.subject,
            body_html: options.html,
            body_text: options.text ?? null,
            template_tag: options.trackContext.templateTag ?? null,
            decision_id: options.trackContext.decisionId ?? null,
            sent_by_staff_id: options.trackContext.staffUserId ?? null,
          });
        if (logErr) {
          console.error(
            `Failed to log outbound message (non-fatal):`,
            logErr.message,
          );
        }
      } catch (err) {
        console.error("Exception logging outbound message (non-fatal):", err);
      }
    }

    return { sent: true, suppressed: false, mailgunId: json.id };
  } catch (err) {
    console.error(`Mailgun send error (${options.subject}):`, err);
    return { sent: false, suppressed: false, reason: "exception" };
  }
}

/**
 * Convenience: send without the gate. Equivalent to sendMailgunEmail without
 * respectDoNotContactFor — used for operational emails (daily-status digest,
 * staff-facing notifications) that should not be suppressed by applicant opt-outs.
 */
export async function sendMailgunOperationalEmail(
  options: Omit<MailgunSendOptions, "respectDoNotContactFor">,
): Promise<MailgunSendResult> {
  return sendMailgunEmail(options);
}
