// ============================================================================
// generate-invoice-pdf v1.0
// Generates a PDF invoice from customer_invoices data and stores it in
// the invoices storage bucket.
// Supports both POST (with invoice_id in body) and GET (with query params).
// Date: February 15, 2026
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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Support both POST body and GET query params
    let invoiceId: string | null = null;
    let orderId: string | null = null;

    if (req.method === "POST") {
      const body = await req.json();
      invoiceId = body.invoice_id || null;
      orderId = body.order_id || null;
    } else {
      const url = new URL(req.url);
      invoiceId = url.searchParams.get("invoice_id");
      orderId = url.searchParams.get("order_id");
    }

    // Resolve invoice
    let invoice: any = null;

    if (invoiceId) {
      const { data, error } = await supabase
        .from("customer_invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();

      if (error || !data) throw new Error("Invoice not found");
      invoice = data;
    } else if (orderId) {
      // Find the latest invoice for this order
      const { data, error } = await supabase
        .from("customer_invoices")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) throw new Error("No invoice found for this order");
      invoice = data;
    } else {
      throw new Error("Must provide invoice_id or order_id");
    }

    console.log("Generating PDF for invoice:", invoice.invoice_number);

    // Get order details
    const { data: order } = await supabase
      .from("orders")
      .select("id, order_number, shipping_name, shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country")
      .eq("id", invoice.order_id)
      .single();

    // Get customer details (including payment method preferences and invoicing branch)
    const { data: customer } = await supabase
      .from("customers")
      .select("id, full_name, email, phone, company_name, preferred_payment_method_id, backup_payment_method_id, invoicing_branch_id")
      .eq("id", invoice.customer_id)
      .single();

    // Resolve payment method display instructions from branch_payment_methods
    let preferredMethodName: string | null = null;
    let preferredMethodInstructions: string | null = null;
    let backupMethodName: string | null = null;
    let backupMethodInstructions: string | null = null;

    const paymentMethodIds = [
      customer?.preferred_payment_method_id,
      customer?.backup_payment_method_id,
    ].filter(Boolean);

    if (paymentMethodIds.length > 0) {
      // Get method names
      const { data: methods } = await supabase
        .from("payment_methods")
        .select("id, name, code")
        .in("id", paymentMethodIds);

      // Get branch-specific display instructions if the customer has an invoicing branch
      let branchMethods: any[] = [];
      if (customer?.invoicing_branch_id) {
        const { data: bpm } = await supabase
          .from("branch_payment_methods")
          .select("payment_method_id, display_instructions, details, is_enabled")
          .eq("branch_id", customer.invoicing_branch_id)
          .in("payment_method_id", paymentMethodIds)
          .eq("is_enabled", true);
        branchMethods = bpm || [];
      }

      if (methods) {
        for (const m of methods) {
          const bpm = branchMethods.find((b: any) => b.payment_method_id === m.id);
          const instructions = bpm
            ? resolvePaymentInstructions(m.code, bpm.display_instructions, bpm.details)
            : null;

          if (m.id === customer?.preferred_payment_method_id) {
            preferredMethodName = m.name;
            preferredMethodInstructions = instructions;
          }
          if (m.id === customer?.backup_payment_method_id) {
            backupMethodName = m.name;
            backupMethodInstructions = instructions;
          }
        }
      }
    }

    // Get quote details for line items
    let quoteFiles: any[] = [];
    if (invoice.quote_id) {
      const { data: files } = await supabase
        .from("quote_files")
        .select("id, file_name, source_language, target_language, word_count, rate_per_word, subtotal")
        .eq("quote_id", invoice.quote_id)
        .eq("category_slug", "to_translate");

      quoteFiles = files || [];
    }

    // Resolve service (certified vs non-cert) for the line-item fallback label.
    // Prefer the order's service; fall back to the quote's.
    let serviceName: string | null = null;
    let serviceCode: string | null = null;
    const svcSourceId = (order as any)?.service_id || null;
    if (svcSourceId) {
      const { data: svc } = await supabase
        .from("services")
        .select("code, name")
        .eq("id", svcSourceId)
        .maybeSingle();
      if (svc) {
        serviceName = (svc as any).name || null;
        serviceCode = (svc as any).code || null;
      }
    }

    // Build PDF content as a simple text-based PDF
    const pdfBytes = buildInvoicePdf(invoice, order, customer, quoteFiles, {
      preferredMethodName,
      preferredMethodInstructions,
      backupMethodName,
      backupMethodInstructions,
      serviceName,
      serviceCode,
    });

    // Upload to storage
    const storagePath = `${invoice.customer_id}/${invoice.invoice_number}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("invoices")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw new Error("Failed to upload PDF to storage");
    }

    // Update invoice record with PDF path
    await supabase
      .from("customer_invoices")
      .update({
        pdf_storage_path: storagePath,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);

    console.log("PDF generated and stored at:", storagePath);

    // If GET request, return the PDF directly for download
    if (req.method === "GET") {
      return new Response(pdfBytes, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
        },
      });
    }

    return jsonResponse({
      success: true,
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      pdf_storage_path: storagePath,
    });
  } catch (error) {
    console.error("generate-invoice-pdf error:", error.message);
    return jsonResponse({ success: false, error: error.message }, 400);
  }
});

// ============================================================================
// PDF Generation
// Builds a minimal but valid PDF document without external dependencies.
// Uses raw PDF operators for cross-platform compatibility on Deno edge.
// ============================================================================

/**
 * Resolves placeholder tokens like [EMAIL], [ADDRESS] in display_instructions
 * using the details JSON from branch_payment_methods.
 * If instructions still contain unresolved placeholders or are empty,
 * falls back to generating instructions from the details directly.
 */
function resolvePaymentInstructions(
  code: string,
  displayInstructions: string | null,
  details: Record<string, string> | null,
): string | null {
  const d = details || {};

  // If display_instructions exist, replace placeholders with actual values
  if (displayInstructions) {
    let resolved = displayInstructions
      .replace(/\[EMAIL\]/g, d.email || "")
      .replace(/\[ADDRESS\]/g, d.address || "")
      .replace(/\[BANK\]/g, d.bank_name || "")
      .replace(/\[TRANSIT\]/g, d.transit || "")
      .replace(/\[ACCOUNT\]/g, d.account || "")
      .replace(/\[SWIFT\]/g, d.swift || "")
      .replace(/\[INSTITUTION\]/g, d.institution || "")
      .replace(/\[PAYABLE_TO\]/g, d.payable_to || "");

    // If after resolving there are no empty bracket remnants, return it
    if (!resolved.includes("[]") && resolved.trim()) {
      return resolved;
    }
  }

  // Fallback: generate instructions from details (same logic as frontend)
  switch (code) {
    case "etransfer":
      return d.email ? `Send Interac e-Transfer to: ${d.email}` : null;
    case "wire":
      return d.bank_name
        ? `Wire Transfer — ${d.bank_name}, Transit: ${d.transit}, Account: ${d.account}${d.swift ? ", SWIFT: " + d.swift : ""}`
        : null;
    case "cheque":
      return d.payable_to
        ? `Make cheque payable to ${d.payable_to}${d.address ? " and mail to: " + d.address : ""}`
        : null;
    case "direct_deposit":
      return d.bank_name
        ? `Direct Deposit — ${d.bank_name}, Transit: ${d.transit}, Account: ${d.account}`
        : null;
    case "paypal":
      return d.email ? `Send PayPal payment to: ${d.email}` : null;
    case "cash":
      return "Cash payment accepted at our office.";
    case "stripe":
    case "online":
      return "Pay online via credit/debit card at portal.cethos.com";
    default:
      return null;
  }
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildInvoicePdf(
  invoice: any,
  order: any,
  customer: any,
  lineItems: any[],
  paymentInfo: {
    preferredMethodName: string | null;
    preferredMethodInstructions: string | null;
    backupMethodName: string | null;
    backupMethodInstructions: string | null;
    serviceName?: string | null;
    serviceCode?: string | null;
  },
): Uint8Array {
  const lines: string[] = [];
  let yPos = 750;
  const leftMargin = 50;
  const pageWidth = 595.28; // A4
  const rightCol = 350;

  // Helper to escape PDF text
  const esc = (s: string) =>
    String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");

  // Helper to add a line of text
  const addText = (
    x: number,
    y: number,
    text: string,
    size = 10,
    font = "F1",
  ) => {
    lines.push(`BT /${font} ${size} Tf ${x} ${y} Td (${esc(text)}) Tj ET`);
  };

  // Helper to draw a line
  const addLine = (x1: number, y1: number, x2: number, y2: number) => {
    lines.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  };

  // Helper to draw a filled rectangle
  const addRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    g: number,
    b: number,
  ) => {
    lines.push(`${r} ${g} ${b} rg ${x} ${y} ${w} ${h} re f`);
    lines.push("0 0 0 rg"); // Reset to black
  };

  // ---- Header ----
  addRect(0, 780, pageWidth, 62, 0.118, 0.251, 0.686); // Blue header bar
  addText(leftMargin, 800, "CETHOS Translation Services", 18, "F2");
  lines.push("1 1 1 rg"); // White text
  addText(leftMargin, 800, "CETHOS Translation Services", 18, "F2");
  lines.push("0 0 0 rg"); // Black text

  // ---- Invoice title ----
  yPos = 760;
  addText(leftMargin, yPos, "INVOICE", 24, "F2");
  yPos -= 20;

  addText(leftMargin, yPos, `Invoice #: ${invoice.invoice_number}`, 10, "F2");
  addText(
    rightCol,
    yPos,
    `Date: ${new Date(invoice.invoice_date).toLocaleDateString("en-US")}`,
    10,
  );
  yPos -= 15;

  if (order?.order_number) {
    addText(leftMargin, yPos, `Order #: ${order.order_number}`, 10);
    yPos -= 15;
  }

  addText(
    rightCol,
    yPos + 15,
    `Due Date: ${new Date(invoice.due_date).toLocaleDateString("en-US")}`,
    10,
  );

  // Status badge
  const statusText = `Status: ${(invoice.status || "draft").toUpperCase()}`;
  addText(rightCol, yPos, statusText, 10, "F2");
  yPos -= 25;

  // ---- Divider ----
  addLine(leftMargin, yPos, pageWidth - leftMargin, yPos);
  yPos -= 20;

  // ---- Bill To ----
  addText(leftMargin, yPos, "Bill To:", 10, "F2");
  yPos -= 15;

  if (customer) {
    if (customer.company_name) {
      addText(leftMargin, yPos, customer.company_name, 10);
      yPos -= 14;
    }
    addText(leftMargin, yPos, customer.full_name || "", 10);
    yPos -= 14;
    addText(leftMargin, yPos, customer.email || "", 10);
    yPos -= 14;
    if (customer.phone) {
      addText(leftMargin, yPos, customer.phone, 10);
      yPos -= 14;
    }
  }

  // Shipping address on the right
  if (order) {
    let shipY = yPos + 57;
    addText(rightCol, shipY, "Ship To:", 10, "F2");
    shipY -= 15;
    if (order.shipping_name) {
      addText(rightCol, shipY, order.shipping_name, 10);
      shipY -= 14;
    }
    if (order.shipping_address_line1) {
      addText(rightCol, shipY, order.shipping_address_line1, 10);
      shipY -= 14;
    }
    if (order.shipping_address_line2) {
      addText(rightCol, shipY, order.shipping_address_line2, 10);
      shipY -= 14;
    }
    const cityStateZip = [
      order.shipping_city,
      order.shipping_state,
      order.shipping_postal_code,
    ]
      .filter(Boolean)
      .join(", ");
    if (cityStateZip) {
      addText(rightCol, shipY, cityStateZip, 10);
      shipY -= 14;
    }
    if (order.shipping_country) {
      addText(rightCol, shipY, order.shipping_country, 10);
    }
  }

  yPos -= 20;

  // ---- Line Items Table ----
  addLine(leftMargin, yPos, pageWidth - leftMargin, yPos);
  yPos -= 5;

  // Table header
  addRect(leftMargin, yPos - 12, pageWidth - leftMargin * 2, 16, 0.95, 0.95, 0.95);
  addText(leftMargin + 5, yPos, "Description", 9, "F2");
  addText(300, yPos, "Qty/Words", 9, "F2");
  addText(390, yPos, "Rate", 9, "F2");
  addText(470, yPos, "Amount", 9, "F2");
  yPos -= 20;

  // Line items
  if (lineItems.length > 0) {
    for (const item of lineItems) {
      const desc = `${item.file_name || "Translation"} (${item.source_language || "?"} > ${item.target_language || "?"})`;
      addText(leftMargin + 5, yPos, desc.substring(0, 45), 9);
      addText(300, yPos, String(item.word_count || "-"), 9);
      addText(
        390,
        yPos,
        item.rate_per_word ? `$${Number(item.rate_per_word).toFixed(4)}` : "-",
        9,
      );
      addText(
        470,
        yPos,
        item.subtotal ? `$${Number(item.subtotal).toFixed(2)}` : "-",
        9,
      );
      yPos -= 16;
    }
  } else {
    const fallbackLabel =
      paymentInfo.serviceName ||
      (paymentInfo.serviceCode === "certified_translation" ||
      !paymentInfo.serviceCode
        ? "Translation Services"
        : "Services");
    addText(leftMargin + 5, yPos, fallbackLabel, 9);
    addText(
      470,
      yPos,
      `$${Number(invoice.subtotal).toFixed(2)}`,
      9,
    );
    yPos -= 16;
  }

  yPos -= 10;
  addLine(leftMargin, yPos, pageWidth - leftMargin, yPos);
  yPos -= 20;

  // ---- Totals ----
  const totalsX = 380;
  const totalsValX = 470;

  addText(totalsX, yPos, "Subtotal:", 10);
  addText(
    totalsValX,
    yPos,
    `$${Number(invoice.subtotal).toFixed(2)}`,
    10,
  );
  yPos -= 16;

  if (Number(invoice.certification_total) > 0) {
    addText(totalsX, yPos, "Certification:", 10);
    addText(
      totalsValX,
      yPos,
      `$${Number(invoice.certification_total).toFixed(2)}`,
      10,
    );
    yPos -= 16;
  }

  if (Number(invoice.rush_fee) > 0) {
    addText(totalsX, yPos, "Rush Fee:", 10);
    addText(
      totalsValX,
      yPos,
      `$${Number(invoice.rush_fee).toFixed(2)}`,
      10,
    );
    yPos -= 16;
  }

  if (Number(invoice.delivery_fee) > 0) {
    addText(totalsX, yPos, "Delivery Fee:", 10);
    addText(
      totalsValX,
      yPos,
      `$${Number(invoice.delivery_fee).toFixed(2)}`,
      10,
    );
    yPos -= 16;
  }

  if (Number(invoice.tax_amount) > 0) {
    const taxPct = Number(invoice.tax_rate) * 100;
    addText(totalsX, yPos, `Tax (${taxPct.toFixed(1)}%):`, 10);
    addText(
      totalsValX,
      yPos,
      `$${Number(invoice.tax_amount).toFixed(2)}`,
      10,
    );
    yPos -= 16;
  }

  // Total line
  addLine(totalsX, yPos + 2, pageWidth - leftMargin, yPos + 2);
  yPos -= 4;
  addText(totalsX, yPos, "Total:", 12, "F2");
  addText(
    totalsValX,
    yPos,
    `$${Number(invoice.total_amount).toFixed(2)}`,
    12,
    "F2",
  );
  yPos -= 18;

  if (Number(invoice.amount_paid) > 0) {
    addText(totalsX, yPos, "Amount Paid:", 10);
    addText(
      totalsValX,
      yPos,
      `$${Number(invoice.amount_paid).toFixed(2)}`,
      10,
    );
    yPos -= 16;
  }

  if (Number(invoice.balance_due) > 0) {
    addText(totalsX, yPos, "Balance Due:", 12, "F2");
    addText(
      totalsValX,
      yPos,
      `$${Number(invoice.balance_due).toFixed(2)}`,
      12,
      "F2",
    );
    yPos -= 16;
  }

  // ---- Payment Method ----
  if (paymentInfo.preferredMethodName || paymentInfo.backupMethodName) {
    yPos -= 20;
    addText(leftMargin, yPos, "Payment Method:", 10, "F2");
    yPos -= 15;
    if (paymentInfo.preferredMethodName) {
      addText(leftMargin, yPos, `Preferred: ${paymentInfo.preferredMethodName}`, 9, "F2");
      yPos -= 14;
      if (paymentInfo.preferredMethodInstructions) {
        // Wrap long instructions across multiple lines (max ~75 chars per line)
        const instrLines = wrapText(paymentInfo.preferredMethodInstructions, 75);
        for (const line of instrLines) {
          addText(leftMargin + 10, yPos, line, 8);
          yPos -= 12;
        }
      }
    }
    if (paymentInfo.backupMethodName) {
      addText(leftMargin, yPos, `Backup: ${paymentInfo.backupMethodName}`, 9, "F2");
      yPos -= 14;
      if (paymentInfo.backupMethodInstructions) {
        const instrLines = wrapText(paymentInfo.backupMethodInstructions, 75);
        for (const line of instrLines) {
          addText(leftMargin + 10, yPos, line, 8);
          yPos -= 12;
        }
      }
    }
  }

  // ---- Notes ----
  if (invoice.notes) {
    yPos -= 20;
    addText(leftMargin, yPos, "Notes:", 10, "F2");
    yPos -= 15;
    addText(leftMargin, yPos, invoice.notes.substring(0, 80), 9);
  }

  // ---- Footer ----
  addText(
    leftMargin,
    40,
    "Thank you for choosing CETHOS Translation Services.",
    9,
  );
  addText(leftMargin, 28, "Questions? Contact us at support@cethos.com", 8);

  // ---- Build PDF byte stream ----
  const contentStream = lines.join("\n");
  const streamBytes = new TextEncoder().encode(contentStream);

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>
endobj

4 0 obj
<< /Length ${streamBytes.length} >>
stream
${contentStream}
endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

6 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj

xref
0 7
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000284 00000 n
0000000${String(355 + streamBytes.length).padStart(3, "0")} 00000 n
0000000${String(432 + streamBytes.length).padStart(3, "0")} 00000 n

trailer
<< /Size 7 /Root 1 0 R >>
startxref
${509 + streamBytes.length}
%%EOF`;

  return new TextEncoder().encode(pdf);
}
