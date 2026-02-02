import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceData {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  customer: {
    full_name: string;
    email: string;
    phone: string;
    company_name?: string;
    customer_type: string;
  };
  order: {
    order_number: string;
  };
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  subtotal: number;
  certification_total: number;
  rush_fee: number;
  delivery_fee: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { invoice_id } = await req.json();

    if (!invoice_id) {
      throw new Error("invoice_id is required");
    }

    // Fetch invoice with related data
    const { data: invoice, error: invoiceError } = await supabaseClient
      .from("customer_invoices")
      .select(`
        *,
        customer:customers(*),
        order:orders(order_number, quote_id)
      `)
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      throw new Error(`Invoice not found: ${invoiceError?.message}`);
    }

    // Fetch document line items from ai_analysis_results
    const { data: analysisResults } = await supabaseClient
      .from("ai_analysis_results")
      .select("*")
      .eq("quote_id", invoice.quote_id);

    // Build invoice data
    const invoiceData: InvoiceData = {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      customer: {
        full_name: invoice.customer?.full_name || "Customer",
        email: invoice.customer?.email || "",
        phone: invoice.customer?.phone || "",
        company_name: invoice.customer?.company_name,
        customer_type: invoice.customer?.customer_type || "individual",
      },
      order: {
        order_number: invoice.order?.order_number || "",
      },
      items: (analysisResults || []).map((doc: any) => ({
        description: `${doc.detected_document_type?.replace(/_/g, " ")} - ${doc.language_name || doc.detected_language} (${doc.word_count} words)`,
        quantity: doc.billable_pages || 1,
        unit_price: doc.base_rate || 65,
        total: doc.line_total || 0,
      })),
      subtotal: invoice.subtotal,
      certification_total: invoice.certification_total,
      rush_fee: invoice.rush_fee,
      delivery_fee: invoice.delivery_fee,
      tax_rate: invoice.tax_rate,
      tax_amount: invoice.tax_amount,
      total_amount: invoice.total_amount,
      amount_paid: invoice.amount_paid,
      balance_due: invoice.balance_due,
      status: invoice.status,
    };

    // Generate PDF HTML
    const pdfHtml = generateInvoiceHtml(invoiceData);

    // For now, store HTML - PDF generation can be added later with puppeteer or similar
    const storagePath = `invoices/${invoice.customer_id}/${invoice.invoice_number}.html`;

    const { error: uploadError } = await supabaseClient.storage
      .from("invoices")
      .upload(storagePath, pdfHtml, {
        contentType: "text/html",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
    }

    // Update invoice with PDF path
    await supabaseClient
      .from("customer_invoices")
      .update({
        pdf_storage_path: storagePath,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq("id", invoice_id);

    return new Response(
      JSON.stringify({
        success: true,
        invoice_number: invoice.invoice_number,
        storage_path: storagePath,
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

function generateInvoiceHtml(data: InvoiceData): string {
  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${data.invoice_number}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .logo { font-size: 28px; font-weight: bold; color: #0d9488; }
    .invoice-title { font-size: 24px; color: #666; }
    .invoice-number { font-size: 14px; color: #888; }
    .addresses { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .address-block { width: 45%; }
    .address-block h3 { margin: 0 0 10px 0; color: #666; font-size: 12px; text-transform: uppercase; }
    .address-block p { margin: 0; line-height: 1.6; }
    .details-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    .details-table th { background: #f5f5f5; padding: 12px; text-align: left; border-bottom: 2px solid #ddd; }
    .details-table td { padding: 12px; border-bottom: 1px solid #eee; }
    .details-table .amount { text-align: right; }
    .totals { width: 300px; margin-left: auto; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; }
    .totals-row.total { border-top: 2px solid #333; font-weight: bold; font-size: 18px; }
    .totals-row.balance { color: #dc2626; }
    .totals-row.paid { color: #16a34a; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
    .status-paid { background: #dcfce7; color: #16a34a; }
    .status-issued { background: #fef3c7; color: #d97706; }
    .footer { margin-top: 60px; text-align: center; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">CETHOS</div>
      <p>Certified Translation Services</p>
    </div>
    <div style="text-align: right;">
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-number">${data.invoice_number}</div>
      <div class="status-badge status-${data.status}">${data.status.toUpperCase()}</div>
    </div>
  </div>

  <div class="addresses">
    <div class="address-block">
      <h3>Bill To</h3>
      <p>
        <strong>${data.customer.full_name}</strong><br>
        ${data.customer.company_name ? data.customer.company_name + "<br>" : ""}
        ${data.customer.email}<br>
        ${data.customer.phone}
      </p>
    </div>
    <div class="address-block">
      <h3>Invoice Details</h3>
      <p>
        <strong>Invoice Date:</strong> ${formatDate(data.invoice_date)}<br>
        <strong>Due Date:</strong> ${formatDate(data.due_date)}<br>
        <strong>Order:</strong> ${data.order.order_number}
      </p>
    </div>
  </div>

  <table class="details-table">
    <thead>
      <tr>
        <th>Description</th>
        <th class="amount">Qty</th>
        <th class="amount">Rate</th>
        <th class="amount">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${data.items.map(item => `
        <tr>
          <td>${item.description}</td>
          <td class="amount">${item.quantity.toFixed(2)}</td>
          <td class="amount">${formatCurrency(item.unit_price)}</td>
          <td class="amount">${formatCurrency(item.total)}</td>
        </tr>
      `).join("")}
      ${data.certification_total > 0 ? `
        <tr>
          <td>Certification Fee</td>
          <td class="amount">1</td>
          <td class="amount">${formatCurrency(data.certification_total)}</td>
          <td class="amount">${formatCurrency(data.certification_total)}</td>
        </tr>
      ` : ""}
      ${data.rush_fee > 0 ? `
        <tr>
          <td>Rush Fee</td>
          <td class="amount">1</td>
          <td class="amount">${formatCurrency(data.rush_fee)}</td>
          <td class="amount">${formatCurrency(data.rush_fee)}</td>
        </tr>
      ` : ""}
      ${data.delivery_fee > 0 ? `
        <tr>
          <td>Delivery Fee</td>
          <td class="amount">1</td>
          <td class="amount">${formatCurrency(data.delivery_fee)}</td>
          <td class="amount">${formatCurrency(data.delivery_fee)}</td>
        </tr>
      ` : ""}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row">
      <span>Subtotal</span>
      <span>${formatCurrency(data.subtotal)}</span>
    </div>
    ${data.tax_amount > 0 ? `
      <div class="totals-row">
        <span>Tax (${(data.tax_rate * 100).toFixed(0)}%)</span>
        <span>${formatCurrency(data.tax_amount)}</span>
      </div>
    ` : ""}
    <div class="totals-row total">
      <span>Total</span>
      <span>${formatCurrency(data.total_amount)}</span>
    </div>
    ${data.amount_paid > 0 ? `
      <div class="totals-row paid">
        <span>Amount Paid</span>
        <span>-${formatCurrency(data.amount_paid)}</span>
      </div>
    ` : ""}
    ${data.balance_due > 0 ? `
      <div class="totals-row balance">
        <span>Balance Due</span>
        <span>${formatCurrency(data.balance_due)}</span>
      </div>
    ` : ""}
  </div>

  <div class="footer">
    <p>Thank you for your business!</p>
    <p>CETHOS Corp | portal.cethos.com | support@cethoscorp.com</p>
  </div>
</body>
</html>
  `;
}
