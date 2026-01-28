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
    const { conversation_id, reader_type, reader_id } = await req.json();

    if (!conversation_id || !reader_type) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: conversation_id, reader_type",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!["staff", "customer"].includes(reader_type)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid reader_type. Must be 'staff' or 'customer'",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `📖 Marking messages as read for ${reader_type} in conversation ${conversation_id}`,
    );

    // Create Supabase client with service role key
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

    // Call the RPC function to mark messages as read
    const { data: result, error: rpcError } = await supabaseAdmin.rpc(
      "mark_messages_read",
      {
        p_conversation_id: conversation_id,
        p_reader_type: reader_type,
        p_reader_id: reader_id,
      },
    );

    if (rpcError) {
      console.error("❌ RPC error:", rpcError);
      throw new Error("Failed to mark messages as read: " + rpcError.message);
    }

    console.log(
      `✅ Messages marked as read. Unread count: ${result[0].unread_count}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        unread_count: result[0].unread_count,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("❌ Error in mark-messages-read:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
