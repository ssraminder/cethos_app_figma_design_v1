// ============================================================================
// EDGE FUNCTION: ai-allocate-payment
// VERSION: v2
// DATE: March 26, 2026
// CHANGES FROM v1:
//   - MULTICURRENCY: Prompt includes invoice currency, payment currency
//   - Only suggests allocations to invoices matching payment currency
//   - Warns if cross-currency allocation attempted
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.24.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const anthropic = new Anthropic({
      apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
    });

    const { queue_item_id, customer_id, amount, currency: paymentCurrency, reference_number, customer_memo } = await req.json();

    // v2: Default currency to CAD if not provided
    const cur = paymentCurrency || 'CAD';

    const { data: customer } = await supabaseClient
      .from("customers")
      .select("full_name, company_name")
      .eq("id", customer_id)
      .single();

    // v2: Include currency in invoice query, filter to matching currency only
    const { data: invoices } = await supabaseClient
      .from("customer_invoices")
      .select("id, invoice_number, balance_due, due_date, currency, order:orders(order_number)")
      .eq("customer_id", customer_id)
      .eq("currency", cur)
      .gt("balance_due", 0)
      .order("due_date", { ascending: true });

    // v2: Also check if there are invoices in OTHER currencies (for warning)
    const { data: otherCurrencyInvoices } = await supabaseClient
      .from("customer_invoices")
      .select("id, invoice_number, balance_due, currency")
      .eq("customer_id", customer_id)
      .neq("currency", cur)
      .gt("balance_due", 0);

    const { data: paymentHistory } = await supabaseClient
      .from("customer_payments")
      .select(`
        amount, currency, created_at,
        allocations:customer_payment_allocations(
          invoice:customer_invoices(invoice_number)
        )
      `)
      .eq("customer_id", customer_id)
      .order("created_at", { ascending: false })
      .limit(5);

    const otherCurrencyNote = (otherCurrencyInvoices && otherCurrencyInvoices.length > 0)
      ? `\n\nNOTE: This customer also has ${otherCurrencyInvoices.length} outstanding invoice(s) in other currencies (${[...new Set(otherCurrencyInvoices.map(i => i.currency))].join(', ')}). These CANNOT be allocated from this ${cur} payment.`
      : '';

    const prompt = `You are a payment allocation assistant for CETHOS translation services.

CUSTOMER: ${customer?.full_name}${customer?.company_name ? ` (${customer.company_name})` : ""}
PAYMENT AMOUNT: $${amount.toFixed(2)} ${cur}
PAYMENT CURRENCY: ${cur}
REFERENCE NUMBER: ${reference_number || "None provided"}
CUSTOMER MEMO: ${customer_memo || "None provided"}${otherCurrencyNote}

OUTSTANDING INVOICES (${cur} only):
${invoices?.map(inv => `
- Invoice: ${inv.invoice_number}
  Balance Due: $${parseFloat(String(inv.balance_due)).toFixed(2)} ${inv.currency || cur}
  Due Date: ${inv.due_date}
  Order: ${(inv.order as any)?.order_number || "N/A"}
`).join("\n") || "No outstanding invoices in this currency"}

RECENT PAYMENT HISTORY:
${paymentHistory?.map(p => `
- ${new Date(p.created_at).toLocaleDateString()}: $${parseFloat(String(p.amount)).toFixed(2)} ${p.currency || 'CAD'} → ${
  (p.allocations as any[])?.map((a: any) => a.invoice?.invoice_number).join(", ") || "Unallocated"
}`).join("\n") || "No recent payments"}

Based on this information, determine how to allocate the payment to invoices.
IMPORTANT: Only allocate to invoices in the SAME currency as the payment (${cur}).

Return ONLY a JSON object with this exact structure:
{
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of your allocation decision",
  "allocations": [
    {
      "invoice_id": "uuid",
      "invoice_number": "INV-YYYY-NNNNNN",
      "allocated_amount": 0.00
    }
  ],
  "unallocated_amount": 0.00,
  "warnings": ["any concerns or notes"]
}

Rules:
1. Never allocate more than an invoice's balance_due
2. Exact payment match to single invoice = 95%+ confidence
3. Invoice number mentioned in memo/reference = prioritize that invoice
4. Order number mentioned = find related invoice
5. If no clear match, allocate oldest-first with lower confidence (70-80%)
6. If payment exceeds all balances, note unallocated amount
7. Confidence < 90% if: partial payment, ambiguous reference, multiple possible matches
8. NEVER allocate across currencies`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse AI response");

    const result = JSON.parse(jsonMatch[0]);

    const validatedAllocations = result.allocations.filter((alloc: any) => {
      const invoice = invoices?.find(i => i.id === alloc.invoice_id || i.invoice_number === alloc.invoice_number);
      if (!invoice) return false;
      alloc.invoice_id = invoice.id;
      return alloc.allocated_amount > 0 && alloc.allocated_amount <= parseFloat(String(invoice.balance_due));
    });

    await supabaseClient
      .from("payment_confirmation_queue")
      .update({
        ai_confidence: result.confidence,
        ai_reasoning: result.reasoning,
        ai_allocations: validatedAllocations,
      })
      .eq("id", queue_item_id);

    return new Response(
      JSON.stringify({
        confidence: result.confidence,
        reasoning: result.reasoning,
        allocations: validatedAllocations,
        warnings: result.warnings,
        currency: cur,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
