import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Role hierarchy (higher number = higher authority)
const ROLE_HIERARCHY: Record<string, number> = {
  reviewer: 1,
  senior_reviewer: 2,
  admin: 3,
  super_admin: 4,
};

/**
 * Check if currentRole can override claimedByRole
 */
function canOverrideClaim(
  currentRole: string,
  claimedByRole: string
): boolean {
  const currentLevel = ROLE_HIERARCHY[currentRole?.toLowerCase()] || 0;
  const claimedLevel = ROLE_HIERARCHY[claimedByRole?.toLowerCase()] || 0;
  return currentLevel > claimedLevel;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reviewId, staffId, isOverride } = await req.json();

    if (!reviewId || !staffId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: reviewId, staffId",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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
      }
    );

    const now = new Date().toISOString();

    // 1. Get review data
    const { data: review, error: reviewFetchError } = await supabaseAdmin
      .from("hitl_reviews")
      .select("*, quotes(quote_number)")
      .eq("id", reviewId)
      .single();

    if (reviewFetchError || !review) {
      throw new Error("Review not found: " + reviewFetchError?.message);
    }

    // 2. Get current staff's role
    const { data: currentStaff, error: staffError } = await supabaseAdmin
      .from("staff_users")
      .select("id, full_name, role")
      .eq("id", staffId)
      .single();

    if (staffError || !currentStaff) {
      throw new Error("Staff not found: " + staffError?.message);
    }

    // 3. Check if review is already claimed
    const previousClaimerId = review.assigned_to;
    let previousClaimerName: string | null = null;
    let previousClaimerRole: string | null = null;

    if (previousClaimerId) {
      // Get previous claimer's info
      const { data: previousClaimer } = await supabaseAdmin
        .from("staff_users")
        .select("id, full_name, role")
        .eq("id", previousClaimerId)
        .single();

      if (previousClaimer) {
        previousClaimerName = previousClaimer.full_name;
        previousClaimerRole = previousClaimer.role;

        // If claimed by same person, just return success
        if (previousClaimerId === staffId) {
          return new Response(
            JSON.stringify({
              success: true,
              message: "Already claimed by you",
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // Check if override is allowed
        if (!isOverride) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Review is already claimed by ${previousClaimerName}`,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // Check role hierarchy for override
        if (!canOverrideClaim(currentStaff.role, previousClaimerRole)) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Cannot override claim from ${previousClaimerRole}. Your role (${currentStaff.role}) does not have sufficient authority.`,
            }),
            {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }
    }

    // 4. Update HITL review with new assignment
    const updateData: Record<string, any> = {
      assigned_to: staffId,
      status: "in_review",
      updated_at: now,
    };

    // Track override history if this was an override
    if (previousClaimerId && isOverride) {
      updateData.previous_assigned_to = previousClaimerId;
      updateData.claim_override_at = now;
      updateData.claim_override_by = staffId;
    }

    const { error: updateError } = await supabaseAdmin
      .from("hitl_reviews")
      .update(updateData)
      .eq("id", reviewId);

    if (updateError) {
      throw new Error("Failed to claim review: " + updateError.message);
    }

    // 5. Log staff activity
    const activityDetails: Record<string, any> = {
      quote_id: review.quote_id,
      quote_number: review.quotes?.quote_number,
    };

    if (previousClaimerId && isOverride) {
      activityDetails.previous_assigned_to = previousClaimerId;
      activityDetails.previous_assigned_name = previousClaimerName;
      activityDetails.previous_assigned_role = previousClaimerRole;
      activityDetails.override_reason = "Role hierarchy override";
    }

    const { error: logError } = await supabaseAdmin
      .from("staff_activity_log")
      .insert({
        staff_id: staffId,
        action_type: isOverride ? "hitl_claim_override" : "hitl_claim",
        entity_type: "hitl_review",
        entity_id: reviewId,
        details: activityDetails,
      });

    if (logError) {
      console.error("Failed to log activity:", logError);
      // Don't fail the operation if logging fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: isOverride
          ? `Review taken over from ${previousClaimerName}`
          : "Review claimed successfully",
        claimedBy: {
          id: currentStaff.id,
          name: currentStaff.full_name,
          role: currentStaff.role,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in claim-hitl-review:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
