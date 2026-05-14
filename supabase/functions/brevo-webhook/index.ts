// ============================================================================
// brevo-webhook
//
// Receives transactional-email webhook events from Brevo and stores them in
// brevo_email_events. The admin vendor profile reads from there to display
// the full per-email lifecycle (sent → delivered → opened → clicked → ...).
//
// Configure in Brevo: Account → Transactional → Settings → Webhook
//   URL:    https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/brevo-webhook?secret=<BREVO_WEBHOOK_SECRET>
//   Events: All (delivered, opened, click, hard_bounce, soft_bounce, blocked,
//           spam, invalid_email, deferred, unique_opened, unsubscribed)
//
// Deploy --no-verify-jwt — Brevo POSTs without an Authorization header.
// The shared secret in the query string is the auth boundary instead.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Brevo posts one of these. Keys are kebab-case in some events.
type BrevoEvent = {
  event?: string;
  email?: string;
  id?: number;                // Brevo's internal numeric id
  "message-id"?: string;      // SMTP message-id (matches our metadata.brevo_message_id)
  subject?: string;
  reason?: string;
  link?: string;
  tag?: string;
  tags?: string[];
  date?: string;              // event timestamp string
  ts?: number;                // unix seconds
  ts_event?: number;
  [k: string]: unknown;
};

function parseEventTs(payload: BrevoEvent): Date {
  if (typeof payload.ts_event === "number") return new Date(payload.ts_event * 1000);
  if (typeof payload.ts === "number") return new Date(payload.ts * 1000);
  if (typeof payload.date === "string") {
    const d = new Date(payload.date);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  // Shared-secret auth — set BREVO_WEBHOOK_SECRET in edge-function secrets
  // and pass it as ?secret=... when configuring the Brevo webhook URL.
  const expectedSecret = Deno.env.get("BREVO_WEBHOOK_SECRET");
  if (expectedSecret) {
    const url = new URL(req.url);
    const got = url.searchParams.get("secret");
    if (got !== expectedSecret) {
      return json({ ok: false, error: "forbidden" }, 403);
    }
  }

  let payload: BrevoEvent | BrevoEvent[];
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const events: BrevoEvent[] = Array.isArray(payload) ? payload : [payload];
  if (events.length === 0) return json({ ok: true, inserted: 0 });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const rows = events.map((e) => {
    const messageId = (e["message-id"] as string | undefined) ?? "";
    const event = (e.event as string | undefined)?.toLowerCase() ?? "unknown";
    const email = (e.email as string | undefined) ?? "";
    return {
      brevo_message_id: messageId,
      brevo_id: typeof e.id === "number" ? e.id : null,
      event,
      recipient_email: email,
      subject: (e.subject as string | undefined) ?? null,
      reason: (e.reason as string | undefined) ?? null,
      link: (e.link as string | undefined) ?? null,
      tag: Array.isArray(e.tags) ? e.tags[0] ?? null : (e.tag as string | undefined) ?? null,
      event_ts: parseEventTs(e).toISOString(),
      raw_payload: e as unknown as Record<string, unknown>,
    };
  }).filter((r) => r.brevo_message_id && r.recipient_email);

  if (rows.length === 0) {
    return json({ ok: true, inserted: 0, skipped: events.length, reason: "missing_message_id_or_email" });
  }

  // onConflict do nothing — Brevo can retry the same event.
  const { error, count } = await sb
    .from("brevo_email_events")
    .upsert(rows, { onConflict: "brevo_message_id,event,event_ts", ignoreDuplicates: true, count: "exact" });

  if (error) {
    console.error("brevo-webhook insert error", error);
    return json({ ok: false, error: error.message }, 500);
  }

  return json({ ok: true, inserted: count ?? rows.length });
});
