import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  Globe,
  ChevronDown,
  Check,
  Loader2,
  Search,
  X,
  RotateCcw,
} from "lucide-react";

// Types
interface Language {
  id: string;
  code: string;
  name: string;
  native_name: string | null;
  tier: number;
  multiplier: number;
}

interface IntendedUse {
  id: string;
  code: string;
  name: string;
}

interface TranslationDetails {
  sourceLanguageId: string | null;
  targetLanguageId: string | null;
  intendedUseId: string | null;
  countryOfIssue: string | null;
  languageTier: number;
  languageMultiplier: number;
  languageMultiplierOverride: number | null;
}

interface Props {
  quoteId: string;
  onDetailsChange?: () => void;
}

// Countries list (ISO 3166-1)
const COUNTRIES = [
  { code: "AF", name: "Afghanistan" },
  { code: "AL", name: "Albania" },
  { code: "DZ", name: "Algeria" },
  { code: "AR", name: "Argentina" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "BD", name: "Bangladesh" },
  { code: "BE", name: "Belgium" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CL", name: "Chile" },
  { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" },
  { code: "CR", name: "Costa Rica" },
  { code: "HR", name: "Croatia" },
  { code: "CU", name: "Cuba" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" },
  { code: "DO", name: "Dominican Republic" },
  { code: "EC", name: "Ecuador" },
  { code: "EG", name: "Egypt" },
  { code: "SV", name: "El Salvador" },
  { code: "ET", name: "Ethiopia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GH", name: "Ghana" },
  { code: "GR", name: "Greece" },
  { code: "GT", name: "Guatemala" },
  { code: "HN", name: "Honduras" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IR", name: "Iran" },
  { code: "IQ", name: "Iraq" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JM", name: "Jamaica" },
  { code: "JP", name: "Japan" },
  { code: "JO", name: "Jordan" },
  { code: "KE", name: "Kenya" },
  { code: "KR", name: "South Korea" },
  { code: "KW", name: "Kuwait" },
  { code: "LB", name: "Lebanon" },
  { code: "MY", name: "Malaysia" },
  { code: "MX", name: "Mexico" },
  { code: "MA", name: "Morocco" },
  { code: "NP", name: "Nepal" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NI", name: "Nicaragua" },
  { code: "NG", name: "Nigeria" },
  { code: "NO", name: "Norway" },
  { code: "PK", name: "Pakistan" },
  { code: "PA", name: "Panama" },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "PR", name: "Puerto Rico" },
  { code: "QA", name: "Qatar" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SG", name: "Singapore" },
  { code: "ZA", name: "South Africa" },
  { code: "ES", name: "Spain" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "SY", name: "Syria" },
  { code: "TW", name: "Taiwan" },
  { code: "TH", name: "Thailand" },
  { code: "TT", name: "Trinidad and Tobago" },
  { code: "TR", name: "Turkey" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "UY", name: "Uruguay" },
  { code: "VE", name: "Venezuela" },
  { code: "VN", name: "Vietnam" },
  { code: "YE", name: "Yemen" },
  { code: "ZW", name: "Zimbabwe" },
].sort((a, b) => a.name.localeCompare(b.name));

// Searchable Dropdown Component
interface SearchableDropdownProps {
  label: string;
  value: string | null;
  options: { id: string; label: string; sublabel?: string }[];
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  saving?: boolean;
}

function SearchableDropdown({
  label,
  value,
  options,
  onChange,
  placeholder = "Select...",
  disabled = false,
  saving = false,
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((o) => o.id === value);

  const filteredOptions = options.filter(
    (o) =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      (o.sublabel && o.sublabel.toLowerCase().includes(search.toLowerCase()))
  );

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </label>

      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full flex items-center justify-between px-3 py-2 bg-white border rounded-md text-left transition-colors ${
          disabled
            ? "bg-gray-50 cursor-not-allowed text-gray-400"
            : "border-gray-200 hover:border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
        }`}
      >
        <span className={selectedOption ? "text-gray-900" : "text-gray-400"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <div className="flex items-center gap-1">
          {saving && (
            <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
          )}
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500 italic">
                No results found
              </div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between ${
                    option.id === value ? "bg-teal-50 text-teal-700" : ""
                  }`}
                >
                  <div>
                    <div className="font-medium">{option.label}</div>
                    {option.sublabel && (
                      <div className="text-xs text-gray-500">
                        {option.sublabel}
                      </div>
                    )}
                  </div>
                  {option.id === value && (
                    <Check className="w-4 h-4 text-teal-600" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Main Component
export default function TranslationDetailsCard({
  quoteId,
  onDetailsChange,
}: Props) {
  const [details, setDetails] = useState<TranslationDetails | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [intendedUses, setIntendedUses] = useState<IntendedUse[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch data on mount
  useEffect(() => {
    fetchAllData();
  }, [quoteId]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Fetch quote details
      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .select(
          `
          source_language_id,
          target_language_id,
          intended_use_id,
          country_of_issue,
          language_multiplier_override,
          source_language:languages!quotes_source_language_id_fkey (
            id, code, name, native_name, tier, multiplier
          )
        `
        )
        .eq("id", quoteId)
        .single();

      if (quoteError) throw quoteError;

      // Fetch all languages
      const { data: langData, error: langError } = await supabase
        .from("languages")
        .select("id, code, name, native_name, tier, multiplier")
        .eq("is_active", true)
        .order("name");

      if (langError) throw langError;

      // Fetch intended uses
      const { data: useData, error: useError } = await supabase
        .from("intended_uses")
        .select("id, code, name")
        .eq("is_active", true)
        .order("sort_order");

      if (useError) throw useError;

      setLanguages(langData || []);
      setIntendedUses(useData || []);

      // Get source language tier info
      const sourceLang = quoteData?.source_language as Language | null;

      setDetails({
        sourceLanguageId: quoteData?.source_language_id || null,
        targetLanguageId: quoteData?.target_language_id || null,
        intendedUseId: quoteData?.intended_use_id || null,
        countryOfIssue: quoteData?.country_of_issue || null,
        languageTier: sourceLang?.tier || 1,
        languageMultiplier:
          quoteData?.language_multiplier_override ??
          sourceLang?.multiplier ??
          1.0,
        languageMultiplierOverride: quoteData?.language_multiplier_override,
      });
    } catch (err: any) {
      console.error("Error fetching translation details:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-save field
  const saveField = async (field: string, value: any) => {
    setSavingField(field);
    setError(null);

    try {
      const updateData: Record<string, any> = {};

      if (field === "sourceLanguageId") {
        updateData.source_language_id = value;
        // Reset multiplier override when source language changes
        updateData.language_multiplier_override = null;
      } else if (field === "targetLanguageId") {
        updateData.target_language_id = value;
      } else if (field === "intendedUseId") {
        updateData.intended_use_id = value;
      } else if (field === "countryOfIssue") {
        updateData.country_of_issue = value;
      } else if (field === "languageMultiplierOverride") {
        updateData.language_multiplier_override = value;
      }

      const { error: updateError } = await supabase
        .from("quotes")
        .update(updateData)
        .eq("id", quoteId);

      if (updateError) throw updateError;

      // If source language changed, update local state with new tier info
      if (field === "sourceLanguageId") {
        const newLang = languages.find((l) => l.id === value);
        if (newLang) {
          setDetails((prev) =>
            prev
              ? {
                  ...prev,
                  sourceLanguageId: value,
                  languageTier: newLang.tier || 1,
                  languageMultiplier: newLang.multiplier || 1.0,
                  languageMultiplierOverride: null,
                }
              : null
          );
        }
      } else if (field === "languageMultiplierOverride") {
        setDetails((prev) =>
          prev
            ? {
                ...prev,
                languageMultiplier: value,
                languageMultiplierOverride: value,
              }
            : null
        );
      } else {
        setDetails((prev) => (prev ? { ...prev, [field]: value } : null));
      }

      // Trigger recalculation if language or multiplier changed
      if (
        ["sourceLanguageId", "languageMultiplierOverride"].includes(field)
      ) {
        await supabase.rpc("recalculate_quote_totals", { p_quote_id: quoteId });
        onDetailsChange?.();
      }

      toast.success("Saved successfully");
    } catch (err: any) {
      console.error(`Error saving ${field}:`, err);
      setError(err.message);
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setSavingField(null);
    }
  };

  // Get tier badge color
  const getTierBadgeColor = (tier: number) => {
    switch (tier) {
      case 1:
        return "bg-green-100 text-green-700 border-green-200";
      case 2:
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case 3:
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  // Reset multiplier to tier default
  const handleResetMultiplier = async () => {
    const sourceLang = languages.find(
      (l) => l.id === details?.sourceLanguageId
    );
    if (sourceLang) {
      setSavingField("languageMultiplierOverride");
      try {
        const { error: updateError } = await supabase
          .from("quotes")
          .update({ language_multiplier_override: null })
          .eq("id", quoteId);

        if (updateError) throw updateError;

        setDetails((prev) =>
          prev
            ? {
                ...prev,
                languageMultiplier: sourceLang.multiplier || 1.0,
                languageMultiplierOverride: null,
              }
            : null
        );

        // Trigger recalculation
        await supabase.rpc("recalculate_quote_totals", { p_quote_id: quoteId });
        onDetailsChange?.();

        toast.success("Multiplier reset to tier default");
      } catch (err: any) {
        console.error("Error resetting multiplier:", err);
        toast.error(`Failed to reset: ${err.message}`);
      } finally {
        setSavingField(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm mb-6">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Globe className="w-5 h-5 text-teal-600" />
          Translation Details
        </h3>
      </div>

      <div className="p-5">
        {/* Error Display */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Source Language */}
          <SearchableDropdown
            label="Source Language"
            value={details?.sourceLanguageId || null}
            options={languages.map((l) => ({
              id: l.id,
              label: l.name,
              sublabel: l.native_name
                ? `${l.native_name} (${l.code})`
                : `(${l.code})`,
            }))}
            onChange={(id) => saveField("sourceLanguageId", id)}
            placeholder="Select source language"
            saving={savingField === "sourceLanguageId"}
          />

          {/* Target Language */}
          <SearchableDropdown
            label="Target Language"
            value={details?.targetLanguageId || null}
            options={languages.map((l) => ({
              id: l.id,
              label: l.name,
              sublabel: l.native_name
                ? `${l.native_name} (${l.code})`
                : `(${l.code})`,
            }))}
            onChange={(id) => saveField("targetLanguageId", id)}
            placeholder="Select target language"
            saving={savingField === "targetLanguageId"}
          />

          {/* Purpose / Intended Use */}
          <SearchableDropdown
            label="Purpose"
            value={details?.intendedUseId || null}
            options={intendedUses.map((u) => ({
              id: u.id,
              label: u.name,
            }))}
            onChange={(id) => saveField("intendedUseId", id)}
            placeholder="Select purpose"
            saving={savingField === "intendedUseId"}
          />

          {/* Country of Issue */}
          <SearchableDropdown
            label="Country of Issue"
            value={details?.countryOfIssue || null}
            options={COUNTRIES.map((c) => ({
              id: c.code,
              label: c.name,
              sublabel: c.code,
            }))}
            onChange={(code) => saveField("countryOfIssue", code)}
            placeholder="Select country"
            saving={savingField === "countryOfIssue"}
          />

          {/* Language Tier (Read-only) */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Language Tier
            </label>
            <div className="flex items-center h-[42px]">
              <span
                className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${getTierBadgeColor(details?.languageTier || 1)}`}
              >
                Tier {details?.languageTier || 1}
              </span>
              <span className="ml-2 text-xs text-gray-500">
                {details?.languageTier === 1 && "(Standard)"}
                {details?.languageTier === 2 && "(Complex Script)"}
                {details?.languageTier === 3 && "(Rare/Specialized)"}
              </span>
            </div>
          </div>

          {/* Language Multiplier (Editable) */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Language Multiplier
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  step="0.01"
                  min="0.5"
                  max="3.0"
                  value={details?.languageMultiplier || 1.0}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0.5 && val <= 3.0) {
                      saveField("languageMultiplierOverride", val);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
                {savingField === "languageMultiplierOverride" && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-teal-500" />
                )}
              </div>

              {/* Show reset button if override is set */}
              {details?.languageMultiplierOverride !== null && (
                <button
                  onClick={handleResetMultiplier}
                  className="px-2 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                  title="Reset to tier default"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Show if overridden */}
            {details?.languageMultiplierOverride !== null && (
              <p className="text-xs text-orange-600 mt-1">
                Custom override (Tier default:{" "}
                {languages.find((l) => l.id === details?.sourceLanguageId)
                  ?.multiplier || "1.00"}
                x)
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
