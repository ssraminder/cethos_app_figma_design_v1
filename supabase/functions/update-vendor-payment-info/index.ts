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
    const { vendor_id, payment_currency, payment_method, payment_details, invoice_notes } = body;

    if (!vendor_id) {
      return new Response(
        JSON.stringify({ success: false, error: "vendor_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `💳 update-vendor-payment-info: vendor=${vendor_id}, method=${payment_method}`
    );

    // Upsert payment info keyed by vendor_id
    const { data, error } = await supabase
      .from("vendor_payment_info")
      .upsert(
        {
          vendor_id,
          payment_currency: payment_currency || null,
          payment_method: payment_method || null,
          payment_details: payment_details || null,
          invoice_notes: invoice_notes || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "vendor_id" }
      )
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
      JSON.stringify({ success: true, data: { payment_info: data } }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("update-vendor-payment-info error:", err);
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
