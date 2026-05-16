// POST /functions/v1/customer-quote-get
// Body: { quote_id: string }
// Returns: { success: true, quote, analysis, files }
//
// One round-trip data fetch for the customer-facing checkout/review pages.
// Replaces the anon `.from('quotes' | 'ai_analysis_results' | 'quote_files')`
// reads in client/components/quote/Step4ReviewCheckout.tsx, blocked by the
// RLS lockdown introduced in 20260514_emergency_rls_lockdown.sql.
//
// quote_id is the capability — matches the existing trust model in this app.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  CORS_HEADERS,
  getAdminClient,
  jsonResponse,
  preflight,
} from "../_shared/customer-quote.ts";

const QUOTE_SELECT = `
  id, quote_number, status, processing_status,
  hitl_required, hitl_reasons, customer_note,
  customer_id,
  source_language_id, target_language_id, intended_use_id,
  delivery_option_id,
  country_of_issue, special_instructions,
  subtotal, certification_total, rush_fee, delivery_fee,
  tax_rate, tax_amount, total, calculated_totals, is_rush,
  turnaround_type, estimated_delivery_date,
  physical_delivery_option_id, selected_pickup_location_id,
  billing_address, shipping_address,
  base_rate_override, partner_id, partner_code,
  entry_point, expires_at, saved_at,
  customer:customers(id, full_name, email, phone, company_name, customer_type),
  service:services(code, name),
  intended_use:intended_uses(code, name),
  delivery_option:delivery_options!quotes_delivery_option_id_fkey(id, name),
  target_language:languages!quotes_target_language_id_fkey(id, name, code),
  source_language:languages!quotes_source_language_id_fkey(id, name, code, multiplier, tier)
`;

const ANALYSIS_SELECT = `
  id, quote_file_id, manual_filename, detected_language, language_name,
  detected_document_type, document_type_other, assessed_complexity,
  word_count, page_count, billable_pages, base_rate, line_total,
  certification_price, processing_status, ocr_confidence, language_confidence,
  document_type_confidence, complexity_confidence,
  certification_types(name)
`;

const FILES_SELECT = `
  id, original_filename, storage_path, file_size, mime_type, upload_status,
  ai_processing_status, file_category_id, replacement_reason, created_at
`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const quoteId = body?.quote_id;
    if (typeof quoteId !== "string" || quoteId.length === 0) {
      return jsonResponse({ success: false, error: "Missing quote_id" }, 400);
    }

    const admin = await getAdminClient();

    const [quoteRes, analysisRes, filesRes, adjustmentsRes] = await Promise.all([
      admin.from("quotes").select(QUOTE_SELECT).eq("id", quoteId).maybeSingle(),
      admin
        .from("ai_analysis_results")
        .select(ANALYSIS_SELECT)
        .eq("quote_id", quoteId),
      admin
        .from("quote_files")
        .select(FILES_SELECT)
        .eq("quote_id", quoteId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      admin
        .from("quote_adjustments")
        .select("*")
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: true }),
    ]);

    if (quoteRes.error) {
      console.error("customer-quote-get: quote error", quoteRes.error);
      return jsonResponse(
        { success: false, error: quoteRes.error.message ?? "Quote read failed" },
        500,
      );
    }
    if (!quoteRes.data) {
      return jsonResponse({ success: false, error: "Quote not found" }, 404);
    }
    if (analysisRes.error) {
      console.error("customer-quote-get: analysis error", analysisRes.error);
    }
    if (filesRes.error) {
      console.error("customer-quote-get: files error", filesRes.error);
    }
    if (adjustmentsRes.error) {
      console.error("customer-quote-get: adjustments error", adjustmentsRes.error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        quote: quoteRes.data,
        analysis: analysisRes.data ?? [],
        files: filesRes.data ?? [],
        adjustments: adjustmentsRes.data ?? [],
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("customer-quote-get error:", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
