// POST /functions/v1/customer-quote-create
// Body: { source_language_id?, target_language_id?, partner_id?, partner_code?,
//         partner_rate?, referral_url? }
// Returns: { success: true, quote: { id, quote_number } }
//
// Replaces the anon `supabase.from('quotes').insert(...)` in
// client/components/quote/Step1Upload.tsx, which is blocked by the RLS
// lockdown introduced in 20260514_emergency_rls_lockdown.sql.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  CORS_HEADERS,
  getAdminClient,
  jsonResponse,
  preflight,
} from "../_shared/customer-quote.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      source_language_id,
      target_language_id,
      partner_id,
      partner_code,
      partner_rate,
      referral_url,
    } = body ?? {};

    const admin = await getAdminClient();

    const insertRow: Record<string, unknown> = {
      status: "draft",
      entry_point: "customer_web",
    };
    if (source_language_id) insertRow.source_language_id = source_language_id;
    if (target_language_id) insertRow.target_language_id = target_language_id;

    if (partner_id) {
      insertRow.partner_id = partner_id;
      insertRow.partner_code = partner_code ?? null;
      const rate =
        typeof partner_rate === "number"
          ? partner_rate
          : typeof partner_rate === "string"
            ? Number.parseFloat(partner_rate)
            : NaN;
      if (Number.isFinite(rate)) insertRow.base_rate_override = rate;
      if (typeof referral_url === "string") insertRow.referral_url = referral_url;
    }

    const { data, error } = await admin
      .from("quotes")
      .insert(insertRow)
      .select("id, quote_number")
      .single();

    if (error) {
      console.error("customer-quote-create insert failed:", error);
      return jsonResponse(
        { success: false, error: error.message ?? "Insert failed" },
        500,
      );
    }

    return new Response(
      JSON.stringify({ success: true, quote: data }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("customer-quote-create error:", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
