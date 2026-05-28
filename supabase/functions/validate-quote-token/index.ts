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
  if (!data) return json({ valid: false });

  // Token is valid — load enough quote/customer context for the review page
  // to decide which CTAs to render (AR approve vs Stripe pay vs Pay advance).
  // RLS would otherwise hide is_ar_customer / payment_terms from the anon
  // role; we return only the flags the UI needs, no PII beyond what the
  // review page already shows.
  const { data: quoteCtx, error: ctxErr } = await supabase
    .from("quotes")
    .select("status, advance_percentage, advance_amount, customer_id")
    .eq("id", quoteId)
    .maybeSingle();

  if (ctxErr) {
    console.warn("validate-quote-token quote ctx fetch failed:", ctxErr.message);
    return json({ valid: true, quote: null });
  }
  if (!quoteCtx) {
    return json({ valid: true, quote: null });
  }

  let customer: {
    is_ar_customer?: boolean;
    payment_terms?: string | null;
    company_name?: string | null;
  } = {};
  if (quoteCtx.customer_id) {
    const { data: customerRow, error: cErr } = await supabase
      .from("customers")
      .select("is_ar_customer, payment_terms, company_name")
      .eq("id", quoteCtx.customer_id)
      .maybeSingle();
    if (cErr) {
      console.warn("validate-quote-token customer fetch failed:", cErr.message);
    } else if (customerRow) {
      customer = customerRow;
    }
  }

  return json({
    valid: true,
    quote: {
      status: quoteCtx.status,
      advance_percentage: Number(quoteCtx.advance_percentage ?? 0) || 0,
      advance_amount: quoteCtx.advance_amount ?? null,
      is_ar_customer: Boolean(customer.is_ar_customer),
      payment_terms: customer.payment_terms ?? null,
      is_business: Boolean(customer.company_name),
    },
  });
});
