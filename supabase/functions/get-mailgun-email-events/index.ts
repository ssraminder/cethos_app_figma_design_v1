// get-mailgun-email-events
// Diagnostic: fetch Mailgun delivery events for a recipient (or message-id) so
// we can see whether an auto-reply from the inbound system was delivered,
// failed, bounced, or spam-suppressed. Mirrors get-brevo-email-events but for
// the Mailgun transport (vendors.cethos.com). Uses MAILGUN_API_KEY/DOMAIN/REGION.
// JWT disabled (called as an admin diagnostic).

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function apiBase(): string {
  const region = (Deno.env.get("MAILGUN_REGION") ?? "us").toLowerCase();
  return region === "eu" ? "https://api.eu.mailgun.net/v3" : "https://api.mailgun.net/v3";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("MAILGUN_API_KEY");
  const domain = Deno.env.get("MAILGUN_DOMAIN");
  if (!apiKey || !domain) return json({ success: false, error: "MAILGUN_API_KEY/DOMAIN not configured" }, 500);

  const body = await req.json().catch(() => ({}));
  const recipient: string | undefined = body?.recipient ?? body?.email;
  const messageId: string | undefined = body?.messageId;
  const limit: number = Math.min(300, Math.max(1, Number(body?.limit) || 50));
  if (!recipient && !messageId) return json({ success: false, error: "Missing recipient or messageId" }, 400);

  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (recipient) params.set("recipient", recipient);
  if (messageId) params.set("message-id", messageId);

  const url = `${apiBase()}/${domain}/events?${params.toString()}`;
  const auth = `Basic ${btoa(`api:${apiKey}`)}`;
  const res = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json({ success: false, error: `Mailgun events ${res.status}`, details: data }, res.status);
  }

  // Slim the items down to the useful fields.
  const items = (data?.items ?? []).map((e: Record<string, unknown>) => ({
    event: e.event,
    recipient: e.recipient,
    timestamp: e.timestamp,
    reason: (e as { reason?: unknown }).reason ?? null,
    severity: (e as { severity?: unknown }).severity ?? null,
    deliveryStatus: (e as { ["delivery-status"]?: { message?: string; code?: number } })["delivery-status"] ?? null,
    subject: ((e as { message?: { headers?: { subject?: string } } }).message?.headers?.subject) ?? null,
  }));

  return json({ success: true, domain, region: Deno.env.get("MAILGUN_REGION") ?? "us", count: items.length, events: items });
});
