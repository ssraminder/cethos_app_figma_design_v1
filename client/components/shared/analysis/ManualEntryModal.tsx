import { useState, useEffect, useMemo } from "react";
import {
  X,
  FileText,
  Loader2,
  Save,
  Calculator,
  Info,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import SearchableDropdown from "@/components/SearchableDropdown";
import { calculatePerPageRate, calculateLineTotal, formatCurrency, getPricingBreakdown } from "@/utils/pricing";

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

interface IntendedUse {
  id: string;
  code: string;
  name: string;
  default_certification_type_id: string | null;
}

interface AppSettings {
  base_rate: number;
  words_per_page: number;
  complexity_easy: number;
  complexity_medium: number;
  complexity_hard: number;
  min_billable_pages: number;
}

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: QuoteFile | null; // Now optional - null for standalone entries
  quoteId: string;
  staffId?: string;
  onSaveComplete?: () => void | Promise<void>;
}

const DEFAULT_SETTINGS: AppSettings = {
  base_rate: 65.0,
  words_per_page: 225, // Updated to 225 as per spec
  complexity_easy: 1.0,
  complexity_medium: 1.15,
  complexity_hard: 1.25,
  min_billable_pages: 0.5,
};

export default function ManualEntryModal({
  isOpen,
  onClose,
  file,
  quoteId,
  staffId,
  onSaveComplete,
}: ManualEntryModalProps) {
  // Reference data
  const [languages, setLanguages] = useState<Language[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [certificationTypes, setCertificationTypes] = useState<CertificationType[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Form state
  const [documentName, setDocumentName] = useState<string>("");
  const [selectedLanguageId, setSelectedLanguageId] = useState<string>("");
  const [selectedDocumentTypeId, setSelectedDocumentTypeId] = useState<string>("");
  const [documentTypeOther, setDocumentTypeOther] = useState<string>("");
  const [wordCount, setWordCount] = useState<number | null>(null);
  const [billablePages, setBillablePages] = useState<number>(1.0);
  const [complexity, setComplexity] = useState<string>("medium");
  const [selectedCertificationId, setSelectedCertificationId] = useState<string>("");

  // Quote context
  const [quotePurpose, setQuotePurpose] = useState<string>("");
  const [defaultCertificationFromPurpose, setDefaultCertificationFromPurpose] = useState<string | null>(null);

  // Quote source language multiplier (from Step 2)
  const [quoteLanguageMultiplier, setQuoteLanguageMultiplier] = useState<number>(1.0);
  const [quoteSourceLanguageName, setQuoteSourceLanguageName] = useState<string>("");

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingAnalysisId, setExistingAnalysisId] = useState<string | null>(null);

  // Determine if this is a standalone entry (no file)
  const isStandalone = !file;

  useEffect(() => {
    if (isOpen) {
      loadReferenceData();
      loadQuoteContext();
      fetchQuoteLanguageMultiplier();
      if (file) {
        loadExistingAnalysis();
        setDocumentName(file.original_filename);
      } else {
        // Reset form for standalone entry
        setDocumentName("");
        setExistingAnalysisId(null);
        setWordCount(null);
        setBillablePages(1.0);
        setComplexity("medium");
        setSelectedDocumentTypeId("");
        setDocumentTypeOther("");
      }
    }
  }, [isOpen, file?.id]);

  // Auto-calculate billable pages when word count or complexity changes
  useEffect(() => {
    if (wordCount && wordCount > 0) {
      const multiplier = getComplexityMultiplier(complexity);
      // Formula: ceil((words / 225) × complexity × 10) / 10 - rounds UP to nearest 0.1
      const calculated = Math.ceil((wordCount / settings.words_per_page) * multiplier * 10) / 10;
      setBillablePages(Math.max(calculated, settings.min_billable_pages));
    }
  }, [wordCount, complexity, settings]);

  const loadReferenceData = async () => {
    setLoading(true);
    try {
      const [languagesRes, docTypesRes, certTypesRes, settingsRes] = await Promise.all([
        supabase.from("languages").select("*").eq("is_active", true).order("name"),
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
      }

      if (certTypesRes.data) {
        setCertificationTypes(certTypesRes.data);
        // Set default certification to "Oath Commissioner" if not already set
        if (!selectedCertificationId) {
          const oathCommissioner = certTypesRes.data.find((c: CertificationType) =>
            c.name.toLowerCase().includes("oath") ||
            c.name.toLowerCase().includes("commissioner")
          );
          if (oathCommissioner) {
            setSelectedCertificationId(oathCommissioner.id);
          }
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

  const loadQuoteContext = async () => {
    try {
      // Fetch quote with intended use and its default certification
      const { data, error } = await supabase
        .from("quotes")
        .select(`
          intended_use_id,
          source_language_id,
          intended_uses(
            id,
            name,
            default_certification_type_id
          )
        `)
        .eq("id", quoteId)
        .single();

      if (data && !error) {
        // Set source language if available and not already set
        if (data.source_language_id && !selectedLanguageId) {
          setSelectedLanguageId(data.source_language_id);
        }

        // Set purpose name for display
        const intendedUse = data.intended_uses as IntendedUse | null;
        if (intendedUse) {
          setQuotePurpose(intendedUse.name);

          // Set default certification from intended use
          if (intendedUse.default_certification_type_id) {
            setDefaultCertificationFromPurpose(intendedUse.default_certification_type_id);
            // Only set if not editing existing entry
            if (!existingAnalysisId && !selectedCertificationId) {
              setSelectedCertificationId(intendedUse.default_certification_type_id);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error loading quote context:", error);
    }
  };

  // Fetch quote's source language multiplier (from Step 2)
  const fetchQuoteLanguageMultiplier = async () => {
    if (!quoteId) return;

    try {
      const { data, error } = await supabase
        .from("quotes")
        .select(`
          source_language_id,
          language_multiplier_override,
          languages!quotes_source_language_id_fkey (
            name,
            multiplier
          )
        `)
        .eq("id", quoteId)
        .single();

      if (data && !error) {
        const langData = data.languages as { name: string; multiplier: number } | null;
        if (langData) {
          // Use override if set, otherwise use language's default multiplier
          const multiplier = data.language_multiplier_override ?? langData.multiplier ?? 1.0;
          setQuoteLanguageMultiplier(multiplier);
          setQuoteSourceLanguageName(langData.name || "");
        }
      }
    } catch (error) {
      console.error("Error fetching quote language multiplier:", error);
    }
  };

  const loadExistingAnalysis = async () => {
    if (!file) return;

    try {
      const { data, error } = await supabase
        .from("ai_analysis_results")
        .select("*")
        .eq("quote_file_id", file.id)
        .single();

      if (data && !error) {
        setExistingAnalysisId(data.id);

        // Pre-populate form with existing data
        if (data.detected_language) {
          const lang = languages.find((l) => l.name === data.detected_language || l.code === data.detected_language);
          if (lang) setSelectedLanguageId(lang.id);
        }

        if (data.detected_document_type) {
          const docType = documentTypes.find((d) => d.name === data.detected_document_type || d.code === data.detected_document_type);
          if (docType) {
            setSelectedDocumentTypeId(docType.id);
          } else if (data.detected_document_type === "other" || data.document_type_other) {
            setSelectedDocumentTypeId("other");
            setDocumentTypeOther(data.document_type_other || data.detected_document_type);
          }
        }

        if (data.certification_type_id) {
          setSelectedCertificationId(data.certification_type_id);
        }

        if (data.word_count) {
          setWordCount(data.word_count);
        }

        if (data.billable_pages) {
          setBillablePages(data.billable_pages);
        }

        if (data.assessed_complexity) {
          // Normalize complexity values
          const comp = data.assessed_complexity.toLowerCase();
          if (comp === "low" || comp === "easy") setComplexity("easy");
          else if (comp === "high" || comp === "hard") setComplexity("hard");
          else setComplexity("medium");
        }
      }
    } catch (error) {
      // No existing analysis, that's fine
      console.log("No existing analysis found");
    }
  };

  const getComplexityMultiplier = (comp: string): number => {
    switch (comp) {
      case "easy":
      case "low":
        return settings.complexity_easy;
      case "medium":
        return settings.complexity_medium;
      case "hard":
      case "high":
        return settings.complexity_hard;
      default:
        return settings.complexity_medium;
    }
  };

  // Calculate per-page rate (rounded to next $2.50)
  const perPageRate = useMemo(() => {
    return calculatePerPageRate(quoteLanguageMultiplier, settings.base_rate);
  }, [quoteLanguageMultiplier, settings.base_rate]);

  // Get pricing breakdown text for display
  const pricingBreakdownText = useMemo(() => {
    const breakdown = getPricingBreakdown(quoteLanguageMultiplier, settings.base_rate);
    return breakdown.breakdownText;
  }, [quoteLanguageMultiplier, settings.base_rate]);

  // Calculate pricing summary
  // IMPORTANT: Use quote's source language multiplier (from Step 2), NOT the detected language
  const pricingSummary = useMemo(() => {
    const selectedCertification = certificationTypes.find((c) => c.id === selectedCertificationId);
    const complexityMultiplier = getComplexityMultiplier(complexity);

    // Translation cost calculation using consistent per-page rate (rounded to next $2.50)
    // Note: complexity is already factored into billablePages
    const translationCost = calculateLineTotal(
      billablePages,
      quoteLanguageMultiplier,
      1.0, // complexity already in billable pages
      settings.base_rate
    );

    // Certification cost
    const certificationCost = selectedCertification?.price ? parseFloat(selectedCertification.price as any) : 0;

    // Line total
    const lineTotal = translationCost + certificationCost;

    return {
      billablePages,
      complexityMultiplier,
      languageMultiplier: quoteLanguageMultiplier,
      perPageRate,
      translationCost,
      certificationCost,
      lineTotal,
    };
  }, [billablePages, selectedCertificationId, complexity, certificationTypes, settings, quoteLanguageMultiplier, perPageRate]);

  const handleSave = async () => {
    // Validation
    if (isStandalone && !documentName.trim()) {
      toast.error("Please enter a document name");
      return;
    }

    if (!selectedLanguageId) {
      toast.error("Please select a language");
      return;
    }

    if (selectedDocumentTypeId === "other" && !documentTypeOther.trim()) {
      toast.error("Please specify the document type");
      return;
    }

    setSaving(true);

    try {
      const selectedLanguage = languages.find((l) => l.id === selectedLanguageId);
      const selectedDocumentType = documentTypes.find((d) => d.id === selectedDocumentTypeId);
      const isOtherDocType = selectedDocumentTypeId === "other";

      const analysisData = {
        quote_id: quoteId,
        quote_file_id: file?.id || null,
        manual_filename: isStandalone ? documentName.trim() : null,
        detected_language: selectedLanguage?.code || selectedLanguage?.name || "Unknown",
        detected_document_type: isOtherDocType ? "other" : (selectedDocumentType?.code || selectedDocumentType?.name || "Unknown"),
        document_type_other: isOtherDocType ? documentTypeOther.trim() : null,
        assessed_complexity: complexity,
        complexity_multiplier: getComplexityMultiplier(complexity),
        word_count: wordCount || null,
        page_count: 1, // Default for manual entries
        billable_pages: billablePages,
        base_rate: settings.base_rate,
        line_total: pricingSummary.lineTotal,
        certification_type_id: selectedCertificationId || null,
        certification_price: pricingSummary.certificationCost,
        ocr_provider: "manual",
        llm_provider: "manual",
        llm_model: "staff_manual_entry",
        processing_status: "completed",
        is_staff_created: true,
        created_by_staff_id: staffId || null,
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

      // Update quote_files status if we have a file
      if (file?.id) {
        await supabase
          .from("quote_files")
          .update({ ai_processing_status: "completed" })
          .eq("id", file.id);
      }

      // Recalculate quote totals
      const { error: rpcError } = await supabase.rpc("recalculate_quote_totals", {
        p_quote_id: quoteId,
      });
      if (rpcError) {
        console.error("RPC recalculate error:", rpcError);
      }

      toast.success(existingAnalysisId ? "Entry updated successfully" : "Manual entry saved successfully");

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

  const wordCountProvided = wordCount !== null && wordCount > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-orange-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              {isStandalone ? "Add Manual Entry" : "Manual Document Entry"}
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
            <div className="space-y-5">
              {/* File Info or Document Name */}
              {file ? (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <FileText className="w-5 h-5 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {file.original_filename}
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Document Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={documentName}
                    onChange={(e) => setDocumentName(e.target.value)}
                    placeholder="e.g., Birth Certificate - Maria Garcia"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Document Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Type <span className="text-red-500">*</span>
                </label>
                <SearchableDropdown
                  options={[
                    ...documentTypes.map((dt) => ({
                      id: dt.id,
                      label: dt.name,
                    })),
                    { id: "other", label: "Other" },
                  ]}
                  value={selectedDocumentTypeId}
                  onChange={(value) => {
                    setSelectedDocumentTypeId(value);
                    if (value !== "other") {
                      setDocumentTypeOther("");
                    }
                  }}
                  placeholder="Search document types..."
                />

                {selectedDocumentTypeId === "other" && (
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Specify Document Type <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={documentTypeOther}
                      onChange={(e) => setDocumentTypeOther(e.target.value)}
                      placeholder="e.g., Medical Power of Attorney"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                )}
              </div>

              {/* Language */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Detected Language <span className="text-red-500">*</span>
                  <span className="text-gray-400 font-normal ml-1">(for classification)</span>
                </label>
                <SearchableDropdown
                  options={languages.map((l) => ({
                    id: l.id,
                    label: `${l.name} (${l.code})`,
                  }))}
                  value={selectedLanguageId}
                  onChange={(value) => setSelectedLanguageId(value)}
                  placeholder="Search languages..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Identifies the document's language for the translator
                </p>
              </div>

              {/* Word Count and Complexity */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Word Count <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={wordCount || ""}
                    onChange={(e) => {
                      const val = e.target.value ? parseInt(e.target.value) : null;
                      setWordCount(val);
                    }}
                    placeholder="e.g., 450"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    If entered, billable pages will be calculated automatically
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Complexity <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={complexity}
                    onChange={(e) => setComplexity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="easy">Easy (1.0x)</option>
                    <option value="medium">Medium ({settings.complexity_medium}x)</option>
                    <option value="hard">Hard ({settings.complexity_hard}x)</option>
                  </select>
                </div>
              </div>

              {/* Billable Pages */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Billable Pages <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={billablePages}
                  onChange={(e) => {
                    if (!wordCountProvided) {
                      setBillablePages(parseFloat(e.target.value) || 0.5);
                    }
                  }}
                  disabled={wordCountProvided}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    wordCountProvided ? "bg-gray-100 cursor-not-allowed" : ""
                  }`}
                />
                {wordCountProvided && (
                  <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                    <Calculator className="w-3 h-3" />
                    Auto-calculated from word count
                  </p>
                )}
              </div>

              {/* Certification */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Certification <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedCertificationId}
                  onChange={(e) => setSelectedCertificationId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No Certification</option>
                  {certificationTypes.map((cert) => (
                    <option key={cert.id} value={cert.id}>
                      {cert.name} - ${parseFloat(cert.price as any).toFixed(2)}
                    </option>
                  ))}
                </select>
                {quotePurpose && defaultCertificationFromPurpose && (
                  <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Based on quote purpose: {quotePurpose}
                  </p>
                )}
              </div>

              {/* Pricing Summary */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <Calculator className="w-4 h-4 text-gray-500" />
                  <span className="font-medium text-gray-700">Pricing Summary</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Per Page Rate:</span>
                    <span className="font-semibold text-teal-600">{formatCurrency(perPageRate)}</span>
                  </div>
                  <div className="text-xs text-gray-500 text-right -mt-0.5">
                    {pricingBreakdownText}
                  </div>
                  <div className="flex justify-between">
                    <span>Translation ({pricingSummary.billablePages} pages × {formatCurrency(perPageRate)}):</span>
                    <span>{formatCurrency(pricingSummary.translationCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Certification:</span>
                    <span>{formatCurrency(pricingSummary.certificationCost)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                    <span>Line Total:</span>
                    <span>{formatCurrency(pricingSummary.lineTotal)}</span>
                  </div>
                </div>
                {quoteSourceLanguageName && (
                  <p className="text-xs text-gray-500 mt-2">
                    ℹ️ Language multiplier ({pricingSummary.languageMultiplier}x) from quote source: {quoteSourceLanguageName}
                  </p>
                )}
              </div>

              {/* Info Notice for Standalone Entries */}
              {isStandalone && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-900">
                    This creates a pricing entry without an uploaded file. The document name will be used for display and invoicing purposes.
                  </p>
                </div>
              )}
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
            className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
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
