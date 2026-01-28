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
    console.log("📨 Received request");
    const { quote_id, customer_id, staff_id, message_text, attachments } =
      await req.json();
    console.log("📝 Parameters:", {
      quote_id,
      customer_id,
      staff_id,
      message_text: message_text?.substring(0, 50),
      attachments_count: attachments?.length || 0,
    });

    if ((!quote_id && !customer_id) || !staff_id || !message_text) {
      console.log("❌ Missing required fields");
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Missing required fields: (quote_id or customer_id), staff_id, message_text",
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

    // 1. Get customer info (from quote or directly)
    let customerId: string;
    let customerInfo: any;
    let quoteNumber: string | null = null;
    let orderNumber: string | null = null;

    if (quote_id) {
      console.log("📋 Fetching quote:", quote_id);
      const { data: quote, error: quoteError } = await supabaseAdmin
        .from("quotes")
        .select("*, customers(id, email, full_name), orders(order_number)")
        .eq("id", quote_id)
        .single();

      if (quoteError || !quote) {
        console.log("❌ Quote error:", quoteError);
        throw new Error("Quote not found: " + quoteError?.message);
      }
      console.log("✅ Quote found, customer:", quote.customer_id);
      customerId = quote.customer_id;
      customerInfo = quote.customers;
      quoteNumber = quote.quote_number;
      orderNumber = quote.orders?.[0]?.order_number || null;
      console.log("📝 Quote #", quoteNumber, orderNumber ? `(Order #${orderNumber})` : "");
    } else if (customer_id) {
      console.log("👤 Fetching customer directly:", customer_id);
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
      customerId = customer.id;
      customerInfo = customer;
    } else {
      throw new Error("Either quote_id or customer_id must be provided");
    }

    // 2. Get staff info
    console.log("👤 Fetching staff:", staff_id);
    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff_users")
      .select("full_name, email")
      .eq("id", staff_id)
      .single();

    if (staffError || !staff) {
      console.log("❌ Staff error:", staffError);
      throw new Error("Staff not found: " + staffError?.message);
    }
    console.log("✅ Staff found:", staff.full_name);

    // 3. Get or create conversation for this customer
    console.log("💬 Looking for conversation for customer:", customerId);
    let conversationId: string;

    // Try to find existing conversation for this customer
    const { data: existingConversation } = await supabaseAdmin
      .from("customer_conversations")
      .select("id")
      .eq("customer_id", customerId)
      .maybeSingle();

    if (existingConversation) {
      conversationId = existingConversation.id;
      console.log("✅ Found existing conversation:", conversationId);
    } else {
      console.log("📝 Creating new conversation");
      // Create new conversation for customer
      const { data: newConversation, error: conversationError } =
        await supabaseAdmin
          .from("customer_conversations")
          .insert({
            customer_id: customerId,
            subject: quoteNumber
              ? `Quote #${quoteNumber} - Translation Services`
              : `Customer Support - ${customerInfo?.full_name || "Customer"}`,
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
        quote_id,
        sender_type: "staff",
        sender_staff_id: staff_id,
        message_text,
        message_type: "text",
        source: "app",
        metadata: {
          quote_number: quoteNumber,
          order_number: orderNumber,
        },
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
          const tempFileName = tempPath.split("/").pop() || "file";

          // Extract original filename (without timestamp prefix)
          const originalFileName = tempFileName.replace(/^\d+-[a-z0-9]+-/, "");

          // Use original filename for permanent path (message folder provides uniqueness)
          const permanentPath = `conversations/${conversationId}/messages/${message.id}/${originalFileName}`;

          console.log(`📦 Moving file from ${tempPath} to ${permanentPath}`);
          console.log(`📄 Restoring original filename: ${originalFileName}`);

          // Copy file from temp to permanent location
          const { error: copyError } = await supabaseAdmin.storage
            .from(tempBucket)
            .copy(tempPath, permanentPath);

          if (copyError) {
            console.error("Failed to copy attachment:", copyError);
            continue;
          }

          // Get file metadata from the permanent location
          const { data: fileData, error: listError } =
            await supabaseAdmin.storage
              .from(tempBucket)
              .list(permanentPath.split("/").slice(0, -1).join("/"), {
                search: originalFileName,
              });

          if (listError) {
            console.error("Failed to get file metadata:", listError);
          }

          const fileInfo = fileData?.[0];

          // Insert attachment record with correct field names
          const { error: insertError } = await supabaseAdmin
            .from("message_attachments")
            .insert({
              message_id: message.id,
              filename: originalFileName,
              original_filename: originalFileName,
              mime_type:
                fileInfo?.metadata?.mimetype || "application/octet-stream",
              file_size: fileInfo?.metadata?.size || 0,
              storage_path: permanentPath,
            });

          if (insertError) {
            console.error("Failed to insert attachment record:", insertError);
            continue;
          }

          // Delete temp file
          const { error: deleteError } = await supabaseAdmin.storage
            .from(tempBucket)
            .remove([tempPath]);

          if (deleteError) {
            console.error("Failed to delete temp file:", deleteError);
            // Not critical, continue
          }

          console.log("✅ Attachment processed:", originalFileName);
        } catch (attachmentError) {
          console.error("Failed to process attachment:", attachmentError);
          // Continue with other attachments
        }
      }
    }

    // 6. Send email to customer if they have an email
    if (customerInfo?.email) {
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({
            templateId: 20, // New message notification template
            to: customerInfo.email,
            replyTo: staff.email || "support@cethos.com",
            params: {
              CUSTOMER_NAME: customerInfo.full_name || "Customer",
              STAFF_NAME: staff.full_name || "Cethos Team",
              MESSAGE_TEXT: message_text,
              QUOTE_NUMBER: quoteNumber || quote_id || "",
              ORDER_NUMBER: orderNumber || "",
              QUOTE_URL: quote_id
                ? `${Deno.env.get("FRONTEND_URL")}/dashboard/quotes/${quote_id}`
                : `${Deno.env.get("FRONTEND_URL")}/dashboard`,
            },
          }),
        });
      } catch (emailError) {
        console.error("Failed to send email notification:", emailError);
        // Don't fail the operation if email fails
      }
    }

    // 7. Log staff activity
    await supabaseAdmin.from("staff_activity_log").insert({
      staff_id,
      action_type: "send_message",
      entity_type: quote_id ? "quote" : "customer",
      entity_id: quote_id || customerId,
      details: {
        quote_id: quote_id || null,
        message_preview: message_text.substring(0, 100),
        customer_id: customerId,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: {
          id: message.id,
          sender_type: "staff",
          sender_name: staff.full_name,
          message_text: message.message_text,
          created_at: message.created_at,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("❌ Error in send-staff-message:", error);
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
