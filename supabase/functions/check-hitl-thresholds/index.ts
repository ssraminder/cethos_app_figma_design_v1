import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

interface CheckThresholdsRequest {
  quoteId: string;
}

interface ThresholdCheck {
  value: number;
  threshold: number | null;
  passed: boolean;
}

function calculatePriority(triggerReasons: string[]): number {
  let priority = 5;
  // More trigger reasons = more complex = higher priority (lower number)
  if (triggerReasons.length >= 3) priority = 3;
  else if (triggerReasons.length >= 2) priority = 4;
  // High value orders get higher priority
  if (triggerReasons.includes("high_order_value")) priority -= 1;
  return Math.max(1, Math.min(10, priority));
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { quoteId }: CheckThresholdsRequest = await req.json();

    if (!quoteId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required field: quoteId",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`🔍 [CHECK-HITL-THRESHOLDS] Checking thresholds for quote: ${quoteId}`);

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

    // 1. Check if quote exists and is not already in HITL
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from("quotes")
      .select("id, quote_number, status, processing_status, total")
      .eq("id", quoteId)
      .single();

    if (quoteError || !quote) {
      console.error("❌ [CHECK-HITL-THRESHOLDS] Quote not found:", quoteError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Quote not found",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // If quote is already in HITL, don't create another review
    if (quote.status === "hitl_pending") {
      console.log(`⏭️ [CHECK-HITL-THRESHOLDS] Quote already in HITL, skipping`);
      return new Response(
        JSON.stringify({
          success: true,
          passed: false,
          alreadyInHitl: true,
          message: "Quote already requires HITL review",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Get all analysis results for this quote
    const { data: analyses, error: analysisError } = await supabaseAdmin
      .from("ai_analysis_results")
      .select("*")
      .eq("quote_id", quoteId);

    if (analysisError) {
      console.error("❌ [CHECK-HITL-THRESHOLDS] Error fetching analyses:", analysisError);
      // Don't block customer if we can't fetch analyses
      return new Response(
        JSON.stringify({
          success: true,
          passed: true,
          message: "Could not fetch analyses, defaulting to pass",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // If no analyses exist, default to pass (quote may be manual or pending)
    if (!analyses || analyses.length === 0) {
      console.log(`ℹ️ [CHECK-HITL-THRESHOLDS] No analyses found for quote, defaulting to pass`);
      return new Response(
        JSON.stringify({
          success: true,
          passed: true,
          message: "No analyses to check",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Get all active thresholds
    const { data: thresholds, error: thresholdError } = await supabaseAdmin
      .from("hitl_thresholds")
      .select("*")
      .eq("is_active", true);

    if (thresholdError) {
      console.error("❌ [CHECK-HITL-THRESHOLDS] Error fetching thresholds:", thresholdError);
      // Don't block customer if we can't fetch thresholds
      return new Response(
        JSON.stringify({
          success: true,
          passed: true,
          message: "Could not fetch thresholds, defaulting to pass",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Build threshold map
    const thresholdMap: Record<string, number> = {};
    for (const t of thresholds || []) {
      thresholdMap[t.threshold_key] = parseFloat(t.threshold_value);
    }

    console.log(`📊 [CHECK-HITL-THRESHOLDS] Active thresholds:`, thresholdMap);

    // 5. Calculate aggregate values across all files
    let totalPages = 0;
    let minOcrConfidence = 1;
    let minLanguageConfidence = 1;
    let minClassificationConfidence = 1;
    let minComplexityConfidence = 1;
    let totalValue = 0;

    for (const analysis of analyses) {
      totalPages += analysis.page_count || 0;
      totalValue += analysis.line_total || 0;

      // Track minimum confidence values (worst case)
      if (analysis.ocr_confidence !== null && analysis.ocr_confidence < minOcrConfidence) {
        minOcrConfidence = analysis.ocr_confidence;
      }
      if (analysis.language_confidence !== null && analysis.language_confidence < minLanguageConfidence) {
        minLanguageConfidence = analysis.language_confidence;
      }
      if (analysis.document_type_confidence !== null && analysis.document_type_confidence < minClassificationConfidence) {
        minClassificationConfidence = analysis.document_type_confidence;
      }
      if (analysis.complexity_confidence !== null && analysis.complexity_confidence < minComplexityConfidence) {
        minComplexityConfidence = analysis.complexity_confidence;
      }
    }

    // Use quote total if available and higher
    if (quote.total && quote.total > totalValue) {
      totalValue = quote.total;
    }

    console.log(`📊 [CHECK-HITL-THRESHOLDS] Aggregate values:`, {
      totalPages,
      totalValue,
      minOcrConfidence,
      minLanguageConfidence,
      minClassificationConfidence,
      minComplexityConfidence,
    });

    // 6. Check each threshold
    const triggerReasons: string[] = [];
    const checks: Record<string, ThresholdCheck> = {};

    // Check OCR confidence
    if (thresholdMap.ocr_confidence_min !== undefined) {
      const passed = minOcrConfidence >= thresholdMap.ocr_confidence_min;
      checks.ocr_confidence = { value: minOcrConfidence, threshold: thresholdMap.ocr_confidence_min, passed };
      if (!passed) {
        triggerReasons.push("low_ocr_confidence");
      }
    }

    // Check language confidence
    if (thresholdMap.language_confidence_min !== undefined) {
      const passed = minLanguageConfidence >= thresholdMap.language_confidence_min;
      checks.language_confidence = { value: minLanguageConfidence, threshold: thresholdMap.language_confidence_min, passed };
      if (!passed) {
        triggerReasons.push("low_language_confidence");
      }
    }

    // Check classification confidence
    if (thresholdMap.classification_confidence_min !== undefined) {
      const passed = minClassificationConfidence >= thresholdMap.classification_confidence_min;
      checks.classification_confidence = { value: minClassificationConfidence, threshold: thresholdMap.classification_confidence_min, passed };
      if (!passed) {
        triggerReasons.push("low_classification_confidence");
      }
    }

    // Check complexity confidence
    if (thresholdMap.complexity_confidence_min !== undefined) {
      const passed = minComplexityConfidence >= thresholdMap.complexity_confidence_min;
      checks.complexity_confidence = { value: minComplexityConfidence, threshold: thresholdMap.complexity_confidence_min, passed };
      if (!passed) {
        triggerReasons.push("low_complexity_confidence");
      }
    }

    // Check page count (maximum threshold)
    if (thresholdMap.max_auto_approve_pages !== undefined) {
      const passed = totalPages <= thresholdMap.max_auto_approve_pages;
      checks.page_count = { value: totalPages, threshold: thresholdMap.max_auto_approve_pages, passed };
      if (!passed) {
        triggerReasons.push("high_page_count");
      }
    }

    // Check order value (maximum threshold)
    if (thresholdMap.max_auto_approve_value !== undefined) {
      const passed = totalValue <= thresholdMap.max_auto_approve_value;
      checks.order_value = { value: totalValue, threshold: thresholdMap.max_auto_approve_value, passed };
      if (!passed) {
        triggerReasons.push("high_order_value");
      }
    }

    // 7. If any thresholds failed, create HITL review
    if (triggerReasons.length > 0) {
      console.log(`⚠️ [CHECK-HITL-THRESHOLDS] Thresholds failed:`, triggerReasons);

      const now = new Date().toISOString();
      const slaDeadline = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // 4 hours from now

      // Check if HITL review already exists
      const { data: existingReview } = await supabaseAdmin
        .from("hitl_reviews")
        .select("id")
        .eq("quote_id", quoteId)
        .in("status", ["pending", "in_progress"])
        .single();

      let reviewId: string | null = null;

      if (existingReview) {
        reviewId = existingReview.id;
        console.log(`⏭️ [CHECK-HITL-THRESHOLDS] HITL review already exists: ${reviewId}`);
      } else {
        // Create HITL review
        const { data: review, error: reviewError } = await supabaseAdmin
          .from("hitl_reviews")
          .insert({
            quote_id: quoteId,
            status: "pending",
            priority: calculatePriority(triggerReasons),
            trigger_reasons: triggerReasons,
            sla_deadline: slaDeadline,
            created_at: now,
            updated_at: now,
          })
          .select()
          .single();

        if (reviewError) {
          console.error("❌ [CHECK-HITL-THRESHOLDS] Failed to create HITL review:", reviewError);
        } else {
          reviewId = review?.id;
          console.log(`✅ [CHECK-HITL-THRESHOLDS] HITL review created: ${reviewId}`);
        }
      }

      // Update quote status to hitl_pending
      const { error: quoteUpdateError } = await supabaseAdmin
        .from("quotes")
        .update({
          status: "hitl_pending",
          hitl_required: true,
          hitl_requested_at: now,
          updated_at: now,
        })
        .eq("id", quoteId);

      if (quoteUpdateError) {
        console.error("❌ [CHECK-HITL-THRESHOLDS] Failed to update quote status:", quoteUpdateError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          passed: false,
          reviewId,
          triggerReasons,
          checks,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // All thresholds passed
    console.log(`✅ [CHECK-HITL-THRESHOLDS] All thresholds passed for quote ${quoteId}`);

    return new Response(
      JSON.stringify({
        success: true,
        passed: true,
        checks,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ [CHECK-HITL-THRESHOLDS] Error:", error);

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
