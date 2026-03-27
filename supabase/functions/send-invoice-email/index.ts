// ============================================================================
// send-invoice-email v1.0
// Sends a customer invoice by email with a PDF download link.
// Updates invoice status to "sent" after successful delivery.
// Date: March 26, 2026
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

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }
    if (!BREVO_API_KEY) {
      throw new Error("BREVO_API_KEY not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { invoice_id, custom_message, recipient_emails } = await req.json();
    if (!invoice_id) {
      throw new Error("Missing required field: invoice_id");
    }

    // Fetch invoice
    const { data: invoice, error: invError } = await supabase
      .from("customer_invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();

    if (invError || !invoice) {
      throw new Error("Invoice not found");
    }

    if (invoice.status === "void") {
      throw new Error("Cannot send a voided invoice");
    }

    if (!invoice.pdf_storage_path) {
      throw new Error("Invoice PDF has not been generated yet. Please generate the PDF first.");
    }

    // Fetch customer
    const { data: customer, error: custError } = await supabase
      .from("customers")
      .select("id, full_name, email, company_name")
      .eq("id", invoice.customer_id)
      .single();

    if (custError || !customer) {
      throw new Error("Customer not found");
    }

    if (!customer.email && (!Array.isArray(recipient_emails) || recipient_emails.length === 0)) {
      throw new Error("Customer does not have an email address on file");
    }

    // Generate a signed URL for the PDF (valid for 7 days)
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from("invoices")
      .createSignedUrl(invoice.pdf_storage_path, 60 * 60 * 24 * 7);

    if (urlError || !signedUrlData?.signedUrl) {
      throw new Error("Failed to generate PDF download link");
    }

    const pdfUrl = signedUrlData.signedUrl;

    // Format currency
    const currency = invoice.currency || "CAD";
    const totalFormatted = Number(invoice.total_amount).toLocaleString("en-CA", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    });
    const balanceFormatted = Number(invoice.balance_due).toLocaleString("en-CA", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    });

    // Format dates
    const invoiceDate = invoice.invoice_date
      ? new Date(invoice.invoice_date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "N/A";
    const dueDate = invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "N/A";

    const customerName = customer.company_name || customer.full_name || "Valued Customer";

    // Build email HTML
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; }
    .header { background-color: #1e40af; color: #fff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
    .body { padding: 32px; }
    .invoice-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .invoice-box table { width: 100%; border-collapse: collapse; }
    .invoice-box td { padding: 6px 0; font-size: 14px; }
    .invoice-box td:last-child { text-align: right; font-weight: 600; }
    .label { color: #64748b; }
    .amount { font-size: 18px; color: #1e40af; }
    .btn { display: inline-block; background-color: #1e40af; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 16px; }
    .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>CETHOS Translation Services</h1>
    </div>
    <div class="body">
      <p>Dear ${customerName},</p>
      <p>Please find below the details of your invoice. A PDF copy is attached for your records.</p>
${custom_message ? `
      <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
        <p style="margin: 0; font-size: 14px; color: #333; white-space: pre-line;">${custom_message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
      </div>
` : ""}
      <div class="invoice-box">
        <table>
          <tr>
            <td class="label">Invoice Number</td>
            <td>${invoice.invoice_number}</td>
          </tr>
          <tr>
            <td class="label">Invoice Date</td>
            <td>${invoiceDate}</td>
          </tr>
          <tr>
            <td class="label">Due Date</td>
            <td>${dueDate}</td>
          </tr>
          <tr>
            <td class="label">Total Amount</td>
            <td>${totalFormatted}</td>
          </tr>
          <tr>
            <td class="label">Balance Due</td>
            <td class="amount">${balanceFormatted}</td>
          </tr>
        </table>
      </div>

      <a href="${pdfUrl}" class="btn">Download Invoice PDF</a>

      <p style="margin-top: 24px; font-size: 13px; color: #64748b;">
        If you have any questions about this invoice, please don't hesitate to contact us.
      </p>
    </div>
    <div class="footer">
      <p>CETHOS Translation Services<br>This is an automated message. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;

    // Build recipient list: use provided emails or fall back to customer email
    const toEmails: Array<{ email: string; name: string }> = [];
    if (Array.isArray(recipient_emails) && recipient_emails.length > 0) {
      for (const addr of recipient_emails) {
        if (typeof addr === "string" && addr.includes("@")) {
          // Use the customer name for the primary email, generic name for extras
          const name = addr.toLowerCase() === customer.email?.toLowerCase()
            ? customerName
            : addr;
          toEmails.push({ email: addr, name });
        }
      }
    }
    if (toEmails.length === 0) {
      if (!customer.email) {
        throw new Error("Customer does not have an email address on file");
      }
      toEmails.push({ email: customer.email, name: customerName });
    }

    // Send email via Brevo
    const emailPayload = {
      to: toEmails,
      sender: {
        name: "Cethos Translation Services",
        email: "donotreply@cethos.com",
      },
      subject: `Invoice ${invoice.invoice_number} from Cethos Translation Services`,
      htmlContent,
    };

    const sentToList = toEmails.map((t) => t.email).join(", ");
    console.log(`Sending invoice ${invoice.invoice_number} to ${sentToList}`);

    const brevoResp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const brevoResult = await brevoResp.json();

    if (!brevoResp.ok) {
      console.error("Brevo API error:", JSON.stringify(brevoResult));
      throw new Error(
        `Email delivery failed: ${brevoResult.message || brevoResp.statusText}`
      );
    }

    console.log("Invoice email sent successfully:", brevoResult.messageId);

    // Update invoice status to "sent" if currently "issued"
    if (invoice.status === "issued") {
      await supabase
        .from("customer_invoices")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", invoice.id);
    }

    // Log activity
    if (invoice.order_id) {
      await supabase.from("order_activity_log").insert({
        order_id: invoice.order_id,
        action: "invoice_emailed",
        details: {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          sent_to: sentToList,
          message_id: brevoResult.messageId,
        },
      });
    }

    return jsonResponse({
      success: true,
      sent_to: sentToList,
      message_id: brevoResult.messageId,
    });
  } catch (error) {
    console.error("send-invoice-email error:", error.message);
    return jsonResponse({ success: false, error: error.message }, 400);
  }
});
