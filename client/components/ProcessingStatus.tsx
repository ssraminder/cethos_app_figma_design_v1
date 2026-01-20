import { useEffect, useState } from "react";
import { Check, Mail, Loader2 } from "lucide-react";
import { supabase } from '@/lib/supabase';

interface ProcessingStatusProps {
  quoteId: string;
  onComplete: () => void;
  onEmailInstead: () => void;
}

interface ProcessingStep {
  label: string;
  status: "completed" | "processing" | "pending";
}

type QuoteStatus = 'pending' | 'processing' | 'quote_ready' | 'hitl_pending' | 'error';

export default function ProcessingStatus({
  quoteId,
  onComplete,
  onEmailInstead,
}: ProcessingStatusProps) {
  const [progress, setProgress] = useState(0);
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>('pending');
  const [steps, setSteps] = useState<ProcessingStep[]>([
    { label: "Files uploaded", status: "completed" },
    { label: "Translation details saved", status: "completed" },
    { label: "Analyzing documents...", status: "processing" },
    { label: "Calculating pricing", status: "pending" },
  ]);

  // Fetch current status and subscribe to realtime updates
  useEffect(() => {
    if (!quoteId) return;

    // Initial fetch
    const fetchStatus = async () => {
      const { data: quote } = await supabase
        .from('quotes')
        .select('processing_status')
        .eq('id', quoteId)
        .single();

      if (quote) {
        setQuoteStatus(quote.processing_status);
      }

      // Fetch file progress
      const { data: files } = await supabase
        .from('quote_files')
        .select('processing_status')
        .eq('quote_id', quoteId);

      if (files) {
        const completed = files.filter(f => f.processing_status === 'complete').length;
        const total = files.length;
        const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
        setProgress(progressPercent);

        // Update steps based on progress
        if (progressPercent >= 50 && progressPercent < 100) {
          setSteps([
            { label: "Files uploaded", status: "completed" },
            { label: "Translation details saved", status: "completed" },
            { label: "Analyzing documents...", status: "completed" },
            { label: "Calculating pricing", status: "processing" },
          ]);
        } else if (progressPercent >= 100) {
          setSteps([
            { label: "Files uploaded", status: "completed" },
            { label: "Translation details saved", status: "completed" },
            { label: "Analyzing documents...", status: "completed" },
            { label: "Calculating pricing", status: "completed" },
          ]);
        }
      }
    };

    fetchStatus();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`quote-${quoteId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quotes',
          filter: `id=eq.${quoteId}`,
        },
        (payload: any) => {
          const newStatus = payload.new.processing_status as QuoteStatus;
          setQuoteStatus(newStatus);

          if (newStatus === 'quote_ready') {
            setProgress(100);
            setSteps([
              { label: "Files uploaded", status: "completed" },
              { label: "Translation details saved", status: "completed" },
              { label: "Analyzing documents...", status: "completed" },
              { label: "Calculating pricing", status: "completed" },
            ]);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quote_files',
          filter: `quote_id=eq.${quoteId}`,
        },
        () => {
          // Refresh progress when file status changes
          fetchStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [quoteId]);

  // Check if processing is complete
  useEffect(() => {
    if (quoteStatus === 'quote_ready' || progress >= 100) {
      // Wait 500ms before auto-navigating
      const timeout = setTimeout(() => {
        onComplete();
      }, 500);

      return () => clearTimeout(timeout);
    }
  }, [quoteStatus, progress, onComplete]);

  return (
    <div className="max-w-[600px] mx-auto">
      {/* Main Card */}
      <div className="bg-white border-2 border-cethos-border rounded-xl p-8 sm:p-10">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-cethos-navy mb-2">
            Almost there! We're finalizing your quote...
          </h2>
        </div>

        {/* Processing Steps */}
        <div className="space-y-4 mb-8">
          {steps.map((step, index) => (
            <div key={index} className="flex items-center gap-3">
              {/* Status Icon */}
              {step.status === "completed" && (
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}
              {step.status === "processing" && (
                <div className="w-6 h-6 bg-cethos-blue rounded-full flex items-center justify-center flex-shrink-0">
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                </div>
              )}
              {step.status === "pending" && (
                <div className="w-6 h-6 border-2 border-cethos-border rounded-full flex-shrink-0" />
              )}

              {/* Step Label */}
              <span
                className={`text-sm ${
                  step.status === "completed"
                    ? "text-green-600 font-medium"
                    : step.status === "processing"
                      ? "text-cethos-blue font-semibold"
                      : "text-cethos-slate"
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-cethos-blue transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 text-right">
            <span className="text-sm font-semibold text-cethos-blue">
              {progress}%
            </span>
          </div>
        </div>

        {/* Time Estimate */}
        <div className="text-center mb-8">
          <p className="text-sm text-cethos-slate">
            Usually just a few more seconds
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-cethos-border mb-6" />

        {/* Email Option */}
        <div className="text-center">
          <p className="text-sm text-cethos-slate mb-3">Don't want to wait?</p>
          <button
            onClick={onEmailInstead}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white border-2 border-cethos-blue text-cethos-blue rounded-lg hover:bg-blue-50 transition-colors font-semibold text-sm"
          >
            <Mail className="w-4 h-4" />
            Email me when my quote is ready
          </button>
        </div>
      </div>

      {/* Footer Note */}
      <div className="mt-6 text-center">
        <p className="text-xs text-cethos-slate">
          We're analyzing your documents to provide accurate pricing. This
          typically takes just a few seconds.
        </p>
      </div>
    </div>
  );
}
