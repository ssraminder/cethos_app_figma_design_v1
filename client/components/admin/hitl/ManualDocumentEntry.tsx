import React, { useState, useEffect } from "react";
import { Calculator, Save, AlertTriangle } from "lucide-react";

interface ManualDocumentEntryProps {
  quoteFileId: string;
  filename: string;
  onSave: (data: ManualEntryData) => Promise<void>;
  onCancel: () => void;
  languages: Array<{
    id: string;
    code: string;
    name: string;
    multiplier: number;
  }>;
  documentTypes: Array<{ id: string; code: string; name: string }>;
  certificationTypes: Array<{
    id: string;
    code: string;
    name: string;
    price: number;
  }>;
  settings: {
    base_rate: number;
    words_per_page: number;
  };
}

export interface ManualEntryData {
  detected_language: string;
  detected_document_type: string;
  assessed_complexity: string;
  complexity_multiplier: number;
  word_count: number;
  page_count: number;
  billable_pages: number;
  certification_type_id: string;
  certification_price: number;
  line_total: number;
}

export default function ManualDocumentEntry({
  quoteFileId,
  filename,
  onSave,
  onCancel,
  languages,
  documentTypes,
  certificationTypes,
  settings,
}: ManualDocumentEntryProps) {
  const [formData, setFormData] = useState<Partial<ManualEntryData>>({
    detected_language: "",
    detected_document_type: "",
    assessed_complexity: "standard",
    complexity_multiplier: 1.0,
    word_count: 0,
    page_count: 1,
    billable_pages: 1,
    certification_type_id: "",
    certification_price: 0,
    line_total: 0,
  });

  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);

  const complexityOptions = [
    { value: "easy", label: "Easy", multiplier: 0.8 },
    { value: "standard", label: "Standard", multiplier: 1.0 },
    { value: "moderate", label: "Moderate", multiplier: 1.2 },
    { value: "complex", label: "Complex", multiplier: 1.5 },
  ];

  // Auto-calculate when relevant fields change
  useEffect(() => {
    if (formData.word_count && formData.word_count > 0) {
      const billablePages = Math.ceil(
        formData.word_count / settings.words_per_page,
      );
      setFormData((prev) => ({ ...prev, billable_pages: billablePages }));
    }
  }, [formData.word_count, settings.words_per_page]);

  useEffect(() => {
    calculatePricing();
  }, [
    formData.billable_pages,
    formData.detected_language,
    formData.complexity_multiplier,
    formData.page_count,
    formData.certification_price,
  ]);

  const calculatePricing = () => {
    if (!formData.billable_pages || !formData.detected_language) return;

    setCalculating(true);

    const selectedLanguage = languages.find(
      (l) => l.id === formData.detected_language,
    );
    const languageMultiplier = selectedLanguage?.multiplier || 1.0;

    const translationCost =
      (formData.billable_pages || 0) *
      settings.base_rate *
      languageMultiplier *
      (formData.complexity_multiplier || 1.0);

    const certificationCost =
      (formData.certification_price || 0) * (formData.page_count || 1);

    const lineTotal = translationCost + certificationCost;

    setFormData((prev) => ({
      ...prev,
      line_total: Math.round(lineTotal * 100) / 100,
    }));

    setTimeout(() => setCalculating(false), 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.detected_language) {
      alert("Please select a language");
      return;
    }
    if (!formData.detected_document_type) {
      alert("Please select a document type");
      return;
    }
    if (!formData.word_count || formData.word_count <= 0) {
      alert("Please enter a valid word count");
      return;
    }
    if (!formData.page_count || formData.page_count <= 0) {
      alert("Please enter a valid page count");
      return;
    }

    setSaving(true);
    try {
      await onSave(formData as ManualEntryData);
    } catch (error) {
      console.error("Save error:", error);
      alert("Failed to save: " + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCertificationChange = (certId: string) => {
    const cert = certificationTypes.find((c) => c.id === certId);
    setFormData((prev) => ({
      ...prev,
      certification_type_id: certId,
      certification_price: cert?.price || 0,
    }));
  };

  const handleComplexityChange = (complexity: string) => {
    const option = complexityOptions.find((o) => o.value === complexity);
    setFormData((prev) => ({
      ...prev,
      assessed_complexity: complexity,
      complexity_multiplier: option?.multiplier || 1.0,
    }));
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4 pb-4 border-b border-gray-200">
        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">{filename}</h3>
          <p className="text-xs text-amber-700 mt-1">
            Manual Entry Mode - AI processing failed or disabled
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Language Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Source Language <span className="text-red-600">*</span>
          </label>
          <select
            value={formData.detected_language}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                detected_language: e.target.value,
              }))
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            required
          >
            <option value="">Select language...</option>
            {languages.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.name} ({lang.code.toUpperCase()})
              </option>
            ))}
          </select>
        </div>

        {/* Document Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Document Type <span className="text-red-600">*</span>
          </label>
          <select
            value={formData.detected_document_type}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                detected_document_type: e.target.value,
              }))
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            required
          >
            <option value="">Select type...</option>
            {documentTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>

        {/* Complexity */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Complexity
          </label>
          <select
            value={formData.assessed_complexity}
            onChange={(e) => handleComplexityChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          >
            {complexityOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.multiplier}x)
              </option>
            ))}
          </select>
        </div>

        {/* Word Count & Page Count */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Word Count <span className="text-red-600">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={formData.word_count || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  word_count: parseInt(e.target.value) || 0,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Page Count <span className="text-red-600">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={formData.page_count || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  page_count: parseInt(e.target.value) || 1,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              required
            />
          </div>
        </div>

        {/* Billable Pages (Auto-calculated) */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-blue-900">
              Billable Pages (auto-calculated):
            </span>
            <span className="text-sm font-semibold text-blue-900">
              {formData.billable_pages || 0}
            </span>
          </div>
          <p className="text-xs text-blue-700 mt-1">
            Based on {settings.words_per_page} words per page
          </p>
        </div>

        {/* Certification */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Certification Type
          </label>
          <select
            value={formData.certification_type_id}
            onChange={(e) => handleCertificationChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="">None</option>
            {certificationTypes.map((cert) => (
              <option key={cert.id} value={cert.id}>
                {cert.name} (${cert.price})
              </option>
            ))}
          </select>
        </div>

        {/* Pricing Summary */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="w-4 h-4 text-gray-600" />
            <h4 className="text-sm font-semibold text-gray-900">
              Pricing Summary
            </h4>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Base Rate:</span>
              <span className="text-gray-900">${settings.base_rate}/page</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Billable Pages:</span>
              <span className="text-gray-900">
                {formData.billable_pages || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Complexity:</span>
              <span className="text-gray-900">
                {formData.complexity_multiplier}x
              </span>
            </div>
            {formData.certification_price &&
              formData.certification_price > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Certification:</span>
                  <span className="text-gray-900">
                    ${formData.certification_price} × {formData.page_count}{" "}
                    pages
                  </span>
                </div>
              )}
            <div className="border-t border-gray-300 pt-2 mt-2 flex justify-between font-semibold">
              <span className="text-gray-900">Line Total:</span>
              <span
                className={`text-gray-900 ${calculating ? "animate-pulse" : ""}`}
              >
                ${formData.line_total?.toFixed(2) || "0.00"}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              saving ||
              !formData.detected_language ||
              !formData.detected_document_type
            }
            className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>Saving...</>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Entry
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
