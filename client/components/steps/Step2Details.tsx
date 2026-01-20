import { useEffect, useState } from "react";
import { useQuote } from "@/context/QuoteContext";
import { useDropdownOptions } from "@/hooks/useDropdownOptions";
import { Loader2 } from "lucide-react";
import { supabase } from '@/lib/supabase';

export default function Step2Details() {
  const { state, updateState } = useQuote();
  const { languages, intendedUses, loading, error } = useDropdownOptions();
  const [processingStatus, setProcessingStatus] = useState<'pending' | 'processing' | 'quote_ready' | null>(null);
  const [fileProgress, setFileProgress] = useState({ completed: 0, total: 0 });

  const updateField = (field: string, value: string) => {
    updateState({ [field]: value });
  };

  // Set English as default target language
  useEffect(() => {
    if (!state.targetLanguageId && languages.length > 0) {
      const english = languages.find((l) => l.code === "en");
      if (english) {
        updateState({ targetLanguageId: english.id });
      }
    }
  }, [languages.length, state.targetLanguageId, updateState]);

  // Subscribe to processing status updates
  useEffect(() => {
    if (!state.quoteId || !supabase) return;

    const fetchStatus = async () => {
      if (!supabase) return;

      // Get quote status
      const { data: quote } = await supabase
        .from('quotes')
        .select('processing_status')
        .eq('id', state.quoteId)
        .single();

      if (quote) {
        setProcessingStatus(quote.processing_status);
      }

      // Get file progress
      const { data: files } = await supabase
        .from('quote_files')
        .select('processing_status')
        .eq('quote_id', state.quoteId);

      if (files) {
        const completed = files.filter(f => f.processing_status === 'complete').length;
        setFileProgress({ completed, total: files.length });
      }
    };

    fetchStatus();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`step2-${state.quoteId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quotes',
          filter: `id=eq.${state.quoteId}`,
        },
        (payload: any) => {
          setProcessingStatus(payload.new.processing_status);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quote_files',
          filter: `quote_id=eq.${state.quoteId}`,
        },
        () => {
          fetchStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [state.quoteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-cethos-blue" />
        <span className="ml-3 text-cethos-slate">Loading options...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <>
      {/* Page Title */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy mb-2">
          Translation Details
        </h1>
        <p className="text-base text-cethos-slate">
          Provide information about your translation requirements
        </p>
      </div>

      {/* Processing Status Indicator */}
      {processingStatus && (processingStatus === 'pending' || processingStatus === 'processing') && (
        <div className="mb-6 bg-blue-50 border-l-4 border-cethos-blue rounded-lg p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-cethos-blue flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">
              Analyzing your documents in the background...
            </p>
            {fileProgress.total > 0 && (
              <p className="text-xs text-blue-700 mt-1">
                {fileProgress.completed} of {fileProgress.total} documents processed
              </p>
            )}
          </div>
        </div>
      )}

      {/* Processing Complete Indicator */}
      {processingStatus === 'quote_ready' && (
        <div className="mb-6 bg-green-50 border-l-4 border-green-500 rounded-lg p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm font-medium text-green-900">
            Document analysis complete! Your quote is ready.
          </p>
        </div>
      )}

      {/* Form Section */}
      <div className="bg-white border-2 border-cethos-border rounded-xl p-6 sm:p-8 space-y-6">
        {/* Source Language */}
        <div>
          <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
            Source Language <span className="text-red-500">*</span>
          </label>
          <select
            value={state.sourceLanguageId || ""}
            onChange={(e) => updateField("sourceLanguageId", e.target.value)}
            className="w-full h-12 px-4 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-blue focus:border-transparent text-sm bg-white"
          >
            <option value="">Select source language...</option>
            {languages
              .filter((lang) => lang.id !== state.targetLanguageId)
              .map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.name} ({lang.native_name})
                </option>
              ))}
          </select>
        </div>

        {/* Target Language */}
        <div>
          <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
            Target Language <span className="text-red-500">*</span>
          </label>
          <select
            value={state.targetLanguageId || ""}
            onChange={(e) => updateField("targetLanguageId", e.target.value)}
            className="w-full h-12 px-4 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-blue focus:border-transparent text-sm bg-white"
          >
            <option value="">Select target language...</option>
            {languages
              .filter((lang) => lang.id !== state.sourceLanguageId)
              .map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.name} ({lang.native_name})
                </option>
              ))}
          </select>
        </div>

        {/* Purpose of Translation */}
        <div>
          <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
            Purpose of Translation <span className="text-red-500">*</span>
          </label>
          <select
            value={state.intendedUseId || ""}
            onChange={(e) => updateField("intendedUseId", e.target.value)}
            className="w-full h-12 px-4 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-blue focus:border-transparent text-sm bg-white"
          >
            <option value="">Select intended use...</option>
            {intendedUses.map((use) => (
              <option key={use.id} value={use.id}>
                {use.name}
              </option>
            ))}
          </select>
        </div>

        {/* Country of Issue */}
        <div>
          <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
            Country where document was issued{" "}
            <span className="text-red-500">*</span>
          </label>
          <select
            value={state.countryOfIssue || ""}
            onChange={(e) => updateField("countryOfIssue", e.target.value)}
            className="w-full h-12 px-4 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-blue focus:border-transparent text-sm bg-white"
          >
            <option value="">Select country...</option>
            <option value="Canada">Canada</option>
            <option value="United States">United States</option>
            <option value="Mexico">Mexico</option>
            <option value="India">India</option>
            <option value="China">China</option>
            <option value="Philippines">Philippines</option>
            <option value="United Kingdom">United Kingdom</option>
            <option value="Germany">Germany</option>
            <option value="France">France</option>
            <option value="Brazil">Brazil</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {/* Special Instructions */}
        <div>
          <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
            Special Instructions (Optional)
          </label>
          <textarea
            value={state.specialInstructions}
            onChange={(e) => {
              const value = e.target.value.slice(0, 500);
              updateField("specialInstructions", value);
            }}
            placeholder="Add any special instructions or notes for your translation..."
            className="w-full h-32 px-4 py-3 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-blue focus:border-transparent text-sm resize-none"
            maxLength={500}
          />
          <div className="mt-2 text-xs text-cethos-slate text-right">
            {state.specialInstructions.length}/500 characters
          </div>
        </div>
      </div>
    </>
  );
}
