import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

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
      console.log("📡 triggerProcessing called with quoteId:", quoteId);

      if (!supabase) {
        console.warn("⚠️ Supabase not configured - processing disabled");
        setProcessingError("Database not configured");
        return null;
      }

      console.log("✅ Supabase client available, invoking Edge Function...");
      setIsProcessing(true);
      setProcessingError(null);

      try {
        console.log("🔌 Calling supabase.functions.invoke('process-document')");
        const { data, error } = await supabase.functions.invoke(
          "process-document",
          {
            body: { quoteId },
          },
        );

        if (error) {
          console.error("❌ Edge Function returned error:", error);
          throw new Error(error.message);
        }

        console.log("✅ Edge Function response:", data);
        return data as ProcessingResult;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Processing failed";
        setProcessingError(message);
        console.error("❌ Document processing error:", err);
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
