import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PricingData {
  billablePages: number;
  sourceLanguageId: string;
  targetLanguageId: string;
  complexity: "easy" | "medium" | "hard";
  certificationTypeIds: string[];
  isRush: boolean;
  deliveryOptionId?: string;
}

interface ManualOverride {
  translationTotal?: number;
  certificationTotal?: number;
  rushFee?: number;
  deliveryFee?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      quoteId,
      staffId,
      pricingData,
      manualOverride,
      useAutoCalculation = true,
    }: {
      quoteId: string;
      staffId: string;
      pricingData?: PricingData;
      manualOverride?: ManualOverride;
      useAutoCalculation?: boolean;
    } = await req.json();

    if (!quoteId || !staffId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: quoteId, staffId",
        }),
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

    // 1. Verify quote ownership
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from("quotes")
      .select("id, created_by_staff_id, is_manual_quote, is_rush, delivery_fee")
      .eq("id", quoteId)
      .single();

    if (quoteError || !quote) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Quote not found",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2. Get tax rate from settings
    const { data: taxRateSetting } = await supabaseAdmin
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "tax_rate_default")
      .single();

    const taxRate = taxRateSetting?.setting_value
      ? parseFloat(taxRateSetting.setting_value)
      : 0.05;

    let calculatedTotals: any;

    // 3. Calculate pricing based on mode
    if (useAutoCalculation && !manualOverride) {
      // Use the database function to recalculate from ai_analysis_results
      console.log(`🧮 Using auto-calculation for quote: ${quoteId}`);

      const { error: calcError } = await supabaseAdmin.rpc(
        "recalculate_quote_totals",
        {
          p_quote_id: quoteId,
        },
      );

      if (calcError) {
        console.error("Error in recalculate_quote_totals:", calcError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to calculate pricing: " + calcError.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Fetch the updated totals
      const { data: updatedQuote } = await supabaseAdmin
        .from("quotes")
        .select("calculated_totals")
        .eq("id", quoteId)
        .single();

      calculatedTotals = updatedQuote?.calculated_totals || {};
    } else {
      // Manual override or custom calculation
      console.log(`✍️ Using manual override for quote: ${quoteId}`);

      let translationTotal = 0;
      let certificationTotal = 0;
      let deliveryFee = quote.delivery_fee || 0;

      if (manualOverride) {
        // Use override values
        translationTotal = manualOverride.translationTotal || 0;
        certificationTotal = manualOverride.certificationTotal || 0;
        deliveryFee = manualOverride.deliveryFee ?? deliveryFee;
      } else if (pricingData) {
        // Calculate from pricing data
        // Get language pricing tier
        const { data: language } = await supabaseAdmin
          .from("languages")
          .select("pricing_tier")
          .eq("id", pricingData.targetLanguageId)
          .single();

        const pricingTier = language?.pricing_tier || "tier_1";

        // Get base rate from settings
        const { data: baseRateSetting } = await supabaseAdmin
          .from("app_settings")
          .select("setting_value")
          .eq("setting_key", `base_rate_${pricingTier}`)
          .single();

        const baseRate = baseRateSetting?.setting_value
          ? parseFloat(baseRateSetting.setting_value)
          : 65.0;

        // Get complexity multiplier
        const complexityMultipliers: Record<string, number> = {
          easy: 0.8,
          medium: 1.0,
          hard: 1.5,
        };
        const complexityMultiplier =
          complexityMultipliers[pricingData.complexity] || 1.0;

        // Calculate translation total
        translationTotal =
          pricingData.billablePages * baseRate * complexityMultiplier;

        // Calculate certification total
        if (pricingData.certificationTypeIds.length > 0) {
          const { data: certTypes } = await supabaseAdmin
            .from("certification_types")
            .select("id, price")
            .in("id", pricingData.certificationTypeIds);

          certificationTotal = (certTypes || []).reduce(
            (sum, cert) => sum + (cert.price || 0),
            0,
          );
        }

        // Get delivery fee if provided
        if (pricingData.deliveryOptionId) {
          const { data: deliveryOption } = await supabaseAdmin
            .from("delivery_options")
            .select("price")
            .eq("id", pricingData.deliveryOptionId)
            .single();

          deliveryFee = deliveryOption?.price || 0;
        }
      }

      // Calculate subtotal
      const subtotal = translationTotal + certificationTotal;

      // Apply rush fee if applicable (30% surcharge)
      const rushFee =
        manualOverride?.rushFee ??
        (pricingData?.isRush ? Math.round(subtotal * 0.3 * 100) / 100 : 0);

      // Calculate tax
      const taxAmount =
        Math.round((subtotal + rushFee + deliveryFee) * taxRate * 100) / 100;

      // Calculate total
      const total = subtotal + rushFee + deliveryFee + taxAmount;

      calculatedTotals = {
        translation_total: translationTotal,
        certification_total: certificationTotal,
        subtotal: subtotal,
        rush_fee: rushFee,
        delivery_fee: deliveryFee,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total: total,
        manual_override: !!manualOverride,
      };

      // Update quote with calculated values
      const { error: updateError } = await supabaseAdmin
        .from("quotes")
        .update({
          subtotal: subtotal,
          certification_total: certificationTotal,
          rush_fee: rushFee,
          delivery_fee: deliveryFee,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total: total,
          calculated_totals: calculatedTotals,
          is_rush: pricingData?.isRush ?? quote.is_rush,
          updated_at: new Date().toISOString(),
        })
        .eq("id", quoteId);

      if (updateError) {
        console.error("Error updating quote:", updateError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to update quote: " + updateError.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // 4. Log staff activity
    await supabaseAdmin.from("staff_activity_log").insert({
      staff_id: staffId,
      action: "calculate_quote_pricing",
      details: {
        quote_id: quoteId,
        mode: useAutoCalculation ? "auto" : "manual",
        has_override: !!manualOverride,
        totals: calculatedTotals,
      },
      created_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        ...calculatedTotals,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in calculate-manual-quote-pricing:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
