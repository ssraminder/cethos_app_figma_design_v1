import { useState, useMemo, useEffect } from "react";
import { useQuote } from "@/context/QuoteContext";
import { supabase } from "@/lib/supabase";
import StartOverLink from "@/components/quote/StartOverLink";
import { ChevronRight, ChevronLeft, Loader2, Lock } from "lucide-react";

export default function Step3Contact() {
  const { state, updateState, goToPreviousStep } = useQuote();

  // Fetch quote_number into context if not already available
  useEffect(() => {
    const fetchQuoteNumber = async () => {
      if (state.quoteNumber || !state.quoteId || !supabase) return;
      const { data } = await supabase
        .from("quotes")
        .select("quote_number")
        .eq("id", state.quoteId)
        .single();
      if (data?.quote_number) {
        updateState({ quoteNumber: data.quote_number });
      }
    };
    fetchQuoteNumber();
  }, [state.quoteId, state.quoteNumber]);

  // Local state for first/last name — combined into fullName for QuoteContext
  const [firstName, setFirstName] = useState(() => {
    const parts = state.fullName.trim().split(" ");
    return parts[0] || "";
  });
  const [lastName, setLastName] = useState(() => {
    const parts = state.fullName.trim().split(" ");
    return parts.slice(1).join(" ") || "";
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Derived state
  const isBusiness = state.customerType === "business";

  // ── Validation ──────────────────────────────────────────────────────────

  const isEmailValid = useMemo(() => {
    if (!state.email) return true; // Don't flag empty as invalid (handled by required check)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email);
  }, [state.email]);

  const isFormValid = useMemo(() => {
    const hasFirstName = firstName.trim().length > 0;
    const hasLastName = lastName.trim().length > 0;
    const hasValidEmail =
      state.email.trim().length > 0 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email);
    const hasPhone = state.phone.trim().length > 0;
    const hasCompany = !isBusiness || state.companyName.trim().length > 0;
    return hasFirstName && hasLastName && hasValidEmail && hasPhone && hasCompany;
  }, [firstName, lastName, state.email, state.phone, isBusiness, state.companyName]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleBusinessToggle = (checked: boolean) => {
    updateState({ customerType: checked ? "business" : "individual" });
  };

  const handleContinue = async () => {
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (!supabase) throw new Error("Supabase not configured");

      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      const email = state.email.trim();
      const phone = state.phone.trim();
      const customerType = isBusiness ? "business" : "individual";
      const companyName = isBusiness ? state.companyName.trim() : null;

      // Update context
      updateState({ fullName });

      // 1. Create or update customer (upsert by email)
      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .upsert(
          {
            email,
            full_name: fullName,
            phone,
            customer_type: customerType,
            company_name: companyName,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email" },
        )
        .select("id")
        .single();

      if (customerError) throw customerError;

      // 2. Link customer to quote and set status to "lead"
      if (state.quoteId && customer) {
        const { error: linkError } = await supabase
          .from("quotes")
          .update({
            customer_id: customer.id,
            status: "lead",
          })
          .eq("id", state.quoteId);

        if (linkError) throw linkError;
      }

      // 3. Show processing modal (Index.tsx renders ProcessingStatus overlay)
      updateState({ showProcessingModal: true, isProcessing: true });
    } catch (err: any) {
      console.error("Error saving contact info:", err);
      setSubmitError(
        err?.message || "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* Page Title */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy mb-2">
          Your Information
        </h1>
        <p className="text-base text-cethos-gray">
          We&rsquo;ll use this to contact you about your translation.
        </p>
        {state.quoteNumber && (
          <p className="text-sm text-gray-400 mt-1">
            Quote ref: <span className="font-medium text-gray-500">{state.quoteNumber}</span>
          </p>
        )}
      </div>

      {/* Form Fields */}
      <div className="space-y-[18px]">
        {/* Row 1: First Name + Last Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="María"
              className="w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-lg text-sm bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="García"
              className="w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-lg text-sm bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition"
            />
          </div>
        </div>

        {/* Row 2: Email + Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={state.email}
              onChange={(e) => updateState({ email: e.target.value })}
              placeholder="maria@email.com"
              className={`w-full px-3 py-2 border-[1.5px] rounded-lg text-sm bg-white transition ${
                state.email && !isEmailValid
                  ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                  : "border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
              }`}
            />
            {state.email && !isEmailValid && (
              <p className="text-xs text-red-500 mt-1">
                Please enter a valid email address
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">
              Phone <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={state.phone}
              onChange={(e) => updateState({ phone: e.target.value })}
              placeholder="+1 416-555-0123"
              className="w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-lg text-sm bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition"
            />
          </div>
        </div>

        {/* Business Checkbox */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isBusiness}
              onChange={(e) => handleBusinessToggle(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-sm text-gray-700">
              This is a business order
            </span>
          </label>
        </div>

        {/* Company Name (conditional) */}
        {isBusiness && (
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">
              Company Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={state.companyName}
              onChange={(e) => updateState({ companyName: e.target.value })}
              placeholder="Your company name"
              className="w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-lg text-sm bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition"
            />
          </div>
        )}
      </div>

      {/* Privacy Notice */}
      <div className="mt-4 flex items-center gap-2 text-gray-400">
        <Lock className="w-3.5 h-3.5" />
        <p className="text-xs">
          Your information is secure and will never be shared.
        </p>
      </div>

      {/* Submit error */}
      {submitError && (
        <p className="text-sm text-red-600 mt-4 p-3 bg-red-50 rounded-lg">
          {submitError}
        </p>
      )}

      {/* Navigation Bar */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
        <StartOverLink />

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={goToPreviousStep}
            className="flex items-center gap-2 px-6 py-3 border-2 border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 font-medium transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Back</span>
          </button>

          <button
            type="button"
            onClick={handleContinue}
            disabled={!isFormValid || isSubmitting}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-base text-white transition-all ${
              isFormValid && !isSubmitting
                ? "bg-cethos-teal hover:bg-cethos-teal-light"
                : "bg-gray-300 cursor-not-allowed"
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Saving&hellip;</span>
              </>
            ) : (
              <>
                <span>Continue</span>
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
