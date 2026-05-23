import { useState, useEffect } from "react";
import { useQuote } from "@/context/QuoteContext";
import ProgressStepper from "@/components/quote/ProgressStepper";
import ProcessingStatus from "@/components/ProcessingStatus";
import Step1Upload from "@/components/quote/Step1Upload";
import Step2Details from "@/components/quote/Step2Details";
import Step3Contact from "@/components/quote/Step3Contact";
import Step4ReviewCheckout from "@/components/quote/Step4ReviewCheckout";
import { getCustomerQuoteData } from "@/lib/customer-quote-api";
import { Loader2, AlertTriangle, CheckCircle, Clock } from "lucide-react";

async function validateQuoteToken(
  quoteId: string,
  token: string
): Promise<boolean> {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/validate-quote-token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ quote_id: quoteId, token }),
      }
    );

    if (!response.ok) return false;
    const result = await response.json();
    return result.valid === true;
  } catch (_e) {
    return false;
  }
}

export default function QuoteFlow() {
  const { state, updateState, resetQuote } = useQuote();

  // Determine if URL params are present to show loading immediately (prevent flash)
  const [isHydrating, setIsHydrating] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !!(params.get("id") || params.get("quote_id"));
  });
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [tokenInvalid, setTokenInvalid] = useState(false);

  // ── Partner ?ref= capture on mount ──────────────────────────────────────
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const refParam = searchParams.get("ref");

    if (refParam) {
      // Clear any existing partner sessionStorage keys before validating
      sessionStorage.removeItem("cethos_partner_id");
      sessionStorage.removeItem("cethos_partner_code");
      sessionStorage.removeItem("cethos_partner_rate");
      sessionStorage.removeItem("cethos_partner_name");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseAnonKey) {
        fetch(`${supabaseUrl}/functions/v1/validate-partner-code`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseAnonKey,
          },
          body: JSON.stringify({ code: refParam }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.valid === true) {
              sessionStorage.setItem("cethos_partner_id", data.partner_id);
              sessionStorage.setItem("cethos_partner_code", refParam);
              sessionStorage.setItem("cethos_partner_rate", String(data.customer_rate));
              sessionStorage.setItem("cethos_partner_name", data.name);
            }
          })
          .catch(() => {
            // Invalid code or network error — silently continue with standard pricing
          });
      }

      // Strip ?ref= from URL to keep it clean
      searchParams.delete("ref");
      const remaining = searchParams.toString();
      const cleanUrl = window.location.pathname + (remaining ? `?${remaining}` : "");
      window.history.replaceState({}, "", cleanUrl);
    } else {
      // No ?ref= — customer arrived directly, clear partner data
      sessionStorage.removeItem("cethos_partner_id");
      sessionStorage.removeItem("cethos_partner_code");
      sessionStorage.removeItem("cethos_partner_rate");
      sessionStorage.removeItem("cethos_partner_name");
    }
  }, []);

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

    // Validate token when URL params are present
    if (quoteId && token) {
      const isValid = await validateQuoteToken(quoteId, token);
      if (!isValid) {
        setTokenInvalid(true);
        setIsHydrating(false);
        return;
      }
    }

    try {
      // Use customer-quote-get edge function — the May 14 RLS lockdown blocks
      // anon SELECT on quotes/quote_files/customers, so direct PostgREST
      // fetches from this page silently returned empty arrays ("Quote Not
      // Found"). The edge function reads via service role using quote_id as
      // the capability, matching the rest of the customer-quote-* surface.
      let snapshot;
      try {
        snapshot = await getCustomerQuoteData(quoteId);
      } catch (err: any) {
        if (isCancelled()) return;
        const msg = (err?.message || "").toLowerCase();
        if (msg.includes("not found")) {
          setHydrationError("quote_not_found");
        } else {
          console.error("Quote fetch failed:", err);
          setHydrationError("quote_not_found");
        }
        setIsHydrating(false);
        return;
      }

      if (isCancelled()) return;

      const quote = snapshot.quote as any;
      const quoteFiles = snapshot.files;
      if (!quote) {
        setHydrationError("quote_not_found");
        setIsHydrating(false);
        return;
      }

      // Check quote is still actionable
      if (["paid", "cancelled"].includes(quote.status)) {
        setHydrationError("quote_already_completed");
        setIsHydrating(false);
        return;
      }

      // Check expiry
      if (quote.expires_at && new Date(quote.expires_at) < new Date()) {
        setHydrationError("quote_expired");
        setIsHydrating(false);
        return;
      }

      // Check there are files
      if (!quoteFiles || quoteFiles.length === 0) {
        // No files — something went wrong, let user start fresh at step 1
        setIsHydrating(false);
        return;
      }

      // For email links, surface embedded customer data if present
      const customerData: any =
        source === "email_link" ? (quote.customer ?? null) : null;

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

  if (tokenInvalid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border
                        border-gray-200 p-8 text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center
                          justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24"
                 stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94
                       a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            This link has expired
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            Quote links expire after 30 days for security reasons. Please contact
            us to receive a new link.
          </p>
          <a
            href="mailto:info@cethos.com"
            className="inline-block px-5 py-2.5 bg-teal-600 text-white text-sm
                       font-medium rounded-lg hover:bg-teal-700"
          >
            Contact Support
          </a>
        </div>
      </div>
    );
  }

  // ── Normal quote flow ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <div className={`mx-auto py-7 pb-24 ${state.currentStep === 4 ? "max-w-7xl px-4 sm:px-6 lg:px-8" : "max-w-2xl px-5"}`}>
        <ProgressStepper currentStep={state.currentStep} className={`mb-7 ${state.currentStep === 4 ? "max-w-2xl mx-auto" : ""}`} />

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
