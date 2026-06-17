// ============================================================================
// cvp-send-instrument-choice-invitation
//
// Phase 1 of the applicant-choice routing (replaces the immediate
// cvp-send-tests call from the pre-screen path). Generates a single-use
// choice token on cvp_applications, sends a V3-shaped "Choose your
// assessment" invitation email pointing to /choose/{token}.
//
// When the applicant clicks the link they land on the chooser page, which
// calls cvp-record-instrument-choice with their selection. That function
// is what actually dispatches translation tests OR a quiz.
//
// Companion to docs/qms/02-test-or-quiz-routing.md §5.
//
// POST /functions/v1/cvp-send-instrument-choice-invitation
// Body: { applicationId: string, staffId?: uuid }
// Returns: { success, data: { applicationId, token, expiresAt } }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = Deno.env.get("APP_URL") ?? "https://join.cethos.com";
// 10-day TTL — matches translation-test + quiz token TTL
const CHOICE_TTL_MS = 10 * 24 * 60 * 60 * 1000;

interface Body {
  applicationId?: string;
  staffId?: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "invalid_json" }, 400);
  }

  const applicationId = (body.applicationId ?? "").trim();
  if (!applicationId) {
    return jsonResponse({ success: false, error: "applicationId is required" }, 400);
  }

  // Fetch applicant + pending combos so we know what target languages are
  // in play (purely informational for the email — doesn't affect the choice
  // mechanic).
  const { data: appData, error: appErr } = await supabase
    .from("cvp_applications")
    .select("id, email, full_name, application_number, instrument_choice")
    .eq("id", applicationId)
    .maybeSingle();
  if (appErr || !appData) {
    return jsonResponse({ success: false, error: "Application not found." }, 404);
  }
  const app = appData as {
    id: string;
    email: string;
    full_name: string;
    application_number: string;
    instrument_choice: string | null;
  };

  if (app.instrument_choice) {
    return jsonResponse(
      {
        success: false,
        error: "already_chosen",
        message: `Applicant already chose "${app.instrument_choice}". Use staff override on the recruitment detail page to switch.`,
      },
      400,
    );
  }

  // Generate fresh token (UUID) + 10-day expiry. Overwrites any existing
  // token on the row — re-sending the invitation invalidates the old link.
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHOICE_TTL_MS);
  // Use a Postgres-side gen_random_uuid via an UPDATE..RETURNING so we get
  // the value back atomically.
  const { data: tokenRow, error: tokenErr } = await supabase
    .rpc("gen_random_uuid")
    .select();
  // Fallback: if the RPC isn't exposed, generate client-side via crypto.
  let token: string;
  if (tokenErr || !tokenRow) {
    token = crypto.randomUUID();
  } else {
    token = String(tokenRow);
  }

  const { error: updateErr } = await supabase
    .from("cvp_applications")
    .update({
      instrument_choice_token: token,
      instrument_choice_token_expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", applicationId);
  if (updateErr) {
    console.error("Failed to write instrument_choice_token:", updateErr);
    return jsonResponse(
      { success: false, error: "Failed to issue choice token. Please try again." },
      500,
    );
  }

  // Send the invitation email
  const chooseUrl = `${APP_URL.replace(/\/$/, "")}/choose/${token}`;
  const subject = `Your Cethos assessment is ready · ${app.application_number}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; max-width: 640px;">
      <p>Hi ${esc(app.full_name)},</p>
      <p>Your pre-screen for application <strong>${esc(app.application_number)}</strong> has passed. The next step is a competence assessment — and you get to <strong>choose how to demonstrate it</strong>.</p>

      <div style="margin: 20px 0; padding: 16px 18px; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px;">
        <div style="font-weight: 600; color: #0C2340; margin-bottom: 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Two paths — pick the one that suits you</div>
        <ol style="margin: 0; padding-left: 22px; font-size: 14px; line-height: 1.6; color: #111827;">
          <li style="margin-bottom: 8px;"><strong>Translation test</strong> — one or more graded translation samples (60–120 minutes total). Tests applied skill, AI-graded.</li>
          <li><strong>ISO competence quiz</strong> — 40 multiple-choice questions covering the five ISO 17100 §6.1.2 competences (20–30 minutes). Theoretical, deterministic grading.</li>
        </ol>
        <p style="margin: 14px 0 0; font-size: 13px; color: #6B7280;">Either path is sufficient. Click below to view both options side-by-side and choose.</p>
      </div>

      <p style="margin: 24px 0;">
        <a href="${esc(chooseUrl)}" style="display: inline-block; background: #0891B2; color: #fff; text-decoration: none; padding: 11px 22px; border-radius: 6px; font-weight: 600; font-size: 14px;">Choose your assessment</a>
      </p>

      <div style="margin-top: 24px; padding: 14px 16px; background: #FFFBEB; border-left: 3px solid #F59E0B; font-size: 13px; color: #374151;">
        <strong>Heads up:</strong> this link expires in <strong>240 hours</strong>. Once you pick a path, you'll receive a follow-up email with the actual test or quiz links.
      </div>

      <div style="margin-top: 20px; font-size: 13px; color: #6B7280;">
        Need help deciding or have a question? Reply to this email and we'll get back to you.
      </div>
    </div>`;
  const text =
    `Hi ${app.full_name},\n\n` +
    `Your pre-screen for application ${app.application_number} has passed. ` +
    `Choose how you'd like to demonstrate competence:\n\n` +
    `  1. Translation test — 60–120 min, applied skill, AI-graded\n` +
    `  2. ISO competence quiz — 20–30 min, 40 MCQs, deterministic\n\n` +
    `Either path is sufficient. Open: ${chooseUrl}\n\n` +
    `Link expires in 240 hours.\n`;

  await sendMailgunEmail({
    to: { email: app.email, name: app.full_name },
    subject,
    html,
    text,
    respectDoNotContactFor: app.email,
    tags: ["v3-choose-assessment", applicationId],
  });

  return jsonResponse({
    success: true,
    data: {
      applicationId,
      token,
      expiresAt: expiresAt.toISOString(),
      chooseUrl,
    },
  });
});
