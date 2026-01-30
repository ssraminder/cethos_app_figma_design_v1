import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { quoteId, triggerReasons, priority } = await req.json();

    if (!quoteId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required field: quoteId",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`📋 [CREATE-HITL-REVIEW] Creating HITL review for quote: ${quoteId}`);
    console.log(`  - Trigger reasons: ${triggerReasons?.join(", ") || "none"}`);
    console.log(`  - Priority: ${priority || "default"}`);

    // Create Supabase client with service role key (bypasses RLS)
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

    const now = new Date().toISOString();

    // 1. Check if quote exists
    const { data: quote, error: quoteFetchError } = await supabaseAdmin
      .from("quotes")
      .select("id, quote_number, status, processing_status, customer_id")
      .eq("id", quoteId)
      .single();

    if (quoteFetchError || !quote) {
      console.error("❌ [CREATE-HITL-REVIEW] Quote not found:", quoteFetchError);
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

    // 2. Check if a pending HITL review already exists for this quote
    const { data: existingReview } = await supabaseAdmin
      .from("hitl_reviews")
      .select("id, status")
      .eq("quote_id", quoteId)
      .in("status", ["pending", "in_progress"])
      .single();

    if (existingReview) {
      console.log(`⏭️ [CREATE-HITL-REVIEW] HITL review already exists: ${existingReview.id}`);
      return new Response(
        JSON.stringify({
          success: true,
          reviewId: existingReview.id,
          message: "HITL review already exists",
          alreadyExists: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 3. Create the HITL review
    const { data: review, error: reviewInsertError } = await supabaseAdmin
      .from("hitl_reviews")
      .insert({
        quote_id: quoteId,
        trigger_reasons: triggerReasons || ["manual_trigger"],
        priority: priority || 3, // Default priority
        status: "pending",
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (reviewInsertError) {
      console.error("❌ [CREATE-HITL-REVIEW] Failed to create review:", reviewInsertError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to create HITL review: " + reviewInsertError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 4. Update quote status to hitl_pending
    const { error: quoteUpdateError } = await supabaseAdmin
      .from("quotes")
      .update({
        status: "hitl_pending",
        processing_status: "hitl_pending",
        updated_at: now,
      })
      .eq("id", quoteId);

    if (quoteUpdateError) {
      console.error("❌ [CREATE-HITL-REVIEW] Failed to update quote status:", quoteUpdateError);
      // Don't fail the operation - review was created successfully
    }

    console.log(`✅ [CREATE-HITL-REVIEW] HITL review created: ${review.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        reviewId: review.id,
        quoteNumber: quote.quote_number,
        message: "HITL review created successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("❌ [CREATE-HITL-REVIEW] Error:", error);

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
