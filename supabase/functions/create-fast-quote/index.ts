import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { success: false, error: "Missing Supabase configuration" },
      500,
    );
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    const { staffId, customer, quote, documents, pricing } = body;

    // Validate required fields
    if (!staffId) throw new Error("Missing required field: staffId");
    if (!customer?.fullName)
      throw new Error("Missing required field: customer.fullName");
    if (!customer.email && !customer.phone)
      throw new Error("Customer must have email or phone");
    if (!quote?.sourceLanguageId)
      throw new Error("Missing required field: sourceLanguageId");
    if (!quote?.targetLanguageId)
      throw new Error("Missing required field: targetLanguageId");
    if (!documents || documents.length === 0)
      throw new Error("At least one document is required");

    // 1. Find or create customer
    let customerId: string;

    if (customer.existingCustomerId) {
      customerId = customer.existingCustomerId;
    } else {
      let existing = null;
      if (customer.email) {
        const { data } = await supabaseAdmin
          .from("customers")
          .select("id")
          .eq("email", customer.email)
          .maybeSingle();
        existing = data;
      }
      if (!existing && customer.phone) {
        const { data } = await supabaseAdmin
          .from("customers")
          .select("id")
          .eq("phone", customer.phone)
          .maybeSingle();
        existing = data;
      }

      if (existing) {
        customerId = existing.id;
      } else {
        const { data: newCustomer, error: customerError } = await supabaseAdmin
          .from("customers")
          .insert({
            full_name: customer.fullName,
            email: customer.email || null,
            phone: customer.phone || null,
            customer_type: customer.customerType || "individual",
            company_name: customer.companyName || null,
            auth_user_id: null,
          })
          .select("id")
          .single();

        if (customerError || !newCustomer) {
          throw new Error(
            `Failed to create customer: ${customerError?.message}`,
          );
        }
        customerId = newCustomer.id;
      }
    }

    // 2. Generate quote number (QT-YYYY-NNNNN)
    const year = new Date().getFullYear();
    const { data: lastQuote } = await supabaseAdmin
      .from("quotes")
      .select("quote_number")
      .like("quote_number", `QT-${year}-%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextNum = 1;
    if (lastQuote) {
      const parts = lastQuote.quote_number.split("-");
      nextNum = parseInt(parts[2]) + 1;
    }
    const quoteNumber = `QT-${year}-${String(nextNum).padStart(5, "0")}`;

    // 3. INSERT quote
    const { data: quoteRecord, error: quoteError } = await supabaseAdmin
      .from("quotes")
      .insert({
        quote_number: quoteNumber,
        customer_id: customerId,
        status: "quote_ready",
        source_language_id: quote.sourceLanguageId,
        target_language_id: quote.targetLanguageId,
        intended_use_id: quote.intendedUseId || null,
        country_of_issue: quote.countryOfIssue || null,
        special_instructions: quote.specialInstructions || null,
        tax_rate_id: quote.taxRateId || null,
        tax_rate: pricing.taxRate || 0,
        turnaround_option_id: quote.turnaroundOptionId || null,
        is_rush: quote.isRush || false,
        rush_fee: quote.rushFee || 0,
        physical_delivery_option_id: quote.physicalDeliveryOptionId || null,
        delivery_fee: quote.deliveryFee || 0,
        subtotal: pricing.subtotal || 0,
        certification_total: pricing.certificationTotal || 0,
        tax_amount: pricing.taxAmount || 0,
        total: pricing.total || 0,
        calculated_totals: {
          translation_total: pricing.translationSubtotal || 0,
          certification_total: pricing.certificationTotal || 0,
          subtotal: pricing.subtotal || 0,
          discount_total: -(pricing.discountAmount || 0),
          surcharge_total: pricing.surchargeAmount || 0,
          rush_fee: quote.rushFee || 0,
          delivery_fee: quote.deliveryFee || 0,
          tax_rate: pricing.taxRate || 0,
          tax_amount: pricing.taxAmount || 0,
          total: pricing.total || 0,
        },
        is_manual_quote: true,
        created_by_staff_id: staffId,
        entry_point: quote.entryPoint || "staff_manual",
        manual_quote_notes: quote.manualQuoteNotes || null,
        processing_status: "quote_ready",
      })
      .select("id, quote_number")
      .single();

    if (quoteError || !quoteRecord) {
      throw new Error(`Failed to create quote: ${quoteError?.message}`);
    }

    const quoteId = quoteRecord.id;

    // 4. INSERT ai_analysis_results rows (one per document)
    for (const doc of documents) {
      const { error: docError } = await supabaseAdmin
        .from("ai_analysis_results")
        .insert({
          quote_id: quoteId,
          quote_file_id: null,
          manual_filename: doc.label,
          detected_document_type: doc.documentType || null,
          assessed_complexity: doc.complexity || "easy",
          complexity_multiplier: doc.complexityMultiplier || 1.0,
          word_count: doc.wordCount || 0,
          page_count: doc.pageCount || 1,
          billable_pages: doc.billablePages || 1,
          base_rate: doc.perPageRate || 65,
          line_total: doc.lineTotal || 0,
          certification_type_id: doc.certificationTypeId || null,
          certification_price: doc.certificationPrice || 0,
          processing_status: "completed",
          ocr_provider: "manual",
          is_staff_created: true,
          created_by_staff_id: staffId,
        });

      if (docError) {
        console.error("Failed to insert document analysis:", docError);
      }
    }

    // 5. INSERT quote_adjustments (discount / surcharge)
    if (pricing.discountAmount > 0) {
      await supabaseAdmin.from("quote_adjustments").insert({
        quote_id: quoteId,
        adjustment_type: "discount",
        value_type: pricing.discountType,
        value: pricing.discountValue,
        calculated_amount: pricing.discountAmount,
        reason: pricing.discountReason || "",
        added_by: staffId,
      });
    }

    if (pricing.surchargeAmount > 0) {
      await supabaseAdmin.from("quote_adjustments").insert({
        quote_id: quoteId,
        adjustment_type: "surcharge",
        value_type: pricing.surchargeType,
        value: pricing.surchargeValue,
        calculated_amount: pricing.surchargeAmount,
        reason: pricing.surchargeReason || "",
        added_by: staffId,
      });
    }

    // 6. Call recalculate_quote_totals RPC to sync all columns
    try {
      await supabaseAdmin.rpc("recalculate_quote_totals", {
        p_quote_id: quoteId,
      });
    } catch (rpcError) {
      console.error("recalculate_quote_totals RPC error:", rpcError);
      // Non-blocking — totals already set in insert
    }

    // 7. Log to staff_activity_log
    try {
      await supabaseAdmin.from("staff_activity_log").insert({
        staff_id: staffId,
        action: "create_fast_quote",
        entity_type: "quote",
        entity_id: quoteId,
        details: {
          quote_number: quoteNumber,
          customer_id: customerId,
          document_count: documents.length,
          total: pricing.total,
          entry_point: quote.entryPoint || "staff_manual",
        },
      });
    } catch (logError) {
      console.error("Activity log error:", logError);
      // Non-blocking
    }

    // 8. Return
    return jsonResponse({
      success: true,
      quoteId: quoteId,
      quoteNumber: quoteNumber,
      customerId: customerId,
    });
  } catch (error) {
    console.error("create-fast-quote error:", error.message);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
});
