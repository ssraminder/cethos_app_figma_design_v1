import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export interface DocumentAnalysis {
  id: string;
  filename: string;
  language: string;
  languageName: string;
  documentType: string;
  complexity: string;
  wordCount: number;
  pageCount: number;
  billablePages: number;
  lineTotal: number;
  certificationPrice: number;
}

interface QuoteTotals {
  translation_total: number;
  certification_total: number;
  subtotal: number;
  rush_fee: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
}

interface QuotePricing {
  documents: DocumentAnalysis[];
  totals: QuoteTotals;
  isRush: boolean;
  hitlRequired: boolean;
  customerEmail: string | null;
  quoteNumber: string | null;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
}

export function useQuotePricing(quoteId: string | null): QuotePricing {
  const [documents, setDocuments] = useState<DocumentAnalysis[]>([]);
  const [totals, setTotals] = useState<QuoteTotals>({
    translation_total: 0,
    certification_total: 0,
    subtotal: 0,
    rush_fee: 0,
    tax_rate: 0.05,
    tax_amount: 0,
    total: 0,
  });
  const [isRush, setIsRush] = useState(false);
  const [hitlRequired, setHitlRequired] = useState(false);
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);
  const [quoteNumber, setQuoteNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!quoteId || !supabase) {
      setIsLoading(false);
      return;
    }

    const fetchPricing = async () => {
      if (!supabase) return;

      setIsLoading(true);

      try {
        // Fetch quote with calculated_totals (source of truth)
        const { data: quote, error: quoteError } = await supabase
          .from("quotes")
          .select(
            `
            id,
            quote_number,
            calculated_totals,
            is_rush,
            hitl_required,
            processing_status,
            customers(email)
          `,
          )
          .eq("id", quoteId)
          .single();

        if (quoteError) throw quoteError;

        // Extract calculated totals from JSONB column
        const calculatedTotals = quote?.calculated_totals || {};
        setTotals({
          translation_total: calculatedTotals.translation_total || 0,
          certification_total: calculatedTotals.certification_total || 0,
          subtotal: calculatedTotals.subtotal || 0,
          rush_fee: calculatedTotals.rush_fee || 0,
          tax_rate: calculatedTotals.tax_rate || 0.05,
          tax_amount: calculatedTotals.tax_amount || 0,
          total: calculatedTotals.total || 0,
        });
        setIsRush(quote?.is_rush || false);
        setHitlRequired(quote?.hitl_required || false);
        setQuoteNumber(quote?.quote_number || null);
        setCustomerEmail(quote?.customers?.email || null);

        if (quote?.processing_status === "quote_ready") {
          // Fetch analysis results for itemized document list
          const { data: results, error: resultsError } = await supabase
            .from("ai_analysis_results")
            .select(
              `
              id,
              detected_language,
              language_name,
              detected_document_type,
              assessed_complexity,
              word_count,
              page_count,
              billable_pages,
              line_total,
              certification_price,
              quote_files!inner(
                original_filename,
                quote_id
              )
            `,
            )
            .eq("quote_files.quote_id", quoteId)
            .eq("processing_status", "complete");

          if (resultsError) throw resultsError;

          const docs: DocumentAnalysis[] = (results || []).map((r: any) => ({
            id: r.id,
            filename: r.quote_files?.original_filename || "Unknown",
            language: r.detected_language,
            languageName: r.language_name,
            documentType: r.detected_document_type,
            complexity: r.assessed_complexity,
            wordCount: r.word_count,
            pageCount: r.page_count,
            billablePages: r.billable_pages,
            lineTotal: r.line_total,
            certificationPrice: r.certification_price || 0,
          }));

          setDocuments(docs);
          setIsReady(true);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch pricing",
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchPricing();

    // Subscribe to quote updates (triggers on ANY update, including calculated_totals)
    if (!supabase) return;

    const quoteChannel = supabase
      .channel(`pricing-${quoteId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "quotes",
          filter: `id=eq.${quoteId}`,
        },
        (payload: any) => {
          console.log("Quote updated, refetching pricing...", payload);
          fetchPricing();
        },
      )
      .subscribe();

    // Subscribe to ai_analysis_results updates (for itemized list changes)
    const analysisChannel = supabase
      .channel(`analysis-${quoteId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "ai_analysis_results",
        },
        (payload: any) => {
          console.log(
            "Analysis results updated, refetching pricing...",
            payload,
          );
          fetchPricing();
        },
      )
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(quoteChannel);
        supabase.removeChannel(analysisChannel);
      }
    };
  }, [quoteId]);

  return { documents, totals, isRush, isLoading, isReady, error };
}
