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
    // Verify authorization token (optional but recommended)
    const authHeader = req.headers.get("Authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");

    // If CRON_SECRET is set, verify it matches
    if (cronSecret) {
      const providedSecret = authHeader?.replace("Bearer ", "");
      if (providedSecret !== cronSecret) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Unauthorized - Invalid cron secret",
          }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    console.log("🗑️ Starting draft quote purge job");

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

    // Call the purge function
    const { data, error } = await supabaseAdmin.rpc("purge_old_draft_quotes");

    if (error) {
      console.error("❌ Error calling purge function:", error);
      throw error;
    }

    const result = data?.[0] || {
      deleted_count: 0,
      purge_date: new Date().toISOString(),
      details: {},
    };

    console.log("✅ Purge completed successfully:", {
      deleted_count: result.deleted_count,
      details: result.details,
    });

    return new Response(
      JSON.stringify({
        success: true,
        deleted_count: result.deleted_count,
        purge_date: result.purge_date,
        details: result.details,
        message:
          result.deleted_count > 0
            ? `Successfully purged ${result.deleted_count} draft quotes`
            : "No draft quotes found to purge",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("❌ Error in purge-draft-quotes:", error);
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
