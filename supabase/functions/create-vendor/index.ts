import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const {
      full_name,
      email,
      phone,
      vendor_type,
      status,
      country,
      province_state,
      city,
      language_pairs,
      notes,
    } = body;

    // Validate required fields
    if (!full_name || !String(full_name).trim()) {
      return new Response(
        JSON.stringify({ success: false, error: "Full name is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!email || !String(email).trim()) {
      return new Response(
        JSON.stringify({ success: false, error: "Email is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    console.log(
      `➕ create-vendor: name="${full_name}", email="${normalizedEmail}"`
    );

    // Check email uniqueness
    const { data: existing } = await supabase
      .from("vendors")
      .select("id, full_name, email, status")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "A vendor with this email already exists",
          existing_vendor: {
            id: existing.id,
            full_name: existing.full_name,
            email: existing.email,
            status: existing.status,
          },
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Build vendor record
    const now = new Date().toISOString();
    const vendorRecord: Record<string, unknown> = {
      full_name: String(full_name).trim(),
      email: normalizedEmail,
      status: status || "active",
      created_at: now,
      updated_at: now,
    };

    if (phone && String(phone).trim()) vendorRecord.phone = String(phone).trim();
    if (vendor_type) vendorRecord.vendor_type = vendor_type;
    if (country) vendorRecord.country = country;
    if (province_state && String(province_state).trim())
      vendorRecord.province_state = String(province_state).trim();
    if (city && String(city).trim()) vendorRecord.city = String(city).trim();
    if (notes && String(notes).trim()) vendorRecord.notes = String(notes).trim();

    // Insert vendor
    const { data: newVendor, error: insertError } = await supabase
      .from("vendors")
      .insert(vendorRecord)
      .select("id, full_name, email, status, vendor_type, country")
      .single();

    if (insertError) {
      console.error("create-vendor insert error:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Insert language pairs if provided
    let languagePairsInserted = 0;
    if (Array.isArray(language_pairs) && language_pairs.length > 0) {
      const pairsToInsert = language_pairs
        .filter(
          (lp: { source_language?: string; target_language?: string }) =>
            lp.source_language && lp.target_language
        )
        .map((lp: { source_language: string; target_language: string }) => ({
          vendor_id: newVendor.id,
          source_language: lp.source_language,
          target_language: lp.target_language,
          is_active: true,
        }));

      if (pairsToInsert.length > 0) {
        const { error: lpError } = await supabase
          .from("vendor_language_pairs")
          .insert(pairsToInsert);

        if (lpError) {
          console.error("create-vendor language pairs error:", lpError);
          // Non-fatal — vendor was already created
        } else {
          languagePairsInserted = pairsToInsert.length;
        }
      }
    }

    console.log(
      `✅ create-vendor: id=${newVendor.id}, language_pairs=${languagePairsInserted}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        vendor: newVendor,
        language_pairs_inserted: languagePairsInserted,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("create-vendor error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
