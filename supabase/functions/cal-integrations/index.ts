// supabase/functions/cal-integrations/index.ts
//
// Cal.com integration — receives Cal.com webhooks and exposes Cal.com REST API
// actions through the same { platform, action, params } pattern as the
// google-integrations function.
//
// Two endpoints in one function (auto-detected by request shape):
//
//   1. Cal.com webhook (Cal.com → us)
//      Cal.com sends POST with {triggerEvent, payload, ...} and an
//      `x-cal-signature-256` HMAC header. Body is recognized when it has
//      a `triggerEvent` key. We verify HMAC, persist the booking, and
//      forward the conversion to GA4 (Measurement Protocol via
//      google-integrations) and Google Ads OCI queue (when a gclid was
//      attached to the original lead).
//
//   2. Internal action dispatch (our app → us)
//      Body shape: { action: "list_event_types" | "list_bookings" | ..., params }
//      Auth: Bearer <SUPABASE_SERVICE_ROLE_KEY> on the Authorization header.
//
// Required env (cal.com + email only — Google config lives in
// google-integrations and is NOT read here):
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   - CAL_API_KEY (from Cal.com Settings → Developer → API Keys)
//   - CAL_WEBHOOK_SECRET (the secret you set when creating the webhook)
//   - BREVO_API_KEY (already in Supabase project secrets)
//
// All Google touchpoints (GA4 Measurement Protocol, Google Ads offline
// conversion enqueue) are delegated to the google-integrations edge function,
// which owns its own GA_MEASUREMENT_ID/GA_API_SECRET/GAds customer +
// conversion-action config. cal-integrations sends only the per-booking
// payload (gclid, customer alias, lead type) and lets google-integrations
// resolve resource names and credentials.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CAL_API_KEY = Deno.env.get("CAL_API_KEY") || "";
const CAL_WEBHOOK_SECRET = Deno.env.get("CAL_WEBHOOK_SECRET") || "";
const CAL_API_BASE = Deno.env.get("CAL_API_BASE") || "https://api.cal.com/v2";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") || "";
const SITE_BASE = "https://cethos.com";
const FROM_EMAIL = "info@cethos.com";
const FROM_NAME = "Cethos Translation Services";
const SUPPORT_PHONE = "+1 (587) 600-0786";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-cal-signature-256, x-client-info, apikey, content-type",
};

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// ---------------------------------------------------------------------------
// HMAC signature verification (Cal.com webhooks use HMAC-SHA256)
// ---------------------------------------------------------------------------
async function verifyCalSignature(rawBody: string, signature: string): Promise<boolean> {
  if (!CAL_WEBHOOK_SECRET) return true; // dev-mode skip
  if (!signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(CAL_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return signature === expected || signature === `sha256=${expected}`;
}

// ---------------------------------------------------------------------------
// Cal.com REST API helper
// ---------------------------------------------------------------------------
async function calFetch(path: string, init: RequestInit = {}): Promise<{ status: number; data: any }> {
  const res = await fetch(`${CAL_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CAL_API_KEY}`,
      "Content-Type": "application/json",
      "cal-api-version": "2024-08-13",
      ...((init.headers as Record<string, string>) || {}),
    },
  });
  const text = await res.text();
  try {
    return { status: res.status, data: text ? JSON.parse(text) : {} };
  } catch {
    return { status: res.status, data: text };
  }
}

// ---------------------------------------------------------------------------
// Delegate to google-integrations for any Google API touchpoint.
// google-integrations resolves its own GA_MEASUREMENT_ID/GA_API_SECRET/GAds
// customer + conversion-action config; we don't read those here.
// ---------------------------------------------------------------------------
async function callGoogleIntegrations(platform: string, action: string, params: Record<string, any>) {
  const url = `${SUPABASE_URL}/functions/v1/google-integrations`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ platform, action, params }),
  });
  let body: any;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => "");
  }
  return { ok: res.ok, status: res.status, body };
}

async function sendGA4Event(eventName: string, params: Record<string, any>, clientId: string) {
  return callGoogleIntegrations("ga4", "send_event", {
    client_id: clientId,
    events: [{ name: eventName, params }],
  });
}

// ---------------------------------------------------------------------------
// Persist a booking + queue ad conversion (when gclid present) when Cal.com
// confirms a booking.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Branded confirmation email — sent on BOOKING_CREATED.
// Asks the client to upload a picture of every document via secure upload,
// using the existing /secure-upload route with a consult-context URL.
// ---------------------------------------------------------------------------
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMtnTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Edmonton",
      dateStyle: "full",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

