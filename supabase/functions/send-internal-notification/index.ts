import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Internal notification recipients
const INTERNAL_RECIPIENTS = [
  { email: "info@cethos.com", name: "Cethos Info" },
  { email: "raminder@cethos.com", name: "Raminder" },
  { email: "pm@cethos.com", name: "Project Manager" },
];

interface NotificationRequest {
  type: "quote_to_lead" | "new_order";
  quoteId?: string;
  orderId?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: NotificationRequest = await req.json();
    const { type, quoteId, orderId } = body;

    console.log(`Sending internal notification: ${type}`);

    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoApiKey) {
      console.error("BREVO_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch quote data
    let quote: any = null;
    let order: any = null;
    let customer: any = null;
    let documentCount = 0;
    const filesWithUrls: { filename: string; size: number; url: string }[] = [];

    if (type === "quote_to_lead" && quoteId) {
      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .select(`
          *,
          customer:customers(id, email, full_name),
          source_language:languages!quotes_source_language_id_fkey(name),
          target_language:languages!quotes_target_language_id_fkey(name)
        `)
        .eq("id", quoteId)
        .single();

      if (quoteError || !quoteData) {
        console.error("Quote not found:", quoteError);
        return new Response(
          JSON.stringify({ error: "Quote not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      quote = quoteData;
      customer = quoteData.customer;

      // Get document count
      const { count } = await supabase
        .from("quote_files")
        .select("*", { count: "exact", head: true })
        .eq("quote_id", quoteId);
      documentCount = count || 0;

      // Fetch files for this quote
      const { data: quoteFiles } = await supabase
        .from("quote_files")
        .select("id, original_filename, storage_path, file_size")
        .eq("quote_id", quoteId)
        .order("created_at");

      // Generate signed URLs
      if (quoteFiles && quoteFiles.length > 0) {
        for (const file of quoteFiles) {
          const { data: signedUrlData } = await supabase
            .storage
            .from("quote-files")
            .createSignedUrl(file.storage_path, 60 * 60 * 24); // 24 hours

          if (signedUrlData) {
            filesWithUrls.push({
              filename: file.original_filename,
              size: file.file_size,
              url: signedUrlData.signedUrl,
            });
          }
        }
      }
    } else if (type === "new_order" && orderId) {
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select(`
          *,
          customer:customers(id, email, full_name),
          quote:quotes(
            id,
            quote_number,
            source_language:languages!quotes_source_language_id_fkey(name),
            target_language:languages!quotes_target_language_id_fkey(name)
          )
        `)
        .eq("id", orderId)
        .single();

      if (orderError || !orderData) {
        console.error("Order not found:", orderError);
        return new Response(
          JSON.stringify({ error: "Order not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      order = orderData;
      quote = orderData.quote;
      customer = orderData.customer;

      // Get document count from quote
      if (quote?.id) {
        const { count } = await supabase
          .from("quote_files")
          .select("*", { count: "exact", head: true })
          .eq("quote_id", quote.id);
        documentCount = count || 0;

        // Fetch files for this quote
        const { data: quoteFiles } = await supabase
          .from("quote_files")
          .select("id, original_filename, storage_path, file_size")
          .eq("quote_id", quote.id)
          .order("created_at");

        // Generate signed URLs
        if (quoteFiles && quoteFiles.length > 0) {
          for (const file of quoteFiles) {
            const { data: signedUrlData } = await supabase
              .storage
              .from("quote-files")
              .createSignedUrl(file.storage_path, 60 * 60 * 24); // 24 hours

            if (signedUrlData) {
              filesWithUrls.push({
                filename: file.original_filename,
                size: file.file_size,
                url: signedUrlData.signedUrl,
              });
            }
          }
        }
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid notification type or missing ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format currency
    const total = type === "new_order" ? (order?.total_amount || 0) : (quote?.total || 0);
    const formattedTotal = new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(total);

    // Format date
    const formattedDate = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Edmonton",
    });

    const customerName = customer?.full_name || "Unknown Customer";
    const customerEmail = customer?.email || "N/A";
    const sourceLanguage = quote?.source_language?.name || "N/A";
    const targetLanguage = quote?.target_language?.name || "N/A";

    // Generate files HTML section
    const filesHtml = filesWithUrls.length > 0 ? `
      <div style="background-color: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">📎 Files (${filesWithUrls.length})</h3>
        ${filesWithUrls.map(file => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f3f4f6;">
            <div>
              <span style="color: #111827;">📄 ${file.filename}</span>
              <span style="color: #9ca3af; font-size: 12px; margin-left: 8px;">(${(file.size / 1024).toFixed(1)} KB)</span>
            </div>
            <a href="${file.url}" style="background-color: #7c3aed; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500;">Download</a>
          </div>
        `).join('')}
        <p style="margin: 15px 0 0 0; color: #6b7280; font-size: 12px;">⏰ Download links expire in 24 hours</p>
      </div>
    ` : '';

    let subject: string;
    let emailHtml: string;

    if (type === "quote_to_lead") {
      const quoteNumber = quote?.quote_number || "N/A";
      subject = `🎯 New Lead: ${quoteNumber} - ${customerName}`;
      emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .header h1 { margin: 0; font-size: 24px; }
            .header .emoji { font-size: 48px; margin-bottom: 10px; }
            .content { padding: 30px; background-color: #f9fafb; }
            .info-box { background-color: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
            .info-row:last-child { border-bottom: none; }
            .info-label { color: #6b7280; font-size: 14px; }
            .info-value { font-weight: 600; color: #111827; }
            .highlight { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }
            .cta-button { display: inline-block; padding: 14px 30px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="emoji">🎯</div>
              <h1>New Lead Received!</h1>
            </div>
            <div class="content">
              <p>A new quote has been converted to a <strong>Lead</strong> and requires attention.</p>

              <div class="info-box">
                <div class="info-row">
                  <span class="info-label">Quote Number</span>
                  <span class="info-value">${quoteNumber}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Customer</span>
                  <span class="info-value">${customerName}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Email</span>
                  <span class="info-value">${customerEmail}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Languages</span>
                  <span class="info-value">${sourceLanguage} → ${targetLanguage}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Documents</span>
                  <span class="info-value">${documentCount} file(s)</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Estimated Total</span>
                  <span class="info-value" style="color: #059669; font-size: 18px;">${formattedTotal}</span>
                </div>
              </div>

              ${filesHtml}

              <div class="highlight">
                <strong>⏰ Action Required:</strong> Please review this lead in the HITL queue and process the quote.
              </div>

              <div style="text-align: center; margin-top: 30px;">
                <a href="https://portal.cethos.com/admin/hitl" class="cta-button">View HITL Queue</a>
              </div>

              <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
                Received: ${formattedDate}
              </p>
            </div>
            <div class="footer">
              <p>This is an automated notification from Cethos Translation Services.</p>
            </div>
          </div>
        </body>
        </html>
      `;
    } else {
      // new_order
      const orderNumber = order?.order_number || "N/A";
      const quoteNumber = quote?.quote_number || "N/A";
      subject = `🎉 New Order: ${orderNumber} - ${customerName} - ${formattedTotal}`;
      emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .header h1 { margin: 0; font-size: 24px; }
            .header .emoji { font-size: 48px; margin-bottom: 10px; }
            .content { padding: 30px; background-color: #f9fafb; }
            .info-box { background-color: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
            .info-row:last-child { border-bottom: none; }
            .info-label { color: #6b7280; font-size: 14px; }
            .info-value { font-weight: 600; color: #111827; }
            .success-box { background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }
            .total-box { background-color: #059669; color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
            .total-box .amount { font-size: 32px; font-weight: bold; }
            .cta-button { display: inline-block; padding: 14px 30px; background-color: #059669; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="emoji">🎉</div>
              <h1>New Order Received!</h1>
            </div>
            <div class="content">
              <div class="success-box">
                <strong>✅ Payment Confirmed!</strong> A new order has been placed and is ready for processing.
              </div>

              <div class="total-box">
                <div style="font-size: 14px; opacity: 0.9;">Order Total</div>
                <div class="amount">${formattedTotal}</div>
              </div>

              <div class="info-box">
                <div class="info-row">
                  <span class="info-label">Order Number</span>
                  <span class="info-value">${orderNumber}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Quote Number</span>
                  <span class="info-value">${quoteNumber}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Customer</span>
                  <span class="info-value">${customerName}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Email</span>
                  <span class="info-value">${customerEmail}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Languages</span>
                  <span class="info-value">${sourceLanguage} → ${targetLanguage}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Documents</span>
                  <span class="info-value">${documentCount} file(s)</span>
                </div>
              </div>

              ${filesHtml}

              <div style="text-align: center; margin-top: 30px;">
                <a href="https://portal.cethos.com/admin/orders" class="cta-button">View Orders</a>
              </div>

              <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
                Order placed: ${formattedDate}
              </p>
            </div>
            <div class="footer">
              <p>This is an automated notification from Cethos Translation Services.</p>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    // Send email via Brevo to all recipients
    let emailsSent = 0;
    for (const recipient of INTERNAL_RECIPIENTS) {
      try {
        const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": brevoApiKey,
          },
          body: JSON.stringify({
            sender: {
              name: "Cethos Notifications",
              email: "noreply@cethos.com",
            },
            to: [{ email: recipient.email, name: recipient.name }],
            subject,
            htmlContent: emailHtml,
          }),
        });

        if (brevoResponse.ok) {
          emailsSent++;
          console.log(`Email sent to ${recipient.email}`);
        } else {
          const errorText = await brevoResponse.text();
          console.error(`Failed to send to ${recipient.email}:`, errorText);
        }
      } catch (err) {
        console.error(`Error sending to ${recipient.email}:`, err);
      }
    }

    // Log activity
    await supabase.from("staff_activity_log").insert({
      action: `internal_notification_${type}`,
      resource_type: type === "new_order" ? "order" : "quote",
      resource_id: orderId || quoteId,
      details: {
        type,
        emails_sent: emailsSent,
        recipients: INTERNAL_RECIPIENTS.map(r => r.email),
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        emailsSent,
        recipients: INTERNAL_RECIPIENTS.length
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
