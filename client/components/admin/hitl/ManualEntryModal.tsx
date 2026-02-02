import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Pencil,
  Plus,
  Trash2,
  Loader2,
  Save,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { calculatePerPageRate, calculateLineTotal, formatCurrency, getPricingBreakdown } from "@/utils/pricing";

interface QuoteFile {
  id: string;
  original_filename: string;
  storage_path?: string;
  mime_type: string;
}

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: QuoteFile;
  quoteId: string;
  onSaveComplete?: () => void | Promise<void>;
}

interface PageEntry {
  id: string;
  pageNumber: number;
  wordCount: number;
  complexity: "low" | "medium" | "high";
  billablePages: number;
}

interface Settings {
  baseRate: number;
  wordsPerPage: number;
  complexityEasy: number;
  complexityMedium: number;
  complexityHard: number;
  minBillablePages: number;
}

interface Language {
  id: string;
  code: string;
  name: string;
  multiplier: number;
}

interface DocumentType {
  code: string;
  name: string;
}

interface CertificationType {
  id: string;
  code: string;
  name: string;
  price: number;
}

interface CalculationResult {
  totalWords: number;
  totalPages: number;
  totalBillablePages: number;
  translationCost: number;
  certificationCost: number;
  lineTotal: number;
  minApplied: boolean;
}

