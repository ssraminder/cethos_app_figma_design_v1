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
    const { quote_id, staff_id, message_text, attachments } = await req.json();

    if (!quote_id || !staff_id || !message_text) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: quote_id, staff_id, message_text",
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

    // 1. Get quote and customer info
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from("quotes")
      .select("*, customers(id, email, full_name)")
      .eq("id", quote_id)
      .single();

    if (quoteError || !quote) {
      throw new Error("Quote not found: " + quoteError?.message);
    }

    // 2. Get staff info
    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff_users")
      .select("full_name, email")
      .eq("id", staff_id)
      .single();

    if (staffError || !staff) {
      throw new Error("Staff not found: " + staffError?.message);
    }

    // 3. Insert message into quote_messages
    const { data: message, error: messageError } = await supabaseAdmin
      .from("quote_messages")
      .insert({
        quote_id,
        sender_type: "staff",
        sender_staff_id: staff_id,
        message_text,
      })
      .select()
      .single();

    if (messageError) {
      throw new Error("Failed to insert message: " + messageError.message);
    }

    // 4. Send email to customer if they have an email
    if (quote.customers?.email) {
      try {
        await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            },
            body: JSON.stringify({
              templateId: 20, // New message notification template
              to: quote.customers.email,
              replyTo: staff.email || "support@cethos.com",
              params: {
                CUSTOMER_NAME: quote.customers.full_name || "Customer",
                STAFF_NAME: staff.full_name || "Cethos Team",
                MESSAGE_TEXT: message_text,
                QUOTE_NUMBER: quote.quote_number,
                QUOTE_URL: `${Deno.env.get("FRONTEND_URL")}/dashboard/quotes/${quote_id}`,
              },
            }),
          },
        );
      } catch (emailError) {
        console.error("Failed to send email notification:", emailError);
        // Don't fail the operation if email fails
      }
    }

    // 5. Log staff activity
    await supabaseAdmin.from("staff_activity_log").insert({
      staff_id,
      action_type: "send_message",
      entity_type: "quote",
      entity_id: quote_id,
      details: {
        quote_number: quote.quote_number,
        message_preview: message_text.substring(0, 100),
        customer_id: quote.customer_id,
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
    console.error("Error in send-staff-message:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
