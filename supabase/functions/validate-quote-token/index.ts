import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return json({ valid: false }, 405);

  let body: { quote_id?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ valid: false }, 400);
  }

  const quoteId = (body.quote_id ?? "").trim();
  const token = (body.token ?? "").trim();
  if (!quoteId || !token) return json({ valid: false }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await supabase
    .from("customer_magic_links")
    .select("id")
    .eq("token", token)
    .eq("purpose", "quote_access")
    .eq("is_valid", true)
    .gt("expires_at", new Date().toISOString())
    .or(`quote_id.eq.${quoteId},quote_id.is.null`)
    .limit(1)
    .maybeSingle();

  if (error) return json({ valid: false }, 500);

  return json({ valid: !!data });
});
