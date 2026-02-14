// ============================================================================
// verify-customer-login-otp v1.0
// Validates magic link token and creates customer session
// Despite the "otp" name, this validates magic link tokens
// (Named to match existing frontend calls in Login.tsx)
// Date: February 14, 2026
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// SHA-256 hash
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Generate a session token for the customer auth context
function generateSessionToken(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )!;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { token } = body;

    if (!token) {
      throw new Error("Token is required");
    }

    console.log("Verifying magic link token...");

    // 1. Hash the provided token
    const tokenHash = await hashToken(token);

    // 2. Look up session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("customer_sessions")
      .select("id, customer_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .single();

    if (sessionError || !session) {
      console.log("Invalid or expired token");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid or expired login link. Please request a new one.",
        }),
        {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    // 3. Check if already used
    if (session.used_at) {
      console.log("Token already used");
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "This login link has already been used. Please request a new one.",
        }),
        {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    // 4. Check expiry
    if (new Date(session.expires_at) < new Date()) {
      console.log("Token expired");
      return new Response(
        JSON.stringify({
          success: false,
          error: "This login link has expired. Please request a new one.",
        }),
        {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    // 5. Mark token as used
    await supabaseAdmin
      .from("customer_sessions")
      .update({ used_at: new Date().toISOString() })
      .eq("id", session.id);

    // 6. Fetch customer data
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, email, full_name, phone, customer_type, company_name")
      .eq("id", session.customer_id)
      .single();

    if (customerError || !customer) {
      throw new Error("Customer not found");
    }

    // 7. Update last_login_at
    await supabaseAdmin
      .from("customers")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", customer.id);

    // 8. Generate a session token for the frontend
    const sessionToken = generateSessionToken();
    const sessionTokenHash = await hashToken(sessionToken);

    // Store this as a persistent session (24 hours)
    const sessionExpiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    ).toISOString();

    await supabaseAdmin.from("customer_sessions").insert({
      customer_id: customer.id,
      token_hash: sessionTokenHash,
      expires_at: sessionExpiresAt,
      ip_address: req.headers.get("x-forwarded-for") || null,
      user_agent: req.headers.get("user-agent") || null,
    });

    console.log(`Customer verified: ${customer.email}`);

    return new Response(
      JSON.stringify({
        success: true,
        session: {
          token: sessionToken,
          expires_at: sessionExpiresAt,
        },
        customer: {
          id: customer.id,
          email: customer.email,
          full_name: customer.full_name,
          phone: customer.phone,
          customer_type: customer.customer_type,
          company_name: customer.company_name,
        },
      }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("verify-customer-login-otp error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
