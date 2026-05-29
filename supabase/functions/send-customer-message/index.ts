// ============================================================================
// send-customer-message v2.0
// Sends a message from a customer, stores it in conversation_messages,
// processes attachments, and sends admin notification email via Brevo.
// Now includes attachment download links in the notification email.
// Date: April 15, 2026
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  ctaButton,
  detailsTable,
  emailShell,
  esc as escShell,
  lead,
  messageBlock,
  REPLY,
  statusBadge,
  title,
  type TemplateMeta,
} from "../_shared/email-shell.ts";

const TEMPLATE: TemplateMeta = {
  name: "Admin — Customer Message Received",
  version: "2.0",
  updatedAt: "2026-05-28",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { customer_id, quote_id, order_id, message_text, attachments } =
      await req.json();

    if (!customer_id || !message_text) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: customer_id, message_text",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ----------------------------------------------------------------
    // 1. Look up customer
    // ----------------------------------------------------------------
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, email, full_name")
      .eq("id", customer_id)
      .single();

    if (customerError || !customer) throw new Error("Customer not found");

    console.log("👤 Customer:", customer.full_name, customer.email);

    // ----------------------------------------------------------------
    // 2. Resolve quote/order context from explicit params
    // ----------------------------------------------------------------
    let resolvedQuoteId = quote_id || null;
    let resolvedOrderId = order_id || null;
    let quoteNumber: string | null = null;
    let orderNumber: string | null = null;
    let contextSource = "explicit";

    if (resolvedQuoteId) {
      const { data: quoteData, error: quoteError } = await supabaseAdmin
        .from("quotes")
        .select("id, customer_id, quote_number, orders(id, order_number)")
        .eq("id", resolvedQuoteId)
        .eq("customer_id", customer_id)
        .is("deleted_at", null)
        .single();

      if (quoteError || !quoteData)
        throw new Error("Quote not found or access denied");
      quoteNumber = quoteData.quote_number;
      resolvedOrderId =
        resolvedOrderId || quoteData.orders?.[0]?.id || null;
      orderNumber = quoteData.orders?.[0]?.order_number || null;
    } else if (resolvedOrderId) {
      const { data: orderData } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, quote_id, quotes(id, quote_number)")
        .eq("id", resolvedOrderId)
        .eq("customer_id", customer_id)
        .single();

      if (orderData) {
        orderNumber = orderData.order_number;
        resolvedQuoteId =
          orderData.quote_id || orderData.quotes?.[0]?.id || null;
        quoteNumber = orderData.quotes?.[0]?.quote_number || null;
      }
    }

    // ----------------------------------------------------------------
    // 3. Find or create conversation
    // ----------------------------------------------------------------
    let conversationId: string;
    const { data: existingConv } = await supabaseAdmin
      .from("customer_conversations")
      .select("id")
      .eq("customer_id", customer_id)
      .maybeSingle();

    if (existingConv) {
      conversationId = existingConv.id;
    } else {
      const { data: newConv, error: convError } = await supabaseAdmin
        .from("customer_conversations")
        .insert({
          customer_id: customer_id,
          subject: `Customer Support - ${customer.full_name}`,
          status: "active",
        })
        .select("id")
        .single();

      if (convError || !newConv)
        throw new Error("Failed to create conversation");
      conversationId = newConv.id;
    }

    // ----------------------------------------------------------------
    // 4. INHERITANCE: If still no quote_id, inherit from recent message
    // ----------------------------------------------------------------
    if (!resolvedQuoteId && conversationId) {
      const { data: recentMsg } = await supabaseAdmin
        .from("conversation_messages")
        .select("quote_id, order_id, metadata")
        .eq("conversation_id", conversationId)
        .not("quote_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentMsg) {
        resolvedQuoteId = recentMsg.quote_id;
        resolvedOrderId = recentMsg.order_id || null;
        quoteNumber = recentMsg.metadata?.quote_number || null;
        orderNumber = recentMsg.metadata?.order_number || null;
        contextSource = "conversation_context";

        if (resolvedQuoteId && !quoteNumber) {
          const { data: qLookup } = await supabaseAdmin
            .from("quotes")
            .select("quote_number, orders(id, order_number)")
            .eq("id", resolvedQuoteId)
            .maybeSingle();

          if (qLookup) {
            quoteNumber = qLookup.quote_number;
            if (!resolvedOrderId && qLookup.orders?.[0]) {
              resolvedOrderId = qLookup.orders[0].id;
              orderNumber = qLookup.orders[0].order_number;
            }
          }
        }

        if (resolvedOrderId && !orderNumber) {
          const { data: oLookup } = await supabaseAdmin
            .from("orders")
            .select("order_number")
            .eq("id", resolvedOrderId)
            .maybeSingle();
          if (oLookup) orderNumber = oLookup.order_number;
        }

        console.log(
          `Inherited context from conversation: quote=${quoteNumber}, order=${orderNumber}`,
        );
      }
    }

    // ----------------------------------------------------------------
    // 5. FINAL FALLBACK: Auto-tag to customer's most recent active order
    // ----------------------------------------------------------------
    if (!resolvedQuoteId) {
      const { data: latestOrder } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, quote_id, quotes(id, quote_number)")
        .eq("customer_id", customer_id)
        .in("status", ["pending", "paid", "in_production", "draft_review"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestOrder) {
        resolvedOrderId = latestOrder.id;
        orderNumber = latestOrder.order_number;
        resolvedQuoteId =
          latestOrder.quote_id || latestOrder.quotes?.[0]?.id || null;
        quoteNumber = latestOrder.quotes?.[0]?.quote_number || null;
        contextSource = "auto_tagged_latest_order";
        console.log(
          `Auto-tagged to latest active order: order=${orderNumber}, quote=${quoteNumber}`,
        );
      }
    }

    // ----------------------------------------------------------------
    // 6. Insert message
    // ----------------------------------------------------------------
    const { data: message, error: msgError } = await supabaseAdmin
      .from("conversation_messages")
      .insert({
        conversation_id: conversationId,
        quote_id: resolvedQuoteId,
        order_id: resolvedOrderId,
        sender_type: "customer",
        sender_customer_id: customer_id,
        message_text: message_text,
        message_type: "text",
        source: "app",
        metadata: {
          quote_number: quoteNumber,
          order_number: orderNumber,
          ...(contextSource !== "explicit"
            ? { inherited_from: contextSource }
            : {}),
        },
      })
      .select()
      .single();

    if (msgError) throw new Error("Failed to insert message");

    console.log("✅ Message inserted:", message.id);

    // ----------------------------------------------------------------
    // 7. Handle attachments (temp path -> permanent path + record)
    // ----------------------------------------------------------------
    interface ProcessedAttachment {
      original_filename: string;
      filename: string;
      storage_path: string;
      file_size: number;
      mime_type: string;
    }
    const processedAttachments: ProcessedAttachment[] = [];

    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        try {
          const bucket = "message-attachments";
          const rawFilename = att.split("/").pop() || "file";
          const cleanFilename = rawFilename.replace(/^\d+-[a-z0-9]+-/, "");
          const storagePath = `conversations/${conversationId}/messages/${message.id}/${cleanFilename}`;

          const { error: copyErr } = await supabaseAdmin.storage
            .from(bucket)
            .copy(att, storagePath);
          if (copyErr) {
            console.error("Failed to copy attachment:", copyErr);
            continue;
          }

          const { data: fileList } = await supabaseAdmin.storage
            .from(bucket)
            .list(storagePath.split("/").slice(0, -1).join("/"), {
              search: cleanFilename,
            });

          const fileInfo = fileList?.[0];
          const fileSize = fileInfo?.metadata?.size || 0;
          const mimeType =
            fileInfo?.metadata?.mimetype || "application/octet-stream";

          await supabaseAdmin.from("message_attachments").insert({
            message_id: message.id,
            filename: cleanFilename,
            original_filename: cleanFilename,
            mime_type: mimeType,
            file_size: fileSize,
            storage_path: storagePath,
          });

          processedAttachments.push({
            original_filename: cleanFilename,
            filename: cleanFilename,
            storage_path: storagePath,
            file_size: fileSize,
            mime_type: mimeType,
          });

          // Delete temp file
          await supabaseAdmin.storage.from(bucket).remove([att]);
        } catch (_e) {
          console.error("Attachment processing error:", _e);
          // Non-blocking
        }
      }

      console.log(
        `📎 Processed ${processedAttachments.length} attachment(s)`,
      );
    }

    // ----------------------------------------------------------------
    // 8. Update conversation metadata
    // ----------------------------------------------------------------
    const { data: convData } = await supabaseAdmin
      .from("customer_conversations")
      .select("unread_count_staff")
      .eq("id", conversationId)
      .single();

    await supabaseAdmin
      .from("customer_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        unread_count_staff: (convData?.unread_count_staff || 0) + 1,
      })
      .eq("id", conversationId);

    // ----------------------------------------------------------------
    // 9. Send admin notification email via Brevo (with attachments)
    // ----------------------------------------------------------------
    try {
      const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
      if (BREVO_API_KEY) {
        const FRONTEND_URL =
          Deno.env.get("FRONTEND_URL") || "https://portal.cethos.com";

        const refParts: string[] = [];
        if (orderNumber) refParts.push(`Order: ${orderNumber}`);
        if (quoteNumber) refParts.push(`Quote: ${quoteNumber}`);
        const refLine =
          refParts.length > 0
            ? refParts.join(" / ")
            : "No order/quote linked";

        const subjectRef = orderNumber || quoteNumber || "";
        const emailSubject = subjectRef
          ? `New customer message from ${customer.full_name} \u2014 ${subjectRef}`
          : `New customer message from ${customer.full_name}`;

        let adminLink = `${FRONTEND_URL}/admin/messages`;
        if (resolvedOrderId) {
          adminLink = `${FRONTEND_URL}/admin/orders/${resolvedOrderId}`;
        } else if (resolvedQuoteId) {
          adminLink = `${FRONTEND_URL}/admin/quotes/${resolvedQuoteId}`;
        }

        // Build attachment HTML section and Brevo file attachments
        let attachmentsHtml = "";
        const brevoAttachments: { name: string; content: string }[] = [];

        if (processedAttachments.length > 0) {
          const linkItems: string[] = [];
          for (const att of processedAttachments) {
            const displayName = att.original_filename || att.filename || "file";
            const sizeKB = att.file_size
              ? `${(att.file_size / 1024).toFixed(1)} KB`
              : "";

            // Generate signed URL (24-hour expiry)
            const { data: signedData } = await supabaseAdmin.storage
              .from("message-attachments")
              .createSignedUrl(att.storage_path, 86400);

            const downloadLink = signedData?.signedUrl || adminLink;

            linkItems.push(`
              <tr>
                <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="font-size:14px;color:#374151;">
                        &#128206; <a href="${downloadLink}" style="color:#1e40af;text-decoration:underline;font-weight:500;">${displayName}</a>
                        <span style="color:#9ca3af;font-size:12px;margin-left:8px;">${sizeKB}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`);

            // Embed file in email as base64 (under 10MB)
            if (att.file_size && att.file_size <= 10 * 1024 * 1024) {
              try {
                const { data: fileBlob } = await supabaseAdmin.storage
                  .from("message-attachments")
                  .download(att.storage_path);

                if (fileBlob) {
                  const arrayBuffer = await fileBlob.arrayBuffer();
                  const bytes = new Uint8Array(arrayBuffer);
                  let binary = "";
                  for (let i = 0; i < bytes.length; i++) {
                    binary += String.fromCharCode(bytes[i]);
                  }
                  const base64Content = btoa(binary);
                  brevoAttachments.push({
                    name: displayName,
                    content: base64Content,
                  });
                }
              } catch (dlErr) {
                console.error(
                  `Failed to download attachment for email: ${displayName}`,
                  dlErr,
                );
              }
            }
          }

          attachmentsHtml = `
              <!-- Attachments -->
              <div style="margin:24px 0;">
                <p style="margin:0 0 8px;color:#374151;font-size:14px;font-weight:600;">
                  &#128206; Attached Files (${processedAttachments.length})
                </p>
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                  ${linkItems.join("")}
                </table>
                <p style="margin:8px 0 0;color:#9ca3af;font-size:12px;">
                  Download links expire in 24 hours. Files are also attached to this email.
                </p>
              </div>`;
        }

        const htmlContent = emailShell(
          [
            statusBadge("info", "New customer message"),
            title(`New message from ${escShell(customer.full_name)}`),
            lead(`A new message just came in from the customer portal. Reply directly to the customer at ${escShell(customer.email)}, or open the admin panel to thread the conversation.`),
            detailsTable([
              ["From", `${escShell(customer.full_name)} (${escShell(customer.email)})`],
              ["Reference", String(refLine)],
            ]),
            messageBlock(escShell(message_text).replace(/\n/g, "<br />")),
            attachmentsHtml,
            ctaButton({ label: "View in admin panel", url: adminLink }),
          ].join(""),
          { replyTo: REPLY.ops, template: TEMPLATE, preheader: `New message from ${escShell(customer.full_name)}` },
        );

        const emailPayload: Record<string, unknown> = {
          sender: {
            name: "Cethos Customer Portal",
            email: "donotreply@cethos.com",
          },
          replyTo: { email: REPLY.ops },
          to: [{ email: "support@cethos.com", name: "Cethos Support" }],
          subject: emailSubject,
          htmlContent,
        };

        // Attach files to email if any were processed
        if (brevoAttachments.length > 0) {
          emailPayload.attachment = brevoAttachments;
          console.log(
            `📎 Including ${brevoAttachments.length} file attachment(s) in email`,
          );
        }

        console.log("📧 Sending admin notification email");

        const emailResponse = await fetch(
          "https://api.brevo.com/v3/smtp/email",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "api-key": BREVO_API_KEY,
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
            "✅ Admin notification sent, messageId:",
            emailResult.messageId,
          );
        }
      }
    } catch (emailErr) {
      console.error("Failed to send admin notification:", emailErr);
      // Non-blocking — message was already stored
    }

    // ----------------------------------------------------------------
    // 10. Return success with full message context
    // ----------------------------------------------------------------
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          message: {
            id: message.id,
            conversation_id: conversationId,
            sender_type: "customer",
            sender_name: customer.full_name || customer.email || "Customer",
            sender_customer_id: customer_id,
            message_text: message.message_text,
            quote_id: resolvedQuoteId,
            order_id: resolvedOrderId,
            metadata: message.metadata,
            created_at: message.created_at,
            read_by_customer_at: message.created_at,
            read_by_staff_at: null,
            attachments: processedAttachments.map((a) => ({
              filename: a.filename,
              original_filename: a.original_filename,
              file_size: a.file_size,
              mime_type: a.mime_type,
            })),
          },
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    console.error("send-customer-message error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
