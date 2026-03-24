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
    const { vendor_id, action } = body;

    if (!vendor_id || !action) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "vendor_id and action are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `💰 update-vendor-rates: vendor=${vendor_id}, action=${action}`
    );

    if (action === "add") {
      const {
        service_id,
        language_pair_id,
        calculation_unit,
        rate,
        currency,
        minimum_charge,
        added_by,
      } = body;

      if (!service_id || !calculation_unit || rate == null || !currency) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "service_id, calculation_unit, rate, and currency are required for add",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Try to compute rate_cad via exchange rate
      let rateCad: number | null = null;
      if (currency !== "CAD") {
        const { data: currencyData } = await supabase
          .from("currencies")
          .select("exchange_rate_to_cad")
          .eq("code", currency)
          .maybeSingle();
        if (currencyData?.exchange_rate_to_cad) {
          rateCad = parseFloat(rate) * currencyData.exchange_rate_to_cad;
        }
      } else {
        rateCad = parseFloat(rate);
      }

      const { data, error } = await supabase
        .from("vendor_rates")
        .insert({
          vendor_id,
          service_id,
          language_pair_id: language_pair_id || null,
          calculation_unit,
          rate: parseFloat(rate),
          currency,
          rate_cad: rateCad,
          minimum_charge: minimum_charge ? parseFloat(minimum_charge) : null,
          source: "admin",
          added_by: added_by ?? "admin",
          is_active: true,
        })
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
        JSON.stringify({ success: true, data: { rate: data } }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "update") {
      const { rate_id, rate, currency, calculation_unit, minimum_charge, language_pair_id } = body;

      if (!rate_id) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "rate_id is required for update",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const updates: Record<string, unknown> = {};
      if (rate != null) updates.rate = parseFloat(rate);
      if (currency) updates.currency = currency;
      if (calculation_unit) updates.calculation_unit = calculation_unit;
      if (language_pair_id !== undefined) updates.language_pair_id = language_pair_id || null;
      if (minimum_charge !== undefined)
        updates.minimum_charge = minimum_charge
          ? parseFloat(minimum_charge)
          : null;

      // Recompute rate_cad if rate or currency changed
      const effectiveCurrency = currency ?? undefined;
      const effectiveRate = rate != null ? parseFloat(rate) : undefined;

      if (effectiveCurrency || effectiveRate != null) {
        // Fetch current row to get the other value if only one changed
        const { data: currentRate } = await supabase
          .from("vendor_rates")
          .select("rate, currency")
          .eq("id", rate_id)
          .single();

        const finalCurrency = effectiveCurrency ?? currentRate?.currency;
        const finalRate = effectiveRate ?? currentRate?.rate;

        if (finalCurrency === "CAD") {
          updates.rate_cad = finalRate;
        } else if (finalCurrency && finalRate != null) {
          const { data: currencyData } = await supabase
            .from("currencies")
            .select("exchange_rate_to_cad")
            .eq("code", finalCurrency)
            .maybeSingle();
          updates.rate_cad = currencyData?.exchange_rate_to_cad
            ? finalRate * currencyData.exchange_rate_to_cad
            : null;
        }
      }

      const { data, error } = await supabase
        .from("vendor_rates")
        .update(updates)
        .eq("id", rate_id)
        .eq("vendor_id", vendor_id)
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
        JSON.stringify({ success: true, data: { rate: data } }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "deactivate") {
      const { rate_id } = body;

      if (!rate_id) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "rate_id is required for deactivate",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data, error } = await supabase
        .from("vendor_rates")
        .update({ is_active: false })
        .eq("id", rate_id)
        .eq("vendor_id", vendor_id)
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
        JSON.stringify({ success: true, data: { rate: data } }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "activate") {
      const { rate_id } = body;

      if (!rate_id) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "rate_id is required for activate",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data, error } = await supabase
        .from("vendor_rates")
        .update({ is_active: true })
        .eq("id", rate_id)
        .eq("vendor_id", vendor_id)
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
        JSON.stringify({ success: true, data: { rate: data } }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: `Unknown action: ${action}. Valid actions: add, update, deactivate, activate`,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("update-vendor-rates error:", err);
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
