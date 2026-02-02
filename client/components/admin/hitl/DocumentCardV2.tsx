import React, { useState } from "react";
import {
  FileText,
  Download,
  Eye,
  ChevronDown,
  ChevronUp,
  X,
  Plus,
  AlertCircle,
} from "lucide-react";
import { calculatePerPageRate, calculateLineTotal, formatCurrency as formatPricingCurrency } from "@/utils/pricing";

interface CertificationType {
  id: string;
  code: string;
  name: string;
  price: number;
}

interface AdditionalCert {
  id: string;
  certification_type_id: string;
  name: string;
  price: number;
}

interface Language {
  id: string;
  code: string;
  name: string;
  multiplier: number;
}

interface PageData {
  id: string;
  page_number: number;
  word_count: number;
  quote_file_id: string;
}

interface AnalysisResult {
  id: string;
  quote_file_id: string;
  detected_language: string;
  detected_document_type: string;
  assessed_complexity: string;
  complexity_multiplier: number;
  word_count: number;
  page_count: number;
  billable_pages: number;
  line_total: number;
  certification_type_id: string;
  certification_price: number;
  quote_file?: {
    original_filename: string;
    storage_path: string;
    file_size: number;
    mime_type: string;
  };
}

interface Props {
  index: number;
  analysis: AnalysisResult;
  file: {
    id: string;
    original_filename: string;
    storage_path?: string;
    file_size: number;
    mime_type: string;
    ai_processing_status?: string;
  };
  pages: PageData[];
  languages: Language[];
  certificationTypes: CertificationType[];
  additionalCerts: AdditionalCert[];
  isExpanded: boolean;
  hasChanges: boolean;
  canEdit: boolean;
  baseRate: number;
  wordsPerPage: number;
  // Handlers
  onToggle: () => void;
  onRemove: () => void;
  onPreview: () => void;
  onLanguageChange: (value: string) => void;
  onComplexityChange: (value: string) => void;
  onDocumentTypeChange: (value: string) => void;
  onCertificationChange: (value: string) => void;
  onAddCertification: () => void;
  onRemoveCertification: (certId: string) => void;
  onPageWordCountChange: (pageId: string, wordCount: number) => void;
  // Value getters
  getValue: (field: string, defaultValue: any) => any;
  getLanguageMultiplier: (code: string) => number;
}

// Complexity options
const COMPLEXITY_OPTIONS = [
  { code: "easy", name: "Easy", multiplier: 0.8 },
  { code: "standard", name: "Standard", multiplier: 1.0 },
  { code: "moderate", name: "Moderate", multiplier: 1.2 },
  { code: "complex", name: "Complex", multiplier: 1.5 },
];

// Document type options
const DOCUMENT_TYPE_OPTIONS = [
  "birth_certificate",
  "marriage_certificate",
  "death_certificate",
  "divorce_decree",
  "passport",
  "drivers_license",
  "legal_contract",
  "academic_transcript",
  "diploma",
  "medical_record",
  "immigration_document",
  "business_document",
  "financial_document",
  "power_of_attorney",
  "affidavit",
  "court_document",
  "other",
];

