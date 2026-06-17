/**
 * Shared Brevo (formerly Sendinblue) email helper for CVP edge functions.
 *
 * All Brevo template IDs are defined here. Update when templates are created in the
 * Brevo dashboard.
 */

export const BREVO_TEMPLATES = {
  V1_APPLICATION_RECEIVED: 21,
  V2_PRESCREEN_PASSED: 22,
  V3_TEST_INVITATION: 23,
  V4_TEST_REMINDER_24HR: 24,
  V5_TEST_EXPIRED: 25,
  V6_FINAL_CHANCE_DAY7: 26,
  V7_TEST_RECEIVED: 27,
  V8_UNDER_MANUAL_REVIEW: 28,
  V9_NEGOTIATION_OFFER: 29,
  V10_RATE_AGREED: 30,
  V11_APPROVED_WELCOME: 31,
  V12_REJECTED: 32,
  V13_WAITLISTED: 33,
  V14_PROFILE_NUDGE: 34,
  V15_CERT_EXPIRY: 37,
  V16_LANGUAGE_PAIRS_CHECK: 35,
  V17_REQUEST_MORE_INFO: 36,
} as const;

export type BrevoTemplateKey = keyof typeof BREVO_TEMPLATES;

interface SendEmailOptions {
  to: { email: string; name: string };
  templateId: number;
  params: Record<string, string | number | boolean>;
}

/**
 * Send a transactional email via Brevo.
 * Returns true on success, false on failure (non-throwing).
 */
export async function sendBrevoEmail(options: SendEmailOptions): Promise<boolean> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) {
    console.error("BREVO_API_KEY not configured — skipping email send");
    return false;
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: [options.to],
        templateId: options.templateId,
        params: options.params,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `Brevo send failed (template ${options.templateId}): ${response.status} — ${errorBody}`
      );
      return false;
    }

    return true;
  } catch (err) {
    console.error(`Brevo send error (template ${options.templateId}):`, err);
    return false;
  }
}

interface SendRawEmailOptions {
  to: { email: string; name: string }[];
  subject: string;
  htmlContent: string;
  sender?: { email: string; name: string };
}

/**
 * Send a raw (non-template) transactional email via Brevo.
 * Used for one-off operational/admin emails like daily status digests.
 * Returns true on success, false on failure (non-throwing).
 */
export async function sendBrevoRawEmail(
  options: SendRawEmailOptions,
): Promise<boolean> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) {
    console.error("BREVO_API_KEY not configured — skipping email send");
    return false;
  }

  const sender = options.sender ?? {
    email: Deno.env.get("BREVO_SENDER_EMAIL") ?? "noreply@cethos.com",
    name: Deno.env.get("BREVO_SENDER_NAME") ?? "CETHOS Vendor Portal",
  };

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender,
        to: options.to,
        subject: options.subject,
        htmlContent: options.htmlContent,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `Brevo raw send failed (${options.subject}): ${response.status} — ${errorBody}`,
      );
      return false;
    }

    return true;
  } catch (err) {
    console.error(`Brevo raw send error (${options.subject}):`, err);
    return false;
  }
}
