// ============================================================================
// send-customer-login-otp v1.0
// Generates magic link + sends welcome/login email
// Despite the "otp" name, this implements magic link auth
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

const MAGIC_LINK_EXPIRY_MINUTES = 15;
const SITE_URL = Deno.env.get("SITE_URL") || "https://portal.cethos.com";

// Generate a cryptographically secure random token
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// SHA-256 hash
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { email, quoteNumber, submissionDate } = body;

    if (!email) {
      throw new Error("Email is required");
    }

    const normalizedEmail = email.toLowerCase().trim();
    console.log(`Magic link request for: ${normalizedEmail}`);

    // 1. Look up customer
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, email, full_name")
      .eq("email", normalizedEmail)
      .single();

    if (customerError || !customer) {
      console.log(`Customer not found: ${normalizedEmail}`);
      // Return success anyway to prevent email enumeration
      return new Response(
        JSON.stringify({
          success: true,
          message: "If an account exists, a login link has been sent.",
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // 2. Invalidate any existing unused sessions for this customer
    await supabaseAdmin
      .from("customer_sessions")
      .update({ used_at: new Date().toISOString() })
      .eq("customer_id", customer.id)
      .is("used_at", null);

    // 3. Generate token + hash
    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);

    // 4. Store session
    const expiresAt = new Date(
      Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000,
    ).toISOString();

    const { error: sessionError } = await supabaseAdmin
      .from("customer_sessions")
      .insert({
        customer_id: customer.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        ip_address: req.headers.get("x-forwarded-for") || null,
        user_agent: req.headers.get("user-agent") || null,
      });

    if (sessionError) {
      console.error("Failed to create session:", sessionError);
      throw new Error("Failed to create login session");
    }

    // 5. Build magic link URL
    const loginLink = `${SITE_URL}/login/verify?token=${rawToken}`;

    // 6. Send email via Brevo Template #20
    if (BREVO_API_KEY) {
      const emailPayload = {
        to: [
          {
            email: customer.email,
            name: customer.full_name || customer.email,
          },
        ],
        sender: {
          name: "Cethos Translation Services",
          email: "donotreply@cethos.com",
        },
        templateId: 20,
        params: {
          CUSTOMER_NAME: customer.full_name || "there",
          LOGIN_LINK: loginLink,
          QUOTE_NUMBER: quoteNumber || "",
          SUBMISSION_DATE:
            submissionDate ||
            new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            }),
        },
      };

      const emailResponse = await fetch(
        "https://api.brevo.com/v3/smtp/email",
        {
          method: "POST",
          headers: {
            "api-key": BREVO_API_KEY,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(emailPayload),
        },
      );

      const emailResult = await emailResponse.json();

      if (!emailResponse.ok) {
        console.error("Brevo error:", JSON.stringify(emailResult));
        // Don't throw -- session is created, customer can retry
      } else {
        console.log("Magic link email sent:", emailResult.messageId);
      }
    } else {
      console.warn("BREVO_API_KEY not set -- magic link not emailed");
      console.log("Magic link (dev):", loginLink);
    }

    // 7. Update customer tracking
    await supabaseAdmin
      .from("customers")
      .update({ magic_link_sent_at: new Date().toISOString() })
      .eq("id", customer.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "If an account exists, a login link has been sent.",
      }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("send-customer-login-otp error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
