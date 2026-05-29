// ============================================================================
// send-customer-login-otp v2.0
// ----------------------------------------------------------------------------
// Generates a magic-link customer session and emails it through Brevo.
// Despite the "otp" name, this is magic-link auth, not a numeric code
// (named to match the frontend call site in Login.tsx).
//
// v2.0 (2026-05-28): Migrated email body in-repo. Previously called Brevo
// template ID #20 with merge params; now renders inline HTML using the
// shared `_shared/email-shell.ts`. Single source of truth in git.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  brevoPayload,
  callout,
  ctaButton,
  emailShell,
  esc,
  eyebrow,
  hint,
  lead,
  REPLY,
  strong,
  title,
  type TemplateMeta,
} from "../_shared/email-shell.ts";

const TEMPLATE: TemplateMeta = {
  name: "Customer Login Link",
  version: "2.0",
  updatedAt: "2026-05-28",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAGIC_LINK_EXPIRY_MINUTES = 15;
const SITE_URL = Deno.env.get("SITE_URL") || "https://portal.cethos.com";

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
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildLoginEmailHtml(args: {
  customerName: string;
  loginLink: string;
  quoteNumber?: string;
  submissionDate?: string;
}): string {
  const firstName =
    (args.customerName || "").trim().split(/\s+/)[0] || "there";

  // Optional pretext when the customer was redirected here from a quote
  // submission flow — gives the email continuity with what they just did.
  const quoteContextLine =
    args.quoteNumber && args.submissionDate
      ? `You recently started quote ${strong(esc(args.quoteNumber))} on ${esc(args.submissionDate)}. `
      : args.quoteNumber
        ? `You recently started quote ${strong(esc(args.quoteNumber))}. `
        : "";

  const body = [
    eyebrow("Sign in to Cethos"),
    title("Your Cethos sign-in link"),
    lead(
      `Hi ${esc(firstName)}, click the button below to sign in to your Cethos customer portal. ${quoteContextLine}This link is good for ${MAGIC_LINK_EXPIRY_MINUTES} minutes.`,
    ),
    ctaButton({
      label: "Sign in to Cethos",
      url: args.loginLink,
      variant: "navy",
      align: "full",
    }),
    callout({
      tone: "info",
      title: "Why a link instead of a password?",
      body: `Cethos uses email-based sign-in so you never need to remember a password. Each link works once, then expires — even if someone else later reads this email, they can't use it.`,
    }),
    hint(
      `Didn't request this? You can safely ignore this email — no one signed in. Questions? Reply to this email or contact <a href="mailto:support@cethos.com" style="color:#0E7490;">support@cethos.com</a>.`,
    ),
  ].join("");

  return emailShell(body, {
    replyTo: REPLY.customer,
    template: TEMPLATE,
    preheader: `Your sign-in link for Cethos — expires in ${MAGIC_LINK_EXPIRY_MINUTES} minutes.`,
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { email, quoteNumber, submissionDate } = body;

    if (!email) throw new Error("Email is required");

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

    const loginLink = `${SITE_URL}/login/verify?token=${rawToken}`;

    // 5. Send email via Brevo using inline HTML (v2.0 — no longer using
    // Brevo template #20).
    if (BREVO_API_KEY) {
      const html = buildLoginEmailHtml({
        customerName: customer.full_name || "",
        loginLink,
        quoteNumber: quoteNumber || undefined,
        submissionDate:
          submissionDate ||
          new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
      });

      const payload = brevoPayload({
        to: [
          {
            email: customer.email,
            name: customer.full_name || customer.email,
          },
        ],
        subject: "Your Cethos sign-in link",
        html,
        replyTo: REPLY.customer,
        senderName: "Cethos Translation Services",
        senderEmail: "donotreply@cethos.com",
        tags: ["customer-login-otp"],
      });

      const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const emailResult = await emailResponse.json().catch(() => ({}));

      if (!emailResponse.ok) {
        console.error("Brevo error:", JSON.stringify(emailResult));
        // Don't throw — session is created, customer can retry.
      } else {
        console.log("Magic link email sent:", (emailResult as any)?.messageId);
      }
    } else {
      console.warn("BREVO_API_KEY not set — magic link not emailed");
      console.log("Magic link (dev):", loginLink);
    }

    // 6. Update customer tracking
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
    console.error("send-customer-login-otp error:", (error as Error).message);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
