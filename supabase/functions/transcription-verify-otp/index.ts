// POST /functions/v1/transcription-verify-otp
// Body: { email: string, otp: string }
// Validates OTP against stored hash, issues a session token (HMAC-signed, 24h TTL).
// Also returns remaining free uses for the day.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  jsonResponse,
  preflight,
  getServiceClient,
  sha256Hex,
  issueSessionToken,
  getTranscriptionSettings,
  auditLog,
} from "../_shared/transcription.ts";

const MAX_ATTEMPTS = 5;

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
    const otp = typeof body?.otp === "string" ? body.otp.trim() : "";

    if (!email || !otp) {
      return jsonResponse({ success: false, error: "Email and OTP required" }, 400);
    }

    const admin = getServiceClient();

    // Find the most recent unexpired, unverified OTP for this email
    const { data: otpRows, error: fetchErr } = await admin
      .from("transcription_otps")
      .select("id, otp_hash, expires_at, attempts")
      .eq("email", email)
      .eq("verified", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (fetchErr || !otpRows || otpRows.length === 0) {
      return jsonResponse(
        { success: false, error: "No valid OTP found. Please request a new code." },
        400,
      );
    }

    const otpRow = otpRows[0];

    // Check attempt limit
    if (otpRow.attempts >= MAX_ATTEMPTS) {
      return jsonResponse(
        { success: false, error: "Too many attempts. Please request a new code." },
        429,
      );
    }

    // Increment attempts
    await admin
      .from("transcription_otps")
      .update({ attempts: otpRow.attempts + 1 })
      .eq("id", otpRow.id);

    // Verify hash
    const inputHash = await sha256Hex(otp);
    if (inputHash !== otpRow.otp_hash) {
      return jsonResponse(
        { success: false, error: "Invalid code. Please try again." },
        400,
      );
    }

    // OTP valid — issue session token
    const sessionToken = await issueSessionToken(email);

    // Mark OTP as verified and store session token
    await admin
      .from("transcription_otps")
      .update({ verified: true, session_token: sessionToken })
      .eq("id", otpRow.id);

    // Check daily free usage
    const settings = await getTranscriptionSettings(admin);
    const dailyLimit = parseInt(settings.transcription_free_tier_daily_limit ?? "5", 10);
    const today = new Date().toISOString().split("T")[0];

    const { data: usageRow } = await admin
      .from("transcription_email_usage")
      .select("usage_count")
      .eq("email", email)
      .eq("usage_date", today)
      .maybeSingle();

    const usedToday = usageRow?.usage_count ?? 0;
    const freeRemaining = Math.max(0, dailyLimit - usedToday);

    await auditLog(admin, null, "otp_verified", "customer", email, {
      free_remaining: freeRemaining,
    });

    return jsonResponse({
      success: true,
      session_token: sessionToken,
      free_remaining: freeRemaining,
      daily_limit: dailyLimit,
    });
  } catch (e) {
    console.error("transcription-verify-otp error:", e);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});
