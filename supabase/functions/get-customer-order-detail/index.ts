import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const url = new URL(req.url);
    const orderId = url.searchParams.get("order_id");
    const customerId = url.searchParams.get("customer_id");

    if (!orderId || !customerId) {
      return new Response(
        JSON.stringify({ success: false, error: "order_id and customer_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📦 get-customer-order-detail: order=${orderId}, customer=${customerId}`);

    // Fetch order with quote join for language and intended use data
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(`
        *,
        quotes (
          id,
          quote_number,
          source_language_id,
          target_language_id,
          intended_use_id,
          country_of_issue,
          certification_type,
          special_instructions,
          document_count
        )
      `)
      .eq("id", orderId)
      .eq("customer_id", customerId)
      .single();

    if (orderError || !order) {
      console.error("Order query error:", orderError);
      return new Response(
        JSON.stringify({ success: false, error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve language names
    const quote = order.quotes as any;
    let sourceLanguage = null;
    let targetLanguage = null;
    let intendedUse = null;

    if (quote) {
      const langIds = [quote.source_language_id, quote.target_language_id].filter(Boolean);
      if (langIds.length > 0) {
        const { data: languages } = await supabase
          .from("languages")
          .select("id, name, code")
          .in("id", langIds);

        if (languages) {
          sourceLanguage = languages.find((l: any) => l.id === quote.source_language_id) || null;
          targetLanguage = languages.find((l: any) => l.id === quote.target_language_id) || null;
        }
      }

      // Resolve intended use name
      if (quote.intended_use_id) {
        const { data: use } = await supabase
          .from("intended_uses")
          .select("id, name")
          .eq("id", quote.intended_use_id)
          .single();

        intendedUse = use || null;
      }
    }

    // Format response
    const responseData = {
      ...order,
      // Flatten quote details for easier frontend access
      quote_number: quote?.quote_number || null,
      source_language: sourceLanguage ? sourceLanguage.name : null,
      target_language: targetLanguage ? targetLanguage.name : null,
      intended_use: intendedUse ? intendedUse.name : null,
      country_of_issue: quote?.country_of_issue || null,
      certification_type: quote?.certification_type || null,
      special_instructions: quote?.special_instructions || null,
      document_count: quote?.document_count || null,
    };

    // Remove nested quotes object to keep response flat
    delete responseData.quotes;

    console.log(`✅ Returning order ${order.order_number} for customer ${customerId}`);

    return new Response(
      JSON.stringify({ success: true, data: responseData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("❌ get-customer-order-detail error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
