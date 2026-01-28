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
    const { quote_id } = await req.json();

    if (!quote_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing quote_id",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Create Supabase client with service role key (bypasses RLS)
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

    // Fetch messages
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from("conversation_messages")
      .select(
        `
        id,
        conversation_id,
        quote_id,
        sender_type,
        sender_customer_id,
        sender_staff_id,
        message_text,
        message_type,
        source,
        read_by_customer_at,
        read_by_staff_at,
        created_at
      `,
      )
      .eq("quote_id", quote_id)
      .order("created_at", { ascending: true });

    if (messagesError) {
      throw new Error("Failed to fetch messages: " + messagesError.message);
    }

    // Fetch staff and customer names for each message
    const formattedMessages = await Promise.all(
      (messages || []).map(async (msg: any) => {
        let sender_name = "Unknown";

        if (msg.sender_type === "staff" && msg.sender_staff_id) {
          const { data: staffData } = await supabaseAdmin
            .from("staff_users")
            .select("full_name")
            .eq("id", msg.sender_staff_id)
            .single();
          sender_name = staffData?.full_name || "Staff";
        } else if (msg.sender_type === "customer" && msg.sender_customer_id) {
          const { data: customerData } = await supabaseAdmin
            .from("customers")
            .select("full_name")
            .eq("id", msg.sender_customer_id)
            .single();
          sender_name = customerData?.full_name || "Customer";
        } else if (msg.sender_type === "system") {
          sender_name = "System";
        }

        return {
          id: msg.id,
          sender_type: msg.sender_type,
          sender_name,
          message_text: msg.message_text,
          created_at: msg.created_at,
          read_by_customer_at: msg.read_by_customer_at,
          read_by_staff_at: msg.read_by_staff_at,
        };
      }),
    );

    return new Response(
      JSON.stringify({
        success: true,
        messages: formattedMessages,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in get-quote-messages:", error);

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
