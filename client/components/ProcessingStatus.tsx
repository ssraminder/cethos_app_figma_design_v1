import { useEffect, useState } from "react";
import { Check, Mail, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQuote } from "@/context/QuoteContext";

interface ProcessingStatusProps {
  quoteId: string;
  onComplete: () => void;
  onEmailInstead: () => void;
}

interface ProcessingStep {
  label: string;
  status: "completed" | "processing" | "pending";
}

type QuoteStatus =
  | "pending"
  | "processing"
  | "quote_ready"
  | "completed"
  | "review_required"
  | "error";

const TIMEOUT_SECONDS = 45;

export default function ProcessingStatus({
  quoteId,
  onComplete,
  onEmailInstead,
}: ProcessingStatusProps) {
  const { resetQuote } = useQuote();
  const [progress, setProgress] = useState(0);
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>("pending");
  const [steps, setSteps] = useState<ProcessingStep[]>([
    { label: "Files uploaded", status: "completed" },
    { label: "Translation details saved", status: "completed" },
    { label: "Analyzing documents...", status: "processing" },
    { label: "Calculating pricing", status: "pending" },
  ]);

  // Timeout states
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(TIMEOUT_SECONDS);

  // Review required states
  const [reviewRequired, setReviewRequired] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");

  // Helper: fetch quote details and show the review-required confirmation screen
  const showReviewConfirmation = async () => {
    if (!supabase) return;
    const { data: quoteDetails } = await supabase
      .from("quotes")
      .select("quote_number, customers(email)")
      .eq("id", quoteId)
      .single();

    setCustomerEmail(
      (quoteDetails?.customers as any)?.email || ""
    );
    setQuoteNumber(quoteDetails?.quote_number || "");
    setReviewRequired(true);
  };

  // Countdown timer effect
  useEffect(() => {
    if (
      !quoteId ||
      quoteStatus === "quote_ready" ||
      quoteStatus === "completed" ||
      quoteStatus === "review_required"
    )
      return;

    const countdownInterval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          setHasTimedOut(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [quoteId, quoteStatus]);

  // Show review confirmation when timeout occurs
  useEffect(() => {
    if (hasTimedOut) {
      showReviewConfirmation();
    }
  }, [hasTimedOut]);

  // Fetch current status and subscribe to realtime updates
  useEffect(() => {
    if (!quoteId || !supabase) return;

    // Initial fetch
    const fetchStatus = async () => {
      if (!supabase) return;

      const { data: quote } = await supabase
        .from("quotes")
        .select("processing_status, status")
        .eq("id", quoteId)
        .single();

      if (quote) {
        setQuoteStatus(quote.processing_status);
      }

      // Fetch file progress
      const { data: files } = await supabase
        .from("quote_files")
        .select("processing_status")
        .eq("quote_id", quoteId);

      if (files) {
        const completed = files.filter(
          (f) => f.processing_status === "complete"
        ).length;
        const total = files.length;
        const progressPercent =
          total > 0 ? Math.round((completed / total) * 100) : 0;
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
    if (!supabase) return;

    const channel = supabase
      .channel(`quote-${quoteId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "quotes",
          filter: `id=eq.${quoteId}`,
        },
        (payload: any) => {
          const newStatus = payload.new.processing_status as QuoteStatus;
          setQuoteStatus(newStatus);

          if (newStatus === "quote_ready" || newStatus === "completed") {
            setProgress(100);
            setSteps([
              { label: "Files uploaded", status: "completed" },
              { label: "Translation details saved", status: "completed" },
              { label: "Analyzing documents...", status: "completed" },
              { label: "Calculating pricing", status: "completed" },
            ]);
          } else if (newStatus === "review_required") {
            showReviewConfirmation();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "quote_files",
          filter: `quote_id=eq.${quoteId}`,
        },
        () => {
          // Refresh progress when file status changes
          fetchStatus();
        }
      )
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [quoteId]);

  // Handle processing completion
  useEffect(() => {
    if (quoteStatus === "quote_ready" || quoteStatus === "completed") {
      // Pipeline completed — proceed to Step 4 Review
      setTimeout(() => {
        onComplete();
      }, 300);
    } else if (quoteStatus === "review_required") {
      // AI flagged issues — show confirmation screen
      showReviewConfirmation();
    }
  }, [quoteStatus, onComplete]);

  // Review required — confirmation screen
  if (reviewRequired) {
    return (
      <div className="bg-white rounded-xl p-8 max-w-lg mx-auto text-center">
        {/* Green checkmark */}
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Your Request Has Been Submitted
        </h2>

        <p className="text-gray-600 mb-4">
          Our team has received your documents and will review them manually.
          {customerEmail && (
            <>
              {" "}We'll contact you shortly at <strong>{customerEmail}</strong>.
            </>
          )}
        </p>

        {quoteNumber && (
          <p className="text-sm text-gray-500 mb-6">
            Your quote reference: <strong>{quoteNumber}</strong>
          </p>
        )}

        <a
          href="https://cethos.com"
          className="inline-flex items-center justify-center px-6 py-3 bg-cethos-blue text-white rounded-lg hover:bg-opacity-90 transition-colors font-semibold"
        >
          Return to Home
        </a>
      </div>
    );
  }

  // Normal processing state
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
            {timeRemaining > 30
              ? "Usually just a few more seconds"
              : timeRemaining > 10
                ? "Almost there..."
                : "Just a moment longer..."}
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

          <button
            onClick={() => {
              if (window.confirm('Are you sure? This will discard your current quote and start fresh.')) {
                resetQuote();
              }
            }}
            className="text-sm text-gray-400 hover:text-gray-600 underline mt-3"
          >
            Start over with a new quote
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
