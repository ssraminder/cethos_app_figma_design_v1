// ============================================================================
// create-fast-quote-kiosk
//
// Kiosk-authenticated version of create-fast-quote. Accepts the same body
// shape as create-fast-quote EXCEPT that staffId is derived from the
// x-kiosk-staff-token header, not the body. The quote is stamped with
// entry_point='kiosk_tablet' and kiosk_device_id = <tablet id>.
//
// Auth: device secret + staff token. See _shared/kiosk-auth.ts.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  authenticateDevice,
  authenticateStaffToken,
  getSupabaseAdmin,
  handleOptions,
  jsonResponse,
  KioskAuthError,
  rateLimit,
} from "../_shared/kiosk-auth.ts";

serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const supabase = getSupabaseAdmin();
    const device = await authenticateDevice(req, supabase);
    const staffPayload = await authenticateStaffToken(req, device);

    // Per-device quote cap — loose cap to prevent a misbehaving device from
    // spraying quotes. Legitimate use is ~a few per hour.
    if (!rateLimit(`quote:${device.id}`, 30, 60 * 60_000)) {
      return jsonResponse(
        { success: false, error: "Quote rate limit exceeded for this device" },
        429,
      );
    }

    const body = await req.json();
    const { customer, quote, documents, pricing } = body;
    const staffId = staffPayload.staff_id;

    // Validation (mirrors create-fast-quote)
    if (!customer?.fullName) throw new Error("Missing customer.fullName");
    if (!customer.email && !customer.phone)
      throw new Error("Customer must have email or phone");
    if (!quote?.sourceLanguageId) throw new Error("Missing sourceLanguageId");
    if (!quote?.targetLanguageId) throw new Error("Missing targetLanguageId");
    if (!documents || documents.length === 0)
      throw new Error("At least one document is required");

    // 1. Find or create customer (same flow as create-fast-quote)
    let customerId: string;
    if (customer.existingCustomerId) {
      customerId = customer.existingCustomerId;
    } else {
      let existing = null as { id: string } | null;
      if (customer.email) {
        const { data } = await supabase
          .from("customers")
          .select("id")
          .eq("email", customer.email)
          .maybeSingle();
        existing = data;
      }
      if (!existing && customer.phone) {
        const { data } = await supabase
          .from("customers")
          .select("id")
          .eq("phone", customer.phone)
          .maybeSingle();
        existing = data;
      }
      if (existing) {
        customerId = existing.id;
      } else {
        const { data: newCustomer, error: customerError } = await supabase
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
    const { data: lastQuote } = await supabase
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

    // 3. Insert quote (tagged as kiosk)
    const { data: quoteRecord, error: quoteError } = await supabase
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
        tax_rate: pricing?.taxRate || 0,
        turnaround_option_id: quote.turnaroundOptionId || null,
        is_rush: quote.isRush || false,
        rush_fee: quote.rushFee || 0,
        physical_delivery_option_id: quote.physicalDeliveryOptionId || null,
        delivery_fee: quote.deliveryFee || 0,
        subtotal: pricing?.subtotal || 0,
        certification_total: pricing?.certificationTotal || 0,
        tax_amount: pricing?.taxAmount || 0,
        total: pricing?.total || 0,
        calculated_totals: {
          translation_total: pricing?.translationSubtotal || 0,
          certification_total: pricing?.certificationTotal || 0,
          subtotal: pricing?.subtotal || 0,
          discount_total: -(pricing?.discountAmount || 0),
          surcharge_total: pricing?.surchargeAmount || 0,
          rush_fee: quote.rushFee || 0,
          delivery_fee: quote.deliveryFee || 0,
          tax_rate: pricing?.taxRate || 0,
          tax_amount: pricing?.taxAmount || 0,
          total: pricing?.total || 0,
        },
        is_manual_quote: true,
        created_by_staff_id: staffId,
        entry_point: "kiosk_tablet",
        manual_quote_notes: quote.manualQuoteNotes || null,
        processing_status: "quote_ready",
        kiosk_device_id: device.id,
      })
      .select("id, quote_number")
      .single();

    if (quoteError || !quoteRecord) {
      throw new Error(`Failed to create quote: ${quoteError?.message}`);
    }
    const quoteId = quoteRecord.id;

    // 4. Documents (one ai_analysis_results row per doc)
    for (const doc of documents) {
      const { error: docError } = await supabase
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
      if (docError) console.error("Document insert failed:", docError);
    }

    // 5. Adjustments
    if (pricing?.discountAmount > 0) {
      await supabase.from("quote_adjustments").insert({
        quote_id: quoteId,
        adjustment_type: "discount",
        value_type: pricing.discountType,
        value: pricing.discountValue,
        calculated_amount: pricing.discountAmount,
        reason: pricing.discountReason || "",
        added_by: staffId,
      });
    }
    if (pricing?.surchargeAmount > 0) {
      await supabase.from("quote_adjustments").insert({
        quote_id: quoteId,
        adjustment_type: "surcharge",
        value_type: pricing.surchargeType,
        value: pricing.surchargeValue,
        calculated_amount: pricing.surchargeAmount,
        reason: pricing.surchargeReason || "",
        added_by: staffId,
      });
    }

    // 6. Recalculate totals
    try {
      await supabase.rpc("recalculate_quote_totals", { p_quote_id: quoteId });
    } catch (rpcError) {
      console.error("recalculate_quote_totals RPC error:", rpcError);
    }

    // 7. Activity log
    try {
      await supabase.from("staff_activity_log").insert({
        staff_id: staffId,
        activity_type: "create_kiosk_quote",
        entity_type: "quote",
        entity_id: quoteId,
        details: {
          quote_number: quoteNumber,
          customer_id: customerId,
          document_count: documents.length,
          total: pricing?.total,
          kiosk_device_id: device.id,
          device_name: device.name,
        },
      });
    } catch (logError) {
      console.error("Activity log error:", logError);
    }

    return jsonResponse({
      success: true,
      quoteId,
      quoteNumber,
      customerId,
      deviceId: device.id,
    });
  } catch (err) {
    if (err instanceof KioskAuthError) {
      return jsonResponse({ success: false, error: err.message }, err.status);
    }
    console.error("create-fast-quote-kiosk error:", err);
    return jsonResponse(
      { success: false, error: err instanceof Error ? err.message : "Server error" },
      500,
    );
  }
});
