// supabase/functions/secure-upload-otp-verify/index.ts
//
// Verifies a 6-digit OTP issued by secure-upload-otp-send. On success returns
// a one-time verificationToken (32-byte hex) that the client must include
// when calling upload-start. The token's hash is stored on the OTP row with
// a 30-minute expiry; upload-start validates against that.
//
// Request body: { otpId: string, code: string }
//
// Response on success:
//   { success: true, verificationToken, expiresInSeconds }
//
// On failure: 400 with { success: false, error } — generic enough to not
// leak whether the otpId is valid vs the code is wrong, but the user sees
// a useful message ("Code is incorrect or expired").

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VERIFICATION_TOKEN_EXPIRY_MINUTES = 30;
const MAX_ATTEMPTS = 5;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const otpId = String(body.otpId || "");
    const code = String(body.code || "").trim();

    if (!otpId || !/^[0-9a-f-]{36}$/i.test(otpId)) {
      return jsonResponse(400, { success: false, error: "Code is incorrect or expired" });
    }
    if (!/^\d{6}$/.test(code)) {
      return jsonResponse(400, { success: false, error: "Enter the 6-digit code" });
    }

    const { data: row } = await supabaseAdmin
      .from("secure_upload_otps")
      .select(
        "id, contact, channel, code_hash, attempts, expires_at, verified_at",
      )
      .eq("id", otpId)
      .maybeSingle();

    if (!row) {
      return jsonResponse(400, { success: false, error: "Code is incorrect or expired" });
    }

    // Already verified
    if (row.verified_at) {
      return jsonResponse(400, {
        success: false,
        error: "This code has already been used. Please request a new one.",
      });
    }

    // Expired
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return jsonResponse(400, { success: false, error: "Code has expired. Please request a new one." });
    }

    // Too many attempts
    if (row.attempts >= MAX_ATTEMPTS) {
      return jsonResponse(400, {
        success: false,
        error: "Too many incorrect attempts. Please request a new code.",
      });
    }

    // Compare hash
    const codeHash = await sha256(code);
    if (codeHash !== row.code_hash) {
      // Increment attempt counter (best-effort)
      await supabaseAdmin
        .from("secure_upload_otps")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      const remaining = MAX_ATTEMPTS - (row.attempts + 1);
      return jsonResponse(400, {
        success: false,
        error:
          remaining > 0
            ? `Code is incorrect. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
            : "Too many incorrect attempts. Please request a new code.",
      });
    }

    // Success — mint a verification token
    const verificationToken = generateVerificationToken();
    const tokenHash = await sha256(verificationToken);
    const verificationExpires = new Date(
      Date.now() + VERIFICATION_TOKEN_EXPIRY_MINUTES * 60 * 1000,
    ).toISOString();

    const { error: updateErr } = await supabaseAdmin
      .from("secure_upload_otps")
      .update({
        verified_at: new Date().toISOString(),
        verification_token_hash: tokenHash,
        verification_expires_at: verificationExpires,
        attempts: row.attempts + 1,
      })
      .eq("id", row.id);

    if (updateErr) {
      console.error("OTP verification update failed:", updateErr);
      throw new Error("Verification failed");
    }

    console.log(
      `OTP verified: ${row.channel}=${row.contact} otpId=${row.id}`,
    );

    return jsonResponse(200, {
      success: true,
      verificationToken,
      contact: row.contact,
      channel: row.channel,
      expiresInSeconds: VERIFICATION_TOKEN_EXPIRY_MINUTES * 60,
    });
  } catch (err: unknown) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error("secure-upload-otp-verify error:", msg);
    return jsonResponse(500, { success: false, error: "Verification failed" });
  }
});

function generateVerificationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
