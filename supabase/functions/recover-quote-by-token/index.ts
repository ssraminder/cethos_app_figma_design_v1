/**
 * recover-quote-by-token
 *
 * Restores the public quote-recovery email flow that C-4 closed at the
 * RLS layer. The previous design relied on a `quotes` RLS policy that
 * carved out `OR recovery_token IS NOT NULL` — but the policy never
 * verified the caller HAD the matching token; it just checked the row
 * HAS one. So anon could read every quote with a non-null token.
 *
 * The fix: the RLS policy was tightened (admin migration
 * 20260515_drop_recovery_token_or_clause.sql) to require
 * `auth.uid()`-based customer ownership. This function brings the
 * public-link recovery flow back without the bypass — service_role
 * fetches the row, verifies the token in code (timing-safe), checks
 * expiry, and returns a redacted quote snapshot suitable for the
 * customer to view + pay.
 *
 * POST body:
 *   { quote_id: uuid, recovery_token: uuid }
 *
 * Response:
 *   200 → { success: true, quote: { …safe fields… } }
 *   400 → { success: false, error: "invalid_input" }
 *   401 → { success: false, error: "invalid_token" }
 *   404 → { success: false, error: "quote_not_found" }
 *   410 → { success: false, error: "token_expired" }
 *
 * Deploy with verify_jwt=false — this is a public-recovery endpoint.
 * No anon-key requirement either (caller already presents the secret
 * by way of the recovery_token).
 */

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

interface Body {
  quote_id?: string;
  recovery_token?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }

  const quoteId = (body.quote_id ?? "").toLowerCase().trim();
  const provided = (body.recovery_token ?? "").toLowerCase().trim();
  if (!UUID_RE.test(quoteId) || !UUID_RE.test(provided)) {
    return json({ success: false, error: "invalid_input" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, status, total, tax_amount, certification_total, rush_fee, delivery_fee, " +
        "subtotal, expires_at, created_at, customer_id, source_language_id, target_language_id, " +
        "recovery_token, recovery_token_expires_at, recovery_token_used_count",
    )
    .eq("id", quoteId)
    .maybeSingle();
  if (qErr) {
    return json({ success: false, error: "lookup_failed" }, 500);
  }
  if (!quote) {
    return json({ success: false, error: "quote_not_found" }, 404);
  }

  const storedToken = quote.recovery_token as string | null;
  if (!storedToken || !timingSafeEqual(storedToken.toLowerCase(), provided)) {
    return json({ success: false, error: "invalid_token" }, 401);
  }

  const expiresAt = quote.recovery_token_expires_at as string | null;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return json({ success: false, error: "token_expired" }, 410);
  }

  // Increment use counter (best-effort; never block recovery on this).
  void supabase
    .from("quotes")
    .update({
      recovery_token_used_count: (quote.recovery_token_used_count as number ?? 0) + 1,
    })
    .eq("id", quoteId)
    .then(() => {}, () => {});

  // Return a redacted snapshot — drop the token fields so they never
  // re-enter the browser response.
  const {
    recovery_token: _drop1,
    recovery_token_expires_at: _drop2,
    recovery_token_used_count: _drop3,
    ...safeQuote
  } = quote as Record<string, unknown>;

  return json({ success: true, quote: safeQuote });
});