async function sendConfirmationEmail(opts: {
  toEmail: string;
  toName: string;
  startTime: string;
  cancelUrl?: string;
  uploadUrl: string;
  zoomUrl?: string;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!BREVO_API_KEY) return { ok: false, error: "BREVO_API_KEY not set" };

  const when = formatMtnTime(opts.startTime);
  const safeName = escapeHtml(opts.toName || "there");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Your Apostille Consultation is Confirmed</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;color:#0C2340;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:linear-gradient(135deg,#0C2340 0%,#0891B2 100%);padding:32px 32px 28px;color:#ffffff;">
      <div style="font-size:13px;letter-spacing:1.5px;text-transform:uppercase;opacity:.85;margin-bottom:6px;">Cethos Translation Services</div>
      <h1 style="margin:0;font-size:24px;font-weight:700;line-height:1.25;">Your apostille consultation is confirmed</h1>
      <p style="margin:8px 0 0;color:#E0F2FE;font-size:14px;">15-minute call · No commitment · Mountain Time</p>
    </div>

    <div style="padding:28px 32px;">
      <p style="margin:0 0 18px;font-size:16px;">Hi ${safeName},</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">
        Thanks for booking — your free 15-minute apostille consultation is confirmed for:
      </p>
      <div style="background:#F8FAFC;border-left:4px solid #0891B2;padding:16px 18px;margin:0 0 22px;border-radius:6px;">
        <div style="font-size:18px;font-weight:600;color:#0C2340;">${escapeHtml(when)}</div>
        ${opts.zoomUrl ? `<div style="margin-top:8px;font-size:14px;"><a href="${escapeHtml(opts.zoomUrl)}" style="color:#0891B2;text-decoration:none;font-weight:600;">→ Join the Zoom meeting</a></div>` : ""}
      </div>

      <h2 style="margin:24px 0 10px;font-size:18px;color:#0C2340;border-bottom:2px solid #0891B2;padding-bottom:6px;">Before our call — please upload your documents</h2>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
        So we can give you a real, useful answer in 15 minutes (not spend the call on context-gathering), please send a clear photo or scan of each document you'd like apostilled. This is the single biggest difference between a useful consultation and a wasted one.
      </p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">
        Use our secure upload — encrypted in transit, scanned for safety, retained for 180 days then deleted:
      </p>
      <div style="text-align:center;margin:0 0 22px;">
        <a href="${escapeHtml(opts.uploadUrl)}" style="display:inline-block;background:#0891B2;color:#ffffff;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:8px;font-size:16px;">
          Upload My Documents Securely →
        </a>
      </div>

      <h2 style="margin:24px 0 10px;font-size:18px;color:#0C2340;border-bottom:2px solid #0891B2;padding-bottom:6px;">What to have ready on the call</h2>
      <ul style="margin:0 0 22px;padding:0 0 0 20px;font-size:15px;line-height:1.7;">
        <li>The destination country where the document will be used</li>
        <li>Any deadline you're working against</li>
        <li>Whether the document was issued in Canada or elsewhere</li>
        <li>Any communication you've already had with the destination authority</li>
      </ul>

      <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:14px 16px;margin:0 0 22px;">
        <div style="font-size:14px;font-weight:600;color:#9A3412;margin-bottom:4px;">Need to cancel?</div>
        <div style="font-size:14px;color:#7C2D12;line-height:1.5;">
          ${opts.cancelUrl ? `Use this link: <a href="${escapeHtml(opts.cancelUrl)}" style="color:#9A3412;font-weight:600;">cancel my booking</a>.` : "Reply to this email to cancel."}
          To respect everyone's calendar, this consultation can only be cancelled — not rescheduled. If you need a different time, please cancel and book a new one.
        </div>
      </div>

      <p style="margin:24px 0 0;font-size:14px;color:#475569;line-height:1.6;">
        Questions before the call? Reply to this email or call us at
        <a href="tel:+15876000786" style="color:#0891B2;text-decoration:none;font-weight:600;">${escapeHtml(SUPPORT_PHONE)}</a>.
      </p>
    </div>

    <div style="background:#0C2340;color:#94A3B8;padding:22px 32px;font-size:12px;line-height:1.6;text-align:center;">
      <div style="color:#ffffff;font-weight:600;font-size:14px;margin-bottom:6px;">Cethos Translation Services</div>
      421 7 Avenue SW, Floor 30 · Calgary, AB T2P 4K9, Canada<br/>
      <a href="${SITE_BASE}" style="color:#67E8F9;text-decoration:none;">cethos.com</a>
    </div>
  </div>
</body></html>`;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email: opts.toEmail, name: opts.toName || undefined }],
      replyTo: { email: FROM_EMAIL, name: FROM_NAME },
      subject: "Your Cethos apostille consultation is confirmed — please upload your documents",
      htmlContent: html,
    }),
  });

  return res.ok
    ? { ok: true, status: res.status }
    : { ok: false, status: res.status, error: await res.text() };
}

async function handleBookingCreated(payload: any) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const email: string = payload?.attendees?.[0]?.email || payload?.email || "";
  const fullName: string = payload?.attendees?.[0]?.name || payload?.name || "";
  const startTime: string = payload?.startTime || payload?.start_time || new Date().toISOString();
  const eventTitle: string = payload?.eventType?.title || payload?.title || "";
  const calBookingUid: string = payload?.uid || payload?.bookingUid || "";

  // Cal.com forwards URL-passed metadata in `responses` and `metadata` and
  // `additionalNotes`. We push our UTM/gclid in `metadata` from the embed URL.
  const meta = payload?.metadata || {};
  const utm = {
    utm_source: meta.utm_source || "cethos",
    utm_medium: meta.utm_medium || "apostille_page",
    utm_campaign: meta.utm_campaign || "free_consult",
    utm_content: meta.utm_content || null,
  };
  const gclid: string | null = meta.gclid || null;

  // Find the matching consult lead (we created it when the user submitted
  // step 3 with mode='consult'). Match by email + most recent.
  const { data: leadRows } = await supabase
    .from("cethosweb_quote_submissions")
    .select("id, service_data, created_at")
    .eq("service_type", "apostille")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1);
  const lead = leadRows?.[0];

  // Update the lead row with booking confirmation metadata.
  if (lead) {
    const newServiceData = {
      ...(lead.service_data || {}),
      cal_booking: {
        uid: calBookingUid,
        start_time: startTime,
        event_title: eventTitle,
        confirmed_at: new Date().toISOString(),
      },
    };
    await supabase
      .from("cethosweb_quote_submissions")
      .update({ service_data: newServiceData })
      .eq("id", lead.id);
  }

  // Fire server-side GA4 event (reliable — fires even if user closed the tab).
  const clientId = `${email || "anon"}-${calBookingUid || crypto.randomUUID()}`;
  await sendGA4Event(
    "booking_completed",
    {
      placement: meta.utm_content || "unknown",
      lead_type: "apostille_consult",
      ...utm,
    },
    clientId,
  );

  // Queue an offline conversion for Google Ads if we have a click identifier.
  // Delegated to google-integrations, which resolves the customer alias and
  // conversion-action resource name from its own config (the actual values
  // never leave google-integrations).
  if (gclid || meta.gbraid || meta.wbraid) {
    await callGoogleIntegrations("gads", "queue_offline_conversion", {
      lead_type: "apostille_consult",
      customer_alias: "cethos_solutions",
      gclid: gclid || undefined,
      gbraid: meta.gbraid || undefined,
      wbraid: meta.wbraid || undefined,
      conversion_date_time: new Date().toISOString(),
      order_id_for_upload: calBookingUid || null,
    });
  }

  // Branded confirmation email + secure-upload link.
  const cancelUrl: string =
    payload?.cancelLink ||
    payload?.cancelUrl ||
    (calBookingUid ? `https://cal.com/booking/${calBookingUid}?cancel=true` : "");
  const zoomUrl: string =
    (typeof payload?.location === "string" && payload.location.startsWith("http") ? payload.location : "") ||
    payload?.metadata?.videoCallUrl ||
    payload?.videoCallData?.url ||
    "";
  const uploadUrl =
    `${SITE_BASE}/secure-upload?context=apostille-consult` +
    `&uid=${encodeURIComponent(calBookingUid)}` +
    (email ? `&email=${encodeURIComponent(email)}` : "") +
    (fullName ? `&name=${encodeURIComponent(fullName)}` : "");

  let emailSent: any = { skipped: "no_email" };
  if (email) {
    emailSent = await sendConfirmationEmail({
      toEmail: email,
      toName: fullName,
      startTime,
      cancelUrl,
      uploadUrl,
      zoomUrl,
    });
  }

  return {
    ok: true,
    lead_id: lead?.id || null,
    cal_booking_uid: calBookingUid,
    email: emailSent,
  };
}

