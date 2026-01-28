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
    const { reviewId, staffId, reason, fileIds } = await req.json();

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
      .select("*, quotes(*, customers(*))")
      .eq("id", reviewId)
      .single();

    if (reviewFetchError || !review) {
      throw new Error("Review not found: " + reviewFetchError?.message);
    }

    // 2. Update quote status to customer_action_awaited
    const { error: quoteUpdateError } = await supabaseAdmin
      .from("quotes")
      .update({
        status: "customer_action_awaited",
        updated_at: now,
      })
      .eq("id", review.quote_id);

    if (quoteUpdateError) {
      throw new Error(
        "Failed to update quote status: " + quoteUpdateError.message,
      );
    }

    // 3. Update HITL review status
    const { error: reviewUpdateError } = await supabaseAdmin
      .from("hitl_reviews")
      .update({
        status: "awaiting_customer",
        resolution_notes: reason,
        updated_at: now,
      })
      .eq("id", reviewId);

    if (reviewUpdateError) {
      throw new Error("Failed to update review: " + reviewUpdateError.message);
    }

    // 4. Log staff activity
    const { error: logError } = await supabaseAdmin
      .from("staff_activity_log")
      .insert({
        staff_id: staffId,
        action_type: "request_better_scan",
        entity_type: "hitl_review",
        entity_id: reviewId,
        details: {
          quote_id: review.quote_id,
          quote_number: review.quotes?.quote_number,
          reason: reason,
          file_ids: fileIds || [],
        },
      });

    if (logError) {
      console.error("Failed to log activity:", logError);
      // Don't fail the whole operation if logging fails
    }

    // 5. Send email to customer requesting better scan
    const customer = review.quotes?.customers;
    if (customer?.email) {
      // Get file names if specified
      let fileNames = "";
      if (fileIds && fileIds.length > 0) {
        const { data: files } = await supabaseAdmin
          .from("quote_files")
          .select("original_filename")
          .in("id", fileIds);

        if (files && files.length > 0) {
          fileNames = files.map((f) => f.original_filename).join(", ");
        }
      }

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
            templateId: 20, // Better scan request template (you may need to adjust this)
            to: customer.email,
            params: {
              CUSTOMER_NAME: customer.full_name || "Customer",
              QUOTE_NUMBER: review.quotes.quote_number,
              REASON: reason,
              FILE_NAMES: fileNames || "all uploaded files",
              QUOTE_LINK: `${Deno.env.get("PUBLIC_SITE_URL")}/quote/recover?quote_id=${review.quote_id}`,
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

    return new Response(
      JSON.stringify({
        success: true,
        message: "Better scan requested successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in reject-hitl-review:", error);

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
