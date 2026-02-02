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

    const { queue_item_id, customer_id, amount, reference_number, customer_memo } = await req.json();

    // Get customer info
    const { data: customer } = await supabaseClient
      .from("customers")
      .select("full_name, company_name")
      .eq("id", customer_id)
      .single();

    // Get outstanding invoices
    const { data: invoices } = await supabaseClient
      .from("customer_invoices")
      .select("id, invoice_number, balance_due, due_date, order:orders(order_number)")
      .eq("customer_id", customer_id)
      .gt("balance_due", 0)
      .order("due_date", { ascending: true });

    // Get recent payment history
    const { data: paymentHistory } = await supabaseClient
      .from("customer_payments")
      .select(`
        amount, created_at,
        allocations:customer_payment_allocations(
          invoice:customer_invoices(invoice_number)
        )
      `)
      .eq("customer_id", customer_id)
      .order("created_at", { ascending: false })
      .limit(5);

    // Build prompt for Claude
    const prompt = `You are a payment allocation assistant for CETHOS translation services.

CUSTOMER: ${customer?.full_name}${customer?.company_name ? ` (${customer.company_name})` : ""}
PAYMENT AMOUNT: $${amount.toFixed(2)} CAD
REFERENCE NUMBER: ${reference_number || "None provided"}
CUSTOMER MEMO: ${customer_memo || "None provided"}

OUTSTANDING INVOICES:
${invoices?.map(inv => `
- Invoice: ${inv.invoice_number}
  Balance Due: $${inv.balance_due.toFixed(2)}
  Due Date: ${inv.due_date}
  Order: ${(inv.order as any)?.order_number || "N/A"}
`).join("\n") || "No outstanding invoices"}

RECENT PAYMENT HISTORY:
${paymentHistory?.map(p => `
- ${new Date(p.created_at).toLocaleDateString()}: $${p.amount.toFixed(2)} → ${
  (p.allocations as any[])?.map((a: any) => a.invoice?.invoice_number).join(", ") || "Unknown"
}`).join("\n") || "No recent payments"}

Based on this information, determine how to allocate the payment to invoices.

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
7. Confidence < 90% if: partial payment, ambiguous reference, multiple possible matches`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    // Parse response
    const responseText = response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse AI response");
    }

    const result = JSON.parse(jsonMatch[0]);

    // Validate allocations against actual invoices
    const validatedAllocations = result.allocations.filter((alloc: any) => {
      const invoice = invoices?.find(i => i.id === alloc.invoice_id || i.invoice_number === alloc.invoice_number);
      if (!invoice) return false;
      // Ensure invoice_id is set correctly
      alloc.invoice_id = invoice.id;
      return alloc.allocated_amount > 0 && alloc.allocated_amount <= invoice.balance_due;
    });

    // Update queue item with AI results
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
