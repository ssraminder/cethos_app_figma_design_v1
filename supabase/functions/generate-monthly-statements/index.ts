import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Calculate previous month period
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Get AR customers with activity
    const { data: arCustomers } = await supabaseClient
      .from("customers")
      .select("id, full_name, email, company_name")
      .eq("is_ar_customer", true);

    const results = [];

    for (const customer of arCustomers || []) {
      try {
        // Check if statement already exists for this period
        const { data: existingStatement } = await supabaseClient
          .from("customer_statements")
          .select("id")
          .eq("customer_id", customer.id)
          .eq("period_start", periodStart.toISOString().split("T")[0])
          .single();

        if (existingStatement) {
          results.push({ customer_id: customer.id, status: "skipped", reason: "Already exists" });
          continue;
        }

        // Get opening balance (sum of unpaid invoices before period)
        const { data: openingInvoices } = await supabaseClient
          .from("customer_invoices")
          .select("balance_due")
          .eq("customer_id", customer.id)
          .lt("invoice_date", periodStart.toISOString().split("T")[0])
          .not("status", "in", '("paid","void")');

        const openingBalance = openingInvoices?.reduce((sum, inv) => sum + inv.balance_due, 0) || 0;

        // Get invoices in period
        const { data: periodInvoices } = await supabaseClient
          .from("customer_invoices")
          .select("*")
          .eq("customer_id", customer.id)
          .gte("invoice_date", periodStart.toISOString().split("T")[0])
          .lte("invoice_date", periodEnd.toISOString().split("T")[0])
          .order("invoice_date", { ascending: true });

        const totalInvoiced = periodInvoices?.reduce((sum, inv) => sum + inv.total_amount, 0) || 0;

        // Get payments in period
        const { data: periodPayments } = await supabaseClient
          .from("customer_payments")
          .select("*")
          .eq("customer_id", customer.id)
          .gte("created_at", periodStart.toISOString())
          .lte("created_at", periodEnd.toISOString() + "T23:59:59Z")
          .order("created_at", { ascending: true });

        const totalPaid = periodPayments?.reduce((sum, pay) => sum + pay.amount, 0) || 0;

        const closingBalance = openingBalance + totalInvoiced - totalPaid;

        // Skip if no activity and no balance
        if (totalInvoiced === 0 && totalPaid === 0 && closingBalance === 0) {
          results.push({ customer_id: customer.id, status: "skipped", reason: "No activity" });
          continue;
        }

        // Calculate aging
        const { data: allUnpaid } = await supabaseClient
          .from("customer_invoices")
          .select("balance_due, due_date")
          .eq("customer_id", customer.id)
          .gt("balance_due", 0);

        let current = 0, days30 = 0, days60 = 0, days90Plus = 0;
        const today = new Date();

        for (const inv of allUnpaid || []) {
          const daysOverdue = Math.floor(
            (today.getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysOverdue <= 0) current += inv.balance_due;
          else if (daysOverdue <= 30) days30 += inv.balance_due;
          else if (daysOverdue <= 60) days60 += inv.balance_due;
          else days90Plus += inv.balance_due;
        }

        // Generate statement number
        const { data: seqData } = await supabaseClient.rpc("generate_statement_number");
        const statementNumber = seqData || `STMT-${Date.now()}`;

        // Create statement
        const { data: statement, error: stmtError } = await supabaseClient
          .from("customer_statements")
          .insert({
            statement_number: statementNumber,
            customer_id: customer.id,
            period_start: periodStart.toISOString().split("T")[0],
            period_end: periodEnd.toISOString().split("T")[0],
            opening_balance: openingBalance,
            total_invoiced: totalInvoiced,
            total_paid: totalPaid,
            closing_balance: closingBalance,
            current_amount: current,
            days_30_amount: days30,
            days_60_amount: days60,
            days_90_plus_amount: days90Plus,
            status: "queued",
          })
          .select()
          .single();

        if (stmtError) throw stmtError;

        // Create line items
        const lineItems = [];

        // Opening balance
        lineItems.push({
          statement_id: statement.id,
          item_type: "opening",
          description: "Opening Balance",
          debit_amount: openingBalance,
          running_balance: openingBalance,
          item_date: periodStart.toISOString().split("T")[0],
        });

        let runningBalance = openingBalance;

        // Combine invoices and payments, sort by date
        const allItems: Array<{type: 'invoice' | 'payment', date: string, data: any}> = [];

        for (const inv of periodInvoices || []) {
          allItems.push({ type: 'invoice', date: inv.invoice_date, data: inv });
        }

        for (const pay of periodPayments || []) {
          allItems.push({ type: 'payment', date: pay.created_at.split('T')[0], data: pay });
        }

        // Sort by date
        allItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Add sorted items
        for (const item of allItems) {
          if (item.type === 'invoice') {
            runningBalance += item.data.total_amount;
            lineItems.push({
              statement_id: statement.id,
              item_type: "invoice",
              reference_id: item.data.id,
              reference_number: item.data.invoice_number,
              description: `Invoice ${item.data.invoice_number}`,
              debit_amount: item.data.total_amount,
              running_balance: runningBalance,
              item_date: item.data.invoice_date,
            });
          } else {
            runningBalance -= item.data.amount;
            lineItems.push({
              statement_id: statement.id,
              item_type: "payment",
              reference_id: item.data.id,
              description: `Payment - ${item.data.payment_method}`,
              credit_amount: item.data.amount,
              running_balance: runningBalance,
              item_date: item.date,
            });
          }
        }

        // Closing balance
        lineItems.push({
          statement_id: statement.id,
          item_type: "closing",
          description: "Closing Balance",
          debit_amount: closingBalance,
          running_balance: closingBalance,
          item_date: periodEnd.toISOString().split("T")[0],
        });

        await supabaseClient.from("customer_statement_items").insert(lineItems);

        results.push({
          customer_id: customer.id,
          customer_name: customer.full_name,
          statement_number: statementNumber,
          closing_balance: closingBalance,
          status: "created",
        });
      } catch (error: any) {
        results.push({
          customer_id: customer.id,
          status: "error",
          error: error.message,
        });
      }
    }

    return new Response(
      JSON.stringify({ generated: results.filter(r => r.status === "created").length, results }),
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
