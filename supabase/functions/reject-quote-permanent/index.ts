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
    const { reviewId, staffId, reason, sendEmail } = await req.json();

    if (!reviewId || !staffId || !reason) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: reviewId, staffId, reason",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

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

    // 1. Get review and quote data
    const { data: review, error: reviewFetchError } = await supabaseAdmin
      .from("hitl_reviews")
      .select("*, quotes(*)")
      .eq("id", reviewId)
      .single();

    if (reviewFetchError || !review) {
      throw new Error("Review not found: " + reviewFetchError?.message);
    }

    // 2. Update HITL review status to rejected
    const { error: reviewUpdateError } = await supabaseAdmin
      .from("hitl_reviews")
      .update({
        status: "rejected",
        completed_at: now,
        completed_by: staffId,
        resolution_notes: reason,
      })
      .eq("id", reviewId);

    if (reviewUpdateError) {
      throw new Error("Failed to update review: " + reviewUpdateError.message);
    }

    // 3. Note: We do NOT update the quote status
    // The quote remains in its current state (e.g., "draft", "details_pending")
    // Permanent rejection is tracked via the HITL review status only
    // This prevents constraint violations since "rejected" is not a valid quote status

    // 4. Log staff activity
    const { error: logError } = await supabaseAdmin
      .from("staff_activity_log")
      .insert({
        staff_id: staffId,
        action_type: "reject_quote_permanent",
        entity_type: "hitl_review",
        entity_id: reviewId,
        details: {
          quote_id: review.quote_id,
          quote_number: review.quotes?.quote_number,
          reason: reason,
          email_sent: sendEmail || false,
        },
      });

    if (logError) {
      console.error("Failed to log activity:", logError);
      // Don't fail the whole operation if logging fails
    }

    // 5. Send email if requested
    if (sendEmail && review.quotes?.customer_id) {
      // Get customer email
      const { data: customer } = await supabaseAdmin
        .from("customers")
        .select("email, full_name")
        .eq("id", review.quotes.customer_id)
        .single();

      if (customer?.email) {
        // Call send-email Edge Function
        const emailResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            },
            body: JSON.stringify({
              templateId: 19, // Quote rejection template
              to: customer.email,
              params: {
                CUSTOMER_NAME: customer.full_name || "Customer",
                QUOTE_NUMBER: review.quotes.quote_number,
                REJECTION_REASON: reason,
                SUPPORT_EMAIL: "support@cethos.com",
              },
            }),
          },
        );

        if (!emailResponse.ok) {
          console.error("Failed to send email:", await emailResponse.text());
          // Don't fail the operation if email fails
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Quote rejected successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in reject-quote-permanent:", error);

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
