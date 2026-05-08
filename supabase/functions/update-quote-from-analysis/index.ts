// ============================================================================
// EDGE FUNCTION: update-quote-from-analysis
// PURPOSE: Replace pricing rows on an existing quote with the OCR-analysis
//          results from OcrResultsModal "Update Quote" action. Soft-deletes
//          previous ai_analysis_results, inserts fresh ones, recalculates
//          quote totals, and flips status to awaiting_payment.
// CALLERS: client/components/shared/analysis/OcrResultsModal.tsx
//          (handleUpdateExistingQuote → supabase.functions.invoke)
// AUTH:    verify_jwt = false; staffId from body, validated against staff_users.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface DocPayload {
  filename?: string;
  ocrBatchFileId?: string | null;
  detectedLanguage?: string;
  languageName?: string;
  detectedDocumentType?: string;
  assessedComplexity?: string;
  wordCount?: number;
  pageCount?: number;
  billablePages?: number;
  complexityMultiplier?: number;
  baseRate?: number;
  perPageRate?: number;
  translationCost?: number;
  certificationTypeId?: string | null;
  certificationPrice?: number;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { success: false, error: "Missing Supabase configuration" },
      500,
    );
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await req.json();
    const {
      quoteId,
      batchId,
      staffId,
      documents,
    }: {
      quoteId?: string;
      batchId?: string | null;
      staffId?: string | null;
      documents?: DocPayload[];
    } = body || {};

    if (!quoteId) throw new Error("Missing required field: quoteId");
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      throw new Error("documents[] is required and must be non-empty");
    }

    // ── Optional staff validation (pass-through if missing; logged in activity) ──
    let validatedStaffId: string | null = null;
    if (staffId) {
      const { data: staff } = await sb
        .from("staff_users")
        .select("id, is_active")
        .eq("id", staffId)
        .maybeSingle();
      if (staff && staff.is_active !== false) {
        validatedStaffId = staff.id;
      }
    }

    // ── Load quote (we need tax_rate + existing fees to recompute totals) ──
    const { data: quote, error: quoteErr } = await sb
      .from("quotes")
      .select(
        "id, quote_number, status, tax_rate, rush_fee, delivery_fee, surcharge_total, discount_total, calculated_totals",
      )
      .eq("id", quoteId)
      .maybeSingle();

    if (quoteErr) throw new Error(`Failed to load quote: ${quoteErr.message}`);
    if (!quote) throw new Error(`Quote not found: ${quoteId}`);

    const taxRate = num(quote.tax_rate, 0);
    const rushFee = num(quote.rush_fee, 0);
    const deliveryFee = num(quote.delivery_fee, 0);
    const surchargeTotal = num(quote.surcharge_total, 0);
    const discountTotal = num(quote.discount_total, 0);

    // ── Soft-delete existing pricing rows for this quote ──
    const nowIso = new Date().toISOString();
    const { error: softDelErr } = await sb
      .from("ai_analysis_results")
      .update({ deleted_at: nowIso })
      .eq("quote_id", quoteId)
      .is("deleted_at", null);
    if (softDelErr) {
      throw new Error(
        `Failed to clear existing pricing rows: ${softDelErr.message}`,
      );
    }

    // ── Insert fresh pricing rows ──
    const insertRows = documents.map((doc) => {
      const wordCount = num(doc.wordCount, 0);
      const pageCount = num(doc.pageCount, 1);
      const billable = num(doc.billablePages, 0);
      const baseRate = num(doc.baseRate ?? doc.perPageRate, 0);
      const complexityMult = num(doc.complexityMultiplier, 1);
      const lineTotal = round2(num(doc.translationCost, 0));
      const certPrice = round2(num(doc.certificationPrice, 0));
      return {
        quote_id: quoteId,
        // ocrBatchFileId is from ocr_batch_files; ai_analysis_results.quote_file_id
        // FK targets quote_files. Leave null to avoid FK violation.
        quote_file_id: null,
        ocr_provider: "manual",
        manual_filename: doc.filename || null,
        detected_document_type: doc.detectedDocumentType || null,
        detected_language: doc.detectedLanguage || null,
        language_name: doc.languageName || null,
        assessed_complexity: doc.assessedComplexity || "easy",
        complexity_multiplier: complexityMult,
        word_count: wordCount,
        page_count: pageCount,
        billable_pages: billable,
        base_rate: baseRate,
        line_total: lineTotal,
        certification_type_id: doc.certificationTypeId || null,
        certification_price: certPrice,
        calculation_unit: "per_page",
        unit_quantity: billable || pageCount || 1,
        processing_status: "completed",
        is_staff_created: true,
        created_by_staff_id: validatedStaffId,
      };
    });

    const { error: insertErr, count: insertedCount } = await sb
      .from("ai_analysis_results")
      .insert(insertRows, { count: "exact" });

    if (insertErr) {
      throw new Error(
        `Failed to insert pricing rows: ${insertErr.message}`,
      );
    }

    // ── Compute totals ──
    const translationSubtotal = round2(
      documents.reduce((sum, d) => sum + num(d.translationCost, 0), 0),
    );
    const certificationTotal = round2(
      documents.reduce((sum, d) => sum + num(d.certificationPrice, 0), 0),
    );
    const subtotal = translationSubtotal;
    const taxableBase =
      subtotal +
      certificationTotal +
      rushFee +
      deliveryFee +
      surchargeTotal -
      discountTotal;
    const taxAmount = round2(taxableBase * taxRate);
    const total = round2(taxableBase + taxAmount);

    const calculatedTotals = {
      translation_total: translationSubtotal,
      certification_total: certificationTotal,
      subtotal,
      surcharge_total: surchargeTotal,
      discount_total: discountTotal,
      rush_fee: rushFee,
      delivery_fee: deliveryFee,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total,
    };

    // ── Update quote ──
    const { error: updateErr } = await sb
      .from("quotes")
      .update({
        status: "awaiting_payment",
        processing_status: "quote_ready",
        subtotal,
        certification_total: certificationTotal,
        tax_amount: taxAmount,
        total,
        calculated_totals: calculatedTotals,
        updated_at: nowIso,
        last_updated_at: nowIso,
        updated_by_staff_id: validatedStaffId,
      })
      .eq("id", quoteId);

    if (updateErr) {
      throw new Error(`Failed to update quote: ${updateErr.message}`);
    }

    // ── Link OCR batch to quote (best-effort; non-fatal) ──
    if (batchId) {
      const { error: batchErr } = await sb
        .from("ocr_batches")
        .update({ quote_id: quoteId })
        .eq("id", batchId);
      if (batchErr) {
        console.warn(
          `Non-fatal: failed to link batch ${batchId} to quote: ${batchErr.message}`,
        );
      }
    }

    // ── Activity log (best-effort; non-fatal) ──
    try {
      await sb.from("quote_activity_log").insert({
        quote_id: quoteId,
        staff_id: validatedStaffId,
        action_type: "pricing_updated_from_analysis",
        details: {
          batch_id: batchId || null,
          documents_processed: documents.length,
          totals: calculatedTotals,
        },
      });
    } catch (logErr) {
      console.warn("Non-fatal: failed to write activity log", logErr);
    }

    return jsonResponse({
      success: true,
      quoteId,
      quoteNumber: quote.quote_number,
      documentsProcessed: insertedCount ?? documents.length,
      totals: calculatedTotals,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("update-quote-from-analysis error:", err);
    return jsonResponse({ success: false, error: message }, 400);
  }
});
