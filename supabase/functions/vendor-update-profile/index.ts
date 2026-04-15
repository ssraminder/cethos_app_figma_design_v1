import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface UpdateRequest {
  email?: string;
  phone?: string;
  full_name?: string;
  city?: string;
  country?: string;
  province_state?: string;
  tax_id?: string;
  tax_name?: string;
  tax_rate?: string;
  preferred_rate_currency?: string;
  native_languages?: string[];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate session
    const { data: session, error: sessionErr } = await supabase
      .from("vendor_sessions")
      .select("vendor_id")
      .eq("session_token", token)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (sessionErr || !session) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, phone, full_name, city, country, province_state, tax_id, tax_name, tax_rate, preferred_rate_currency, native_languages } = (await req.json()) as UpdateRequest;

    // Validate email format if provided
    if (email !== undefined) {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return new Response(
          JSON.stringify({ error: "Invalid email address" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check email uniqueness
      const { data: existing } = await supabase
        .from("vendors")
        .select("id")
        .eq("email", trimmed)
        .neq("id", session.vendor_id)
        .single();

      if (existing) {
        return new Response(
          JSON.stringify({ error: "This email is already in use" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Build update payload
    const updates: Record<string, unknown> = {};
    if (email !== undefined) updates.email = email.trim().toLowerCase();
    if (phone !== undefined) updates.phone = phone.trim() || null;
    if (full_name !== undefined) updates.full_name = full_name.trim();
    if (city !== undefined) updates.city = city.trim() || null;
    if (country !== undefined) {
      updates.country = country.trim() || null;
      // When country changes away from Canada, clear province and reset tax fields
      if (country.trim() !== "Canada") {
        updates.province_state = null;
        updates.tax_name = "N/A";
        updates.tax_rate = 0;
      }
    }
    if (province_state !== undefined) updates.province_state = province_state.trim() || null;
    if (tax_name !== undefined) updates.tax_name = tax_name.trim() || null;
    if (tax_id !== undefined) updates.tax_id = tax_id.trim() || null;
    if (tax_rate !== undefined) {
      const rate = tax_rate ? parseFloat(tax_rate) : null;
      if (rate !== null && (rate < 0 || rate > 100)) {
        return new Response(
          JSON.stringify({ error: "Tax rate must be between 0 and 100" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      updates.tax_rate = rate;
    }
    if (preferred_rate_currency !== undefined) updates.preferred_rate_currency = preferred_rate_currency.trim() || "CAD";
    if (native_languages !== undefined) updates.native_languages = native_languages;

    if (Object.keys(updates).length === 0) {
      return new Response(
        JSON.stringify({ error: "No fields to update" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: updateErr } = await supabase
      .from("vendors")
      .update(updates)
      .eq("id", session.vendor_id);

    if (updateErr) {
      console.error("Failed to update vendor:", updateErr);
      return new Response(
        JSON.stringify({ error: "Failed to update profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Also update cvp_translators if exists
    const { data: vendor } = await supabase
      .from("vendors")
      .select("email")
      .eq("id", session.vendor_id)
      .single();

    if (vendor) {
      const translatorUpdates: Record<string, unknown> = {};
      if (email !== undefined) translatorUpdates.email = updates.email;
      if (phone !== undefined) translatorUpdates.phone = updates.phone;
      if (full_name !== undefined) translatorUpdates.full_name = updates.full_name;

      await supabase
        .from("cvp_translators")
        .update(translatorUpdates)
        .eq("email", vendor.email);
    }

    // Fetch updated vendor profile
    const { data: updatedVendor } = await supabase
      .from("vendors")
      .select("id, full_name, email, phone, status, vendor_type, country, province_state, city, availability_status, tax_id, tax_name, tax_rate, preferred_rate_currency, native_languages")
      .eq("id", session.vendor_id)
      .single();

    return new Response(
      JSON.stringify({ success: true, vendor: updatedVendor }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("vendor-update-profile error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
