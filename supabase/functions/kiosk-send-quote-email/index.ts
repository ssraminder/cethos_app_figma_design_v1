// ============================================================================
// kiosk-send-quote-email
//
// Called at the final step of the kiosk flow (after handback to staff). Emails
// the customer a quote summary with a link to the portal's quote review page
// where they can accept and pay. Thin wrapper that logs the action — the
// actual email is sent via Brevo.
//
// For MVP this emails the existing quote link (per the existing quote
// email pattern). In-person Stripe Checkout on the tablet is Phase 2.
//
// Request headers:  x-kiosk-device-id, x-kiosk-device-secret, x-kiosk-staff-token
// Request body:     { quoteId: string }
// Response:         { success, sent_to, quote_url }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  authenticateDevice,
  getSupabaseAdmin,
  handleOptions,
  jsonResponse,
  KioskAuthError,
  resolveActingStaffId,
} from "../_shared/kiosk-auth.ts";

const SITE_URL = Deno.env.get("SITE_URL") || "https://portal.cethos.com";

serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const supabase = getSupabaseAdmin();
    const device = await authenticateDevice(req, supabase);
    const actingStaffId = await resolveActingStaffId(req, device);

    const { quoteId } = await req.json();
    if (!quoteId) {
      return jsonResponse({ success: false, error: "quoteId required" }, 400);
    }

    const { data: quote, error: quoteErr } = await supabase
      .from("quotes")
      .select(
        "id, quote_number, customer_id, total, kiosk_device_id, customers(id, email, full_name)",
      )
      .eq("id", quoteId)
      .maybeSingle();

    if (quoteErr || !quote) {
      return jsonResponse({ success: false, error: "Quote not found" }, 404);
    }
    if (quote.kiosk_device_id !== device.id) {
      return jsonResponse(
        { success: false, error: "Quote not owned by this device" },
        403,
      );
    }

    const customer = Array.isArray(quote.customers)
      ? quote.customers[0]
      : quote.customers;
    if (!customer?.email) {
      return jsonResponse(
        { success: false, error: "Customer has no email on file" },
        400,
      );
    }

    const quoteUrl = `${SITE_URL}/quote/${quote.id}/review`;

    // Send email via Brevo if configured. Falls back to logging the URL in dev.
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (BREVO_API_KEY) {
      const payload = {
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
        subject: `Your quote ${quote.quote_number} from Cethos`,
        htmlContent: `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="margin:0 0 12px;color:#0f766e">Thanks for visiting Cethos!</h2>
  <p>Hi ${customer.full_name || "there"},</p>
  <p>We've prepared your translation quote <strong>${quote.quote_number}</strong> while you were in our office.
  The total is <strong>$${Number(quote.total || 0).toFixed(2)}</strong>.</p>
  <p style="margin:24px 0;text-align:center">
    <a href="${quoteUrl}" style="display:inline-block;padding:14px 28px;background:#0f766e;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Review &amp; Pay Online</a>
  </p>
  <p style="color:#64748b;font-size:13px">If you have any questions, just reply to this email.</p>
</body></html>`,
      };
      const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        console.error("Brevo error:", errText);
      }
    } else {
      console.warn("BREVO_API_KEY not set — quote email not sent. URL:", quoteUrl);
    }

    await supabase
      .from("staff_activity_log")
      .insert({
        staff_id: actingStaffId,
        activity_type: "kiosk_quote_emailed",
        entity_type: "quote",
        entity_id: quote.id,
        details: {
          quote_number: quote.quote_number,
          sent_to: customer.email,
          kiosk_device_id: device.id,
        },
      })
      .then(() => {}, (err) => console.warn("activity log insert failed:", err));

    return jsonResponse({
      success: true,
      sent_to: customer.email,
      quote_url: quoteUrl,
    });
  } catch (err) {
    if (err instanceof KioskAuthError) {
      return jsonResponse({ success: false, error: err.message }, err.status);
    }
    console.error("kiosk-send-quote-email error:", err);
    return jsonResponse(
      { success: false, error: err instanceof Error ? err.message : "Server error" },
      500,
    );
  }
});