async function handleBookingCancelled(payload: any) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const calBookingUid: string = payload?.uid || payload?.bookingUid || "";
  if (!calBookingUid) return { ok: true, skipped: "no_uid" };

  // Find the lead with this booking UID and mark it cancelled.
  const { data: leadRows } = await supabase
    .from("cethosweb_quote_submissions")
    .select("id, service_data")
    .filter("service_data->cal_booking->>uid", "eq", calBookingUid)
    .limit(1);
  const lead = leadRows?.[0];
  if (!lead) return { ok: true, skipped: "no_match" };

  await supabase
    .from("cethosweb_quote_submissions")
    .update({
      service_data: {
        ...(lead.service_data || {}),
        cal_booking: {
          ...(lead.service_data?.cal_booking || {}),
          cancelled_at: new Date().toISOString(),
        },
      },
    })
    .eq("id", lead.id);

  return { ok: true, lead_id: lead.id };
}

// ---------------------------------------------------------------------------
// Action dispatch (read API)
// ---------------------------------------------------------------------------
async function handleAction(action: string, params: any): Promise<{ status: number; data: any }> {
  switch (action) {
    case "me":
      return calFetch("/me");
    case "list_event_types":
      return calFetch("/event-types");
    case "list_bookings": {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.take) qs.set("take", String(params.take));
      if (params?.skip) qs.set("skip", String(params.skip));
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return calFetch(`/bookings${suffix}`);
    }
    case "get_booking":
      if (!params?.uid) return { status: 400, data: { error: "uid required" } };
      return calFetch(`/bookings/${encodeURIComponent(params.uid)}`);
    case "list_schedules":
      return calFetch("/schedules");
    case "list_webhooks":
      return calFetch("/webhooks");
    case "get_event_type": {
      // GET /event-types/{username}/{slug}
      const username = params?.username || "cethos";
      const slug = params?.event_slug;
      if (!slug) return { status: 400, data: { error: "event_slug required" } };
      return calFetch(`/event-types/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`);
    }
    case "list_event_slots": {
      // GET /slots/available
      // params: { event_type_id, start_time (ISO), end_time (ISO), time_zone }
      const eventTypeId = params?.event_type_id;
      const start = params?.start_time;
      const end = params?.end_time;
      const tz = params?.time_zone || "America/Edmonton";
      if (!eventTypeId || !start || !end) {
        return { status: 400, data: { error: "event_type_id, start_time, end_time required" } };
      }
      const qs = new URLSearchParams({
        eventTypeId: String(eventTypeId),
        startTime: start,
        endTime: end,
        timeZone: tz,
      });
      return calFetch(`/slots/available?${qs.toString()}`);
    }
    case "create_booking": {
      // POST /bookings
      // params: { event_type_id, start (ISO UTC), name, email, phone, notes, metadata, time_zone }
      const eventTypeId = params?.event_type_id;
      const start = params?.start;
      const name = params?.name;
      const email = params?.email;
      const tz = params?.time_zone || "America/Edmonton";
      if (!eventTypeId || !start || !name || !email) {
        return { status: 400, data: { error: "event_type_id, start, name, email required" } };
      }
      const body: Record<string, any> = {
        start,
        eventTypeId,
        attendee: {
          name,
          email,
          timeZone: tz,
          ...(params.phone ? { phoneNumber: params.phone } : {}),
        },
        metadata: params.metadata || {},
      };
      if (params.notes) body.bookingFieldsResponses = { notes: params.notes };
      return calFetch(`/bookings`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    }
    default:
      return { status: 400, data: { error: `Unknown action: ${action}` } };
  }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const rawBody = await req.text();
  let body: any = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json(400, { error: "invalid JSON body" });
  }

  // Detect Cal.com webhook (presence of triggerEvent + payload).
  if (body && typeof body.triggerEvent === "string" && body.payload) {
    const sig = req.headers.get("x-cal-signature-256") || "";
    const verified = await verifyCalSignature(rawBody, sig);
    if (!verified) {
      return json(401, { error: "invalid signature" });
    }
    try {
      let result: any;
      switch (body.triggerEvent) {
        case "BOOKING_CREATED":
        case "BOOKING_RESCHEDULED":
          result = await handleBookingCreated(body.payload);
          break;
        case "BOOKING_CANCELLED":
        case "BOOKING_REJECTED":
          result = await handleBookingCancelled(body.payload);
          break;
        case "MEETING_ENDED":
          // Could fire a conversion here for "meeting_attended" if you want
          // attendance-gated bidding signals.
          result = { ok: true, noted: body.triggerEvent };
          break;
        default:
          result = { ok: true, ignored: body.triggerEvent };
      }
      return json(200, result);
    } catch (err) {
      console.error("[cal-integrations] webhook error", err);
      return json(500, { error: (err as Error).message });
    }
  }

  // Internal action dispatch.
  const { action, params } = body || {};
  if (!action) return json(400, { error: "action required" });

  // Require service-role auth for the read API.
  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    return json(401, { error: "unauthorized" });
  }

  try {
    const result = await handleAction(action, params || {});
    return json(result.status, result.data);
  } catch (err) {
    console.error("[cal-integrations] action error", err);
    return json(500, { error: (err as Error).message });
  }
});
