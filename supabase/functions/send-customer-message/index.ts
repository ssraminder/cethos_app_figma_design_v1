import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("📨 Received customer message request");
    const { customer_id, quote_id, message_text, attachments } =
      await req.json();
    console.log("📝 Parameters:", {
      customer_id,
      quote_id,
      message_text: message_text?.substring(0, 50),
      attachments_count: attachments?.length || 0,
    });

    if (!customer_id || !message_text) {
      console.log("❌ Missing required fields");
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

    // Create Supabase client with service role key (bypasses RLS)
    console.log("🔑 Creating Supabase admin client");
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    // 1. Get customer info
    console.log("👤 Fetching customer:", customer_id);
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, email, full_name")
      .eq("id", customer_id)
      .single();

    if (customerError || !customer) {
      console.log("❌ Customer error:", customerError);
      throw new Error("Customer not found: " + customerError?.message);
    }
    console.log("✅ Customer found:", customer.full_name);

    // 2. Validate quote ownership if quote_id provided
    if (quote_id) {
      console.log("📋 Validating quote ownership:", quote_id);
      const { data: quote, error: quoteError } = await supabaseAdmin
        .from("quotes")
        .select("id, customer_id, quote_number")
        .eq("id", quote_id)
        .eq("customer_id", customer_id)
        .is("deleted_at", null)
        .single();

      if (quoteError || !quote) {
        console.log("❌ Quote validation error:", quoteError);
        throw new Error("Quote not found or access denied");
      }
      console.log("✅ Quote validated:", quote.quote_number);
    }

    // 3. Get or create conversation for this customer
    console.log("💬 Looking for conversation for customer:", customer_id);
    let conversationId: string;

    const { data: existingConversation } = await supabaseAdmin
      .from("customer_conversations")
      .select("id")
      .eq("customer_id", customer_id)
      .maybeSingle();

    if (existingConversation) {
      conversationId = existingConversation.id;
      console.log("✅ Found existing conversation:", conversationId);
    } else {
      console.log("📝 Creating new conversation");
      const { data: newConversation, error: conversationError } =
        await supabaseAdmin
          .from("customer_conversations")
          .insert({
            customer_id: customer_id,
            subject: `Customer Support - ${customer.full_name}`,
            status: "active",
          })
          .select("id")
          .single();

      if (conversationError || !newConversation) {
        console.log("❌ Conversation creation error:", conversationError);
        throw new Error(
          "Failed to create conversation: " + conversationError?.message,
        );
      }

      conversationId = newConversation.id;
      console.log("✅ Created conversation:", conversationId);
    }

    // 4. Insert message into conversation_messages
    console.log("💬 Inserting message into conversation:", conversationId);
    const { data: message, error: messageError } = await supabaseAdmin
      .from("conversation_messages")
      .insert({
        conversation_id: conversationId,
        quote_id: quote_id || null,
        sender_type: "customer",
        sender_customer_id: customer_id,
        message_text,
        message_type: "text",
        source: "app",
      })
      .select()
      .single();

    if (messageError) {
      console.log("❌ Message insert error:", messageError);
      throw new Error("Failed to insert message: " + messageError.message);
    }
    console.log("✅ Message inserted:", message.id);

    // 5. Process attachments if provided
    if (attachments && attachments.length > 0) {
      console.log("📎 Processing attachments:", attachments.length);

      for (const tempPath of attachments) {
        try {
          // Move file from temp to permanent location
          const tempBucket = "message-attachments";
          const fileName = tempPath.split("/").pop() || "file";
          const permanentPath = `conversations/${conversationId}/messages/${message.id}/${fileName}`;

          // Copy file from temp to permanent location
          const { error: copyError } = await supabaseAdmin.storage
            .from(tempBucket)
            .copy(tempPath, permanentPath);

          if (copyError) {
            console.error("Failed to copy attachment:", copyError);
            continue;
          }

          // Get file metadata
          const { data: fileData } = await supabaseAdmin.storage
            .from(tempBucket)
            .list(permanentPath.split("/").slice(0, -1).join("/"), {
              search: fileName,
            });

          const fileInfo = fileData?.[0];

          // Insert attachment record
          await supabaseAdmin.from("message_attachments").insert({
            message_id: message.id,
            file_name: fileName,
            file_type:
              fileInfo?.metadata?.mimetype || "application/octet-stream",
            file_size: fileInfo?.metadata?.size || 0,
            storage_path: permanentPath,
          });

          // Delete temp file
          await supabaseAdmin.storage.from(tempBucket).remove([tempPath]);

          console.log("✅ Attachment processed:", fileName);
        } catch (attachmentError) {
          console.error("Failed to process attachment:", attachmentError);
          // Continue with other attachments
        }
      }
    }

    // 6. Update conversation timestamp
    await supabaseAdmin
      .from("customer_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        unread_count_staff: supabaseAdmin.raw("unread_count_staff + 1"),
      })
      .eq("id", conversationId);

    // 7. Send email notification to staff (Brevo template)
    try {
      const brevoApiKey = Deno.env.get("BREVO_API_KEY");
      if (brevoApiKey) {
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": brevoApiKey,
          },
          body: JSON.stringify({
            sender: {
              name: "CETHOS Customer Portal",
              email: "noreply@cethos.com",
            },
            to: [
              {
                email: "support@cethos.com",
                name: "CETHOS Support",
              },
            ],
            subject: `New customer message from ${customer.full_name}`,
            htmlContent: `
              <h2>New Customer Message</h2>
              <p><strong>From:</strong> ${customer.full_name} (${customer.email})</p>
              <p><strong>Message:</strong></p>
              <p>${message_text}</p>
              ${quote_id ? `<p><strong>Related Quote:</strong> ${quote_id}</p>` : ""}
              <p><a href="${Deno.env.get("FRONTEND_URL")}/admin/messaging">View in Admin Panel</a></p>
            `,
          }),
        });
        console.log("✅ Email notification sent to staff");
      }
    } catch (emailError) {
      console.error("Failed to send email notification:", emailError);
      // Don't fail the operation if email fails
    }

    // 8. Return the message with full details
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
            created_at: message.created_at,
            read_by_customer_at: message.created_at, // Customer's own message is "read"
            read_by_staff_at: null,
            attachments: [], // Attachments will be loaded on refresh
          },
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("❌ Error in send-customer-message:", error);
    console.error("Error name:", error?.name);
    console.error("Error message:", error?.message);
    console.error("Error stack:", error?.stack);

    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || error?.toString() || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
