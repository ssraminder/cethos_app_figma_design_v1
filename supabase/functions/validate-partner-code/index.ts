// ============================================================================
// validate-partner-code v1.2
// Validates a partner code and returns partner data for the branded flow
// Date: February 16, 2026
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { code } = body;

    if (!code || typeof code !== "string") {
      return jsonResponse({ valid: false, error: "Missing partner code" }, 400);
    }

    // Fetch partner by code (case-insensitive)
    const { data: partner, error: partnerError } = await supabaseAdmin
      .from("partners")
      .select(`
        id, code, name, customer_rate,
        custom_logo_url, custom_welcome_message, is_active,
        contact_email, contact_phone,
        business_address_line1, business_city, business_province, business_postal_code
      `)
      .ilike("code", code)
      .eq("is_active", true)
      .maybeSingle();

    if (partnerError) {
      console.error("Error fetching partner:", partnerError);
      return jsonResponse({ valid: false, error: "Database error" }, 500);
    }

    if (!partner) {
      return jsonResponse({ valid: false, error: "Invalid partner code" });
    }

    // Determine customer rate (use partner rate or fallback to default)
    const customerRate = partner.customer_rate || 85.0;

    // Check if partner has a pickup location
    const { data: pickupLocations } = await supabaseAdmin
      .from("pickup_locations")
      .select("id")
      .eq("partner_id", partner.id)
      .eq("is_active", true)
      .limit(1);

    const hasPickupLocation = (pickupLocations?.length || 0) > 0;

    return jsonResponse({
      valid: true,
      partner_id: partner.id,
      customer_rate: customerRate,
      name: partner.name,
      logo_url: partner.custom_logo_url || null,
      welcome_message: partner.custom_welcome_message || null,
      has_pickup_location: hasPickupLocation,
      contact_email: partner.contact_email || null,
      contact_phone: partner.contact_phone || null,
      business_address_line1: partner.business_address_line1 || null,
      business_city: partner.business_city || null,
      business_province: partner.business_province || null,
      business_postal_code: partner.business_postal_code || null,
    });
  } catch (err) {
    console.error("validate-partner-code error:", err);
    return jsonResponse(
      { valid: false, error: "Internal server error" },
      500,
    );
  }
});
