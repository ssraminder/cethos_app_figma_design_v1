import { useState, useEffect, useMemo } from "react";
import {
  X,
  FileText,
  Plus,
  Trash2,
  Loader2,
  Save,
  Calculator,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export interface QuoteFile {
  id: string;
  original_filename: string;
  storage_path?: string;
  mime_type: string;
}

interface Language {
  id: string;
  code: string;
  name: string;
  multiplier: number;
}

interface DocumentType {
  id: string;
  code: string;
  name: string;
}

interface CertificationType {
  id: string;
  code: string;
  name: string;
  price: number;
}

interface AppSettings {
  base_rate: number;
  words_per_page: number;
  complexity_easy: number;
  complexity_medium: number;
  complexity_hard: number;
  min_billable_pages: number;
}

interface PageEntry {
  id: string;
  pageNumber: number;
  wordCount: number;
  complexity: "low" | "medium" | "high";
}

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: QuoteFile;
  quoteId: string;
  onSaveComplete?: () => void | Promise<void>;
}

const DEFAULT_SETTINGS: AppSettings = {
  base_rate: 65.0,
  words_per_page: 250,
  complexity_easy: 1.0,
  complexity_medium: 1.15,
  complexity_hard: 1.3,
  min_billable_pages: 0.5,
};

export default function ManualEntryModal({
  isOpen,
  onClose,
  file,
  quoteId,
  onSaveComplete,
}: ManualEntryModalProps) {
  // Reference data
  const [languages, setLanguages] = useState<Language[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [certificationTypes, setCertificationTypes] = useState<CertificationType[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Form state
  const [pages, setPages] = useState<PageEntry[]>([
    { id: "page-1", pageNumber: 1, wordCount: 250, complexity: "low" },
  ]);
  const [selectedLanguageId, setSelectedLanguageId] = useState<string>("");
  const [selectedDocumentTypeId, setSelectedDocumentTypeId] = useState<string>("");
  const [selectedCertificationId, setSelectedCertificationId] = useState<string>("");

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingAnalysisId, setExistingAnalysisId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadReferenceData();
      loadExistingAnalysis();
    }
  }, [isOpen, file.id]);

  const loadReferenceData = async () => {
    setLoading(true);
    try {
      const [languagesRes, docTypesRes, certTypesRes, settingsRes] = await Promise.all([
        supabase.from("languages").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("document_types").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("certification_types").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("app_settings").select("setting_key, setting_value"),
      ]);

      if (languagesRes.data) {
        setLanguages(languagesRes.data);
        if (languagesRes.data.length > 0 && !selectedLanguageId) {
          setSelectedLanguageId(languagesRes.data[0].id);
        }
      }

      if (docTypesRes.data) {
        setDocumentTypes(docTypesRes.data);
        if (docTypesRes.data.length > 0 && !selectedDocumentTypeId) {
          setSelectedDocumentTypeId(docTypesRes.data[0].id);
        }
      }

      if (certTypesRes.data) {
        setCertificationTypes(certTypesRes.data);
        if (certTypesRes.data.length > 0 && !selectedCertificationId) {
          setSelectedCertificationId(certTypesRes.data[0].id);
        }
      }

      if (settingsRes.data) {
        const settingsMap: Record<string, string> = {};
        settingsRes.data.forEach((s: any) => {
          settingsMap[s.setting_key] = s.setting_value;
        });

        setSettings({
          base_rate: parseFloat(settingsMap.base_rate) || DEFAULT_SETTINGS.base_rate,
          words_per_page: parseInt(settingsMap.words_per_page) || DEFAULT_SETTINGS.words_per_page,
          complexity_easy: parseFloat(settingsMap.complexity_easy) || DEFAULT_SETTINGS.complexity_easy,
          complexity_medium: parseFloat(settingsMap.complexity_medium) || DEFAULT_SETTINGS.complexity_medium,
          complexity_hard: parseFloat(settingsMap.complexity_hard) || DEFAULT_SETTINGS.complexity_hard,
          min_billable_pages: parseFloat(settingsMap.min_billable_pages) || DEFAULT_SETTINGS.min_billable_pages,
        });
      }
    } catch (error) {
      console.error("Error loading reference data:", error);
      toast.error("Failed to load reference data");
    } finally {
      setLoading(false);
    }
  };

  const loadExistingAnalysis = async () => {
    try {
      const { data, error } = await supabase
        .from("ai_analysis_results")
        .select("*")
        .eq("quote_file_id", file.id)
        .single();

      if (data && !error) {
        setExistingAnalysisId(data.id);
        // Pre-populate form with existing data
        // For simplicity, we'll just set the top-level values
        // In a full implementation, you might store page-level data
        if (data.detected_language) {
          const lang = languages.find((l) => l.name === data.detected_language);
          if (lang) setSelectedLanguageId(lang.id);
        }
        if (data.detected_document_type) {
          const docType = documentTypes.find((d) => d.name === data.detected_document_type);
          if (docType) setSelectedDocumentTypeId(docType.id);
        }
        if (data.certification_type_id) {
          setSelectedCertificationId(data.certification_type_id);
        }
        // Set pages based on word count and page count
        if (data.word_count && data.page_count) {
          const avgWordsPerPage = Math.round(data.word_count / data.page_count);
          const newPages: PageEntry[] = [];
          for (let i = 1; i <= data.page_count; i++) {
            newPages.push({
              id: `page-${i}`,
              pageNumber: i,
              wordCount: avgWordsPerPage,
              complexity: data.assessed_complexity?.toLowerCase() || "low",
            });
          }
          if (newPages.length > 0) {
            setPages(newPages);
          }
        }
      }
    } catch (error) {
      // No existing analysis, that's fine
      console.log("No existing analysis found");
    }
  };

  const addPage = () => {
    const newPageNumber = pages.length > 0 ? Math.max(...pages.map((p) => p.pageNumber)) + 1 : 1;
    setPages([
      ...pages,
      {
        id: `page-${Date.now()}`,
        pageNumber: newPageNumber,
        wordCount: settings.words_per_page,
        complexity: "low",
      },
    ]);
  };

  const removePage = (id: string) => {
    if (pages.length > 1) {
      setPages(pages.filter((p) => p.id !== id));
    }
  };

  const updatePage = (id: string, field: keyof PageEntry, value: any) => {
    setPages(
      pages.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const getComplexityMultiplier = (complexity: string): number => {
    switch (complexity) {
      case "low":
        return settings.complexity_easy;
      case "medium":
        return settings.complexity_medium;
      case "high":
        return settings.complexity_hard;
      default:
        return settings.complexity_easy;
    }
  };

  // Calculate pricing summary
  const pricingSummary = useMemo(() => {
    const selectedLanguage = languages.find((l) => l.id === selectedLanguageId);
    const selectedCertification = certificationTypes.find((c) => c.id === selectedCertificationId);

    const languageMultiplier = selectedLanguage?.multiplier ? parseFloat(selectedLanguage.multiplier as any) : 1.0;

    // Calculate totals
    const totalWords = pages.reduce((sum, p) => sum + p.wordCount, 0);
    const totalPages = pages.length;

    // Calculate billable pages per page entry and sum
    let totalBillablePages = 0;
    pages.forEach((page) => {
      const pageBillable = page.wordCount / settings.words_per_page;
      totalBillablePages += pageBillable;
    });

    // Apply minimum billable pages
    totalBillablePages = Math.max(totalBillablePages, settings.min_billable_pages);

    // Calculate weighted average complexity
    let weightedComplexity = 0;
    pages.forEach((page) => {
      const pageBillable = page.wordCount / settings.words_per_page;
      weightedComplexity += pageBillable * getComplexityMultiplier(page.complexity);
    });
    const avgComplexityMultiplier = totalBillablePages > 0 ? weightedComplexity / totalBillablePages : 1.0;

    // Translation cost
    const translationCost =
      settings.base_rate * totalBillablePages * languageMultiplier * avgComplexityMultiplier;

    // Certification cost
    const certificationCost = selectedCertification?.price ? parseFloat(selectedCertification.price as any) : 0;

    // Line total
    const lineTotal = translationCost + certificationCost;

    // Determine overall complexity
    let overallComplexity = "low";
    if (avgComplexityMultiplier >= settings.complexity_hard) {
      overallComplexity = "high";
    } else if (avgComplexityMultiplier >= settings.complexity_medium) {
      overallComplexity = "medium";
    }

    return {
      totalWords,
      totalPages,
      totalBillablePages: Math.round(totalBillablePages * 100) / 100,
      avgComplexityMultiplier: Math.round(avgComplexityMultiplier * 100) / 100,
      overallComplexity,
      languageMultiplier,
      translationCost: Math.round(translationCost * 100) / 100,
      certificationCost,
      lineTotal: Math.round(lineTotal * 100) / 100,
    };
  }, [pages, selectedLanguageId, selectedCertificationId, languages, certificationTypes, settings]);

  const handleSave = async () => {
    setSaving(true);

    try {
      const selectedLanguage = languages.find((l) => l.id === selectedLanguageId);
      const selectedDocumentType = documentTypes.find((d) => d.id === selectedDocumentTypeId);

      const analysisData = {
        quote_id: quoteId,
        quote_file_id: file.id,
        detected_language: selectedLanguage?.name || "Unknown",
        detected_document_type: selectedDocumentType?.name || "Unknown",
        assessed_complexity: pricingSummary.overallComplexity,
        complexity_multiplier: pricingSummary.avgComplexityMultiplier,
        word_count: pricingSummary.totalWords,
        page_count: pricingSummary.totalPages,
        billable_pages: pricingSummary.totalBillablePages,
        base_rate: settings.base_rate,
        line_total: pricingSummary.lineTotal,
        certification_type_id: selectedCertificationId || null,
        certification_price: pricingSummary.certificationCost,
        ocr_provider: "manual",
        llm_provider: "manual",
        llm_model: "manual_entry",
        processing_status: "completed",
        updated_at: new Date().toISOString(),
      };

      let result;
      if (existingAnalysisId) {
        // Update existing
        result = await supabase
          .from("ai_analysis_results")
          .update(analysisData)
          .eq("id", existingAnalysisId);
      } else {
        // Insert new
        result = await supabase.from("ai_analysis_results").insert({
          ...analysisData,
          created_at: new Date().toISOString(),
        });
      }

      if (result.error) throw result.error;

      // Update quote_files status
      await supabase
        .from("quote_files")
        .update({ ai_processing_status: "completed" })
        .eq("id", file.id);

      toast.success("Manual entry saved successfully");

      if (onSaveComplete) {
        await onSaveComplete();
      }

      onClose();
    } catch (error: any) {
      console.error("Error saving manual entry:", error);
      toast.error("Failed to save: " + (error.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-orange-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Manual Document Entry
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* File Info */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <FileText className="w-5 h-5 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {file.original_filename}
                  </p>
                </div>
              </div>

              {/* Document Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Language
                  </label>
                  <select
                    value={selectedLanguageId}
                    onChange={(e) => setSelectedLanguageId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {languages.map((lang) => (
                      <option key={lang.id} value={lang.id}>
                        {lang.name} ({lang.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Document Type
                  </label>
                  <select
                    value={selectedDocumentTypeId}
                    onChange={(e) => setSelectedDocumentTypeId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {documentTypes.map((docType) => (
                      <option key={docType.id} value={docType.id}>
                        {docType.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Certification */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Certification
                </label>
                <select
                  value={selectedCertificationId}
                  onChange={(e) => setSelectedCertificationId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No Certification</option>
                  {certificationTypes.map((cert) => (
                    <option key={cert.id} value={cert.id}>
                      {cert.name} (${parseFloat(cert.price as any).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Page-by-Page Entry */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Pages ({pages.length})
                  </label>
                  <button
                    onClick={addPage}
                    className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add Page
                  </button>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">
                          Page
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">
                          Word Count
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">
                          Complexity
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">
                          Billable
                        </th>
                        <th className="px-4 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {pages.map((page, index) => {
                        const billable = Math.round((page.wordCount / settings.words_per_page) * 100) / 100;
                        return (
                          <tr key={page.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                min="1"
                                value={page.pageNumber}
                                onChange={(e) =>
                                  updatePage(page.id, "pageNumber", parseInt(e.target.value) || 1)
                                }
                                className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                min="0"
                                value={page.wordCount}
                                onChange={(e) =>
                                  updatePage(page.id, "wordCount", parseInt(e.target.value) || 0)
                                }
                                className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <select
                                value={page.complexity}
                                onChange={(e) =>
                                  updatePage(page.id, "complexity", e.target.value)
                                }
                                className="px-2 py-1 border border-gray-300 rounded text-sm"
                              >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                              </select>
                            </td>
                            <td className="px-4 py-2 text-gray-600">
                              {billable.toFixed(2)}
                            </td>
                            <td className="px-4 py-2">
                              <button
                                onClick={() => removePage(page.id)}
                                disabled={pages.length === 1}
                                className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pricing Summary */}
              <div className="bg-blue-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Calculator className="w-5 h-5 text-blue-600" />
                  <h3 className="text-sm font-semibold text-blue-900">
                    Pricing Summary
                  </h3>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-blue-700">Total Words</p>
                    <p className="font-semibold text-blue-900">
                      {pricingSummary.totalWords.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-700">Total Pages</p>
                    <p className="font-semibold text-blue-900">
                      {pricingSummary.totalPages}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-700">Billable Pages</p>
                    <p className="font-semibold text-blue-900">
                      {pricingSummary.totalBillablePages}
                    </p>
                  </div>
                </div>

                <div className="border-t border-blue-200 pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-700">
                      Translation Cost ({pricingSummary.totalBillablePages} pages ×
                      ${settings.base_rate} × {pricingSummary.languageMultiplier}x ×{" "}
                      {pricingSummary.avgComplexityMultiplier}x):
                    </span>
                    <span className="font-medium text-blue-900">
                      ${pricingSummary.translationCost.toFixed(2)}
                    </span>
                  </div>
                  {pricingSummary.certificationCost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-700">Certification:</span>
                      <span className="font-medium text-blue-900">
                        ${pricingSummary.certificationCost.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="border-t border-blue-200 pt-2 flex justify-between text-base font-semibold">
                    <span className="text-blue-900">Line Total:</span>
                    <span className="text-blue-900">
                      ${pricingSummary.lineTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Entry
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
