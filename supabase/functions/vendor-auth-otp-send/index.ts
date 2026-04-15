// ============================================================================
// vendor-auth-otp-send v2.0
// Two modes:
//   1. LOGIN OTP — vendor has vendor_auth record → generate 6-digit code,
//      insert into vendor_otp, email branded login code
//   2. INVITATION — vendor has no vendor_auth → generate token, insert into
//      vendor_sessions, email setup link (original behaviour)
// Supports single (email) and bulk (vendor_ids) modes.
// Date: April 15, 2026
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const JSON_HEADERS = { ...CORS_HEADERS, "Content-Type": "application/json" };

const INVITATION_EXPIRY_HOURS = 72;
const OTP_EXPIRY_MINUTES = 10;
const VENDOR_PORTAL_URL =
  Deno.env.get("VENDOR_PORTAL_URL") || "https://cethos-vendor.netlify.app";
const LOGO_URL =
  "https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/png_logo_cethos_light_bg.png";

// ── Helpers ──

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateOtpCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const num = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(num % 1000000).padStart(6, "0");
}

// ── Email builders ──

function buildInvitationEmail(
  vendorName: string,
  setupLink: string,
  isReminder: boolean,
): string {
  const greeting = vendorName || "there";
  const headline = isReminder
    ? "Friendly reminder: your portal invitation is waiting"
    : "You've been invited to the CETHOS Vendor Portal";
  const bodyText = isReminder
    ? "We sent you an invitation to join the CETHOS Vendor Portal, and it's still waiting for you. Set up your account to manage your projects, submit deliverables, and track payments."
    : "You've been invited to join the CETHOS Vendor Portal where you can manage your projects, submit deliverables, and track payments.";

  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 580px; margin: 0 auto; background-color: #ffffff;">
    <div style="background-color: #ffffff; padding: 36px 32px 28px; text-align: center; border-bottom: 3px solid #0891b2;">
      <img src="${LOGO_URL}" alt="CETHOS Translation Services" style="height: 52px; width: auto; display: block; margin: 0 auto;" />
    </div>
    <div style="padding: 40px 36px;">
      <p style="color: #0f172a; font-size: 16px; font-weight: 600; margin: 0 0 8px;">
        Hi ${greeting},
      </p>
      <p style="color: #475569; font-size: 14px; margin: 0 0 12px; line-height: 1.7;">
        ${headline}
      </p>
      <p style="color: #475569; font-size: 14px; margin: 0 0 32px; line-height: 1.7;">
        ${bodyText}
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${setupLink}"
           style="display: inline-block; padding: 16px 52px; background-color: #0f172a; color: #ffffff;
                  text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px;
                  letter-spacing: 0.3px;">
          Set Up Your Account
        </a>
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 0 0 28px;">
        <p style="color: #64748b; font-size: 12px; margin: 0; line-height: 1.6;">
          This link expires in ${INVITATION_EXPIRY_HOURS} hours. If it has expired, contact your CETHOS project manager to receive a new one.
        </p>
      </div>
      <p style="color: #cbd5e1; font-size: 12px; margin: 0; text-align: center; line-height: 1.6;">
        Questions? <a href="mailto:support@cethos.com" style="color: #0891b2; text-decoration: none;">support@cethos.com</a>
      </p>
    </div>
    <div style="padding: 20px 36px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="color: #94a3b8; font-size: 11px; margin: 0;">
        CETHOS Translation Services · <a href="https://cethos.com" style="color: #0891b2; text-decoration: none;">cethos.com</a>
      </p>
    </div>
  </div>`;
}

function buildLoginOtpEmail(vendorName: string, otpCode: string): string {
  const greeting = vendorName || "there";

  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 580px; margin: 0 auto; background-color: #ffffff;">
    <div style="background-color: #ffffff; padding: 36px 32px 28px; text-align: center; border-bottom: 3px solid #0891b2;">
      <img src="${LOGO_URL}" alt="CETHOS Translation Services" style="height: 52px; width: auto; display: block; margin: 0 auto;" />
    </div>
    <div style="padding: 40px 36px;">
      <p style="color: #0f172a; font-size: 16px; font-weight: 600; margin: 0 0 8px;">
        Hi ${greeting},
      </p>
      <p style="color: #475569; font-size: 14px; margin: 0 0 12px; line-height: 1.7;">
        Your login verification code
      </p>
      <p style="color: #475569; font-size: 14px; margin: 0 0 32px; line-height: 1.7;">
        Enter this code in the Vendor Portal to sign in. It expires in ${OTP_EXPIRY_MINUTES} minutes.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <div style="display: inline-block; padding: 20px 48px; background-color: #f8fafc; border: 2px solid #e2e8f0;
                    border-radius: 12px; font-family: 'SF Mono', Monaco, 'Courier New', monospace;
                    font-size: 36px; font-weight: 700; letter-spacing: 12px; color: #0f172a;">
          ${otpCode}
        </div>
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 0 0 28px;">
        <p style="color: #64748b; font-size: 12px; margin: 0; line-height: 1.6;">
          If you didn't request this code, you can safely ignore this email. Someone may have entered your email address by mistake.
        </p>
      </div>
      <p style="color: #cbd5e1; font-size: 12px; margin: 0; text-align: center; line-height: 1.6;">
        Questions? <a href="mailto:support@cethos.com" style="color: #0891b2; text-decoration: none;">support@cethos.com</a>
      </p>
    </div>
    <div style="padding: 20px 36px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="color: #94a3b8; font-size: 11px; margin: 0;">
        CETHOS Translation Services · <a href="https://cethos.com" style="color: #0891b2; text-decoration: none;">cethos.com</a>
      </p>
    </div>
  </div>`;
}

