// ============================================================================
// process-inbound-email v1.0
// Processes inbound customer email replies (e.g. from Mailgun webhook),
// matches them to a conversation, inherits quote_id from the most recent
// tagged message, and stores the reply in conversation_messages.
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

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ----------------------------------------------------------------
    // Step 1: Parse inbound email payload (Mailgun multipart/form-data)
    // ----------------------------------------------------------------
    let formData: FormData;
    let senderEmail: string;
    let messageText: string;
    let emailMessageId: string | null = null;
    let attachmentCount = 0;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      formData = await req.formData();
      senderEmail = (formData.get("sender") as string || "").trim().toLowerCase();
      messageText = (formData.get("stripped-text") as string || formData.get("body-plain") as string || "").trim();
      emailMessageId = formData.get("Message-Id") as string || null;
      attachmentCount = parseInt(formData.get("attachment-count") as string || "0", 10);
    } else {
      // JSON fallback
      const body = await req.json();
      senderEmail = (body.sender || body.from || "").trim().toLowerCase();
      messageText = (body["stripped-text"] || body["body-plain"] || body.message_text || "").trim();
      emailMessageId = body["Message-Id"] || body.email_message_id || null;
      attachmentCount = body["attachment-count"] || 0;
      formData = new FormData(); // empty fallback
    }

    // Extract email from "Name <email>" format if needed
    const emailMatch = senderEmail.match(/<([^>]+)>/);
    if (emailMatch) {
      senderEmail = emailMatch[1].toLowerCase();
    }

    console.log("📬 Inbound email from:", senderEmail);
    console.log("📝 Message length:", messageText?.length || 0);

    if (!senderEmail) {
      throw new Error("Missing sender email address");
    }

    if (!messageText && attachmentCount === 0) {
      throw new Error("Empty email — no text and no attachments");
    }

    // ----------------------------------------------------------------
    // Step 2: Look up customer by email
    // ----------------------------------------------------------------
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, email, full_name")
      .eq("email", senderEmail)
      .maybeSingle();

    if (customerError) {
      console.error("Customer lookup error:", customerError);
      throw new Error("Customer lookup failed");
    }

    if (!customer) {
      console.log("⚠️ No customer found for email:", senderEmail);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unknown sender — no matching customer",
          sender: senderEmail,
        }),
        {
          status: 200, // 200 so Mailgun doesn't retry
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    console.log("👤 Customer matched:", customer.full_name, customer.id);

    // ----------------------------------------------------------------
    // Step 3: Find or create conversation
    // ----------------------------------------------------------------
    let conversationId: string;

    const { data: existingConvo } = await supabase
      .from("customer_conversations")
      .select("id")
      .eq("customer_id", customer.id)
      .limit(1)
      .maybeSingle();

    if (existingConvo) {
      conversationId = existingConvo.id;
    } else {
      const { data: newConvo, error: convoError } = await supabase
        .from("customer_conversations")
        .insert({ customer_id: customer.id })
        .select("id")
        .single();

      if (convoError || !newConvo) {
        console.error("Conversation creation failed:", convoError);
        throw new Error("Failed to create conversation");
      }

      conversationId = newConvo.id;
      console.log("💬 Created new conversation:", conversationId);
    }

    console.log("💬 Conversation:", conversationId);

    // ----------------------------------------------------------------
    // Step 4: Verify sender belongs to this conversation
    // ----------------------------------------------------------------
    const { data: convoCheck } = await supabase
      .from("customer_conversations")
      .select("customer_id")
      .eq("id", conversationId)
      .single();

    if (convoCheck?.customer_id !== customer.id) {
      throw new Error("Customer does not match conversation");
    }

    // ----------------------------------------------------------------
    // Step 5: Inherit quote_id from most recent tagged message
    // ----------------------------------------------------------------
    let inheritedQuoteId: string | null = null;
    let inheritedMetadata: Record<string, any> = {};

    try {
      const { data: recentTaggedMsg } = await supabase
        .from("conversation_messages")
        .select("quote_id, metadata")
        .eq("conversation_id", conversationId)
        .not("quote_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentTaggedMsg) {
        inheritedQuoteId = recentTaggedMsg.quote_id;
        inheritedMetadata = {
          quote_number: recentTaggedMsg.metadata?.quote_number || null,
          order_number: recentTaggedMsg.metadata?.order_number || null,
          inherited_from: "email_reply",
        };
        console.log("📎 Inherited quote_id from recent message:", inheritedQuoteId);
      }
    } catch (err) {
      console.error("⚠️ Failed to lookup recent quote_id:", err);
      // Non-blocking — message will still be created without quote_id
    }

    // ----------------------------------------------------------------
    // Step 6: Create message (includes inherited quote context)
    // ----------------------------------------------------------------
    const { data: message, error: msgError } = await supabase
      .from("conversation_messages")
      .insert({
        conversation_id: conversationId,
        quote_id: inheritedQuoteId,
        sender_type: "customer",
        sender_customer_id: customer.id,
        message_type: attachmentCount > 0 ? "file" : "text",
        message_text: messageText || null,
        source: "email",
        email_message_id: emailMessageId,
        metadata: inheritedMetadata,
      })
      .select("id, created_at")
      .single();

    if (msgError) {
      console.error("Message insert failed:", msgError);
      throw new Error("Failed to insert message");
    }

    console.log("✅ Message created:", message.id);

    // ----------------------------------------------------------------
    // Step 7: Update conversation metadata
    // ----------------------------------------------------------------
    try {
      await supabase
        .from("customer_conversations")
        .update({
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId);

      // Increment unread count for staff
      await supabase.rpc("increment_unread_staff", {
        p_conversation_id: conversationId,
      });
    } catch (updateErr) {
      console.error("Conversation update error:", updateErr);
      // Non-blocking
    }

    // ----------------------------------------------------------------
    // Step 8: Return success
    // ----------------------------------------------------------------
    console.log("✅ Inbound email processed successfully");

    return new Response(
      JSON.stringify({
        success: true,
        message_id: message.id,
        conversation_id: conversationId,
        quote_id: inheritedQuoteId,
        inherited_from: inheritedQuoteId ? "email_reply" : null,
      }),
      {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("process-inbound-email error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
