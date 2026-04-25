// supabase/functions/secure-upload-otp-send/index.ts
//
// Generates and sends a 6-digit OTP for the public /secure-upload form.
// Channel: email (Brevo) or phone (Twilio SMS). Rate-limited to 3 sends per
// contact per 10 minutes to discourage abuse.
//
// Request body: { channel: 'email'|'phone', contact: string, fullName?: string }
//
// Response on success:
//   { success: true, otpId, channel, contact, expiresInSeconds }
// (Even when rate-limited or contact is malformed we surface the reason
//  so the user can fix their input — no enumeration concern here since the
//  contact is whatever they typed, not a pre-existing identity.)
//
// Required edge-function secrets:
//   BREVO_API_KEY                  (already configured)
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_NUMBER             (e.164, e.g. +15875550100)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OTP_EXPIRY_MINUTES = 10;
const RATE_WINDOW_MINUTES = 10;
const RATE_MAX_SENDS = 3;
const LOGO_URL =
  "https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/png_logo_cethos_light_bg.png";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const brevoKey = Deno.env.get("BREVO_API_KEY") ?? "";
  const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
  const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER") ?? "";

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const channel = String(body.channel || "").toLowerCase();
    const rawContact = String(body.contact || "").trim();
    const fullName = String(body.fullName || "").trim();

    if (channel !== "email" && channel !== "phone") {
      return jsonResponse(400, { success: false, error: "channel must be 'email' or 'phone'" });
    }
    if (!rawContact) {
      return jsonResponse(400, {
        success: false,
        error: channel === "email" ? "Email is required" : "Phone number is required",
      });
    }

    // Normalize contact
    let contact: string;
    if (channel === "email") {
      contact = rawContact.toLowerCase();
      if (!isValidEmail(contact)) {
        return jsonResponse(400, { success: false, error: "Invalid email address" });
      }
    } else {
      contact = normalizeE164(rawContact);
      if (!contact) {
        return jsonResponse(400, {
          success: false,
          error: "Phone number must be in international format (e.g. +1 587 600 0786)",
        });
      }
    }

    // Rate limit
    const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60 * 1000).toISOString();
    const { count: recentSends } = await supabaseAdmin
      .from("secure_upload_otps")
      .select("id", { count: "exact", head: true })
      .eq("contact", contact)
      .gte("created_at", since);

    if ((recentSends ?? 0) >= RATE_MAX_SENDS) {
      return jsonResponse(429, {
        success: false,
        error: `Too many codes requested. Please wait a few minutes before trying again.`,
      });
    }

    // Generate 6-digit code + hash
    const code = generate6DigitCode();
    const codeHash = await sha256(code);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
    const ua = req.headers.get("user-agent") || null;

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("secure_upload_otps")
      .insert({
        contact,
        channel,
        code_hash: codeHash,
        expires_at: expiresAt,
        ip_address: ip,
        user_agent: ua,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      console.error("OTP insert failed:", insertErr);
      throw new Error("Could not create code");
    }

    // Send via the chosen channel
    if (channel === "email") {
      if (!brevoKey) throw new Error("Email channel not configured");
      await sendBrevoEmail({
        brevoKey,
        to: contact,
        toName: fullName || contact,
        code,
      });
    } else {
      if (!twilioSid || !twilioToken || !twilioFrom) {
        throw new Error("SMS channel not configured");
      }
      await sendTwilioSms({
        accountSid: twilioSid,
        authToken: twilioToken,
        from: twilioFrom,
        to: contact,
        code,
      });
    }

    console.log(`OTP sent: ${channel}=${maskContact(contact, channel)} otpId=${inserted.id}`);

    return jsonResponse(200, {
      success: true,
      otpId: inserted.id,
      channel,
      contact: maskContact(contact, channel),
      expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
    });
  } catch (err: unknown) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error("secure-upload-otp-send error:", msg);
    return jsonResponse(500, { success: false, error: msg });
  }
});

