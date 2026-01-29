import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface FilePrice {
  fileId: string;
  fileName: string;
  languageId: string;
  documentTypeId?: string;
  pageCount: number;
  billablePages: number;
  complexity: "low" | "medium" | "high";
  certificationTypeId?: string;
  baseRate: number;
  languageMultiplier: number;
  complexityMultiplier: number;
  translationCost: number;
  certificationCost: number;
  lineTotal: number;
}

interface QuotePricing {
  filePrices: FilePrice[];
  documentSubtotal: number;
  isRush: boolean;
  rushFee: number;
  deliveryOptionId?: string;
  deliveryFee: number;
  hasDiscount: boolean;
  discountType?: "fixed" | "percentage";
  discountValue?: number;
  discountAmount: number;
  discountReason?: string;
  hasSurcharge: boolean;
  surchargeType?: "fixed" | "percentage";
  surchargeValue?: number;
  surchargeAmount: number;
  surchargeReason?: string;
  preTaxTotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      staffId,
      quoteId,
      customerId,
      pricing,
      staffNotes,
      sendNotification,
    }: {
      staffId: string;
      quoteId: string;
      customerId?: string;
      pricing: QuotePricing;
      staffNotes?: string;
      sendNotification: boolean;
    } = await req.json();

    if (!staffId || !quoteId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields",
        }),
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

    const now = new Date().toISOString();

    // 1. Update quotes table with final pricing data
    const { error: quoteUpdateError } = await supabaseAdmin
      .from("quotes")
      .update({
        subtotal: pricing.documentSubtotal,
        rush_fee: pricing.rushFee,
        delivery_fee: pricing.deliveryFee,
        tax_rate: pricing.taxRate,
        tax_amount: pricing.taxAmount,
        total: pricing.total,
        is_rush: pricing.isRush,
        delivery_option_id: pricing.deliveryOptionId || null,
        manual_quote_notes: staffNotes || null,
        status: "quote_ready",
        updated_at: now,
      })
      .eq("id", quoteId);

    if (quoteUpdateError) {
      console.error("Error updating quote:", quoteUpdateError);
      throw new Error("Failed to update quote: " + quoteUpdateError.message);
    }

    // 2. Update ai_analysis_results for each file with pricing data
    for (const filePrice of pricing.filePrices) {
      // First, find the quote_file_id for this file
      const { data: quoteFile } = await supabaseAdmin
        .from("quote_files")
        .select("id")
        .eq("id", filePrice.fileId)
        .single();

      if (!quoteFile) {
        console.warn(`Quote file not found: ${filePrice.fileId}`);
        continue;
      }

      const { error: analysisUpdateError } = await supabaseAdmin
        .from("ai_analysis_results")
        .update({
          billable_pages: filePrice.billablePages,
          page_count: filePrice.pageCount,
          assessed_complexity: filePrice.complexity,
          complexity_multiplier: filePrice.complexityMultiplier,
          base_rate: filePrice.baseRate,
          line_total: filePrice.lineTotal,
          certification_type_id: filePrice.certificationTypeId || null,
          certification_price: filePrice.certificationCost,
          updated_at: now,
        })
        .eq("quote_file_id", quoteFile.id);

      if (analysisUpdateError) {
        console.error(
          `Error updating analysis for file ${filePrice.fileId}:`,
          analysisUpdateError,
        );
        // Don't throw - continue with other files
      }
    }

    // 3. Create quote_adjustments records if discount or surcharge
    if (pricing.discountAmount > 0) {
      const { error: discountError } = await supabaseAdmin
        .from("quote_adjustments")
        .insert({
          quote_id: quoteId,
          adjustment_type: "discount",
          value_type: pricing.discountType || "fixed",
          value: pricing.discountValue || pricing.discountAmount,
          calculated_amount: pricing.discountAmount,
          reason: pricing.discountReason || null,
          created_by_staff_id: staffId,
          created_at: now,
        });

      if (discountError) {
        console.error("Error creating discount adjustment:", discountError);
      }
    }

    if (pricing.surchargeAmount > 0) {
      const { error: surchargeError } = await supabaseAdmin
        .from("quote_adjustments")
        .insert({
          quote_id: quoteId,
          adjustment_type: "surcharge",
          value_type: pricing.surchargeType || "fixed",
          value: pricing.surchargeValue || pricing.surchargeAmount,
          calculated_amount: pricing.surchargeAmount,
          reason: pricing.surchargeReason || null,
          created_by_staff_id: staffId,
          created_at: now,
        });

      if (surchargeError) {
        console.error("Error creating surcharge adjustment:", surchargeError);
      }
    }

    // 4. Log staff activity
    await supabaseAdmin.from("staff_activity_log").insert({
      staff_id: staffId,
      action: "finalize_manual_quote",
      details: {
        quote_id: quoteId,
        total_amount: pricing.total,
        file_count: pricing.filePrices.length,
        has_discount: pricing.discountAmount > 0,
        has_surcharge: pricing.surchargeAmount > 0,
        send_notification: sendNotification,
      },
      created_at: now,
    });

    console.log(`✅ Quote ${quoteId} finalized successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        quoteId,
        message: "Quote finalized successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in finalize-staff-quote:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
