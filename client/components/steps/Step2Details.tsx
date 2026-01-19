import { useQuote } from "@/context/QuoteContext";
import LanguageSelect from "@/components/LanguageSelect";
import PurposeSelect from "@/components/PurposeSelect";
import CountrySelect from "@/components/CountrySelect";

export default function Step2Details() {
  const { state, updateState } = useQuote();

  const updateField = (field: string, value: string) => {
    updateState({ [field]: value });
  };

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

      {/* Form Section */}
      <div className="bg-white border-2 border-cethos-border rounded-xl p-6 sm:p-8 space-y-6">
        {/* Source Language */}
        <div>
          <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
            Source Language <span className="text-red-500">*</span>
          </label>
          <LanguageSelect
            value={state.sourceLanguage}
            onChange={(value) => updateField("sourceLanguage", value)}
            placeholder="Select source language"
          />
        </div>

        {/* Target Language */}
        <div>
          <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
            Target Language <span className="text-red-500">*</span>
          </label>
          <LanguageSelect
            value={state.targetLanguage}
            onChange={(value) => updateField("targetLanguage", value)}
            placeholder="Select target language"
          />
        </div>

        {/* Purpose of Translation */}
        <div>
          <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
            Purpose of Translation <span className="text-red-500">*</span>
          </label>
          <PurposeSelect
            value={state.intendedUse}
            onChange={(value) => updateField("intendedUse", value)}
          />
        </div>

        {/* Country of Issue */}
        <div>
          <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
            Country of Issue <span className="text-red-500">*</span>
          </label>
          <CountrySelect
            value={state.countryOfIssue}
            onChange={(value) => updateField("countryOfIssue", value)}
          />
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
