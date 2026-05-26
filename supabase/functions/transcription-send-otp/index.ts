// POST /functions/v1/transcription-send-otp
// Body: { email: string }
// Generates a 6-digit OTP, hashes it, stores in transcription_otps,
// sends the code via Brevo email. 5-minute expiry, max 3 OTPs per email per 10 min.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  jsonResponse,
  preflight,
  getServiceClient,
  generateOtp,
  sha256Hex,
  sendBrevoEmail,
  auditLog,
} from "../_shared/transcription.ts";

const OTP_EXPIRY_MINUTES = 5;
const MAX_OTPS_PER_WINDOW = 3;
const RATE_WINDOW_MINUTES = 10;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string"
      ? body.email.toLowerCase().trim()
      : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ success: false, error: "Valid email required" }, 400);
    }

    const admin = getServiceClient();

    // Rate limit: max 3 OTPs per email in 10 minutes
    const windowStart = new Date(
      Date.now() - RATE_WINDOW_MINUTES * 60 * 1000,
    ).toISOString();

    const { count } = await admin
      .from("transcription_otps")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", windowStart);

    if ((count ?? 0) >= MAX_OTPS_PER_WINDOW) {
      return jsonResponse(
        { success: false, error: "Too many OTP requests. Please wait a few minutes." },
        429,
      );
    }

    // Generate and store OTP
    const otp = generateOtp();
    const otpHash = await sha256Hex(otp);
    const expiresAt = new Date(
      Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
    ).toISOString();

    const { error: insertErr } = await admin
      .from("transcription_otps")
      .insert({
        email,
        otp_hash: otpHash,
        expires_at: expiresAt,
      });

    if (insertErr) {
      console.error("OTP insert failed:", insertErr);
      return jsonResponse({ success: false, error: "Failed to create OTP" }, 500);
    }

    // Send via Brevo
    const sent = await sendBrevoEmail(
      email,
      "Your Cethos Transcription Code",
      `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #0f172a; margin: 0;">Cethos Transcription</h2>
        </div>
        <p style="color: #334155; font-size: 16px; line-height: 1.5;">
          Your verification code is:
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0f172a; background: #f1f5f9; padding: 16px 32px; border-radius: 8px; display: inline-block;">
            ${otp}
          </span>
        </div>
        <p style="color: #64748b; font-size: 14px; line-height: 1.5;">
          This code expires in ${OTP_EXPIRY_MINUTES} minutes. If you didn't request this, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">
          Cethos Solutions Inc. &bull; cethos.com
        </p>
      </div>
      `,
    );

    if (!sent) {
      console.error("Brevo email send failed for:", email);
    }

    await auditLog(admin, null, "otp_sent", "system", null, { email });

    return jsonResponse({ success: true, expires_in_seconds: OTP_EXPIRY_MINUTES * 60 });
  } catch (e) {
    console.error("transcription-send-otp error:", e);
    return jsonResponse(
      { success: false, error: "Internal error" },
      500,
    );
  }
});