export default function DocumentCardV2({
  index,
  analysis,
  file,
  pages,
  languages,
  certificationTypes,
  additionalCerts,
  isExpanded,
  hasChanges,
  canEdit,
  baseRate,
  wordsPerPage,
  onToggle,
  onRemove,
  onPreview,
  onLanguageChange,
  onComplexityChange,
  onDocumentTypeChange,
  onCertificationChange,
  onAddCertification,
  onRemoveCertification,
  onPageWordCountChange,
  getValue,
  getLanguageMultiplier,
}: Props) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const storagePath = file.storage_path || analysis.quote_file?.storage_path;
  const fileUrl = storagePath
    ? `${supabaseUrl}/storage/v1/object/public/quote-files/${storagePath}`
    : null;

  // Calculations
  const calculatePageBillable = (wordCount: number, complexityMult: number) => {
    return Math.ceil((wordCount / wordsPerPage) * complexityMult * 10) / 10;
  };

  const getPageWordCount = (page: PageData) => {
    // Check for local edits first (this would need to be passed in or handled externally)
    return page.word_count;
  };

  const complexityMultiplier =
    getValue("complexity_multiplier", analysis.complexity_multiplier) || 1.0;

  const totalWords =
    pages.length > 0
      ? pages.reduce((sum, p) => sum + getPageWordCount(p), 0)
      : analysis.word_count || 0;

  const displayPageCount =
    pages.length > 0 ? pages.length : analysis.page_count || 0;

  const calculateDocumentBillable = () => {
    if (pages.length > 0) {
      let totalBillable = 0;
      pages.forEach((page) => {
        totalBillable += calculatePageBillable(
          getPageWordCount(page),
          complexityMultiplier
        );
      });
      return Math.max(totalBillable, 1.0);
    }
    return analysis.billable_pages || 1.0;
  };

  const billablePages = calculateDocumentBillable();
  const languageMultiplier = getLanguageMultiplier(
    getValue("detected_language", analysis.detected_language)
  );

  const calculateTranslationCost = () => {
    // Use consistent per-page rate calculation (rounded to next $2.50)
    // Note: complexity is already factored into billablePages for this component
    return calculateLineTotal(billablePages, languageMultiplier, 1.0, baseRate);
  };

  // Per-page rate for display
  const perPageRate = calculatePerPageRate(languageMultiplier, baseRate);

  const calculateCertificationTotal = () => {
    const primaryCert = certificationTypes.find(
      (c) =>
        c.id === getValue("certification_type_id", analysis.certification_type_id)
    );
    const primaryPrice = primaryCert?.price || 0;
    const additionalTotal = additionalCerts.reduce(
      (sum, cert) => sum + cert.price,
      0
    );
    return primaryPrice + additionalTotal;
  };

  const translationCost = calculateTranslationCost();
  const certificationTotal = calculateCertificationTotal();
  const lineTotal = translationCost + certificationTotal;

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(amount);
  };

  // Check if minimum was applied
  const rawBillable =
    pages.length > 0
      ? pages.reduce(
          (sum, p) =>
            sum + calculatePageBillable(getPageWordCount(p), complexityMultiplier),
          0
        )
      : 0;
  const minApplied = rawBillable < 1.0 && billablePages === 1.0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Header Row */}
      <div
        className="px-4 py-3 flex justify-between items-center bg-gradient-to-r from-gray-50 to-white border-b border-gray-200 cursor-pointer hover:from-gray-100 hover:to-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-teal-600" />
          </div>
          <div className="min-w-0">
            <h4 className="font-medium text-gray-900 truncate">
              {index + 1}. {file.original_filename}
            </h4>
            <p className="text-xs text-gray-500">
              {totalWords} words &bull; {displayPageCount} page(s)
            </p>
          </div>
          {hasChanges && (
            <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800 font-medium flex-shrink-0">
              Unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-lg font-semibold text-gray-900">
            {formatCurrency(lineTotal)}
          </span>
          <span className="text-gray-400">
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
            title="Remove document"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded Content - 2 Column Layout */}
      {isExpanded && (
        <div className="p-4 md:p-6">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_340px] gap-6">
            {/* Left Column - Preview */}
            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 text-sm">Document Preview</h4>
              <div className="border rounded-lg overflow-hidden bg-gray-50 aspect-[4/5] flex items-center justify-center">
                {fileUrl ? (
                  <img
                    src={fileUrl}
                    alt={file.original_filename}
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                      (e.target as HTMLImageElement).parentElement!.innerHTML =
                        '<div class="text-gray-400 text-center p-4"><p>Preview not available</p></div>';
                    }}
                  />
                ) : (
                  <div className="text-gray-400 text-center p-4">
                    <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Preview not available</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {((file.file_size || 0) / 1024 / 1024).toFixed(2)} MB
                </span>
                <div className="flex gap-2">
                  {fileUrl && (
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                  )}
                  <button
                    onClick={onPreview}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-teal-600 border border-teal-300 rounded-md hover:bg-teal-50 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Full Preview
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column - Controls + Cost Card */}
            <div className="space-y-4">
              {/* Config Grid */}
              <div className="space-y-4">
                {/* Document Type - Full Width */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Document Type
                  </label>
                  {canEdit ? (
                    <select
                      value={getValue(
                        "detected_document_type",
                        analysis.detected_document_type
                      )}
                      onChange={(e) => onDocumentTypeChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    >
                      {DOCUMENT_TYPE_OPTIONS.map((type) => (
                        <option key={type} value={type}>
                          {type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-gray-700">
                      {getValue("detected_document_type", analysis.detected_document_type)
                        ?.replace(/_/g, " ")
                        .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                    </p>
                  )}
                </div>

                {/* Language & Complexity - 2 columns */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      Language
                    </label>
                    {canEdit ? (
                      <select
                        value={getValue(
                          "detected_language",
                          analysis.detected_language
                        )}
                        onChange={(e) => onLanguageChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      >
                        {languages.map((lang) => (
                          <option key={lang.id} value={lang.code}>
                            {lang.name} ({lang.multiplier}x)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm text-gray-700">
                        {languages.find(
                          (l) =>
                            l.code ===
                            getValue("detected_language", analysis.detected_language)
                        )?.name || analysis.detected_language}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      Complexity
                    </label>
                    {canEdit ? (
                      <select
                        value={getValue(
                          "assessed_complexity",
                          analysis.assessed_complexity
                        )}
                        onChange={(e) => onComplexityChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      >
                        {COMPLEXITY_OPTIONS.map((opt) => (
                          <option key={opt.code} value={opt.code}>
                            {opt.name} ({opt.multiplier}x)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm text-gray-700 capitalize">
                        {getValue("assessed_complexity", analysis.assessed_complexity)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Unified Cost Card */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Header */}
                <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-700">
                      Billable Pages: {billablePages.toFixed(2)}
                    </span>
                    {minApplied && (
                      <span className="text-xs text-orange-600 italic">
                        * Min applied
                      </span>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="p-4 space-y-4">
                  {/* Certification Section */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Certification
                    </label>
                    {canEdit ? (
                      <select
                        value={getValue(
                          "certification_type_id",
                          analysis.certification_type_id
                        )}
                        onChange={(e) => onCertificationChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      >
                        {certificationTypes.map((cert) => (
                          <option key={cert.id} value={cert.id}>
                            {cert.name} ({formatCurrency(cert.price)})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm text-gray-700">
                        {certificationTypes.find(
                          (c) =>
                            c.id ===
                            getValue(
                              "certification_type_id",
                              analysis.certification_type_id
                            )
                        )?.name || "Not set"}
                      </p>
                    )}

                    {/* Additional Certifications */}
                    {additionalCerts.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {additionalCerts.map((cert) => (
                          <div
                            key={cert.id}
                            className="flex items-center justify-between py-1 px-2 bg-gray-50 rounded text-sm"
                          >
                            <span>{cert.name}</span>
                            <div className="flex items-center gap-2">
                              <span>{formatCurrency(cert.price)}</span>
                              {canEdit && (
                                <button
                                  onClick={() => onRemoveCertification(cert.id)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {canEdit && (
                      <button
                        onClick={onAddCertification}
                        className="mt-2 text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Secondary Certification
                      </button>
                    )}
                  </div>

                  {/* Cost Breakdown */}
                  <div className="border-t border-dashed border-gray-200 pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Per Page Rate</span>
                      <span className="text-teal-600 font-medium">{formatPricingCurrency(perPageRate)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Translation ({billablePages.toFixed(2)} pages)</span>
                      <span className="text-gray-900">{formatCurrency(translationCost)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Certifications</span>
                      <span className="text-gray-900">{formatCurrency(certificationTotal)}</span>
                    </div>
                  </div>

                  {/* Total */}
                  <div className="border-t border-dashed border-gray-200 pt-3">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-900">Line Total</span>
                      <span className="text-lg font-bold text-green-600">
                        {formatCurrency(lineTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
