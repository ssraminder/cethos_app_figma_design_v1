import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { quoteId } = await req.json();

    if (!quoteId) {
      return new Response(
        JSON.stringify({ error: "Missing required field: quoteId" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Create Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    // Call the recalculate_quote_totals DB function
    const { error: calcError } = await supabaseAdmin.rpc(
      "recalculate_quote_totals",
      { p_quote_id: quoteId },
    );

    if (calcError) {
      console.error("Error in recalculate_quote_totals:", calcError);
      return new Response(
        JSON.stringify({
          error: "Failed to recalculate pricing: " + calcError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch the updated quote pricing data
    const { data: quote, error: fetchError } = await supabaseAdmin
      .from("quotes")
      .select(
        "subtotal, certification_total, rush_fee, delivery_fee, tax_rate, tax_amount, total, is_rush, calculated_totals",
      )
      .eq("id", quoteId)
      .single();

    if (fetchError || !quote) {
      console.error("Error fetching updated quote:", fetchError);
      return new Response(
        JSON.stringify({
          error: "Failed to fetch updated quote: " + (fetchError?.message || "Not found"),
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Return the complete pricing data
    const response = {
      subtotal: quote.subtotal,
      certification_total: quote.certification_total,
      rush_fee: quote.rush_fee,
      delivery_fee: quote.delivery_fee,
      tax_rate: quote.tax_rate,
      tax_amount: quote.tax_amount,
      total: quote.total,
      is_rush: quote.is_rush,
      ...(quote.calculated_totals || {}),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in recalculate-quote-pricing:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