// ── Send login OTP for existing vendor ──

interface SendResult {
  vendor_id: string;
  email: string;
  success: boolean;
  mode?: "otp" | "invitation";
  error?: string;
}

async function sendLoginOtp(
  supabase: ReturnType<typeof createClient>,
  brevoKey: string,
  vendor: { id: string; email: string; full_name: string },
): Promise<SendResult> {
  const result: SendResult = {
    vendor_id: vendor.id,
    email: vendor.email,
    success: false,
    mode: "otp",
  };

  try {
    // Invalidate existing unused OTPs for this vendor
    await supabase
      .from("vendor_otp")
      .update({ verified: true })
      .eq("vendor_id", vendor.id)
      .eq("verified", false);

    const otpCode = generateOtpCode();
    const expiresAt = new Date(
      Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
    ).toISOString();

    // Insert OTP record
    const { error: otpError } = await supabase
      .from("vendor_otp")
      .insert({
        vendor_id: vendor.id,
        email: vendor.email.toLowerCase().trim(),
        channel: "email",
        otp_code: otpCode,
        expires_at: expiresAt,
        verified: false,
      });

    if (otpError) {
      result.error = `Failed to create OTP: ${otpError.message}`;
      return result;
    }

    // Send email with code
    const emailHtml = buildLoginOtpEmail(vendor.full_name, otpCode);
    const emailPayload = {
      sender: {
        name: "CETHOS Translation Services",
        email: "donotreply@cethos.com",
      },
      to: [{ email: vendor.email, name: vendor.full_name }],
      replyTo: { email: "support@cethos.com", name: "CETHOS Support" },
      subject: `${otpCode} — Your CETHOS Vendor Portal login code`,
      htmlContent: emailHtml,
    };

    const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": brevoKey,
      },
      body: JSON.stringify(emailPayload),
    });

    if (!emailResponse.ok) {
      const errText = await emailResponse.text();
      result.error = `Brevo error (${emailResponse.status}): ${errText}`;
      return result;
    }

    result.success = true;
    console.log(`Login OTP sent to: ${vendor.email}`);
  } catch (err: unknown) {
    result.error = err instanceof Error ? err.message : "Unknown error";
  }

  return result;
}

// ── Send invitation for new vendor ──

async function sendInvitationForVendor(
  supabase: ReturnType<typeof createClient>,
  brevoKey: string,
  vendor: { id: string; email: string; full_name: string },
  isReminder: boolean,
): Promise<SendResult> {
  const result: SendResult = {
    vendor_id: vendor.id,
    email: vendor.email,
    success: false,
    mode: "invitation",
  };

  try {
    // Delete existing expired invitation tokens for this vendor
    await supabase
      .from("vendor_sessions")
      .delete()
      .eq("vendor_id", vendor.id)
      .lt("expires_at", new Date().toISOString());

    // Generate token
    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000,
    ).toISOString();

    // Store session/token
    const { error: sessionError } = await supabase
      .from("vendor_sessions")
      .insert({
        vendor_id: vendor.id,
        session_token: tokenHash,
        expires_at: expiresAt,
      });

    if (sessionError) {
      result.error = `Failed to create session: ${sessionError.message}`;
      return result;
    }

    // Build email
    const setupLink = `${VENDOR_PORTAL_URL}/setup?token=${rawToken}`;
    const emailHtml = buildInvitationEmail(vendor.full_name, setupLink, isReminder);
    const subject = isReminder
      ? "Reminder: Set up your CETHOS Vendor Portal account"
      : "You're invited to the CETHOS Vendor Portal";

    const emailPayload = {
      sender: {
        name: "CETHOS Translation Services",
        email: "donotreply@cethos.com",
      },
      to: [{ email: vendor.email, name: vendor.full_name }],
      replyTo: { email: "support@cethos.com", name: "CETHOS Support" },
      subject,
      htmlContent: emailHtml,
    };

    const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": brevoKey,
      },
      body: JSON.stringify(emailPayload),
    });

    if (!emailResponse.ok) {
      const errText = await emailResponse.text();
      result.error = `Brevo error (${emailResponse.status}): ${errText}`;
      return result;
    }

    // Update vendor invitation tracking
    if (!isReminder) {
      await supabase
        .from("vendors")
        .update({ invitation_sent_at: new Date().toISOString() })
        .eq("id", vendor.id);
    }

    result.success = true;
    console.log(`Invitation sent to: ${vendor.email}`);
  } catch (err: unknown) {
    result.error = err instanceof Error ? err.message : "Unknown error";
  }

  return result;
}

