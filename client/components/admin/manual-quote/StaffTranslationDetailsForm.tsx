import { useState, useEffect } from "react";
import { Languages, FileText, Globe, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Select from "react-select";

interface QuoteData {
  sourceLanguageId?: string;
  targetLanguageId?: string;
  intendedUseId?: string;
  countryOfIssue?: string;
  specialInstructions?: string;
}

interface StaffTranslationDetailsFormProps {
  value: QuoteData;
  onChange: (data: QuoteData) => void;
}

interface SelectOption {
  value: string;
  label: string;
}

export default function StaffTranslationDetailsForm({
  value,
  onChange,
}: StaffTranslationDetailsFormProps) {
  const [formData, setFormData] = useState<QuoteData>(value);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Dropdown options
  const [languages, setLanguages] = useState<SelectOption[]>([]);
  const [intendedUses, setIntendedUses] = useState<SelectOption[]>([]);
  const [countries, setCountries] = useState<SelectOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDropdownData();
  }, []);

  useEffect(() => {
    onChange(formData);
    validateForm();
  }, [formData]);

  const loadDropdownData = async () => {
    setIsLoading(true);
    try {
      // Load languages
      const { data: languagesData } = await supabase
        .from("languages")
        .select(
          "id, code, name, native_name, is_source_available, is_target_available",
        )
        .eq("is_active", true)
        .order("sort_order")
        .order("name");

      if (languagesData) {
        setLanguages(
          languagesData.map((lang) => ({
            value: lang.id,
            label: `${lang.native_name || lang.name} (${lang.name})`,
          })),
        );
      }

      // Load intended uses
      const { data: usesData } = await supabase
        .from("intended_uses")
        .select("id, code, name, subcategory")
        .eq("is_active", true)
        .order("sort_order")
        .order("name");

      if (usesData) {
        setIntendedUses(
          usesData.map((use) => ({
            value: use.id,
            label: use.subcategory
              ? `${use.name} - ${use.subcategory}`
              : use.name,
          })),
        );
      }

      // Load countries
      const { data: countriesData } = await supabase
        .from("countries")
        .select("code, name, is_common")
        .eq("is_active", true)
        .order("is_common", { ascending: false })
        .order("sort_order")
        .order("name");

      if (countriesData) {
        setCountries(
          countriesData.map((country) => ({
            value: country.code,
            label: `${country.name} (${country.code})`,
          })),
        );
      }
    } catch (error) {
      console.error("Error loading dropdown data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.sourceLanguageId) {
      newErrors.sourceLanguageId = "Source language is required";
    }

    if (!formData.targetLanguageId) {
      newErrors.targetLanguageId = "Target language is required";
    }

    if (formData.sourceLanguageId && formData.targetLanguageId) {
      if (formData.sourceLanguageId === formData.targetLanguageId) {
        newErrors.targetLanguageId =
          "Target language must be different from source language";
      }
    }

    if (!formData.intendedUseId) {
      newErrors.intendedUseId = "Intended use is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSelectChange = (field: string, option: SelectOption | null) => {
    setFormData({
      ...formData,
      [field]: option?.value || "",
    });
  };

  const handleTextChange = (
    e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>,
  ) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="ml-3 text-gray-600">Loading form data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Translation Details
        </h2>
        <p className="text-sm text-gray-600">
          Select the languages and specify the purpose of the translation
        </p>
      </div>

      <div className="space-y-4">
        {/* Source Language */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <Languages className="inline w-4 h-4 mr-1" />
            Source Language (From) *
          </label>
          <Select
            options={languages}
            value={languages.find((l) => l.value === formData.sourceLanguageId)}
            onChange={(option) =>
              handleSelectChange("sourceLanguageId", option)
            }
            placeholder="Select source language..."
            isClearable
            className={errors.sourceLanguageId ? "border-red-300" : ""}
            styles={{
              control: (base) => ({
                ...base,
                borderColor: errors.sourceLanguageId
                  ? "#fca5a5"
                  : base.borderColor,
              }),
            }}
          />
          {errors.sourceLanguageId && (
            <p className="mt-1 text-sm text-red-600">
              {errors.sourceLanguageId}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            The language of the original document
          </p>
        </div>

        {/* Target Language */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <Languages className="inline w-4 h-4 mr-1" />
            Target Language (To) *
          </label>
          <Select
            options={languages}
            value={languages.find((l) => l.value === formData.targetLanguageId)}
            onChange={(option) =>
              handleSelectChange("targetLanguageId", option)
            }
            placeholder="Select target language..."
            isClearable
            className={errors.targetLanguageId ? "border-red-300" : ""}
            styles={{
              control: (base) => ({
                ...base,
                borderColor: errors.targetLanguageId
                  ? "#fca5a5"
                  : base.borderColor,
              }),
            }}
          />
          {errors.targetLanguageId && (
            <p className="mt-1 text-sm text-red-600">
              {errors.targetLanguageId}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            The language to translate the document into
          </p>
        </div>

        {/* Language Pair Summary */}
        {formData.sourceLanguageId && formData.targetLanguageId && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-sm text-blue-800">
              <span className="font-medium">Translation:</span>{" "}
              {
                languages.find((l) => l.value === formData.sourceLanguageId)
                  ?.label
              }{" "}
              →{" "}
              {
                languages.find((l) => l.value === formData.targetLanguageId)
                  ?.label
              }
            </p>
          </div>
        )}

        {/* Intended Use */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <FileText className="inline w-4 h-4 mr-1" />
            Intended Use *
          </label>
          <Select
            options={intendedUses}
            value={intendedUses.find((u) => u.value === formData.intendedUseId)}
            onChange={(option) => handleSelectChange("intendedUseId", option)}
            placeholder="Select intended use..."
            isClearable
            className={errors.intendedUseId ? "border-red-300" : ""}
            styles={{
              control: (base) => ({
                ...base,
                borderColor: errors.intendedUseId
                  ? "#fca5a5"
                  : base.borderColor,
              }),
            }}
          />
          {errors.intendedUseId && (
            <p className="mt-1 text-sm text-red-600">{errors.intendedUseId}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Purpose of the translation (e.g., Immigration, Academic, Legal)
          </p>
        </div>

        {/* Country of Issue */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <Globe className="inline w-4 h-4 mr-1" />
            Country of Issue (Optional)
          </label>
          <Select
            options={countries}
            value={countries.find((c) => c.value === formData.countryOfIssue)}
            onChange={(option) => handleSelectChange("countryOfIssue", option)}
            placeholder="Select country..."
            isClearable
          />
          <p className="mt-1 text-xs text-gray-500">
            Where the original document was issued
          </p>
        </div>

        {/* Special Instructions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Special Instructions (Optional)
          </label>
          <textarea
            name="specialInstructions"
            value={formData.specialInstructions || ""}
            onChange={handleTextChange}
            rows={4}
            maxLength={1000}
            placeholder="Any special requirements, formatting notes, or specific terminology..."
            className="w-full px-4 py-2 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
          <p className="mt-1 text-xs text-gray-500 text-right">
            {(formData.specialInstructions || "").length} / 1000 characters
          </p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-600">
        <p className="font-medium text-gray-700 mb-1">Note:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Source and target languages cannot be the same</li>
          <li>
            Intended use may affect certification requirements and pricing
          </li>
          <li>Special instructions help ensure accurate translation</li>
        </ul>
      </div>
    </div>
  );
}
