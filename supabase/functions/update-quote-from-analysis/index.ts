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

    // ── Sync quote_document_groups directly from the user-set values ──────
    // Groups are the canonical billing source for the sidebar / order total
    // (AdminQuoteDetail prefers groups over analysis). We can NOT call
    // recalculate_document_group here — that RPC ignores the staff-set
    // billable_pages and certification on the analysis row and recomputes
    // billable as CEIL(word_count / 225 * complexity * 10) / 10 plus pulls
    // cert from qdg.certification_type_id (often null), which silently
    // discards the staff edits. Caused QT26-10485 to display $77/$0 while
    // the modal showed $55/$50 (incident 2026-05-19).
    //
    // Instead: aggregate the per-document values back onto the matching
    // group via quote_page_group_assignments and write those values directly.
    try {
      const fileIds = Array.from(
        new Set(
          insertRows
            .map((r) => r.quote_file_id)
            .filter((v): v is string => typeof v === "string" && v.length > 0),
        ),
      );

      const fileToGroup = new Map<string, string>();
      if (fileIds.length > 0) {
        const { data: assignments } = await sb
          .from("quote_page_group_assignments")
          .select("file_id, group_id")
          .in("file_id", fileIds);
        for (const a of assignments ?? []) {
          if (!fileToGroup.has(a.file_id)) {
            fileToGroup.set(a.file_id, a.group_id);
          }
        }
      }

      type GroupAgg = {
        billable: number;
        lineTotal: number;
        certTypeId: string | null;
        certPrice: number;
        baseRate: number;
        complexity: number;
      };
      const groupAggs = new Map<string, GroupAgg>();
      for (const row of insertRows) {
        const fileId = row.quote_file_id;
        if (!fileId) continue;
        const groupId = fileToGroup.get(fileId);
        if (!groupId) continue;
        const agg = groupAggs.get(groupId) ?? {
          billable: 0,
          lineTotal: 0,
          certTypeId: null,
          certPrice: 0,
          baseRate: Number(row.base_rate) || 0,
          complexity: Number(row.complexity_multiplier) || 1,
        };
        agg.billable += Number(row.billable_pages) || 0;
        agg.lineTotal += Number(row.line_total) || 0;
        agg.certPrice += Number(row.certification_price) || 0;
        // First non-null cert wins. Mixed cert types in one group would lose
        // detail here, but the UI surfaces cert at the group level anyway.
        if (!agg.certTypeId && row.certification_type_id) {
          agg.certTypeId = row.certification_type_id;
        }
        groupAggs.set(groupId, agg);
      }

      for (const [groupId, agg] of groupAggs) {
        const { error: groupUpdateErr } = await sb
          .from("quote_document_groups")
          .update({
            billable_pages: round2(agg.billable),
            line_total: round2(agg.lineTotal),
            base_rate: agg.baseRate,
            complexity_multiplier: agg.complexity,
            certification_type_id: agg.certTypeId,
            certification_price: round2(agg.certPrice),
            updated_at: nowIso,
          })
          .eq("id", groupId);
        if (groupUpdateErr) {
          console.warn(
            `Non-fatal: failed to update group ${groupId}: ${groupUpdateErr.message}`,
          );
        }
      }

      // DO NOT call recalculate_quote_from_groups here — that RPC internally
      // calls recalculate_document_group for every group, which would
      // overwrite the billable_pages/line_total we just wrote with the
      // CEIL(word_count / 225 * complexity) recompute. The inline quote
      // update above already wrote the authoritative totals for this flow.
    } catch (groupErr) {
      console.warn(
        "Non-fatal: failed to sync quote_document_groups",
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