export default function ManualEntryModal({
  isOpen,
  onClose,
  file,
  quoteId,
  onSaveComplete,
}: ManualEntryModalProps) {
  // Page entries state
  const [pages, setPages] = useState<PageEntry[]>([
    {
      id: crypto.randomUUID(),
      pageNumber: 1,
      wordCount: 0,
      complexity: "medium",
      billablePages: 0,
    },
  ]);

  // Selection state
  const [selectedLanguageId, setSelectedLanguageId] = useState<string>("");
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>("");
  const [selectedCertificationId, setSelectedCertificationId] =
    useState<string>("");

  // Fetched data
  const [settings, setSettings] = useState<Settings | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [certificationTypes, setCertificationTypes] = useState<
    CertificationType[]
  >([]);

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch initial data when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchInitialData();
    }
  }, [isOpen]);

  const fetchInitialData = async () => {
    setIsLoading(true);

    try {
      // Fetch all data in parallel
      const [settingsRes, languagesRes, docTypesRes, certTypesRes] =
        await Promise.all([
          supabase
            .from("app_settings")
            .select("setting_key, setting_value")
            .in("setting_key", [
              "base_rate",
              "words_per_page",
              "complexity_easy",
              "complexity_medium",
              "complexity_hard",
              "min_billable_pages",
            ]),
          supabase
            .from("languages")
            .select("id, code, name, multiplier")
            .eq("is_active", true)
            .order("sort_order"),
          supabase
            .from("document_types")
            .select("code, name")
            .eq("is_active", true)
            .order("sort_order"),
          supabase
            .from("certification_types")
            .select("id, code, name, price")
            .eq("is_active", true)
            .order("sort_order"),
        ]);

      // Process settings
      if (settingsRes.data) {
        const settingsMap: Record<string, number> = {};
        settingsRes.data.forEach((s) => {
          settingsMap[s.setting_key] = parseFloat(s.setting_value);
        });

        setSettings({
          baseRate: settingsMap.base_rate || 65,
          wordsPerPage: settingsMap.words_per_page || 225,
          complexityEasy: settingsMap.complexity_easy || 1.0,
          complexityMedium: settingsMap.complexity_medium || 1.15,
          complexityHard: settingsMap.complexity_hard || 1.25,
          minBillablePages: settingsMap.min_billable_pages || 1.0,
        });
      }

      const fetchedLanguages = languagesRes.data || [];
      const fetchedDocTypes = docTypesRes.data || [];
      const fetchedCertTypes = certTypesRes.data || [];

      setLanguages(fetchedLanguages);
      setDocumentTypes(fetchedDocTypes);
      setCertificationTypes(fetchedCertTypes);

      // Check for existing analysis (for editing)
      const { data: existingAnalysis } = await supabase
        .from("ai_analysis_results")
        .select("*")
        .eq("quote_file_id", file.id)
        .maybeSingle();

      if (existingAnalysis) {
        // Pass fetched data directly to avoid stale state issues
        prePopulateForm(existingAnalysis, fetchedLanguages, fetchedCertTypes);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load form data");
    } finally {
      setIsLoading(false);
    }
  };

  const prePopulateForm = (
    analysis: any,
    languagesList: Language[],
    certTypesList: CertificationType[]
  ) => {
    // Set language by code - use passed languages list instead of state
    const language = languagesList.find(
      (l) => l.code === analysis.detected_language
    );
    if (language) {
      setSelectedLanguageId(language.id);
    }

    // Set document type
    if (analysis.detected_document_type) {
      setSelectedDocumentType(analysis.detected_document_type);
    }

    // Set certification - use passed cert types list instead of state
    if (analysis.certification_type_id) {
      const certExists = certTypesList.some(
        (c) => c.id === analysis.certification_type_id
      );
      if (certExists) {
        setSelectedCertificationId(analysis.certification_type_id);
      }
    }

    // Reconstruct pages from total word count and page count
    const pageCount = analysis.page_count || 1;
    const totalWords = analysis.word_count || 0;
    const wordsPerPage = Math.ceil(totalWords / pageCount);
    const complexity = analysis.assessed_complexity || "medium";

    const reconstructedPages: PageEntry[] = [];
    for (let i = 1; i <= pageCount; i++) {
      reconstructedPages.push({
        id: crypto.randomUUID(),
        pageNumber: i,
        wordCount: i === pageCount ? totalWords - wordsPerPage * (i - 1) : wordsPerPage,
        complexity: complexity === "mixed" ? "medium" : (complexity as "low" | "medium" | "high"),
        billablePages: 0,
      });
    }

    if (reconstructedPages.length > 0) {
      setPages(reconstructedPages);
    }
  };

  // Get complexity multiplier
  const getComplexityMultiplier = (
    complexity: string,
    settings: Settings
  ): number => {
    switch (complexity) {
      case "low":
        return settings.complexityEasy;
      case "medium":
        return settings.complexityMedium;
      case "high":
        return settings.complexityHard;
      default:
        return settings.complexityMedium;
    }
  };

  // Calculate billable pages for a single page
  const calculatePageBillable = (
    wordCount: number,
    complexity: string,
    settings: Settings
  ): number => {
    if (wordCount <= 0) return 0;
    const multiplier = getComplexityMultiplier(complexity, settings);
    return Math.ceil((wordCount / settings.wordsPerPage) * multiplier * 10) / 10;
  };

  // Recalculate pages when settings change or when pages need calculation
  useEffect(() => {
    if (settings && pages.length > 0) {
      // Check if any page has billablePages = 0 but has wordCount
      const needsRecalculation = pages.some(
        (p) => p.billablePages === 0 && p.wordCount > 0
      );

      if (needsRecalculation) {
        setPages((prevPages) =>
          prevPages.map((page) => ({
            ...page,
            billablePages: calculatePageBillable(
              page.wordCount,
              page.complexity,
              settings
            ),
          }))
        );
      }
    }
  }, [settings, pages.length]); // Added pages.length as dependency

  // Get selected language multiplier
  const selectedLanguageMultiplier = useMemo(() => {
    const lang = languages.find((l) => l.id === selectedLanguageId);
    return lang?.multiplier || 1.0;
  }, [languages, selectedLanguageId]);

  // Get per-page rate based on language multiplier (rounded to next $2.50)
  const perPageRate = useMemo(() => {
    if (!settings) return 0;
    return calculatePerPageRate(selectedLanguageMultiplier, settings.baseRate);
  }, [settings, selectedLanguageMultiplier]);

  // Get pricing breakdown text for display
  const pricingBreakdown = useMemo(() => {
    if (!settings) return null;
    return getPricingBreakdown(selectedLanguageMultiplier, settings.baseRate);
  }, [settings, selectedLanguageMultiplier]);

  // Calculate document totals
  const calculatedTotals = useMemo((): CalculationResult | null => {
    if (!settings) return null;

    const certPrice =
      certificationTypes.find((c) => c.id === selectedCertificationId)?.price ||
      0;

    let totalBillablePages = 0;
    let totalWords = 0;

    for (const page of pages) {
      totalBillablePages += page.billablePages;
      totalWords += page.wordCount;
    }

    // Apply minimum per document
    const minApplied = totalBillablePages < settings.minBillablePages && totalBillablePages > 0;
    if (totalBillablePages > 0) {
      totalBillablePages = Math.max(totalBillablePages, settings.minBillablePages);
    }

    // Calculate costs using consistent per-page rate (rounded to next $2.50)
    // Note: complexity is already factored into billablePages
    const translationCost = calculateLineTotal(
      totalBillablePages,
      selectedLanguageMultiplier,
      1.0, // complexity already in billable pages
      settings.baseRate
    );
    const lineTotal = translationCost + certPrice;

    return {
      totalWords,
      totalPages: pages.length,
      totalBillablePages,
      translationCost,
      certificationCost: certPrice,
      lineTotal,
      minApplied,
    };
  }, [pages, selectedCertificationId, settings, certificationTypes, selectedLanguageMultiplier]);

  // Page management functions
  const handleAddPage = () => {
    const newPageNumber = pages.length + 1;
    setPages([
      ...pages,
      {
        id: crypto.randomUUID(),
        pageNumber: newPageNumber,
        wordCount: 0,
        complexity: "medium",
        billablePages: 0,
      },
    ]);
  };

  const handleRemovePage = (pageId: string) => {
    if (pages.length <= 1) {
      toast.error("At least one page is required");
      return;
    }

    const filtered = pages.filter((p) => p.id !== pageId);
    // Re-number pages
    const renumbered = filtered.map((p, index) => ({
      ...p,
      pageNumber: index + 1,
    }));
    setPages(renumbered);
  };

  const handleUpdatePage = (
    pageId: string,
    field: "wordCount" | "complexity",
    value: number | string
  ) => {
    setPages(
      pages.map((p) => {
        if (p.id !== pageId) return p;

        const updated = { ...p, [field]: value };

        // Recalculate billable pages for this page
        if (settings) {
          updated.billablePages = calculatePageBillable(
            updated.wordCount,
            updated.complexity,
            settings
          );
        }

        return updated;
      })
    );
  };

  // Save handler
  const handleSave = async () => {
    // Validation
    if (!selectedLanguageId) {
      toast.error("Please select a language");
      return;
    }
    if (!selectedDocumentType) {
      toast.error("Please select a document type");
      return;
    }
    if (pages.some((p) => p.wordCount <= 0)) {
      toast.error("All pages must have a word count greater than 0");
      return;
    }
    if (!calculatedTotals) {
      toast.error("Calculation error");
      return;
    }

    setIsSaving(true);

    try {
      const selectedLanguage = languages.find(
        (l) => l.id === selectedLanguageId
      );
      const selectedCert = certificationTypes.find(
        (c) => c.id === selectedCertificationId
      );

      // Determine overall complexity
      const complexities = pages.map((p) => p.complexity);
      const uniqueComplexities = [...new Set(complexities)];
      const overallComplexity =
        uniqueComplexities.length === 1 ? uniqueComplexities[0] : "mixed";

      // Get average complexity multiplier
      const avgMultiplier =
        pages.reduce((sum, p) => {
          return sum + getComplexityMultiplier(p.complexity, settings!);
        }, 0) / pages.length;

      const now = new Date().toISOString();

      // Upsert to ai_analysis_results
      const { error: upsertError } = await supabase
        .from("ai_analysis_results")
        .upsert(
          {
            quote_id: quoteId,
            quote_file_id: file.id,

            // Manual entry marker
            ocr_provider: "manual",
            llm_provider: "manual",
            llm_model: "manual_entry",
            processing_status: "completed",

            // Language
            detected_language: selectedLanguage?.code || "en",
            language_name: selectedLanguage?.name || "English",
            language_confidence: 1.0,

            // Document type
            detected_document_type: selectedDocumentType,
            document_type_confidence: 1.0,

            // Complexity
            assessed_complexity: overallComplexity,
            complexity_confidence: 1.0,
            complexity_multiplier: Math.round(avgMultiplier * 100) / 100,

            // Counts
            word_count: calculatedTotals.totalWords,
            page_count: calculatedTotals.totalPages,
            billable_pages: calculatedTotals.totalBillablePages,

            // Pricing
            base_rate: settings!.baseRate,
            line_total: calculatedTotals.lineTotal,

            // Certification
            certification_type_id: selectedCertificationId || null,
            certification_price: calculatedTotals.certificationCost,

            // Timestamps
            processing_completed_at: now,
            updated_at: now,
          },
          {
            onConflict: "quote_file_id",
          }
        );

      if (upsertError) {
        throw upsertError;
      }

      // Update quote_files status
      await supabase
        .from("quote_files")
        .update({ ai_processing_status: "completed" })
        .eq("id", file.id);

      toast.success("Manual entry saved successfully!");

      // Call callback to refresh parent
      if (onSaveComplete) {
        await onSaveComplete();
      }

      onClose();
    } catch (error: any) {
      console.error("Error saving manual entry:", error);
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Pencil className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Manual Document Entry
              </h2>
              <p className="text-sm text-gray-600 mt-0.5">
                {file.original_filename}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
              <span className="ml-3 text-gray-600">Loading form data...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Page Entries Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                    Page Entries
                  </h3>
                  <button
                    onClick={handleAddPage}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Page
                  </button>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-700 w-16">
                          Page
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-gray-700">
                          Word Count
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-gray-700">
                          Complexity
                        </th>
                        <th className="px-4 py-3 text-center font-medium text-gray-700">
                          Billable Pages
                        </th>
                        <th className="px-4 py-3 text-center font-medium text-gray-700 w-16">

                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {pages.map((page) => (
                        <tr key={page.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-center text-gray-600 font-medium">
                            {page.pageNumber}
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="1"
                              value={page.wordCount || ""}
                              onChange={(e) =>
                                handleUpdatePage(
                                  page.id,
                                  "wordCount",
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                              placeholder="0"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={page.complexity}
                              onChange={(e) =>
                                handleUpdatePage(
                                  page.id,
                                  "complexity",
                                  e.target.value
                                )
                              }
                              className="px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            >
                              <option value="low">
                                Low ({settings?.complexityEasy.toFixed(2)}×)
                              </option>
                              <option value="medium">
                                Medium ({settings?.complexityMedium.toFixed(2)}×)
                              </option>
                              <option value="high">
                                High ({settings?.complexityHard.toFixed(2)}×)
                              </option>
                            </select>
                          </td>
                          <td className="px-4 py-3 text-center font-medium text-gray-900">
                            {page.billablePages.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {pages.length > 1 && (
                              <button
                                onClick={() => handleRemovePage(page.id)}
                                className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Remove page"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Divider */}
              <hr className="border-gray-200" />

              {/* Document Details Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
                  Document Details
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  {/* Language */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Language <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={selectedLanguageId}
                      onChange={(e) => setSelectedLanguageId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">Select language...</option>
                      {languages.map((lang) => (
                        <option key={lang.id} value={lang.id}>
                          {lang.name}
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
                      value={selectedDocumentType}
                      onChange={(e) => setSelectedDocumentType(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">Select type...</option>
                      {documentTypes.map((type) => (
                        <option key={type.code} value={type.code}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <hr className="border-gray-200" />

              {/* Certification Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
                  Certification
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Primary Certification
                  </label>
                  <select
                    value={selectedCertificationId}
                    onChange={(e) => setSelectedCertificationId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="">None</option>
                    {certificationTypes.map((cert) => (
                      <option key={cert.id} value={cert.id}>
                        {cert.name} - ${cert.price.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Divider */}
              <hr className="border-gray-200" />

              {/* Pricing Summary Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
                  Pricing Summary
                </h3>

                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Words:</span>
                    <span className="font-medium text-gray-900">
                      {calculatedTotals?.totalWords.toLocaleString() || 0}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Pages:</span>
                    <span className="font-medium text-gray-900">
                      {calculatedTotals?.totalPages || 0}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Billable Pages:</span>
                    <span className="font-medium text-gray-900">
                      {calculatedTotals?.totalBillablePages.toFixed(2) || "0.00"}
                      {calculatedTotals?.minApplied && (
                        <span className="text-xs text-orange-600 ml-1">
                          (min {settings?.minBillablePages.toFixed(2)} applied)
                        </span>
                      )}
                    </span>
                  </div>

                  <hr className="my-2 border-gray-300" />

                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Per Page Rate:</span>
                    <span className="font-semibold text-teal-600">
                      {formatCurrency(perPageRate)}
                    </span>
                  </div>
                  {pricingBreakdown && (
                    <div className="text-xs text-gray-500 text-right -mt-1">
                      {pricingBreakdown.breakdownText}
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      Translation ({formatCurrency(perPageRate)} ×{" "}
                      {calculatedTotals?.totalBillablePages.toFixed(2)}):
                    </span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(calculatedTotals?.translationCost || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Certification:</span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(calculatedTotals?.certificationCost || 0)}
                    </span>
                  </div>

                  <hr className="my-2 border-gray-300" />

                  <div className="flex justify-between text-lg font-bold">
                    <span className="text-gray-900">Line Total:</span>
                    <span className="text-green-600">
                      {formatCurrency(calculatedTotals?.lineTotal || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={
              isSaving ||
              isLoading ||
              !selectedLanguageId ||
              !selectedDocumentType ||
              pages.some((p) => p.wordCount <= 0)
            }
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save to Quote
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