// ============================================================================
// Validators / helpers
// ============================================================================

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// Accepts: +15876000786, 15876000786, 5876000786 (defaults to +1 if 10 digits)
// Rejects anything that doesn't look like a plausible international number.
function normalizeE164(v: string): string | null {
  const digits = v.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    return /^\+\d{8,15}$/.test(digits) ? digits : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

function generate6DigitCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const num = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(num % 1000000).padStart(6, "0");
}

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function maskContact(contact: string, channel: "email" | "phone"): string {
  if (channel === "email") {
    const [local, domain] = contact.split("@");
    if (!domain) return contact;
    const visible = local.length <= 2 ? local : local.slice(0, 2);
    return `${visible}***@${domain}`;
  }
  // phone: keep last 4
  const last4 = contact.slice(-4);
  return `***${last4}`;
}

// ============================================================================
// Brevo email
// ============================================================================

async function sendBrevoEmail(args: {
  brevoKey: string;
  to: string;
  toName: string;
  code: string;
}): Promise<void> {
  const html = buildOtpEmailHtml(args.toName, args.code);
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": args.brevoKey,
    },
    body: JSON.stringify({
      sender: { name: "Cethos Translation Services", email: "donotreply@cethos.com" },
      to: [{ email: args.to, name: args.toName }],
      replyTo: { email: "support@cethos.com", name: "Cethos Support" },
      subject: `${args.code} — Cethos secure upload code`,
      htmlContent: html,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Brevo email failed: ${resp.status} ${t}`);
  }
}

function buildOtpEmailHtml(name: string, code: string): string {
  const greeting = name || "there";
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 580px; margin: 0 auto; background-color: #ffffff;">
    <div style="background-color: #ffffff; padding: 36px 32px 28px; text-align: center; border-bottom: 3px solid #0891b2;">
      <img src="${LOGO_URL}" alt="Cethos" style="height: 52px; width: auto; display: block; margin: 0 auto;" />
    </div>
    <div style="padding: 40px 36px;">
      <p style="color: #0f172a; font-size: 16px; font-weight: 600; margin: 0 0 8px;">Hi ${greeting},</p>
      <p style="color: #475569; font-size: 14px; margin: 0 0 12px; line-height: 1.7;">Your secure upload verification code:</p>
      <div style="text-align: center; margin: 28px 0;">
        <div style="display: inline-block; padding: 20px 48px; background-color: #f8fafc; border: 2px solid #e2e8f0;
                    border-radius: 12px; font-family: 'SF Mono', Monaco, 'Courier New', monospace;
                    font-size: 36px; font-weight: 700; letter-spacing: 12px; color: #0f172a;">${code}</div>
      </div>
      <p style="color: #475569; font-size: 13px; margin: 0 0 24px; line-height: 1.7;">
        Enter this code on the upload page to continue. It expires in ${OTP_EXPIRY_MINUTES} minutes.
      </p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 0 0 28px;">
        <p style="color: #64748b; font-size: 12px; margin: 0; line-height: 1.6;">
          If you didn't request this code, you can safely ignore this email.
        </p>
      </div>
      <p style="color: #cbd5e1; font-size: 12px; margin: 0; text-align: center; line-height: 1.6;">
        Questions? <a href="mailto:support@cethos.com" style="color: #0891b2; text-decoration: none;">support@cethos.com</a>
      </p>
    </div>
    <div style="padding: 20px 36px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="color: #94a3b8; font-size: 11px; margin: 0;">
        Cethos Translation Services · <a href="https://cethos.com" style="color: #0891b2; text-decoration: none;">cethos.com</a>
      </p>
    </div>
  </div>`;
}

// ============================================================================
// Twilio SMS
// ============================================================================

async function sendTwilioSms(args: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  code: string;
}): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${args.accountSid}/Messages.json`;
  const form = new URLSearchParams();
  form.set("To", args.to);
  form.set("From", args.from);
  form.set(
    "Body",
    `Cethos: your secure upload code is ${args.code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
  );

  const basic = btoa(`${args.accountSid}:${args.authToken}`);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Twilio SMS failed: ${resp.status} ${t}`);
  }
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
