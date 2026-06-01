// ============================================================================
// get-customer-quote-detail
// ----------------------------------------------------------------------------
// Returns a single quote scoped to the calling customer for the customer
// portal Quote detail page (client/pages/customer/CustomerQuoteDetail.tsx).
//
// Inputs (query string):
//   quote_id     UUID — required
//   customer_id  UUID — required; must match quotes.customer_id (RLS-equivalent
//                       check via service-role client)
//
// Output:
//   { success: true, data: { ...flat quote, source_language, target_language,
//                            intended_use, country_of_issue, delivery_method,
//                            total_amount, valid_until, stripe_session_id, ... } }
//
// Reconstructed 2026-06-01 after bundle-loss (function was ACTIVE in metadata
// but 404 NOT_FOUND from the gateway; the source had never been committed).
// Mirrors get-customer-order-detail's shape: service-role client + ownership
// check on customer_id, language resolution via in() lookup, flat response.
// Deploy with --no-verify-jwt (called from customer portal with anon key).
// ============================================================================

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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    const quoteId = url.searchParams.get("quote_id");
    const customerId = url.searchParams.get("customer_id");

    if (!quoteId || !customerId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "quote_id and customer_id are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `get-customer-quote-detail: quote=${quoteId}, customer=${customerId}`,
    );

    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .eq("customer_id", customerId)
      .is("deleted_at", null)
      .maybeSingle();

    if (quoteError) {
      console.error("Quote query error:", quoteError);
      return new Response(
        JSON.stringify({ success: false, error: quoteError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!quote) {
      return new Response(
        JSON.stringify({ success: false, error: "Quote not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Resolve language names (target may fall back to free-text override).
    let sourceLanguageName: string | null = null;
    let targetLanguageName: string | null = quote.target_language_other ?? null;

    const langIds = [quote.source_language_id, quote.target_language_id].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    if (langIds.length > 0) {
      const { data: languages } = await supabase
        .from("languages")
        .select("id, name")
        .in("id", langIds);
      const map = new Map<string, string>(
        ((languages ?? []) as Array<{ id: string; name: string }>).map((l) => [
          l.id,
          l.name,
        ]),
      );
      if (quote.source_language_id) {
        sourceLanguageName = map.get(quote.source_language_id) ?? null;
      }
      if (quote.target_language_id) {
        targetLanguageName =
          map.get(quote.target_language_id) ?? targetLanguageName;
      }
    }

    // Resolve intended use name.
    let intendedUseName: string | null = null;
    if (quote.intended_use_id) {
      const { data: use } = await supabase
        .from("intended_uses")
        .select("id, name")
        .eq("id", quote.intended_use_id)
        .maybeSingle();
      intendedUseName = (use as any)?.name ?? null;
    }

    // Resolve delivery_method: prefer the physical option name when one is
    // chosen; otherwise summarise digital_delivery_options; otherwise null.
    let deliveryMethod: string | null = null;
    if (quote.physical_delivery_option_id) {
      const { data: phys } = await supabase
        .from("delivery_options")
        .select("name")
        .eq("id", quote.physical_delivery_option_id)
        .maybeSingle();
      deliveryMethod = (phys as any)?.name ?? null;
    }
    if (
      !deliveryMethod &&
      Array.isArray(quote.digital_delivery_options) &&
      quote.digital_delivery_options.length > 0
    ) {
      deliveryMethod = "Online Portal";
    }

    const responseData = {
      ...quote,
      // Frontend (CustomerQuoteDetail.tsx) expects these flattened/aliased
      // fields. Keep the originals too so future surfaces can read them.
      source_language: sourceLanguageName,
      target_language: targetLanguageName,
      intended_use: intendedUseName,
      delivery_method: deliveryMethod,
      total_amount: Number(quote.total ?? 0),
      valid_until: quote.expires_at ?? null,
      stripe_session_id: quote.stripe_checkout_session_id ?? null,
    };

    console.log(
      `get-customer-quote-detail: ok quote=${quote.quote_number} customer=${customerId}`,
    );

    return new Response(
      JSON.stringify({ success: true, data: responseData }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("get-customer-quote-detail error:", error?.message || error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
