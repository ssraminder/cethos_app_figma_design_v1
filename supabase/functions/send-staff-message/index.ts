// ============================================================================
// send-staff-message v2.0
// Sends a message from staff to a customer, stores it in conversation_messages,
// and sends email notification via Brevo API directly.
// Date: February 15, 2026
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    const FRONTEND_URL =
      Deno.env.get("FRONTEND_URL") || "https://portal.cethos.com";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const {
      customer_id,
      quote_id,
      order_id,
      staff_id,
      message_text,
      attachments,
    } = body;

    console.log("📨 send-staff-message called with:", {
      customer_id,
      quote_id,
      staff_id,
      message_text_length: message_text?.length,
      attachments_count: attachments?.length || 0,
    });

    if (!staff_id || !message_text) {
      throw new Error("Missing required fields: staff_id, message_text");
    }

    if (!customer_id && !quote_id) {
      throw new Error("Must provide either customer_id or quote_id");
    }

    // ----------------------------------------------------------------
    // 1. Look up the staff member
    // ----------------------------------------------------------------
    const { data: staffUser, error: staffError } = await supabase
      .from("staff_users")
      .select("id, full_name, email")
      .eq("id", staff_id)
      .single();

    if (staffError || !staffUser) {
      console.error("Staff lookup failed:", staffError);
      throw new Error("Staff user not found");
    }

    console.log("👤 Staff:", staffUser.full_name, staffUser.email);

    // ----------------------------------------------------------------
    // 2. Resolve customer_id (from quote if not provided directly)
    // ----------------------------------------------------------------
    let resolvedCustomerId = customer_id;
    let quoteNumber: string | null = null;

    if (quote_id) {
      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .select("id, customer_id, quote_number")
        .eq("id", quote_id)
        .single();

      if (quoteError || !quoteData) {
        console.error("Quote lookup failed:", quoteError);
        throw new Error("Quote not found");
      }

      resolvedCustomerId = resolvedCustomerId || quoteData.customer_id;
      quoteNumber = quoteData.quote_number;
      console.log("📋 Quote:", quoteNumber, "Customer:", resolvedCustomerId);
    }

    if (!resolvedCustomerId) {
      throw new Error("Could not resolve customer_id");
    }

    // ----------------------------------------------------------------
    // 3. Look up the customer
    // ----------------------------------------------------------------
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, email, full_name")
      .eq("id", resolvedCustomerId)
      .single();

    if (customerError || !customer) {
      console.error("Customer lookup failed:", customerError);
      throw new Error("Customer not found");
    }

    console.log("👤 Customer:", customer.full_name, customer.email);

    // ----------------------------------------------------------------
    // 4. Get or create conversation
    // ----------------------------------------------------------------
    let conversationId: string;

    const { data: existingConvo } = await supabase
      .from("customer_conversations")
      .select("id")
      .eq("customer_id", resolvedCustomerId)
      .limit(1)
      .single();

    if (existingConvo) {
      conversationId = existingConvo.id;
    } else {
      const { data: newConvo, error: convoError } = await supabase
        .from("customer_conversations")
        .insert({ customer_id: resolvedCustomerId })
        .select("id")
        .single();

      if (convoError || !newConvo) {
        console.error("Conversation creation failed:", convoError);
        throw new Error("Failed to create conversation");
      }

      conversationId = newConvo.id;
      console.log("💬 Created new conversation:", conversationId);
    }

    // ----------------------------------------------------------------
    // 5. Insert the message
    // ----------------------------------------------------------------
    const messagePayload: Record<string, unknown> = {
      conversation_id: conversationId,
      sender_type: "staff",
      sender_staff_id: staff_id,
      message_type: "text",
      message_text: message_text,
      source: "app",
      metadata: {},
    };

    if (quote_id) {
      messagePayload.quote_id = quote_id;
      if (quoteNumber) {
        (messagePayload.metadata as Record<string, unknown>).quote_number =
          quoteNumber;
      }
    }

    if (order_id) {
      messagePayload.order_id = order_id;
    }

    const { data: insertedMessage, error: insertError } = await supabase
      .from("conversation_messages")
      .insert(messagePayload)
      .select("id, created_at")
      .single();

    if (insertError) {
      console.error("Message insert failed:", insertError);
      throw new Error("Failed to insert message");
    }

    console.log("✅ Message inserted:", insertedMessage.id);

    // ----------------------------------------------------------------
    // 6. Process attachments (if any)
    // ----------------------------------------------------------------
    if (attachments && attachments.length > 0) {
      try {
        for (const attachmentPath of attachments) {
          const { error: attachError } = await supabase
            .from("message_attachments")
            .update({
              message_id: insertedMessage.id,
              conversation_id: conversationId,
            })
            .eq("storage_path", attachmentPath);

          if (attachError) {
            console.error("Attachment processing error:", attachError);
          }
        }
        console.log(
          `📎 Processed ${attachments.length} attachment(s)`,
        );
      } catch (attachErr) {
        console.error("Attachment processing failed:", attachErr);
      }
    }

    // ----------------------------------------------------------------
    // 7. Update conversation metadata
    // ----------------------------------------------------------------
    try {
      await supabase
        .from("customer_conversations")
        .update({
          last_message_at: new Date().toISOString(),
          unread_count_customer: supabase.rpc ? undefined : 1,
        })
        .eq("id", conversationId);

      // Increment unread count for customer
      await supabase.rpc("increment_unread_customer", {
        p_conversation_id: conversationId,
      });
    } catch (updateErr) {
      console.error("Conversation update error:", updateErr);
      // Non-blocking — message was already inserted
    }

    // ----------------------------------------------------------------
    // 8. Send email notification via Brevo API
    // ----------------------------------------------------------------
    if (BREVO_API_KEY && customer.email) {
      try {
        const subject = quoteNumber
          ? `New message from ${staffUser.full_name} regarding quote ${quoteNumber}`
          : `New message from ${staffUser.full_name} at CETHOS`;

        const dashboardUrl = quoteNumber && quote_id
          ? `${FRONTEND_URL}/dashboard/quotes/${quote_id}`
          : `${FRONTEND_URL}/dashboard/messages`;

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1e40af;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">CETHOS Translation Services</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.5;">
                Hi ${customer.full_name || "there"},
              </p>
              <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.5;">
                You have a new message from <strong>${staffUser.full_name}</strong>${quoteNumber ? ` regarding quote <strong>${quoteNumber}</strong>` : ""}:
              </p>
              <!-- Message block -->
              <div style="margin:24px 0;padding:16px 20px;background-color:#eff6ff;border-left:4px solid #3b82f6;border-radius:0 8px 8px 0;">
                <p style="margin:0;color:#1e3a5f;font-size:15px;line-height:1.6;white-space:pre-wrap;">${message_text}</p>
              </div>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td style="background-color:#1e40af;border-radius:8px;">
                    <a href="${dashboardUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;">
                      View in Dashboard
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.5;">
                You can reply directly to this email, and your response will be delivered to our team.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                CETHOS Translation Services &bull; Professional Document Translation
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

        const emailPayload: Record<string, unknown> = {
          to: [{ email: customer.email, name: customer.full_name || customer.email }],
          sender: {
            name: "CETHOS Translation Services",
            email: "donotreply@cethos.com",
          },
          replyTo: {
            email: staffUser.email,
            name: staffUser.full_name,
          },
          subject,
          htmlContent,
        };

        console.log("📧 Sending email to:", customer.email);

        const emailResponse = await fetch(
          "https://api.brevo.com/v3/smtp/email",
          {
            method: "POST",
            headers: {
              "api-key": BREVO_API_KEY,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify(emailPayload),
          },
        );

        const emailResult = await emailResponse.json();

        if (!emailResponse.ok) {
          console.error(
            "Brevo API error:",
            emailResponse.status,
            JSON.stringify(emailResult),
          );
        } else {
          console.log(
            "✅ Email sent successfully, messageId:",
            emailResult.messageId,
          );
        }
      } catch (emailErr) {
        console.error("Email sending failed:", emailErr);
        // Non-blocking — message was already stored
      }
    } else {
      console.log(
        "⚠️ Email not sent:",
        !BREVO_API_KEY ? "BREVO_API_KEY not set" : "No customer email",
      );
    }

    // ----------------------------------------------------------------
    // 9. Log to staff_activity_log (non-blocking)
    // ----------------------------------------------------------------
    try {
      await supabase.from("staff_activity_log").insert({
        staff_id: staff_id,
        action: "message_sent",
        entity_type: "quote",
        entity_id: quote_id || null,
        details: {
          customer_id: resolvedCustomerId,
          customer_email: customer.email,
          quote_number: quoteNumber,
          message_preview: message_text.substring(0, 100),
        },
      });
    } catch (logErr) {
      console.error("Activity log error:", logErr);
    }

    // ----------------------------------------------------------------
    // 10. Return success
    // ----------------------------------------------------------------
    return new Response(
      JSON.stringify({
        success: true,
        message_id: insertedMessage.id,
        conversation_id: conversationId,
      }),
      {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("send-staff-message error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
