import { useEffect, useState, useCallback } from "react";
import { Check, Mail, Loader2, Clock, CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

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
  | "hitl_pending"
  | "error";

const TIMEOUT_SECONDS = 45;

export default function ProcessingStatus({
  quoteId,
  onComplete,
  onEmailInstead,
}: ProcessingStatusProps) {
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
  const [isCreatingHitl, setIsCreatingHitl] = useState(false);
  const [hitlCreated, setHitlCreated] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(TIMEOUT_SECONDS);

  // Threshold checking states
  const [isCheckingThresholds, setIsCheckingThresholds] = useState(false);
  const [thresholdsChecked, setThresholdsChecked] = useState(false);

  // Create HITL review with specified reason
  const createHitlReview = useCallback(async (triggerReason: string = "processing_timeout") => {
    if (isCreatingHitl || hitlCreated) return;

    setIsCreatingHitl(true);
    console.log(`⏱️ Creating HITL review (reason: ${triggerReason})...`);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-hitl-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            quoteId: quoteId,
            triggerReasons: [triggerReason],
            priority: triggerReason === "processing_timeout" ? 4 : 3, // Higher priority for timeout cases
          }),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        console.log("✅ HITL review created:", result.reviewId);
        setHitlCreated(true);
      } else {
        console.error("❌ Failed to create HITL review:", result.error);
        // Still show the HITL UI even if creation failed
        setHitlCreated(true);
      }
    } catch (error) {
      console.error("❌ Error creating HITL review:", error);
      // Still show the HITL UI even if creation failed
      setHitlCreated(true);
    } finally {
      setIsCreatingHitl(false);
    }
  }, [quoteId, isCreatingHitl, hitlCreated]);

  // Check HITL thresholds after processing completes
  const checkHitlThresholds = useCallback(async (): Promise<boolean> => {
    if (isCheckingThresholds || thresholdsChecked || hitlCreated) {
      return !hitlCreated;
    }

    setIsCheckingThresholds(true);
    console.log("🔍 Checking HITL thresholds...");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-hitl-thresholds`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ quoteId: quoteId }),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        setThresholdsChecked(true);

        if (result.passed) {
          console.log("✅ All thresholds passed");
          return true;
        } else {
          console.log("⚠️ Thresholds failed, HITL created:", result.triggerReasons);
          setHitlCreated(true);
          return false;
        }
      }

      // Default to passing if error (don't block customer)
      console.warn("⚠️ Threshold check returned error, defaulting to pass");
      setThresholdsChecked(true);
      return true;
    } catch (error) {
      console.error("❌ Error checking thresholds:", error);
      // Default to passing if error (don't block customer)
      setThresholdsChecked(true);
      return true;
    } finally {
      setIsCheckingThresholds(false);
    }
  }, [quoteId, isCheckingThresholds, thresholdsChecked, hitlCreated]);

  // Handle "Email me instead" button click
  const handleEmailInstead = useCallback(async () => {
    // Create HITL review with customer requested reason
    await createHitlReview("customer_requested_email");
    // Then trigger the email confirmation flow
    onEmailInstead();
  }, [createHitlReview, onEmailInstead]);

  // Countdown timer effect
  useEffect(() => {
    if (!quoteId || hitlCreated || quoteStatus === "quote_ready" || quoteStatus === "completed") return;

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
  }, [quoteId, hitlCreated, quoteStatus]);

  // Trigger HITL when timeout occurs
  useEffect(() => {
    if (hasTimedOut && !hitlCreated && !isCreatingHitl) {
      createHitlReview("processing_timeout");
    }
  }, [hasTimedOut, hitlCreated, isCreatingHitl, createHitlReview]);

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
        
        // If already in HITL, show that state
        if (quote.status === "hitl_pending") {
          setHitlCreated(true);
          setHasTimedOut(true);
        }
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

          if (newStatus === "quote_ready") {
            setProgress(100);
            setSteps([
              { label: "Files uploaded", status: "completed" },
              { label: "Translation details saved", status: "completed" },
              { label: "Analyzing documents...", status: "completed" },
              { label: "Calculating pricing", status: "completed" },
            ]);
          }
          
          // Check if HITL was triggered externally
          if (payload.new.status === "hitl_pending") {
            setHitlCreated(true);
            setHasTimedOut(true);
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

  // Check if processing is complete - then check thresholds
  useEffect(() => {
    if ((quoteStatus === "quote_ready" || progress >= 100) && !hitlCreated && !isCheckingThresholds && !thresholdsChecked) {
      // Processing complete - check thresholds before proceeding
      const checkAndProceed = async () => {
        const passed = await checkHitlThresholds();
        if (passed) {
          // Small delay before navigating for smooth transition
          setTimeout(() => {
            onComplete();
          }, 300);
        }
        // If not passed, hitlCreated state will be set by checkHitlThresholds
      };
      checkAndProceed();
    }
  }, [quoteStatus, progress, hitlCreated, isCheckingThresholds, thresholdsChecked, checkHitlThresholds, onComplete]);

  // HITL Created - Show confirmation
  if (hitlCreated) {
    return (
      <div className="max-w-[600px] mx-auto">
        <div className="bg-white border-2 border-cethos-border rounded-xl p-8 sm:p-10">
          {/* Success Icon */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-cethos-navy mb-2">
              Additional Review Required
            </h2>
            <p className="text-cethos-slate">
              Your documents need a bit more attention from our team
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-amber-800 font-medium mb-1">
                  Your quote request has been received
                </p>
                <p className="text-sm text-amber-700">
                  Our team will review your documents and email you a confirmed quote within <strong>4 working hours</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* What Happens Next */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-cethos-navy mb-3">What happens next?</h3>
            <ol className="space-y-2 text-sm text-cethos-slate">
              <li className="flex gap-2">
                <span className="font-semibold text-cethos-navy">1.</span>
                Our team reviews your documents for accuracy
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-cethos-navy">2.</span>
                We'll email you a confirmed quote
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-cethos-navy">3.</span>
                You can then proceed to payment online
              </li>
            </ol>
          </div>

          {/* Action Button */}
          <div className="text-center">
            <button
              onClick={() => (window.location.href = "/")}
              className="px-8 py-3 bg-cethos-teal text-white rounded-lg hover:bg-cethos-teal-light font-semibold transition-colors"
            >
              Return to Home
            </button>
            <p className="text-xs text-cethos-slate mt-3">
              We'll email you when your quote is ready
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Creating HITL - Show loading
  if (isCreatingHitl) {
    return (
      <div className="max-w-[600px] mx-auto">
        <div className="bg-white border-2 border-cethos-border rounded-xl p-8 sm:p-10">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-cethos-navy mb-2">
              Processing taking longer than expected...
            </h2>
            <p className="text-cethos-slate">
              Transferring to our review team
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Checking thresholds - Show loading
  if (isCheckingThresholds) {
    return (
      <div className="max-w-[600px] mx-auto">
        <div className="bg-white border-2 border-cethos-border rounded-xl p-8 sm:p-10">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-cethos-teal mx-auto mb-4" />
            <h2 className="text-xl font-bold text-cethos-navy mb-2">
              Finalizing your quote...
            </h2>
            <p className="text-cethos-slate">
              Just a moment while we verify everything
            </p>
          </div>
        </div>
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
            onClick={handleEmailInstead}
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
