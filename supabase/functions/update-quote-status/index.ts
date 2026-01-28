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
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const quoteId = url.searchParams.get("quote_id");
    const customerId = url.searchParams.get("customer_id");
    const newStatus = url.searchParams.get("status");

    if (!quoteId || !customerId || !newStatus) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Missing required parameters: quote_id, customer_id, and status",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Valid status values for customer actions
    const validStatuses = ["declined", "quote_ready", "pending_payment"];
    if (!validStatuses.includes(newStatus)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify the quote belongs to the customer
    const { data: quote, error: verifyError } = await supabase
      .from("quotes")
      .select("id, customer_id, status")
      .eq("id", quoteId)
      .eq("customer_id", customerId)
      .is("deleted_at", null)
      .single();

    if (verifyError || !quote) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Quote not found or access denied",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Update the quote status
    const { data: updatedQuote, error: updateError } = await supabase
      .from("quotes")
      .update({ status: newStatus })
      .eq("id", quoteId)
      .eq("customer_id", customerId)
      .select()
      .single();

    if (updateError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to update quote status",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: updatedQuote.id,
          status: updatedQuote.status,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error updating quote status:", error);
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
