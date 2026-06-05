// ============================================================================
// vendor-auth-otp-send v3.0
// Single-email mode: ALWAYS sends a 6-digit login OTP to vendors that exist.
// Vendors don't need to accept an invitation or set a password to log in.
// Pass `mode: "invitation"` to explicitly send the password-setup link
// instead — used by the admin "Send Invitation" escape hatch.
// Bulk mode (vendor_ids) keeps the legacy auth-record dispatch.
// Date: 2026-05-08
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  callout,
  codeBlock,
  ctaButton,
  emailShell,
  esc,
  eyebrow,
  hint,
  lead,
  REPLY,
  title,
  type TemplateMeta,
} from "../_shared/email-shell.ts";

const TPL_INVITATION: TemplateMeta = {
  name: "Vendor — Portal Invitation",
  version: "2.0",
  updatedAt: "2026-05-28",
};
const TPL_LOGIN_OTP: TemplateMeta = {
  name: "Vendor — Login OTP",
  version: "2.0",
  updatedAt: "2026-05-28",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const JSON_HEADERS = { ...CORS_HEADERS, "Content-Type": "application/json" };

const INVITATION_EXPIRY_HOURS = 72;
const OTP_EXPIRY_MINUTES = 10;
const VENDOR_PORTAL_URL =
  Deno.env.get("VENDOR_PORTAL_URL") || "https://vendor.cethos.com";

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
  // Crypto-strong 6-digit OTP, rejection-sampled to remove bias near the
  // mod boundary.
  const cap = 4_294_000_000;
  const buf = new Uint8Array(4);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0;
  } while (n >= cap);
  return String(n % 1_000_000).padStart(6, "0");
}

// Hash-at-rest helpers (audit H-4). Inline because this admin-repo
// function predates the _shared/otp-crypto.ts that the vendor repo
// ships; kept byte-identical to that helper so hashes match across
// repos.
function generateSalt(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashOtp(code: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${code}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

// ── Email builders ──

function buildInvitationEmail(
  vendorName: string,
  setupLink: string,
  isReminder: boolean,
): string {
  const firstName = (vendorName || "there").trim().split(/\s+/)[0] || "there";
  const headline = isReminder
    ? "Friendly reminder: your portal invitation is waiting"
    : "You've been invited to the CETHOS Vendor Portal";
  const bodyText = isReminder
    ? "We sent you an invitation to join the CETHOS Vendor Portal, and it's still waiting for you. Set up your account to manage your projects, submit deliverables, and track payments."
    : "You've been invited to join the CETHOS Vendor Portal where you can manage your projects, submit deliverables, and track payments.";

  return emailShell(
    [
      eyebrow(isReminder ? "Reminder — invitation waiting" : "You're invited"),
      title(headline),
      lead(`Hi ${esc(firstName)}, ${bodyText}`),
      ctaButton({ label: "Set up your account", url: setupLink, variant: "navy", align: "full" }),
      callout({
        tone: "info",
        title: "Link expiry",
        body: `This link expires in ${INVITATION_EXPIRY_HOURS} hours. If it expires before you set up, ask your project manager for a new one.`,
      }),
      hint(`Questions? Reply to this email or contact <a href="mailto:vendor@cethos.com" style="color:#0E7490;">vendor@cethos.com</a>.`),
    ].join(""),
    { replyTo: REPLY.vendor, template: TPL_INVITATION, preheader: `${isReminder ? "Reminder" : "Invitation"}: set up your Cethos Vendor Portal account.` },
  );
}

function buildLoginOtpEmail(vendorName: string, otpCode: string): string {
  const firstName = (vendorName || "there").trim().split(/\s+/)[0] || "there";
  return emailShell(
    [
      eyebrow("Vendor portal sign-in"),
      title("Your sign-in code"),
      lead(`Hi ${esc(firstName)}, enter this code in the Vendor Portal to sign in. It expires in ${OTP_EXPIRY_MINUTES} minutes.`),
      codeBlock({ code: otpCode, expiresIn: `${OTP_EXPIRY_MINUTES} minutes` }),
      callout({
        tone: "info",
        title: "Didn't request this?",
        body: "You can safely ignore this email. Someone may have entered your address by mistake.",
      }),
    ].join(""),
    { replyTo: REPLY.vendor, template: TPL_LOGIN_OTP, preheader: `Your Cethos Vendor Portal sign-in code · expires in ${OTP_EXPIRY_MINUTES} minutes.` },
  );
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
    const salt = generateSalt();
    const otpHash = await hashOtp(otpCode, salt);
    const expiresAt = new Date(
      Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
    ).toISOString();

    // Insert OTP record — hash+salt at rest (audit H-4 / M-6). The raw
    // code only travels in the email body and stays in this scope.
    const { error: otpError } = await supabase
      .from("vendor_otp")
      .insert({
        vendor_id: vendor.id,
        email: vendor.email.toLowerCase().trim(),
        channel: "email",
        otp_hash: otpHash,
        salt,
        attempts: 0,
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
    const { email, vendor_ids, is_reminder, channel, mode } = body;

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

      // Default behaviour is now LOGIN OTP for every existing vendor — no
      // password setup or invitation acceptance required. Staff can still
      // explicitly send the legacy password-setup invitation by passing
      // `mode: "invitation"` (used by the admin "Send Invitation" button).
      const wantsInvitation = mode === "invitation";

      if (wantsInvitation) {
        console.log(`Vendor ${vendor.email}: sending password-setup invitation (explicit mode)`);
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

      // Login OTP — works for vendors with or without a vendor_auth row.
      console.log(`Vendor ${vendor.email}: sending login OTP`);
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
