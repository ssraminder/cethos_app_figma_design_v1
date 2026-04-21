// ============================================================================
// EDGE FUNCTION: admin-create-order
// VERSION: v1
// DATE: April 21, 2026
// PURPOSE: Staff-facing "direct order" creation for AR-approved customers.
//          Skips the quote-review step: creates a paid quote + open order in
//          one call. Used for business/legal/government projects that run on
//          net terms (invoice on delivery) rather than up-front payment.
// AUTH:    staffId in body (matches existing create-fast-quote convention).
// ELIG:    customers.is_ar_customer must be true.
// ============================================================================

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

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await req.json();
    const { staffId, customer, order, documents, pricing, payment } = body;

    // ── Validate staff ──
    if (!staffId) throw new Error("Missing required field: staffId");
    const { data: staff } = await sb
      .from("staff_users")
      .select("id, is_active")
      .eq("id", staffId)
      .maybeSingle();
    if (!staff || staff.is_active === false) {
      return jsonResponse(
        { success: false, error: "Invalid or inactive staff user" },
        403,
      );
    }

    // ── Validate required input ──
    if (!customer?.existingCustomerId) {
      throw new Error(
        "Direct orders require an existing customer (customer.existingCustomerId)",
      );
    }
    if (!order?.serviceId) throw new Error("Missing required field: order.serviceId");
    if (!order?.sourceLanguageId)
      throw new Error("Missing required field: order.sourceLanguageId");
    if (!order?.targetLanguageId)
      throw new Error("Missing required field: order.targetLanguageId");
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      throw new Error("At least one line item is required");
    }
    if (
      !pricing ||
      pricing.subtotal === undefined ||
      pricing.total === undefined ||
      pricing.taxRate === undefined ||
      pricing.taxAmount === undefined
    ) {
      throw new Error(
        "pricing.subtotal, pricing.taxRate, pricing.taxAmount, and pricing.total are required",
      );
    }

    // ── Verify customer eligibility ──
    const customerId = customer.existingCustomerId as string;
    const { data: custRec, error: custErr } = await sb
      .from("customers")
      .select("id, is_ar_customer, payment_terms, currency, customer_type, full_name")
      .eq("id", customerId)
      .maybeSingle();
    if (custErr || !custRec) {
      return jsonResponse({ success: false, error: "Customer not found" }, 404);
    }
    if (!custRec.is_ar_customer) {
      return jsonResponse(
        {
          success: false,
          error:
            "Customer is not AR-approved. Direct orders are only available for AR customers — create a quote instead.",
        },
        403,
      );
    }

    // ── Verify service exists ──
    const { data: service } = await sb
      .from("services")
      .select("id, code, name, default_calculation_units")
      .eq("id", order.serviceId)
      .maybeSingle();
    if (!service) {
      return jsonResponse(
        { success: false, error: `Service not found: ${order.serviceId}` },
        400,
      );
    }

    // ── Generate quote number (QT-YYYY-NNNNN) ──
    const year = new Date().getFullYear();
    const { data: lastQuote } = await sb
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

    // ── Create the "paid" quote (skips review) ──
    const { data: quoteRec, error: quoteErr } = await sb
      .from("quotes")
      .insert({
        quote_number: quoteNumber,
        customer_id: customerId,
        status: "paid",
        processing_status: "quote_ready",
        service_id: service.id,
        source_language_id: order.sourceLanguageId,
        target_language_id: order.targetLanguageId,
        intended_use_id: order.intendedUseId || null,
        country_of_issue: order.countryOfIssue || null,
        special_instructions: order.specialInstructions || null,
        tax_rate: pricing.taxRate || 0,
        tax_rate_id: order.taxRateId || null,
        is_rush: order.isRush || false,
        rush_fee: pricing.rushFee || 0,
        delivery_fee: pricing.deliveryFee || 0,
        physical_delivery_option_id: order.physicalDeliveryOptionId || null,
        subtotal: pricing.subtotal,
        certification_total: pricing.certificationTotal || 0,
        tax_amount: pricing.taxAmount,
        total: pricing.total,
        surcharge_total: pricing.surchargeAmount || 0,
        discount_total: pricing.discountAmount || 0,
        calculated_totals: {
          translation_total: pricing.translationSubtotal || 0,
          certification_total: pricing.certificationTotal || 0,
          subtotal: pricing.subtotal,
          discount_total: -(pricing.discountAmount || 0),
          surcharge_total: pricing.surchargeAmount || 0,
          rush_fee: pricing.rushFee || 0,
          delivery_fee: pricing.deliveryFee || 0,
          tax_rate: pricing.taxRate || 0,
          tax_amount: pricing.taxAmount,
          total: pricing.total,
        },
        is_manual_quote: true,
        created_by_staff_id: staffId,
        entry_point: "admin_direct_order",
        manual_quote_notes: order.notes || null,
        promised_delivery_date: order.promisedDeliveryDate || null,
        turnaround_type: order.turnaroundType || "standard",
        paid_at: new Date().toISOString(),
      })
      .select("id, quote_number")
      .single();

    if (quoteErr || !quoteRec) {
      throw new Error(`Failed to create quote: ${quoteErr?.message}`);
    }
    const quoteId = quoteRec.id;

    // ── Insert line items (ai_analysis_results) ──
    for (const doc of documents) {
      const unit = doc.calculationUnit || "per_page";
      const validUnits = ["per_page", "per_word", "per_hour", "per_minute", "flat"];
      if (!validUnits.includes(unit)) {
        throw new Error(
          `Invalid calculation_unit '${unit}' on line item (valid: ${validUnits.join(", ")})`,
        );
      }

      const quantity =
        unit === "flat" ? 1 : Number(doc.unitQuantity ?? doc.billablePages ?? 0);

      await sb.from("ai_analysis_results").insert({
        quote_id: quoteId,
        quote_file_id: null,
        manual_filename: doc.label || doc.description || "Line item",
        detected_document_type: doc.documentType || null,
        assessed_complexity: doc.complexity || "medium",
        complexity_multiplier: doc.complexityMultiplier || 1.0,
        word_count: doc.wordCount || (unit === "per_word" ? quantity : 0),
        page_count: doc.pageCount || 1,
        billable_pages: unit === "per_page" ? quantity : doc.billablePages || 0,
        calculation_unit: unit,
        unit_quantity: quantity,
        base_rate: doc.baseRate ?? doc.perPageRate ?? 0,
        line_total: doc.lineTotal || 0,
        certification_type_id: doc.certificationTypeId || null,
        certification_price: doc.certificationPrice || 0,
        processing_status: "completed",
        ocr_provider: "manual",
        is_staff_created: true,
        created_by_staff_id: staffId,
      });
    }

    // ── Surcharge / discount adjustments ──
    if (pricing.discountAmount && pricing.discountAmount > 0) {
      await sb.from("quote_adjustments").insert({
        quote_id: quoteId,
        adjustment_type: "discount",
        value_type: pricing.discountType || "flat",
        value: pricing.discountValue || pricing.discountAmount,
        calculated_amount: pricing.discountAmount,
        reason: pricing.discountReason || "",
        added_by: staffId,
      });
    }
    if (pricing.surchargeAmount && pricing.surchargeAmount > 0) {
      await sb.from("quote_adjustments").insert({
        quote_id: quoteId,
        adjustment_type: "surcharge",
        value_type: pricing.surchargeType || "flat",
        value: pricing.surchargeValue || pricing.surchargeAmount,
        calculated_amount: pricing.surchargeAmount,
        reason: pricing.surchargeReason || "",
        added_by: staffId,
      });
    }

    // ── Recalculate totals (non-blocking) ──
    try {
      await sb.rpc("recalculate_quote_totals", { p_quote_id: quoteId });
    } catch (rpcError: any) {
      console.error("recalculate_quote_totals error:", rpcError?.message);
    }

    // ── Determine payment amounts ──
    const amountPaid = payment?.amountPaid
      ? Number(payment.amountPaid)
      : 0;
    const balanceDue =
      Math.max(0, Math.round((Number(pricing.total) - amountPaid) * 100) / 100);
    const orderStatus = balanceDue <= 0 ? "paid" : "balance_due";

    // ── Create the order (order_number auto-generated by trigger) ──
    const { data: orderRec, error: orderErr } = await sb
      .from("orders")
      .insert({
        quote_id: quoteId,
        customer_id: customerId,
        service_id: service.id,
        status: orderStatus,
        work_status: "pending",
        is_direct_order: true,
        subtotal: pricing.subtotal,
        certification_total: pricing.certificationTotal || 0,
        rush_fee: pricing.rushFee || 0,
        delivery_fee: pricing.deliveryFee || 0,
        tax_rate: pricing.taxRate || 0,
        tax_amount: pricing.taxAmount,
        total_amount: pricing.total,
        amount_paid: amountPaid,
        balance_due: balanceDue,
        currency: custRec.currency || pricing.currency || "CAD",
        is_rush: order.isRush || false,
        delivery_option: order.deliveryOption || null,
        estimated_delivery_date: order.promisedDeliveryDate || null,
        surcharge_type: pricing.surchargeType || "flat",
        surcharge_value: pricing.surchargeValue || 0,
        surcharge_total: pricing.surchargeAmount || 0,
        discount_type: pricing.discountType || "flat",
        discount_value: pricing.discountValue || 0,
        discount_total: pricing.discountAmount || 0,
        paid_at: amountPaid > 0 ? new Date().toISOString() : null,
      })
      .select("id, order_number")
      .single();

    if (orderErr || !orderRec) {
      throw new Error(`Failed to create order: ${orderErr?.message}`);
    }

    // ── Optional: record payment ──
    let paymentId: string | null = null;
    if (amountPaid > 0 && payment) {
      let paymentMethodId: string | null = null;
      let pmCode: string | null = null;
      let pmName: string | null = null;
      if (payment.method) {
        const { data: pm } = await sb
          .from("payment_methods")
          .select("id, code, name")
          .eq("code", payment.method)
          .maybeSingle();
        if (pm) {
          paymentMethodId = pm.id;
          pmCode = pm.code;
          pmName = pm.name;
        }
      }

      const currency = custRec.currency || pricing.currency || "CAD";
      const { data: paymentRecord, error: payErr } = await sb
        .from("customer_payments")
        .insert({
          customer_id: customerId,
          amount: amountPaid,
          currency,
          amount_home_currency: amountPaid,
          exchange_rate: 1.0,
          exchange_gain_loss: 0,
          payment_date:
            payment.paidAt
              ? String(payment.paidAt).split("T")[0]
              : new Date().toISOString().split("T")[0],
          payment_method_id: paymentMethodId,
          payment_method_code: pmCode,
          payment_method_name: pmName,
          payment_method: pmName || "Unknown",
          reference_number: payment.referenceNumber || null,
          notes: payment.notes || `Direct order ${orderRec.order_number}`,
          source: "manual",
          status: "unallocated",
          allocated_amount: 0,
          unallocated_amount: amountPaid,
        })
        .select("id")
        .single();
      if (payErr) {
        console.warn("Failed to record payment:", payErr.message);
      } else {
        paymentId = paymentRecord.id;
      }
    }

    // ── Activity log ──
    try {
      await sb.from("staff_activity_log").insert({
        staff_id: staffId,
        action: "create_direct_order",
        entity_type: "order",
        entity_id: orderRec.id,
        details: {
          quote_id: quoteId,
          quote_number: quoteRec.quote_number,
          order_number: orderRec.order_number,
          customer_id: customerId,
          service_code: service.code,
          document_count: documents.length,
          total: pricing.total,
          amount_paid: amountPaid,
          balance_due: balanceDue,
        },
      });
    } catch (logError: any) {
      console.error("Activity log error:", logError?.message);
    }

    return jsonResponse({
      success: true,
      quoteId,
      quoteNumber: quoteRec.quote_number,
      orderId: orderRec.id,
      orderNumber: orderRec.order_number,
      customerId,
      paymentId,
      total: pricing.total,
      amountPaid,
      balanceDue,
      serviceCode: service.code,
    });
  } catch (error: any) {
    console.error("admin-create-order error:", error?.message);
    return jsonResponse(
      { success: false, error: error?.message ?? "Unknown error" },
      500,
    );
  }
});