// ── Main handler ──

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");

    if (!BREVO_API_KEY) {
      throw new Error("BREVO_API_KEY not configured");
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { email, vendor_ids, is_reminder, channel } = body;

    // ── Single mode (from vendor portal login or AdminVendorDetail) ──
    if (email && !vendor_ids) {
      const normalizedEmail = email.toLowerCase().trim();

      const { data: vendor, error: vendorError } = await supabaseAdmin
        .from("vendors")
        .select("id, email, full_name, auth_user_id")
        .eq("email", normalizedEmail)
        .single();

      if (vendorError || !vendor) {
        // Return success to prevent email enumeration
        return new Response(
          JSON.stringify({ success: true, message: "If a vendor exists, a code has been sent." }),
          { headers: JSON_HEADERS },
        );
      }

      // Check if vendor already has a vendor_auth record (has set up account)
      const { data: authRecord } = await supabaseAdmin
        .from("vendor_auth")
        .select("vendor_id")
        .eq("vendor_id", vendor.id)
        .single();

      if (authRecord) {
        // ── LOGIN OTP flow: vendor has an account, send 6-digit code ──
        console.log(`Vendor ${vendor.email} has auth record — sending login OTP`);

        const result = await sendLoginOtp(
          supabaseAdmin,
          BREVO_API_KEY,
          vendor,
        );

        if (!result.success) {
          return new Response(
            JSON.stringify({ success: false, error: result.error }),
            { status: 400, headers: JSON_HEADERS },
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            mode: "otp",
            message: `Login code sent to ${vendor.email}`,
          }),
          { headers: JSON_HEADERS },
        );
      } else {
        // ── INVITATION flow: vendor has no account, send setup link ──
        console.log(`Vendor ${vendor.email} has no auth record — sending invitation`);

        const result = await sendInvitationForVendor(
          supabaseAdmin,
          BREVO_API_KEY,
          vendor,
          !!is_reminder,
        );

        if (!result.success) {
          return new Response(
            JSON.stringify({ success: false, error: result.error }),
            { status: 400, headers: JSON_HEADERS },
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            mode: "invitation",
            message: `Invitation sent to ${vendor.email}`,
          }),
          { headers: JSON_HEADERS },
        );
      }
    }

    // ── Bulk mode (from AdminVendorsList) ──
    if (vendor_ids && Array.isArray(vendor_ids) && vendor_ids.length > 0) {
      const { data: vendors, error: fetchError } = await supabaseAdmin
        .from("vendors")
        .select("id, email, full_name, auth_user_id")
        .in("id", vendor_ids);

      if (fetchError || !vendors) {
        return new Response(
          JSON.stringify({ success: false, error: "Failed to fetch vendors" }),
          { status: 400, headers: JSON_HEADERS },
        );
      }

      // Check which vendors have auth records
      const { data: authRecords } = await supabaseAdmin
        .from("vendor_auth")
        .select("vendor_id")
        .in("vendor_id", vendor_ids);

      const hasAuthSet = new Set(
        (authRecords || []).map((a: { vendor_id: string }) => a.vendor_id),
      );

      const results: SendResult[] = [];

      for (const vendor of vendors) {
        if (hasAuthSet.has(vendor.id)) {
          // Vendor has account — send login OTP
          const result = await sendLoginOtp(supabaseAdmin, BREVO_API_KEY, vendor);
          results.push(result);
        } else {
          // Vendor has no account — send invitation
          const result = await sendInvitationForVendor(
            supabaseAdmin,
            BREVO_API_KEY,
            vendor,
            !!is_reminder,
          );
          results.push(result);
        }
      }

      const sent = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      const errors = results
        .filter((r) => !r.success)
        .map((r) => ({ vendor_id: r.vendor_id, email: r.email, error: r.error }));

      console.log(`Bulk send: ${sent} sent, ${failed} failed`);

      return new Response(
        JSON.stringify({ success: true, sent, failed, errors }),
        { headers: JSON_HEADERS },
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Provide 'email' or 'vendor_ids'" }),
      { status: 400, headers: JSON_HEADERS },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("vendor-auth-otp-send error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
});
