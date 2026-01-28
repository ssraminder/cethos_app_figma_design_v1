import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload =
      req.method === "GET"
        ? Object.fromEntries(new URL(req.url).searchParams)
        : await req.json();

    const quote_id = payload.quote_id || null;
    const customer_id = payload.customer_id || null;
    const conversation_id = payload.conversation_id || null;

    console.log("📥 get-quote-messages request", {
      quote_id,
      customer_id,
      conversation_id,
      method: req.method,
    });

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

    let resolvedConversationId = conversation_id;

    if (!resolvedConversationId && customer_id) {
      const { data: conversation, error: conversationError } =
        await supabaseAdmin
          .from("customer_conversations")
          .select("id")
          .eq("customer_id", customer_id)
          .maybeSingle();

      if (conversationError) {
        console.error("❌ Conversation lookup error:", conversationError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to lookup conversation",
          }),
          { status: 500, headers: jsonHeaders },
        );
      }

      resolvedConversationId = conversation?.id ?? null;
    }

    if (!resolvedConversationId && quote_id) {
      const { data: message, error: quoteLookupError } = await supabaseAdmin
        .from("conversation_messages")
        .select("conversation_id")
        .eq("quote_id", quote_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (quoteLookupError) {
        console.error("❌ Quote lookup error:", quoteLookupError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to lookup conversation by quote",
          }),
          { status: 500, headers: jsonHeaders },
        );
      }

      resolvedConversationId = message?.conversation_id ?? null;
    }

    if (!resolvedConversationId) {
      console.log("ℹ️ No conversation found. Returning empty messages.");
      return new Response(
        JSON.stringify({
          success: true,
          messages: [],
          conversation_id: null,
        }),
        { status: 200, headers: jsonHeaders },
      );
    }

    const { data: messages, error: messagesError } = await supabaseAdmin
      .from("conversation_messages")
      .select(
        `id, conversation_id, quote_id, sender_type, sender_customer_id, sender_staff_id, message_text, message_type, source, read_by_customer_at, read_by_staff_at, created_at, message_attachments(id, filename, original_filename, mime_type, file_size, storage_path), customers:sender_customer_id(full_name, email), staff_users:sender_staff_id(full_name, email)`,
      )
      .eq("conversation_id", resolvedConversationId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("❌ Message query error:", messagesError);
      console.error("Error details:", JSON.stringify(messagesError));
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to fetch messages: ${messagesError.message || JSON.stringify(messagesError)}`,
        }),
        { status: 500, headers: jsonHeaders },
      );
    }

    const formattedMessages = (messages || []).map((msg: any) => {
      let sender_name = "Unknown";

      if (msg.sender_type === "customer" && msg.customers) {
        sender_name =
          msg.customers.full_name || msg.customers.email || "Customer";
      } else if (msg.sender_type === "staff" && msg.staff_users) {
        sender_name =
          msg.staff_users.full_name || msg.staff_users.email || "Staff";
      } else if (msg.sender_type === "system") {
        sender_name = "System";
      }

      return {
        id: msg.id,
        conversation_id: msg.conversation_id,
        quote_id: msg.quote_id,
        sender_type: msg.sender_type,
        sender_name,
        sender_customer_id: msg.sender_customer_id,
        sender_staff_id: msg.sender_staff_id,
        message_text: msg.message_text,
        source: msg.source,
        created_at: msg.created_at,
        read_by_customer_at: msg.read_by_customer_at,
        read_by_staff_at: msg.read_by_staff_at,
        attachments: msg.message_attachments || [],
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        messages: formattedMessages,
        conversation_id: resolvedConversationId,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (error) {
    console.error("❌ get-quote-messages crash:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || error?.toString() || "Internal server error",
      }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
