// supabase/functions/apostille-consult-sms-reminders/index.ts
//
// Sends a Twilio SMS reminder ~2 hours before each apostille consultation,
// with a Cal.com cancel link. Drained on a 15-minute pg_cron schedule.
//
// Selection logic: any cethosweb_quote_submissions row where
//   service_data.cal_booking.uid is present
//   AND service_data.cal_booking.start_time is between now+1h45m and now+2h15m
//   AND service_data.cal_booking.cancelled_at is NULL
//   AND service_data.cal_booking.sms_reminded_at is NULL
// (The 30-minute window prevents missing bookings if cron skews; the
// reminded_at flag prevents double-sends.)
//
// Required env (Supabase project secrets):
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   - TWILIO_ACCOUNT_SID
//   - TWILIO_AUTH_TOKEN
//   - TWILIO_FROM_NUMBER  (E.164 format, e.g. "+15876000786")
//
// Function is verify_jwt=false; cron passes the service-role key in
// Authorization header for project-level auth at the gateway, and we don't
// re-check it inside the function (this endpoint takes no user input).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// Normalize phone to E.164. Handles Canadian/US 10-digit numbers (prefixes +1)
// and strips non-digits except a leading +.
function toE164(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function formatBookingTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Edmonton",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

async function sendTwilioSms(opts: { to: string; body: string }): Promise<{ ok: boolean; status: number; body: unknown }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    return { ok: false, status: 500, body: { error: "Twilio env not configured" } };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const form = new URLSearchParams({
    From: TWILIO_FROM_NUMBER,
    To: opts.to,
    Body: opts.body,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => "");
  }
  return { ok: res.ok, status: res.status, body };
}

interface Lead {
  id: string;
  full_name: string | null;
  phone: string | null;
  service_data: Record<string, unknown> & {
    cal_booking?: {
      uid?: string;
      start_time?: string;
      cancelled_at?: string;
      sms_reminded_at?: string;
    };
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json(405, { error: "POST or GET" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();
  const lower = new Date(now.getTime() + 1 * 60 * 60 * 1000 + 45 * 60 * 1000); // +1h45m
  const upper = new Date(now.getTime() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000); // +2h15m

  // Pull the candidate window. JSONB filtering for "key not present" requires
  // a follow-up filter in JS — Supabase PostgREST doesn't expose `?` operators
  // cleanly through the JS client.
  const { data, error } = await supabase
    .from("cethosweb_quote_submissions")
    .select("id, full_name, phone, service_data")
    .eq("service_type", "apostille")
    .filter("service_data->cal_booking->>start_time", "gte", lower.toISOString())
    .filter("service_data->cal_booking->>start_time", "lte", upper.toISOString());

  if (error) {
    console.error("[sms-reminders] query error", error);
    return json(500, { error: error.message });
  }

  const candidates = ((data || []) as Lead[]).filter((row) => {
    const cb = row.service_data?.cal_booking;
    if (!cb || !cb.uid || !cb.start_time) return false;
    if (cb.cancelled_at) return false;
    if (cb.sms_reminded_at) return false;
    return true;
  });

  const results: Array<{ id: string; status: string; detail?: unknown }> = [];

  for (const row of candidates) {
    const phoneE164 = toE164(row.phone || "");
    if (!phoneE164) {
      results.push({ id: row.id, status: "skipped_no_phone" });
      continue;
    }

    const cb = row.service_data.cal_booking!;
    const when = formatBookingTime(cb.start_time!);
    const cancelUrl = `https://cal.com/booking/${cb.uid}?cancel=true`;
    const firstName = (row.full_name || "").split(" ")[0] || "there";

    // ~2 segments (140 chars). Concise to keep SMS cost down.
    const body =
      `Cethos: Hi ${firstName}, reminder — your free 15-min apostille consult is in 2 hours (${when}). ` +
      `Zoom link in your email. Need to cancel? ${cancelUrl}`;

    const sms = await sendTwilioSms({ to: phoneE164, body });
    if (!sms.ok) {
      results.push({ id: row.id, status: "twilio_error", detail: sms.body });
      continue;
    }

    // Mark reminded so we don't double-send on the next 15-min tick.
    const newServiceData = {
      ...row.service_data,
      cal_booking: {
        ...cb,
        sms_reminded_at: new Date().toISOString(),
      },
    };
    const { error: updateError } = await supabase
      .from("cethosweb_quote_submissions")
      .update({ service_data: newServiceData })
      .eq("id", row.id);
    if (updateError) {
      results.push({ id: row.id, status: "marked_failed", detail: updateError.message });
    } else {
      results.push({ id: row.id, status: "sent" });
    }
  }

  return json(200, {
    ok: true,
    window: { lower: lower.toISOString(), upper: upper.toISOString() },
    candidates: candidates.length,
    sent: results.filter((r) => r.status === "sent").length,
    results,
  });
});
