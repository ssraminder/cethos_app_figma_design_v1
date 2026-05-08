// supabase/functions/recalculate-quote-pricing/index.ts
//
// Thin dispatcher around the two DB recalc paths:
//
//   - recalculate_quote_from_groups(p_quote_id)
//       Canonical billing path. Sums quote_document_groups; runs the
//       per-group page-assignment math via recalculate_document_group;
//       applies adjustments, rush, delivery, tax. Used whenever the
//       quote has rows in quote_document_groups.
//
//   - recalculate_quote_totals(p_quote_id)
//       Legacy path that sums ai_analysis_results (filtered
//       deleted_at IS NULL). Used for older quotes that never moved
//       to the groups model.
//
// The dispatcher picks based on the existence of group rows so callers
// can stay agnostic to which storage path the quote uses.
//
// Body: { quoteId: string }
// Returns: full quote pricing fields + calculated_totals JSONB.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
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

    // Decide path: groups when present, analysis otherwise.
    const { count: groupCount, error: countError } = await supabaseAdmin
      .from("quote_document_groups")
      .select("id", { count: "exact", head: true })
      .eq("quote_id", quoteId);

    if (countError) {
      console.error("Error counting quote_document_groups:", countError);
      return new Response(
        JSON.stringify({
          error: "Failed to inspect document groups: " + countError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const useGroups = (groupCount ?? 0) > 0;
    const rpcName = useGroups
      ? "recalculate_quote_from_groups"
      : "recalculate_quote_totals";

    const { error: calcError } = await supabaseAdmin.rpc(rpcName, {
      p_quote_id: quoteId,
    });

    if (calcError) {
      console.error(`Error in ${rpcName}:`, calcError);
      return new Response(
        JSON.stringify({
          error: `Failed to recalculate pricing (${rpcName}): ${calcError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Return the fresh pricing fields after the recalc has committed.
    const { data: quote, error: fetchError } = await supabaseAdmin
      .from("quotes")
      .select(
        "subtotal, certification_total, rush_fee, delivery_fee, tax_rate, tax_amount, total, is_rush, surcharge_total, discount_total, calculated_totals",
      )
      .eq("id", quoteId)
      .single();

    if (fetchError || !quote) {
      console.error("Error fetching updated quote:", fetchError);
      return new Response(
        JSON.stringify({
          error:
            "Failed to fetch updated quote: " +
            (fetchError?.message || "Not found"),
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const response = {
      path: rpcName,
      group_count: groupCount ?? 0,
      subtotal: quote.subtotal,
      certification_total: quote.certification_total,
      rush_fee: quote.rush_fee,
      delivery_fee: quote.delivery_fee,
      tax_rate: quote.tax_rate,
      tax_amount: quote.tax_amount,
      total: quote.total,
      is_rush: quote.is_rush,
      surcharge_total: quote.surcharge_total,
      discount_total: quote.discount_total,
      ...(quote.calculated_totals || {}),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in recalculate-quote-pricing:", error);
    return new Response(
      JSON.stringify({
        error: error?.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
