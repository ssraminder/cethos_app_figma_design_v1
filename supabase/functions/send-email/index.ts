// ============================================================================
// send-email v1.0
// Generic Brevo transactional email sender
// Date: February 14, 2026
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) {
      throw new Error("BREVO_API_KEY not configured");
    }

    const body = await req.json();
    const { to, toName, subject, templateId, params, htmlContent } = body;

    if (!to) {
      throw new Error("Missing required field: to");
    }

    // Build Brevo API payload
    const emailPayload: Record<string, unknown> = {
      to: [{ email: to, name: toName || to }],
      sender: {
        name: "Cethos Translation Services",
        email: "donotreply@cethos.com",
      },
    };

    if (templateId) {
      // Template-based email
      emailPayload.templateId = Number(templateId);
      if (params) {
        emailPayload.params = params;
      }
    } else if (htmlContent) {
      // Direct HTML email
      emailPayload.subject = subject || "Notification from Cethos";
      emailPayload.htmlContent = htmlContent;
    } else {
      throw new Error("Must provide either templateId or htmlContent");
    }

    // If subject provided with template, override template subject
    if (subject && templateId) {
      emailPayload.subject = subject;
    }

    console.log(`Sending email to ${to}, template: ${templateId || "custom"}`);

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Brevo API error:", JSON.stringify(result));
      throw new Error(
        `Brevo API error: ${result.message || response.statusText}`,
      );
    }

    console.log("Email sent successfully:", result.messageId);

    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("send-email error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
