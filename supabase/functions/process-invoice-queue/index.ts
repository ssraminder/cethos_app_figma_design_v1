import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get pending items from queue
    const { data: queueItems, error: queueError } = await supabaseClient
      .from("invoice_generation_queue")
      .select("*")
      .eq("status", "pending")
      .limit(10);

    if (queueError) {
      throw new Error(`Queue fetch error: ${queueError.message}`);
    }

    const results = [];

    for (const item of queueItems || []) {
      try {
        // Mark as processing
        await supabaseClient
          .from("invoice_generation_queue")
          .update({ status: "processing" })
          .eq("id", item.id);

        // Create invoice
        const { data: invoiceResult, error: invoiceError } = await supabaseClient
          .rpc("create_invoice_from_order", {
            p_order_id: item.order_id,
            p_trigger_type: item.trigger_type || "delivery",
          });

        if (invoiceError) {
          throw invoiceError;
        }

        if (!invoiceResult?.success) {
          throw new Error(invoiceResult?.error || "Failed to create invoice");
        }

        // Generate PDF (call the other edge function)
        const pdfResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-invoice-pdf`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ invoice_id: invoiceResult.invoice_id }),
          }
        );

        // Mark as completed
        await supabaseClient
          .from("invoice_generation_queue")
          .update({
            status: "completed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        results.push({
          order_id: item.order_id,
          invoice_number: invoiceResult.invoice_number,
          status: "success",
        });
      } catch (error: any) {
        console.error(`Error processing ${item.order_id}:`, error);

        await supabaseClient
          .from("invoice_generation_queue")
          .update({
            status: "failed",
            error_message: error.message,
            processed_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        results.push({
          order_id: item.order_id,
          status: "failed",
          error: error.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        processed: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
