import { useEffect, useState } from "react";
import { Check, Mail, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCustomerQuoteData } from "@/lib/customer-quote-api";
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

// Real OCR + AI analysis takes longer than the former placeholder stub's
// instant response. Give the pipeline more room before falling back to the
// "we'll email you" screen — the quote still finishes pricing server-side
// regardless, so this only affects how long the customer watches the spinner.
const TIMEOUT_SECONDS = 75;

export default function ProcessingStatus({
  quoteId,
  onComplete,
  onEmailInstead,
}: ProcessingStatusProps) {
  const { resetQuote, state: quoteState } = useQuote();
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

  // Helper: fetch quote details and show the review-required confirmation screen.
  // Reads via customer-quote-get edge function — direct PostgREST on `quotes`
  // is blocked by the May 14 RLS lockdown for the anon role.
  const showReviewConfirmation = async () => {
    try {
      const snap = await getCustomerQuoteData(quoteId);
      const q = snap.quote as any;
      setCustomerEmail(q?.customer?.email || "");
      setQuoteNumber(q?.quote_number || "");
    } catch (err) {
      console.warn("showReviewConfirmation: customer-quote-get failed:", err);
    }
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

  // Fetch current status via customer-quote-get edge function.
  // The May 14 RLS lockdown blocks anon SELECT on `quotes` + `quote_files`,
  // so direct PostgREST reads silently return empty and Supabase realtime
  // never delivers events for filtered-out rows either. Polling the edge
  // function (service-role-backed, capability-keyed on quote_id) replaces
  // both the .from() read and the realtime subscription.
  useEffect(() => {
    if (!quoteId) return;
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const snap = await getCustomerQuoteData(quoteId);
        if (cancelled) return;

        const newStatus = (snap.quote as any)?.processing_status as QuoteStatus | undefined;
        if (newStatus) setQuoteStatus(newStatus);

        const files = snap.files || [];
        if (files.length > 0) {
          const completed = files.filter(
            (f: any) => f.ai_processing_status === "completed",
          ).length;
          const progressPercent = Math.round((completed / files.length) * 100);
          setProgress(progressPercent);

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
      } catch (err) {
        if (!cancelled) console.warn("ProcessingStatus poll failed:", err);
      }
    };

    fetchStatus();
    const intervalId = setInterval(fetchStatus, 2000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
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
          {quoteState.quoteNumber && (
            <p className="text-sm text-gray-400 mt-1">
              Quote ref: <span className="font-medium text-gray-500">{quoteState.quoteNumber}</span>
            </p>
          )}
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
