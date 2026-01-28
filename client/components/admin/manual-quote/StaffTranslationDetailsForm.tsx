import { useState, useEffect } from "react";
import { useDropdownOptions } from "@/hooks/useDropdownOptions";

interface TranslationData {
  sourceLanguageId?: string;
  targetLanguageId?: string;
  intendedUseId?: string;
  countryOfIssue?: string;
  specialInstructions?: string;
}

interface StaffTranslationDetailsFormProps {
  value: TranslationData;
  onChange: (data: TranslationData) => void;
}

export default function StaffTranslationDetailsForm({
  value,
  onChange,
}: StaffTranslationDetailsFormProps) {
  const { sourceLanguages, targetLanguages, intendedUses, loading, error } =
    useDropdownOptions();
  const [formData, setFormData] = useState<TranslationData>(value);

  useEffect(() => {
    setFormData(value);
  }, [value]);

  const handleChange = (field: keyof TranslationData, fieldValue: string) => {
    const updated = { ...formData, [field]: fieldValue };
    setFormData(updated);
    onChange(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-sm text-red-800">Error loading options: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Source Language */}
      <div>
        <label
          htmlFor="sourceLanguage"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Source Language (From)
        </label>
        <select
          id="sourceLanguage"
          value={formData.sourceLanguageId || ""}
          onChange={(e) => handleChange("sourceLanguageId", e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">Select source language...</option>
          {sourceLanguages.map((lang) => (
            <option key={lang.id} value={lang.id}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      {/* Target Language */}
      <div>
        <label
          htmlFor="targetLanguage"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Target Language (To) *
        </label>
        <select
          id="targetLanguage"
          value={formData.targetLanguageId || ""}
          onChange={(e) => handleChange("targetLanguageId", e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">Select target language...</option>
          {targetLanguages.map((lang) => (
            <option key={lang.id} value={lang.id}>
              {lang.name}
            </option>
          ))}
        </select>
        {!formData.targetLanguageId && (
          <p className="mt-1 text-xs text-amber-600">
            Target language is required
          </p>
        )}
      </div>

      {/* Intended Use */}
      <div>
        <label
          htmlFor="intendedUse"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Intended Use
        </label>
        <select
          id="intendedUse"
          value={formData.intendedUseId || ""}
          onChange={(e) => handleChange("intendedUseId", e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">Select intended use...</option>
          {intendedUses.map((use) => (
            <option key={use.id} value={use.id}>
              {use.name}
            </option>
          ))}
        </select>
      </div>

      {/* Country of Issue */}
      <div>
        <label
          htmlFor="countryOfIssue"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Country of Issue
        </label>
        <input
          type="text"
          id="countryOfIssue"
          value={formData.countryOfIssue || ""}
          onChange={(e) => handleChange("countryOfIssue", e.target.value)}
          placeholder="e.g., Mexico, India, China"
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {/* Special Instructions */}
      <div>
        <label
          htmlFor="specialInstructions"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Special Instructions
        </label>
        <textarea
          id="specialInstructions"
          value={formData.specialInstructions || ""}
          onChange={(e) => handleChange("specialInstructions", e.target.value)}
          rows={4}
          placeholder="Any special requirements, formatting needs, or notes..."
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>
    </div>
  );
}
