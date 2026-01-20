import { useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface ProcessingResult {
  success: boolean;
  documentsProcessed: number;
  totals: {
    translationCost: number;
    documentCount: number;
    totalPages: number;
    totalWords: number;
  };
  hitl: {
    required: boolean;
    reasons: string[];
  };
  error?: string;
}

export function useDocumentProcessing() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);

  const triggerProcessing = useCallback(
    async (quoteId: string): Promise<ProcessingResult | null> => {
      setIsProcessing(true);
      setProcessingError(null);

      try {
        const { data, error } = await supabase.functions.invoke(
          "process-document",
          {
            body: { quoteId },
          },
        );

        if (error) {
          throw new Error(error.message);
        }

        return data as ProcessingResult;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Processing failed";
        setProcessingError(message);
        console.error("Document processing error:", err);
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [],
  );

  return {
    triggerProcessing,
    isProcessing,
    processingError,
  };
}
