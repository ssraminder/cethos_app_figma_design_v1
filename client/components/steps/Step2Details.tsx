import { useEffect, useState, useMemo } from "react";
import { useQuote } from "@/context/QuoteContext";
import { useDropdownOptions } from "@/hooks/useDropdownOptions";
import StartOverLink from "@/components/StartOverLink";
import SearchableDropdown, { DropdownOption } from "@/components/SearchableDropdown";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { Loader2, ChevronRight, ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function Step2Details() {
  const { state, updateState, goToNextStep, goToPreviousStep } = useQuote();
  const {
    sourceLanguages,
    targetLanguages,
    intendedUses,
    countries,
    certificationTypes,
    loading,
    error,
  } = useDropdownOptions();

  const [processingStatus, setProcessingStatus] = useState<
    "pending" | "processing" | "quote_ready" | "completed" | null
  >(null);
  const [fileProgress, setFileProgress] = useState({ completed: 0, total: 0 });
  const [showProvinceDropdown, setShowProvinceDropdown] = useState(false);
  const [provinces, setProvinces] = useState<{ code: string; name: string }[]>(
    []
  );

  // State for "Other" intended use
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherIntendedUse, setOtherIntendedUse] = useState(state.otherIntendedUse || "");

  // State for language tier and calculated rate
  const [languageInfo, setLanguageInfo] = useState<{
    tier: number;
    multiplier: number;
    effectiveRate: number;
  } | null>(null);
  const [baseRate, setBaseRate] = useState(65); // Default base rate

  const updateField = (field: string, value: string) => {
    updateState({ [field]: value });
  };

  // Define subcategory order for intended uses
  const subcategoryOrder = [
    "Immigration",
    "Legal",
    "Academic",
    "Government",
    "Employment",
    "Healthcare",
    "Financial",
    "Personal",
    "Business",
    "Real Estate",
    "Provincial Services",
    "Other",
  ];

  // Convert source languages to dropdown options
  const sourceLanguageOptions: DropdownOption[] = useMemo(() => {
    return sourceLanguages
      .filter((lang) => lang.id !== state.targetLanguageId)
      .map((lang) => ({
        id: lang.id,
        label: lang.name,
      }));
  }, [sourceLanguages, state.targetLanguageId]);

  // Convert target languages to dropdown options
  const targetLanguageOptions: DropdownOption[] = useMemo(() => {
    return targetLanguages
      .filter((lang) => lang.id !== state.sourceLanguageId)
      .map((lang) => ({
        id: lang.id,
        label: lang.name,
      }));
  }, [targetLanguages, state.sourceLanguageId]);

  // Convert intended uses to grouped dropdown options WITH "Other" option (legacy SearchableDropdown)
  const intendedUseOptions: DropdownOption[] = useMemo(() => {
    const options = intendedUses.map((use) => ({
      id: use.id,
      label: use.name,
      group: use.subcategory || "Other",
    }));

    // Add "Other" option at the end
    options.push({
      id: "other",
      label: "Other (please specify)",
      group: "Other",
    });

    return options;
  }, [intendedUses]);

  // Intended use options for SearchableSelect (id/name format) with "Other" option
  const intendedUseSearchableOptions = useMemo(() => {
    const opts = intendedUses.map((use) => ({
      id: use.id,
      name: use.name,
    }));
    opts.push({ id: "other", name: "Other (please specify)" });
    return opts;
  }, [intendedUses]);

  // Convert provinces to dropdown options
  const provinceOptions: DropdownOption[] = useMemo(() => {
    return provinces.map((p) => ({
      id: p.code,
      label: p.name,
    }));
  }, [provinces]);

  // Convert countries to grouped dropdown options (Common vs All)
  const countryOptions: DropdownOption[] = useMemo(() => {
    const common = countries.filter((c) => c.is_common);
    const other = countries.filter((c) => !c.is_common).sort((a, b) => a.name.localeCompare(b.name));

    return [
      ...common.map((c) => ({ id: c.id, label: c.name, group: "Common Countries" })),
      ...other.map((c) => ({ id: c.id, label: c.name, group: "All Countries" })),
    ];
  }, [countries]);

  // Fetch base rate from app_settings
  useEffect(() => {
    const fetchBaseRate = async () => {
      if (!supabase) return;

      try {
        // Use maybeSingle() to avoid error if no row found
        const { data, error } = await supabase
          .from("app_settings")
          .select("setting_value")
          .eq("setting_key", "base_rate")
          .maybeSingle();

        if (error) {
          console.warn("Could not fetch base_rate from app_settings:", error.message);
          // Keep default of 65
          return;
        }

        if (data?.setting_value) {
          setBaseRate(parseFloat(data.setting_value) || 65);
        }
      } catch (err) {
        console.warn("Error fetching base rate:", err);
      }
    };

    fetchBaseRate();
  }, []);

  // Fetch language tier and multiplier when source language changes
  useEffect(() => {
    const fetchLanguageInfo = async () => {
      if (!state.sourceLanguageId || !supabase) {
        setLanguageInfo(null);
        return;
      }

      try {
        const { data: langData, error } = await supabase
          .from("languages")
          .select("tier, multiplier")
          .eq("id", state.sourceLanguageId)
          .single();

        if (error) {
          console.warn("Could not fetch language info:", error.message);
          return;
        }

        if (langData) {
          const tier = langData.tier || 1;
          const multiplier = parseFloat(langData.multiplier) || 1.0;
          
          // Calculate effective rate: base_rate * multiplier, rounded up to nearest 2.5
          const rawRate = baseRate * multiplier;
          const effectiveRate = Math.ceil(rawRate / 2.5) * 2.5;

          setLanguageInfo({
            tier,
            multiplier,
            effectiveRate,
          });

          // Store in quote state for later use
          updateState({
            languageTier: tier,
            languageMultiplier: multiplier,
            effectiveRate: effectiveRate,
          });
        }
      } catch (err) {
        console.warn("Error fetching language info:", err);
      }
    };

    fetchLanguageInfo();
  }, [state.sourceLanguageId, baseRate]);

  // Handle source language change with smart target auto-selection
  const handleSourceLanguageChange = (languageId: string) => {
    updateField("sourceLanguageId", languageId);

    // Find the selected source language
    const selectedLanguage = sourceLanguages.find((l) => l.id === languageId);

    // If source is NOT English, auto-select English as target
    if (selectedLanguage && !selectedLanguage.code.startsWith("en")) {
      // Find English in target languages
      const englishLang = targetLanguages.find((l) => l.code === "en");
      if (englishLang) {
        updateField("targetLanguageId", englishLang.id);
      }
    } else {
      // If source IS English, reset target to empty (user must select)
      updateField("targetLanguageId", "");
    }
  };

  // Handle intended use change with auto-select certification type
  const handleIntendedUseChange = (useId: string) => {
    // Check if "Other" was selected
    if (useId === "other") {
      setShowOtherInput(true);
      updateField("intendedUseId", "");
      updateState({ isOtherIntendedUse: true });
      setShowProvinceDropdown(false);
      updateField("serviceProvince", "");
      return;
    }

    // Regular intended use selected
    setShowOtherInput(false);
    setOtherIntendedUse("");
    updateState({ isOtherIntendedUse: false, otherIntendedUse: "" });
    updateField("intendedUseId", useId);

    // Find the selected intended use
    const selectedUse = intendedUses.find((u) => u.id === useId);

    // Show/hide province dropdown based on subcategory
    const isProvincial = selectedUse?.subcategory === "Provincial Services";
    setShowProvinceDropdown(isProvincial);

    // Clear province if not provincial
    if (!isProvincial) {
      updateField("serviceProvince", "");
    }

    // Auto-select the default certification type
    if (selectedUse?.default_certification_type_id) {
      updateField(
        "certificationTypeId",
        selectedUse.default_certification_type_id
      );
    }
  };

  // Handle "Other" intended use text input
  const handleOtherIntendedUseChange = (value: string) => {
    setOtherIntendedUse(value);
    updateState({ otherIntendedUse: value });
  };

  // Handle country change
  const handleCountryChange = (countryId: string) => {
    const selectedCountry = countries.find((c) => c.id === countryId);
    updateState({
      countryId,
      countryOfIssue: selectedCountry?.name || "",
    });
  };

  // Fetch provinces on mount
  useEffect(() => {
    const fetchProvinces = async () => {
      if (!supabase) return;

      const { data } = await supabase
        .from("canadian_provinces")
        .select("code, name")
        .eq("is_active", true)
        .order("sort_order");

      if (data) setProvinces(data);
    };
    fetchProvinces();
  }, []);

  // Check if province dropdown should be shown based on current intended use
  useEffect(() => {
    if (state.intendedUseId && intendedUses.length > 0) {
      const selectedUse = intendedUses.find(
        (u) => u.id === state.intendedUseId
      );
      const isProvincial = selectedUse?.subcategory === "Provincial Services";
      setShowProvinceDropdown(isProvincial);
    }
  }, [state.intendedUseId, intendedUses]);

  // Check if "Other" was previously selected (on mount)
  useEffect(() => {
    if (state.isOtherIntendedUse) {
      setShowOtherInput(true);
      setOtherIntendedUse(state.otherIntendedUse || "");
    }
  }, []);

  // Subscribe to processing status updates
  useEffect(() => {
    if (!state.quoteId || !supabase) return;

    const fetchStatus = async () => {
      if (!supabase) return;

      // Get quote status
      const { data: quote } = await supabase
        .from("quotes")
        .select("processing_status")
        .eq("id", state.quoteId)
        .single();

      if (quote) {
        setProcessingStatus(quote.processing_status);
      }

      // Get file progress
      const { data: files } = await supabase
        .from("quote_files")
        .select("processing_status")
        .eq("quote_id", state.quoteId);

      if (files) {
        const completed = files.filter(
          (f) => f.processing_status === "complete"
        ).length;
        setFileProgress({ completed, total: files.length });
      }
    };

    fetchStatus();

    // Subscribe to realtime updates
    if (!supabase) return;

    const channel = supabase
      .channel(`step2-${state.quoteId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "quotes",
          filter: `id=eq.${state.quoteId}`,
        },
        (payload: any) => {
          setProcessingStatus(payload.new.processing_status);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "quote_files",
          filter: `quote_id=eq.${state.quoteId}`,
        },
        () => {
          fetchStatus();
        }
      )
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [state.quoteId]);

  // Validation: Check if form is complete
  const isFormValid = useMemo(() => {
    const hasLanguages = state.sourceLanguageId && state.targetLanguageId;
    const hasIntendedUse = state.intendedUseId || (showOtherInput && otherIntendedUse.trim().length > 0);
    const hasProvince = !showProvinceDropdown || state.serviceProvince;
    // Country is OPTIONAL
    return hasLanguages && hasIntendedUse && hasProvince;
  }, [
    state.sourceLanguageId,
    state.targetLanguageId,
    state.intendedUseId,
    showOtherInput,
    otherIntendedUse,
    showProvinceDropdown,
    state.serviceProvince,
  ]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-cethos-blue" />
        <span className="ml-3 text-cethos-slate">Loading options...</span>
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

      {/* Processing Status Indicator */}
      {processingStatus &&
        (processingStatus === "pending" ||
          processingStatus === "processing") && (
          <div className="mb-6 bg-cethos-teal-50 border-l-4 border-cethos-teal rounded-lg p-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-cethos-teal flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                Analyzing your documents in the background...
              </p>
              {fileProgress.total > 0 && (
                <p className="text-xs text-gray-700 mt-1">
                  {fileProgress.completed} of {fileProgress.total} documents
                  processed
                </p>
              )}
            </div>
          </div>
        )}

      {/* Processing Complete Indicator */}
      {(processingStatus === "quote_ready" || processingStatus === "completed") && (
        <div className="mb-6 bg-green-50 border-l-4 border-green-500 rounded-lg p-4 flex items-center gap-3">
          <svg
            className="w-5 h-5 text-green-600 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <p className="text-sm font-medium text-green-900">
            Document analysis complete! Your quote is ready.
          </p>
        </div>
      )}

      {/* Form Section */}
      <div className="bg-white border-2 border-cethos-border rounded-xl p-6 sm:p-8 space-y-6">
        {/* Source Language */}
        <div>
          <SearchableDropdown
            options={sourceLanguageOptions}
            value={state.sourceLanguageId || ""}
            onChange={handleSourceLanguageChange}
            label="Source Language"
            placeholder="Search or select source language..."
            required
          />
          {/* Show language tier info */}
          {languageInfo && (
            <div className="mt-2 text-xs text-cethos-slate flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Tier {languageInfo.tier}
              </span>
              <span>
                Rate: ${languageInfo.effectiveRate.toFixed(2)}/page
                {languageInfo.multiplier !== 1 && (
                  <span className="text-gray-400 ml-1">
                    ({languageInfo.multiplier}x multiplier)
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Target Language */}
        <SearchableDropdown
          options={targetLanguageOptions}
          value={state.targetLanguageId || ""}
          onChange={(value) => updateField("targetLanguageId", value)}
          label="Target Language"
          placeholder="Search or select target language..."
          required
        />

        {/* Purpose of Translation */}
        <div>
          <SearchableSelect
            options={intendedUseSearchableOptions}
            value={showOtherInput ? "other" : (state.intendedUseId || "")}
            onChange={handleIntendedUseChange}
            label="Purpose of Translation"
            placeholder="Search or select intended use..."
            required={true}
            grouped={true}
            synonyms={true}
          />

          {/* "Other" text input */}
          {showOtherInput && (
            <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <input
                type="text"
                value={otherIntendedUse}
                onChange={(e) => handleOtherIntendedUseChange(e.target.value)}
                placeholder="Please specify the purpose of your translation..."
                className="w-full px-4 py-3 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-teal focus:border-transparent text-base"
                maxLength={200}
              />
              <p className="mt-1 text-xs text-cethos-slate">
                {otherIntendedUse.length}/200 characters
              </p>
            </div>
          )}
        </div>

        {/* Province Dropdown - Conditional */}
        {showProvinceDropdown && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <SearchableDropdown
              options={provinceOptions}
              value={state.serviceProvince || ""}
              onChange={(value) => updateField("serviceProvince", value)}
              label="Province / Territory"
              placeholder="Search or select province..."
              required
            />
            <p className="mt-2 text-xs text-cethos-slate">
              Select where this document will be submitted.
            </p>
          </div>
        )}

        {/* Country of Issue - OPTIONAL */}
        <SearchableDropdown
          options={countryOptions}
          value={state.countryId || ""}
          onChange={handleCountryChange}
          label="Country where document was issued (Optional)"
          placeholder="Search or select country..."
          required={false}
          groupOrder={["Common Countries", "All Countries"]}
        />

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
            className="w-full h-32 px-4 py-3 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-teal focus:border-transparent text-base resize-none"
            maxLength={500}
          />
          <div className="mt-2 text-xs text-cethos-slate text-right">
            {state.specialInstructions?.length || 0}/500 characters
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between mt-8">
        <StartOverLink />
        <div className="flex items-center gap-4">
          <button
            onClick={goToPreviousStep}
            className="flex items-center gap-2 px-6 py-3 border-2 border-cethos-border text-cethos-gray rounded-lg hover:bg-cethos-bg-light font-medium transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Back</span>
          </button>

          <button
            onClick={goToNextStep}
            disabled={!isFormValid}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-base text-white transition-all ${
              isFormValid
                ? "bg-cethos-teal hover:bg-cethos-teal-light"
                : "bg-gray-300 cursor-not-allowed"
            }`}
          >
            <span>Continue</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </>
  );
}
