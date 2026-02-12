import { useState, useEffect } from "react";
import { useQuote } from "@/context/QuoteContext";
import { supabase } from "@/lib/supabase";
import ProgressStepper from "@/components/quote/ProgressStepper";
import ProcessingStatus from "@/components/ProcessingStatus";
import Step1Upload from "@/components/quote/Step1Upload";
import Step2Details from "@/components/quote/Step2Details";
import Step3Contact from "@/components/quote/Step3Contact";
import Step4Review from "@/components/quote/Step4Review";
import Step5Delivery from "@/components/quote/Step5Delivery";
import Step6Pay from "@/components/quote/Step6Pay";
import { Loader2, AlertTriangle, CheckCircle, Clock } from "lucide-react";

export default function QuoteFlow() {
  const { state, updateState, resetQuote } = useQuote();

  const [isHydrating, setIsHydrating] = useState(false);
  const [hydrationError, setHydrationError] = useState<string | null>(null);

  // ── URL param detection on mount ────────────────────────────────────────
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const incomingQuoteId = searchParams.get("id");
    const incomingStep = searchParams.get("step");

    if (incomingQuoteId) {
      hydrateFromUrl(incomingQuoteId, incomingStep);
    }
    // If no id param, QuoteContext already loaded from localStorage
  }, []);

  async function hydrateFromUrl(quoteId: string, stepParam: string | null) {
    setIsHydrating(true);
    setHydrationError(null);

    try {
      if (!supabase) throw new Error("Supabase not configured");

      // 1. Fetch the quote
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select(
          `
          id,
          quote_number,
          status,
          processing_status,
          entry_point,
          source_language_id,
          target_language_id,
          intended_use_id,
          country_of_issue,
          special_instructions,
          is_rush,
          total,
          subtotal,
          expires_at
        `,
        )
        .eq("id", quoteId)
        .single();

      if (quoteError || !quote) {
        console.error("Quote not found:", quoteError);
        setHydrationError("quote_not_found");
        setIsHydrating(false);
        return;
      }

      // 2. Check quote is still actionable
      if (["paid", "cancelled"].includes(quote.status)) {
        setHydrationError("quote_already_completed");
        setIsHydrating(false);
        return;
      }

      // 3. Check expiry
      if (quote.expires_at && new Date(quote.expires_at) < new Date()) {
        setHydrationError("quote_expired");
        setIsHydrating(false);
        return;
      }

      // 4. Fetch quote_files for this quote
      const { data: quoteFiles } = await supabase
        .from("quote_files")
        .select(
          "id, original_filename, file_size, mime_type, upload_status, ai_processing_status",
        )
        .eq("quote_id", quoteId)
        .is("deleted_at", null)
        .order("created_at");

      // 5. Check there are files
      if (!quoteFiles || quoteFiles.length === 0) {
        // No files — something went wrong, let user start fresh at step 1
        setIsHydrating(false);
        return;
      }

      // 6. Determine target step
      const targetStep = stepParam ? parseInt(stepParam, 10) : 2;
      const validStep = targetStep >= 2 && targetStep <= 6 ? targetStep : 2;

      // 7. Hydrate context state — overrides localStorage
      updateState({
        quoteId: quote.id,
        quoteNumber: quote.quote_number,
        sourceLanguageId: quote.source_language_id || "",
        targetLanguageId: quote.target_language_id || "",
        intendedUseId: quote.intended_use_id || "",
        countryOfIssue: quote.country_of_issue || "",
        specialInstructions: quote.special_instructions || "",
        entryPoint: quote.entry_point || "website_embed",
        processingStatus: quote.processing_status || null,
        currentStep: validStep,
        // Map quote_files to the context's UploadedFile shape.
        // Since these were uploaded on the website (not in portal), the actual
        // File object is unavailable. We create stub entries so the UI can
        // display file info where needed.
        files: quoteFiles.map((f) => ({
          id: f.id,
          name: f.original_filename,
          size: f.file_size,
          type: f.mime_type,
          file: new File([], f.original_filename, { type: f.mime_type }),
        })),
      });

      // 8. Clean URL params so page refresh loads from localStorage
      window.history.replaceState({}, "", "/quote");
    } catch (err) {
      console.error("Failed to hydrate from URL:", err);
      setHydrationError("unknown_error");
    } finally {
      setIsHydrating(false);
    }
  }

  // ── Event handlers ──────────────────────────────────────────────────────

  const handleProcessingComplete = () => {
    updateState({
      showProcessingModal: false,
      isProcessing: false,
      currentStep: 4,
    });
  };

  const handleEmailInstead = () => {
    updateState({ showProcessingModal: false, isProcessing: false });
  };

  // ── Loading state while hydrating from URL ──────────────────────────────

  if (isHydrating) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
          <span className="text-xl font-extrabold text-teal-600 tracking-tight">
            CETHOS
          </span>
          <div className="w-px h-5 bg-gray-200" />
          <span className="text-sm text-gray-500 font-medium">
            Get a Quote
          </span>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          <p className="text-gray-600 text-sm">Loading your quote...</p>
        </div>
      </div>
    );
  }

  // ── Error states ────────────────────────────────────────────────────────

  if (hydrationError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
          <span className="text-xl font-extrabold text-teal-600 tracking-tight">
            CETHOS
          </span>
          <div className="w-px h-5 bg-gray-200" />
          <span className="text-sm text-gray-500 font-medium">
            Get a Quote
          </span>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center px-4">
          {hydrationError === "quote_not_found" && (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Quote Not Found
              </h2>
              <p className="text-gray-600 max-w-md">
                This quote link has expired or is invalid. Please start a new
                quote.
              </p>
            </>
          )}
          {hydrationError === "quote_already_completed" && (
            <>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Quote Already Submitted
              </h2>
              <p className="text-gray-600 max-w-md">
                This quote has already been submitted. If you need help, please
                contact us.
              </p>
            </>
          )}
          {hydrationError === "quote_expired" && (
            <>
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
                <Clock className="w-8 h-8 text-amber-500" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Quote Expired
              </h2>
              <p className="text-gray-600 max-w-md">
                This quote has expired. Please start a new quote for updated
                pricing.
              </p>
            </>
          )}
          {hydrationError === "unknown_error" && (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Something Went Wrong
              </h2>
              <p className="text-gray-600 max-w-md">
                We couldn't load your quote. Please try again or start a new
                quote.
              </p>
            </>
          )}
          <button
            onClick={() => {
              resetQuote();
              setHydrationError(null);
            }}
            className="mt-2 px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
          >
            Start New Quote
          </button>
        </div>
      </div>
    );
  }

  // ── Normal quote flow ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <span className="text-xl font-extrabold text-teal-600 tracking-tight">
          CETHOS
        </span>
        <div className="w-px h-5 bg-gray-200" />
        <span className="text-sm text-gray-500 font-medium">Get a Quote</span>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-7 pb-24">
        <ProgressStepper currentStep={state.currentStep} className="mb-7" />

        {/* Processing Modal — overlays current step */}
        {state.showProcessingModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <ProcessingStatus
              quoteId={state.quoteId ?? ""}
              onComplete={handleProcessingComplete}
              onEmailInstead={handleEmailInstead}
            />
          </div>
        )}

        {/* Step Components */}
        {state.currentStep === 1 && <Step1Upload />}
        {state.currentStep === 2 && <Step2Details />}
        {state.currentStep === 3 && <Step3Contact />}
        {!state.showProcessingModal && state.currentStep === 4 && (
          <Step4Review />
        )}
        {!state.showProcessingModal && state.currentStep === 5 && (
          <Step5Delivery />
        )}
        {!state.showProcessingModal && state.currentStep === 6 && (
          <Step6Pay />
        )}
      </div>
    </div>
  );
}
