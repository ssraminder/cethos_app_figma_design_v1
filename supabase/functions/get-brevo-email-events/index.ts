// ============================================================================
// get-brevo-email-events v1
// Fetch transactional email events from Brevo for a given recipient. Used
// by the admin portal to diagnose missing vendor / customer notifications
// without leaving the order page.
// Date: 2026-05-08
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) {
      return json({ success: false, error: "BREVO_API_KEY not configured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const email: string | undefined = body?.email;
    const days: number = Math.max(1, Math.min(90, Number(body?.days) || 7));
    const messageId: string | undefined = body?.messageId;
    const limit: number = Math.min(500, Math.max(1, Number(body?.limit) || 100));

    if (!email && !messageId) {
      return json({ success: false, error: "Missing email or messageId" }, 400);
    }

    // Build query string. Brevo's events endpoint supports:
    //   email, startDate, endDate, days, messageId, event (filter by type)
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("days", String(days));
    if (email) params.set("email", email);
    if (messageId) params.set("messageId", messageId);

    const eventsUrl = `https://api.brevo.com/v3/smtp/statistics/events?${params.toString()}`;
    const eventsRes = await fetch(eventsUrl, {
      headers: {
        "api-key": BREVO_API_KEY,
        Accept: "application/json",
      },
    });
    const eventsJson = await eventsRes.json();

    if (!eventsRes.ok) {
      return json(
        {
          success: false,
          error: `Brevo events API: ${eventsJson?.message || eventsRes.statusText}`,
          details: eventsJson,
        },
        eventsRes.status,
      );
    }

    // Also pull the underlying email envelopes (subject + sender) so the UI
    // can show what was actually sent. The events endpoint returns event
    // rows but not the email subject for every one of them.
    const emailsParams = new URLSearchParams();
    emailsParams.set("limit", String(limit));
    if (email) emailsParams.set("email", email);
    if (messageId) emailsParams.set("messageId", messageId);
    const emailsUrl = `https://api.brevo.com/v3/smtp/emails?${emailsParams.toString()}`;
    const emailsRes = await fetch(emailsUrl, {
      headers: {
        "api-key": BREVO_API_KEY,
        Accept: "application/json",
      },
    });
    const emailsJson = emailsRes.ok ? await emailsRes.json() : null;

    return json({
      success: true,
      email: email ?? null,
      days,
      events: eventsJson?.events || [],
      emails: emailsJson?.transactionalEmails || [],
    });
  } catch (err: any) {
    return json({ success: false, error: err?.message || String(err) }, 500);
  }
});
