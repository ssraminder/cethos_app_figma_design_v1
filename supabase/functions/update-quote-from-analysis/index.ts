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

    // ── Post-payment guard ────────────────────────────────────────────────
    // Refuse to mutate analysis/totals once any linked order has captured
    // payment. Mirrors the DB-side guard in recalculate_quote_*; this catches
    // the same race a layer earlier so we don't even soft-delete history on a
    // paid quote. Required after the ORD-2026-10201 incident where a
    // re-analysis fired while the customer was still on Stripe Checkout and
    // silently lowered the displayed total below the captured amount.
    const { data: paidOrders, error: paidErr } = await sb
      .from("orders")
      .select("id, order_number, amount_paid")
      .eq("quote_id", quoteId)
      .gt("amount_paid", 0);
    if (paidErr) {
      throw new Error(`Failed to check payment status: ${paidErr.message}`);
    }
    if (paidOrders && paidOrders.length > 0) {
      return jsonResponse(
        {
          success: false,
          error: "Quote is locked: linked order has captured payment.",
          paid_orders: paidOrders.map((o) => o.order_number),
        },
        409,
      );
    }

    const taxRate = num(quote.tax_rate, 0);
    const rushFee = num(quote.rush_fee, 0);
    const deliveryFee = num(quote.delivery_fee, 0);
    const surchargeTotal = num(quote.surcharge_total, 0);
    const discountTotal = num(quote.discount_total, 0);

    // ── Resolve ocr_batch_files → quote_files mapping ─────────────────────
    // Old behaviour stored quote_file_id=null, severing the link from analysis
    // back to the uploaded file. That breaks recalculate_document_group's
    // translatable_word_count lookup (it joins by quote_file_id) and lets
    // quote_document_groups silently desync from new analysis. Resolve here:
    //   1. ocr_batch_files.quote_file_id when the batch row carries one
    //   2. quote_files.original_filename fallback (case-insensitive)
    const batchFileIds = documents
      .map((d) => d.ocrBatchFileId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    const batchFileMap = new Map<string, string | null>();
    if (batchFileIds.length > 0) {
      const { data: batchFiles, error: batchFilesErr } = await sb
        .from("ocr_batch_files")
        .select("id, quote_file_id, filename, original_filename")
        .in("id", batchFileIds);
      if (!batchFilesErr && batchFiles) {
        for (const bf of batchFiles) {
          batchFileMap.set(bf.id, bf.quote_file_id ?? null);
        }
      }
    }

    const { data: quoteFiles } = await sb
      .from("quote_files")
      .select("id, original_filename")
      .eq("quote_id", quoteId)
      .is("deleted_at", null);
    const filenameToQuoteFileId = new Map<string, string>();
    for (const qf of quoteFiles ?? []) {
      if (qf.original_filename) {
        filenameToQuoteFileId.set(
          qf.original_filename.trim().toLowerCase(),
          qf.id,
        );
      }
    }

    function resolveQuoteFileId(doc: DocPayload): string | null {
      if (doc.ocrBatchFileId) {
        const mapped = batchFileMap.get(doc.ocrBatchFileId);
        if (mapped) return mapped;
      }
      if (doc.filename) {
        const hit = filenameToQuoteFileId.get(doc.filename.trim().toLowerCase());
        if (hit) return hit;
      }
      return null;
    }

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
        // Resolved via ocr_batch_files.quote_file_id (or filename fallback)
        // so recalculate_document_group can find this row by quote_file_id
        // and quote_document_groups stay in sync with the new analysis.
        quote_file_id: resolveQuoteFileId(doc),
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

    // ── Resync quote_document_groups to the new analysis ──────────────────
    // Groups are the canonical billing source for the quote/order sidebar
    // (AdminQuoteDetail.tsx prefers groups over analysis when both exist).
    // Without this step, groups carry stale line totals from the prior
    // analysis run and the OCR Pricing tab + order sidebar diverge silently.
    // recalculate_document_group reads ai_analysis_results.translatable_word_count
    // joined by quote_file_id — which works now that we link analysis rows
    // to their file above.
    try {
      const { data: groupIds, error: groupListErr } = await sb
        .from("quote_document_groups")
        .select("id")
        .eq("quote_id", quoteId);
      if (!groupListErr && groupIds) {
        for (const g of groupIds) {
          await sb.rpc("recalculate_document_group", { p_group_id: g.id });
        }
        if (groupIds.length > 0) {
          await sb.rpc("recalculate_quote_from_groups", {
            p_quote_id: quoteId,
          });
        }
      }
    } catch (groupErr) {
      console.warn(
        "Non-fatal: failed to resync quote_document_groups",
        groupErr,
      );
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
