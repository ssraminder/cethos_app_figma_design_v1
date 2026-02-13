import { useState, useEffect } from "react";
import { useQuote } from "@/context/QuoteContext";
import ProgressStepper from "@/components/quote/ProgressStepper";
import ProcessingStatus from "@/components/ProcessingStatus";
import Step1Upload from "@/components/quote/Step1Upload";
import Step2Details from "@/components/quote/Step2Details";
import Step3Contact from "@/components/quote/Step3Contact";
import Step4ReviewCheckout from "@/components/quote/Step4ReviewCheckout";
import { Loader2, AlertTriangle, CheckCircle, Clock } from "lucide-react";

export default function QuoteFlow() {
  const { state, updateState, resetQuote } = useQuote();

  // Determine if URL params are present to show loading immediately (prevent flash)
  const [isHydrating, setIsHydrating] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !!(params.get("id") || params.get("quote_id"));
  });
  const [hydrationError, setHydrationError] = useState<string | null>(null);

  // ── URL param detection on mount ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const searchParams = new URLSearchParams(window.location.search);

    // Source 1: Website embed — ?id={quoteId}&step=2
    const embedQuoteId = searchParams.get("id");
    const embedStep = searchParams.get("step");

    // Source 2: Email link — ?quote_id={quoteId}&token={token}
    const emailQuoteId = searchParams.get("quote_id");
    const emailToken = searchParams.get("token");

    const incomingQuoteId = embedQuoteId || emailQuoteId;

    if (incomingQuoteId) {
      const source: "website_embed" | "email_link" = embedQuoteId
        ? "website_embed"
        : "email_link";
      const defaultStep = embedQuoteId ? 2 : 4;
      const stepOverride = embedStep ? parseInt(embedStep, 10) : defaultStep;
      hydrateFromUrl(incomingQuoteId, stepOverride, source, emailToken || null, () => cancelled);
    } else {
      // Normal flow — QuoteContext already loaded from localStorage
      setIsHydrating(false);
    }

    // Don't abort the fetch — just skip state updates if unmounted
    return () => { cancelled = true; };
  }, []);

  async function hydrateFromUrl(
    quoteId: string,
    targetStep: number,
    source: "website_embed" | "email_link",
    token: string | null,
    isCancelled: () => boolean = () => false,
    _retryCount: number = 0,
  ): Promise<void> {
    setIsHydrating(true);
    setHydrationError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) throw new Error("Supabase not configured");

      const headers = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      // 1. Fetch the quote — use select=* to avoid column mismatch errors
      const quoteResponse = await fetch(
        `${supabaseUrl}/rest/v1/quotes?select=*&id=eq.${quoteId}`,
        { headers },
      );

      if (isCancelled()) return;

      if (!quoteResponse.ok) {
        console.error("Quote fetch failed:", quoteResponse.status);
        setHydrationError("quote_not_found");
        setIsHydrating(false);
        return;
      }

      const quotes = await quoteResponse.json();
      if (!quotes || quotes.length === 0) {
        console.error("Quote not found");
        setHydrationError("quote_not_found");
        setIsHydrating(false);
        return;
      }
      const quote = quotes[0];

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
      const filesResponse = await fetch(
        `${supabaseUrl}/rest/v1/quote_files?select=id,original_filename,file_size,mime_type,upload_status,ai_processing_status&quote_id=eq.${quoteId}&deleted_at=is.null&order=created_at`,
        { headers },
      );
      const quoteFiles = filesResponse.ok ? await filesResponse.json() : [];

      if (isCancelled()) return;

      // 5. Check there are files
      if (!quoteFiles || quoteFiles.length === 0) {
        // No files — something went wrong, let user start fresh at step 1
        setIsHydrating(false);
        return;
      }

      // 6. For email links, also fetch customer data if customer_id exists
      let customerData: any = null;
      if (source === "email_link" && quote.customer_id) {
        const custResponse = await fetch(
          `${supabaseUrl}/rest/v1/customers?select=id,full_name,email,phone,company_name,customer_type&id=eq.${quote.customer_id}`,
          { headers },
        );
        const customers = custResponse.ok ? await custResponse.json() : [];
        customerData = customers.length > 0 ? customers[0] : null;
      }

      if (isCancelled()) return;

      // 7. Determine valid step
      const validStep =
        targetStep >= 2 && targetStep <= 4
          ? targetStep
          : source === "email_link"
            ? 4
            : 2;

      // 8. Hydrate context state — overrides localStorage
      const hydratedData: Partial<typeof state> = {
        quoteId: quote.id,
        quoteNumber: quote.quote_number,
        sourceLanguageId: quote.source_language_id || "",
        targetLanguageId: quote.target_language_id || "",
        intendedUseId: quote.intended_use_id || "",
        countryOfIssue: quote.country_of_issue || "",
        specialInstructions: quote.special_instructions || "",
        entryPoint: quote.entry_point || (source === "website_embed" ? "website_embed" : null),
        resumeSource: source,
        processingStatus: quote.processing_status || null,
        currentStep: validStep,
        // Map quote_files to the context's UploadedFile shape.
        // Since these were uploaded externally (not in portal), the actual
        // File object is unavailable. We create stub entries so the UI can
        // display file info where needed.
        files: quoteFiles.map((f: any) => ({
          id: f.id,
          name: f.original_filename,
          size: f.file_size,
          type: f.mime_type,
          file: new File([], f.original_filename, { type: f.mime_type }),
        })),
      };

      // Add customer data if we fetched it (email link flow)
      if (customerData) {
        hydratedData.fullName = customerData.full_name || "";
        hydratedData.email = customerData.email || "";
        hydratedData.phone = customerData.phone || "";
        hydratedData.companyName = customerData.company_name || "";
        hydratedData.customerType = customerData.customer_type || "individual";
      }

      updateState(hydratedData);

      // 9. Clean URL params so page refresh loads from localStorage
      window.history.replaceState({}, "", "/quote");
    } catch (err: any) {
      if (isCancelled()) return;

      // AbortError: fetch was cancelled by auth state change or Supabase
      // Web Locks contention during initialization. Retry up to 2 times.
      if (err?.name === "AbortError" && _retryCount < 2) {
        console.warn(
          `Hydration fetch aborted (attempt ${_retryCount + 1}/3), retrying...`,
        );
        await new Promise((r) => setTimeout(r, 300 * (_retryCount + 1)));
        return hydrateFromUrl(quoteId, targetStep, source, token, isCancelled, _retryCount + 1);
      }

      if (err?.name === "AbortError") {
        // Exhausted retries — don't show error UI for transient abort issues
        console.warn("Hydration fetch aborted after retries, using default state");
      } else {
        console.error("Failed to hydrate from URL:", err);
        setHydrationError("unknown_error");
      }
    } finally {
      if (!isCancelled()) {
        setIsHydrating(false);
      }
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
          <Step4ReviewCheckout />
        )}
      </div>
    </div>
  );
}
