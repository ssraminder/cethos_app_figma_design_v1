import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_FIELDS = new Set([
  "full_name",
  "phone",
  "country",
  "province_state",
  "city",
  "vendor_type",
  "years_experience",
  "availability_status",
  "status",
  "preferred_rate_currency",
  "tax_id",
  "tax_rate",
  "minimum_rate",
  "native_languages",
  "certifications",
  "specializations",
  "notes",
]);

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
    const { vendor_id, updates } = body;

    if (!vendor_id) {
      return new Response(
        JSON.stringify({ success: false, error: "vendor_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!updates || typeof updates !== "object") {
      return new Response(
        JSON.stringify({ success: false, error: "updates object is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `✏️ vendor-update-profile: vendor=${vendor_id}, fields=${Object.keys(updates).join(", ")}`
    );

    // Filter to allowed fields only
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (ALLOWED_FIELDS.has(key)) {
        sanitized[key] = value === "" ? null : value;
      }
    }

    if (Object.keys(sanitized).length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No valid fields to update" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse numeric fields
    if (sanitized.years_experience != null) {
      sanitized.years_experience = parseInt(
        String(sanitized.years_experience),
        10
      );
      if (isNaN(sanitized.years_experience as number))
        sanitized.years_experience = null;
    }
    if (sanitized.tax_rate != null) {
      sanitized.tax_rate = parseFloat(String(sanitized.tax_rate));
      if (isNaN(sanitized.tax_rate as number)) sanitized.tax_rate = null;
    }
    if (sanitized.minimum_rate != null) {
      sanitized.minimum_rate = parseFloat(String(sanitized.minimum_rate));
      if (isNaN(sanitized.minimum_rate as number)) sanitized.minimum_rate = null;
    }

    sanitized.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("vendors")
      .update(sanitized)
      .eq("id", vendor_id)
      .select()
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: { vendor: data } }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("vendor-update-profile error:", err);
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
