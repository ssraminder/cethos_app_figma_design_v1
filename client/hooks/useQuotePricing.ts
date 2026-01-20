import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

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
}

interface QuotePricing {
  documents: DocumentAnalysis[];
  subtotal: number;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
}

export function useQuotePricing(quoteId: string | null): QuotePricing {
  const [documents, setDocuments] = useState<DocumentAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!quoteId) {
      setIsLoading(false);
      return;
    }

    const fetchPricing = async () => {
      setIsLoading(true);
      
      try {
        // Get quote status
        const { data: quote } = await supabase
          .from('quotes')
          .select('processing_status')
          .eq('id', quoteId)
          .single();

        if (quote?.processing_status === 'quote_ready') {
          // Fetch analysis results
          const { data: results, error: resultsError } = await supabase
            .from('ai_analysis_results')
            .select(`
              id,
              detected_language,
              language_name,
              detected_document_type,
              assessed_complexity,
              word_count,
              page_count,
              billable_pages,
              line_total,
              quote_files!inner(
                original_filename,
                quote_id
              )
            `)
            .eq('quote_files.quote_id', quoteId)
            .eq('processing_status', 'complete');

          if (resultsError) throw resultsError;

          const docs: DocumentAnalysis[] = (results || []).map((r: any) => ({
            id: r.id,
            filename: r.quote_files?.original_filename || 'Unknown',
            language: r.detected_language,
            languageName: r.language_name,
            documentType: r.detected_document_type,
            complexity: r.assessed_complexity,
            wordCount: r.word_count,
            pageCount: r.page_count,
            billablePages: r.billable_pages,
            lineTotal: r.line_total,
          }));

          setDocuments(docs);
          setIsReady(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch pricing');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPricing();

    // Subscribe to quote updates
    const channel = supabase
      .channel(`pricing-${quoteId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quotes',
          filter: `id=eq.${quoteId}`,
        },
        (payload: any) => {
          if (payload.new.processing_status === 'quote_ready') {
            fetchPricing();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [quoteId]);

  const subtotal = documents.reduce((sum, doc) => sum + doc.lineTotal, 0);

  return { documents, subtotal, isLoading, isReady, error };
}
