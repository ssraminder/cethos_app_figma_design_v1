// ============================================================================
// EDGE FUNCTION: crm-create-order
// VERSION: v1
// DATE: April 10, 2026
// PURPOSE: Accept accepted proposals from CRM and create portal orders
// ACTIONS: create_order, check_proposal, list_crm_orders
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── Auth: API key check ──
  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("CRM_API_KEY");
  if (!expectedKey || apiKey !== expectedKey) {
    return jsonResp({ success: false, error: "Invalid or missing API key" }, 401);
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const body = await req.json();
    const { action } = body;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ACTION: create_order
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (action === "create_order") {
      const { proposal_id, customer, source_language, target_language, intended_use,
              country_of_issue, documents, pricing, payment, turnaround_type,
              special_instructions, crm_metadata } = body;

      // ── Validate required fields ──
      if (!proposal_id) return jsonResp({ success: false, error: "proposal_id is required" }, 400);
      if (!customer?.email || !customer?.full_name) {
        return jsonResp({ success: false, error: "customer.email and customer.full_name are required" }, 400);
      }
      if (!pricing?.total || !pricing?.subtotal || pricing?.tax_rate === undefined || pricing?.tax_amount === undefined) {
        return jsonResp({ success: false, error: "pricing.subtotal, pricing.tax_rate, pricing.tax_amount, and pricing.total are required" }, 400);
      }
      if (!source_language || !target_language) {
        return jsonResp({ success: false, error: "source_language and target_language are required" }, 400);
      }

      // ── Deduplicate: check if proposal already imported ──
      const { data: existingOrder } = await sb
        .from("orders")
        .select("id, order_number")
        .eq("crm_proposal_id", proposal_id)
        .maybeSingle();

      if (existingOrder) {
        return jsonResp({
          success: false,
          error: `Proposal ${proposal_id} already imported as order ${existingOrder.order_number}`,
          order_id: existingOrder.id,
          order_number: existingOrder.order_number,
        }, 409);
      }

      // ── Resolve or create customer ──
      let customerId: string;
      let customerIsNew = false;

      const { data: existingCustomer } = await sb
        .from("customers")
        .select("id")
        .eq("email", customer.email.toLowerCase().trim())
        .maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const { data: newCustomer, error: custErr } = await sb
          .from("customers")
          .insert({
            email: customer.email.toLowerCase().trim(),
            full_name: customer.full_name,
            phone: customer.phone || null,
            customer_type: customer.customer_type || "individual",
            company_name: customer.company_name || null,
          })
          .select("id")
          .single();

        if (custErr) return jsonResp({ success: false, error: `Failed to create customer: ${custErr.message}` }, 500);
        customerId = newCustomer.id;
        customerIsNew = true;
      }

      // ── Resolve languages ──
      const { data: srcLang } = await sb
        .from("languages")
        .select("id")
        .eq("code", source_language)
        .maybeSingle();
      if (!srcLang) return jsonResp({ success: false, error: `source_language '${source_language}' not found in languages table` }, 400);

      const { data: tgtLang } = await sb
        .from("languages")
        .select("id")
        .eq("code", target_language)
        .maybeSingle();
      if (!tgtLang) return jsonResp({ success: false, error: `target_language '${target_language}' not found in languages table` }, 400);

      // ── Resolve intended use (optional) ──
      let intendedUseId: string | null = null;
      if (intended_use) {
        const { data: iu } = await sb
          .from("intended_uses")
          .select("id")
          .eq("code", intended_use)
          .maybeSingle();
        if (!iu) return jsonResp({ success: false, error: `intended_use '${intended_use}' not found` }, 400);
        intendedUseId = iu.id;
      }

      // ── Generate quote number ──
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

      // ── Create quote ──
      const isRush = turnaround_type === "rush" || turnaround_type === "same_day";
      const { data: quote, error: quoteErr } = await sb
        .from("quotes")
        .insert({
          quote_number: quoteNumber,
          status: "paid",
          customer_id: customerId,
          source_language_id: srcLang.id,
          target_language_id: tgtLang.id,
          intended_use_id: intendedUseId,
          country_of_issue: country_of_issue || null,
          special_instructions: special_instructions || null,
          subtotal: pricing.subtotal,
          certification_total: pricing.certification_total || 0,
          rush_fee: pricing.rush_fee || 0,
          delivery_fee: pricing.delivery_fee || 0,
          tax_rate: pricing.tax_rate,
          tax_amount: pricing.tax_amount,
          total: pricing.total,
          is_rush: isRush,
          turnaround_type: turnaround_type || "standard",
        })
        .select("id, quote_number")
        .single();

      if (quoteErr) return jsonResp({ success: false, error: `Failed to create quote: ${quoteErr.message}` }, 500);

      // ── Create document metadata (if provided) ──
      if (documents && Array.isArray(documents) && documents.length > 0) {
        const fileRows = documents.map((doc: any) => ({
          quote_id: quote.id,
          original_filename: doc.filename || "unknown.pdf",
          storage_path: `crm-pending/${proposal_id}/${doc.filename || "unknown.pdf"}`,
          file_size: 0,
          mime_type: "application/pdf",
          upload_status: "pending",
          ai_processing_status: "skipped",
        }));

        const { error: fileErr } = await sb.from("quote_files").insert(fileRows);
        if (fileErr) console.warn("Failed to insert quote_files:", fileErr.message);
      }

      // ── Determine payment amounts ──
      const amountPaid = payment?.amount_paid ? parseFloat(payment.amount_paid) : 0;
      const balanceDue = Math.max(0, Math.round((pricing.total - amountPaid) * 100) / 100);
      const orderStatus = balanceDue <= 0 ? "paid" : "balance_due";

      // ── Create order ──
      // order_number is auto-generated by DB trigger
      const { data: order, error: orderErr } = await sb
        .from("orders")
        .insert({
          quote_id: quote.id,
          customer_id: customerId,
          status: orderStatus,
          subtotal: pricing.subtotal,
          certification_total: pricing.certification_total || 0,
          rush_fee: pricing.rush_fee || 0,
          delivery_fee: pricing.delivery_fee || 0,
          tax_rate: pricing.tax_rate,
          tax_amount: pricing.tax_amount,
          total_amount: pricing.total,
          amount_paid: amountPaid,
          balance_due: balanceDue,
          currency: pricing.currency || "CAD",
          is_rush: isRush,
          paid_at: amountPaid > 0 ? (payment?.paid_at || new Date().toISOString()) : null,
          crm_proposal_id: proposal_id,
          crm_metadata: crm_metadata || null,
        })
        .select("id, order_number")
        .single();

      if (orderErr) return jsonResp({ success: false, error: `Failed to create order: ${orderErr.message}` }, 500);

      // ── Create invoice via DB function ──
      const { data: invoiceResult, error: invErr } = await sb.rpc("create_invoice_from_order", {
        p_order_id: order.id,
        p_trigger_type: "crm_import",
      });

      let invoiceId: string | null = null;
      let invoiceNumber: string | null = null;

      if (invErr) {
        console.warn("Failed to create invoice:", invErr.message);
      } else if (invoiceResult?.success) {
        invoiceId = invoiceResult.invoice_id;
        invoiceNumber = invoiceResult.invoice_number;
      }

      // ── Record payment (if provided and amount > 0) ──
      let paymentId: string | null = null;

      if (amountPaid > 0 && payment) {
        // Resolve payment method
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

        const { data: paymentRecord, error: payErr } = await sb
          .from("customer_payments")
          .insert({
            customer_id: customerId,
            amount: amountPaid,
            currency: pricing.currency || "CAD",
            amount_home_currency: amountPaid,
            exchange_rate: 1.0,
            exchange_gain_loss: 0,
            payment_date: payment.paid_at ? payment.paid_at.split("T")[0] : new Date().toISOString().split("T")[0],
            payment_method_id: paymentMethodId,
            payment_method_code: pmCode,
            payment_method_name: pmName,
            payment_method: pmName || "Unknown",
            reference_number: payment.reference_number || null,
            notes: `CRM proposal ${proposal_id}`,
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

          // Allocate payment to invoice if both exist
          if (invoiceId && paymentId) {
            const allocAmount = Math.min(amountPaid, pricing.total);
            const { error: allocErr } = await sb
              .from("customer_payment_allocations")
              .insert({
                payment_id: paymentId,
                invoice_id: invoiceId,
                allocated_amount: allocAmount,
              });

            if (allocErr) {
              console.warn("Failed to allocate payment:", allocErr.message);
            }
          }
        }
      }

      return jsonResp({
        success: true,
        action: "order_created",
        customer_id: customerId,
        customer_is_new: customerIsNew,
        quote_id: quote.id,
        quote_number: quote.quote_number,
        order_id: order.id,
        order_number: order.order_number,
        invoice_id: invoiceId,
        invoice_number: invoiceNumber,
        payment_id: paymentId,
        proposal_id,
        total: pricing.total,
        balance_due: balanceDue,
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ACTION: check_proposal
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    else if (action === "check_proposal") {
      const { proposal_id } = body;
      if (!proposal_id) return jsonResp({ success: false, error: "proposal_id is required" }, 400);

      const { data: order } = await sb
        .from("orders")
        .select("id, order_number, status, created_at")
        .eq("crm_proposal_id", proposal_id)
        .maybeSingle();

      if (!order) {
        return jsonResp({ success: true, exists: false });
      }

      return jsonResp({
        success: true,
        exists: true,
        order_id: order.id,
        order_number: order.order_number,
        order_status: order.status,
        created_at: order.created_at,
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ACTION: list_crm_orders
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    else if (action === "list_crm_orders") {
      const { limit: lim, offset: off, date_from, date_to } = body;

      let query = sb
        .from("orders")
        .select("id, order_number, crm_proposal_id, status, total_amount, balance_due, created_at, customer:customers(full_name)", { count: "exact" })
        .not("crm_proposal_id", "is", null);

      if (date_from) query = query.gte("created_at", date_from);
      if (date_to) query = query.lte("created_at", date_to + "T23:59:59Z");

      query = query
        .order("created_at", { ascending: false })
        .range(off || 0, (off || 0) + (lim || 25) - 1);

      const { data: orders, error, count } = await query;
      if (error) return jsonResp({ success: false, error: error.message }, 500);

      const mapped = (orders || []).map((o: any) => ({
        order_id: o.id,
        order_number: o.order_number,
        proposal_id: o.crm_proposal_id,
        customer_name: o.customer?.full_name || null,
        total_amount: o.total_amount,
        balance_due: o.balance_due,
        status: o.status,
        created_at: o.created_at,
      }));

      return jsonResp({ success: true, orders: mapped, total: count });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Unknown action
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    else {
      return jsonResp({
        success: false,
        error: "Unknown action. Valid: create_order, check_proposal, list_crm_orders",
      }, 400);
    }
  } catch (error: any) {
    console.error("crm-create-order error:", error);
    return jsonResp({ success: false, error: error.message }, 500);
  }
});
