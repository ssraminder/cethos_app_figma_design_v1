import { useState, useMemo } from "react";
import { useQuote } from "@/context/QuoteContext";
import { useDropdownOptions } from "@/hooks/useDropdownOptions";
import { supabase } from "@/lib/supabase";
import StartOverLink from "@/components/quote/StartOverLink";
import { ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import SearchableSelectUI from "@/components/ui/SearchableSelect";
import SearchableSelect from "@/components/shared/SearchableSelect";

export default function Step2Details() {
  const { state, updateState, goToNextStep, goToPreviousStep, resetQuote } =
    useQuote();
  const { intendedUses, countries, loading, error } = useDropdownOptions();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Dropdown options ──────────────────────────────────────────────────────

  const intendedUseOptions = useMemo(
    () =>
      intendedUses.map((u) => ({
        id: u.id,
        name: u.name,
      })),
    [intendedUses],
  );

  const countryOptions = useMemo(() => {
    const common = countries
      .filter((c) => c.is_common)
      .map((c) => ({ value: c.id, label: c.name, group: "Common Countries" }));
    const rest = countries
      .filter((c) => !c.is_common)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ value: c.id, label: c.name, group: "All Countries" }));

    return [...common, ...rest];
  }, [countries]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleIntendedUseChange = (value: string) => {
    updateState({ intendedUseId: value });
  };

  const handleCountryChange = (countryId: string) => {
    const selected = countries.find((c) => c.id === countryId);
    updateState({
      countryId,
      countryOfIssue: selected?.name || "",
    });
  };

  const handleSpecialInstructionsChange = (value: string) => {
    updateState({ specialInstructions: value });
  };

  // ── Validation ────────────────────────────────────────────────────────────

  const isFormValid = useMemo(
    () => Boolean(state.intendedUseId),
    [state.intendedUseId],
  );

  // ── Continue ──────────────────────────────────────────────────────────────

  const handleContinue = async () => {
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (!supabase) throw new Error("Supabase not configured");

      if (state.quoteId) {
        const { error: updateError } = await supabase
          .from("quotes")
          .update({
            intended_use_id: state.intendedUseId,
            country_of_issue: state.countryOfIssue || null,
            special_instructions: state.specialInstructions || null,
            status: "details_pending",
          })
          .eq("id", state.quoteId);

        if (updateError) throw updateError;
      }

      goToNextStep();
    } catch (err: any) {
      console.error("Error updating quote:", err);
      setSubmitError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Loading / Error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
        <span className="ml-3 text-gray-500">Loading options...</span>
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Processing Banner */}
      <div className="bg-teal-50 border border-teal-100 rounded-lg px-3.5 py-2.5 text-xs text-teal-600 flex items-center gap-2 mb-5">
        <span>&#9203;</span>
        Your documents are being analyzed in the background...
      </div>

      {/* Page Title */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy mb-2">
          Document Details
        </h1>
        <p className="text-base text-cethos-gray">
          Tell us about your documents so we can provide an accurate quote.
        </p>
      </div>

      {/* Form Fields */}
      <div className="space-y-[18px]">
        {/* Intended Use */}
        <SearchableSelect
          options={intendedUseOptions}
          value={state.intendedUseId}
          onChange={(val) => handleIntendedUseChange(val)}
          placeholder="Search intended use..."
          label="Intended Use"
          required={true}
          grouped={true}
          synonyms={true}
        />

        {/* Country of Issue */}
        <SearchableSelectUI
          options={countryOptions}
          value={state.countryId}
          onChange={(val) => handleCountryChange(val)}
          placeholder="Select country (optional)"
          label="Country of Issue"
          required={false}
          groupOrder={["Common Countries", "All Countries"]}
        />

        {/* Additional Information */}
        <div>
          <label className="text-xs font-semibold text-gray-700 mb-1 block">
            Additional Information{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            value={state.specialInstructions}
            onChange={(e) => handleSpecialInstructionsChange(e.target.value)}
            placeholder="Names of people, places or institutions in documents, any special instructions..."
            rows={3}
            className="w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-lg text-sm bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition resize-y min-h-[70px]"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Help our translators with names, places, or formatting requests.
          </p>
        </div>
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
          {state.entryPoint === "website_embed" ? (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "This will discard your uploaded documents and start a new quote. Continue?",
                  )
                ) {
                  resetQuote();
                }
              }}
              className="flex items-center gap-2 px-6 py-3 border-2 border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            >
              <span>Start Over</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={goToPreviousStep}
              className="flex items-center gap-2 px-6 py-3 border-2 border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
              <span>Back</span>
            </button>
          )}

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
