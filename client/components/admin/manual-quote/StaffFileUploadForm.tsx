import { useState, useEffect, useRef } from "react";
import {
  Upload,
  X,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader2,
  Brain,
  File,
  Edit2,
  RefreshCw,
  PenTool,
  Trash2,
  Globe,
  ChevronDown,
  ChevronUp,
  Search,
  Award,
  Save,
  RotateCcw,
  Minus,
  Clock,
  XCircle,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  AnalyzeDocumentModal,
  ManualEntryModal,
} from "@/components/shared/analysis";

// ============================================================================
// TYPES
// ============================================================================

interface FileCategory {
  id: string;
  name: string;
  slug: string;
  is_billable: boolean;
}

interface QuoteFile {
  id: string;
  original_filename: string;
  storage_path?: string;
  mime_type: string;
}

interface UploadedQuoteFile {
  id: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  ai_processing_status: string | null;
  file_category_id: string | null;
  created_at: string;
}

type ProcessingStatus = "pending" | "processing" | "completed" | "failed" | "skipped" | null;

export interface FileWithAnalysis {
  id: string;
  name: string;
  size: number;
  file: File;
  uploadStatus: "pending" | "uploading" | "success" | "failed";
  uploadedFileId?: string;
  analysisStatus: "idle" | "analyzing" | "completed" | "failed" | "timeout";
  detectedLanguage?: string;
  detectedLanguageCode?: string;
  detectedDocumentType?: string;
  pageCount?: number;
  wordCount?: number;
  complexity?: "low" | "medium" | "high";
}

interface AnalysisResult {
  id: string;
  quote_file_id: string | null;
  manual_filename: string | null;
  original_filename: string;
  detected_language: string;
  detected_document_type: string;
  document_type_other: string | null;
  assessed_complexity: string;
  complexity_multiplier: number;
  word_count: number;
  page_count: number;
  billable_pages: number;
  base_rate: number;
  line_total: number;
  certification_type_id: string | null;
  certification_price: number | null;
  is_staff_created: boolean;
}

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

interface DocumentType {
  id: string;
  code: string;
  name: string;
}

interface CertificationType {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  is_default: boolean;
}

interface Country {
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

interface StaffFileUploadFormProps {
  quoteId: string | null;
  staffId: string;
  value: FileWithAnalysis[];
  onChange: (files: FileWithAnalysis[]) => void;
  processWithAI: boolean;
  onProcessWithAIChange: (value: boolean) => void;
  onPricingRefresh?: () => void;
}

// ============================================================================
// SEARCHABLE DROPDOWN COMPONENT
// ============================================================================

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        className={`w-full flex items-center justify-between px-3 py-2 bg-white border rounded-md text-left text-sm transition-colors ${
          disabled
            ? "bg-gray-50 cursor-not-allowed text-gray-400"
            : "border-gray-300 hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        }`}
      >
        <span className={selectedOption ? "text-gray-900" : "text-gray-400"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <div className="flex items-center gap-1">
          {saving && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full pl-8 pr-3 py-1.5 text-base border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No results found</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center justify-between ${
                    option.id === value ? "bg-blue-50 text-blue-700" : "text-gray-900"
                  }`}
                >
                  <div>
                    <div>{option.label}</div>
                    {option.sublabel && (
                      <div className="text-xs text-gray-500">{option.sublabel}</div>
                    )}
                  </div>
                  {option.id === value && <CheckCircle className="w-4 h-4 text-blue-600" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COUNTRIES LIST
// ============================================================================

const COUNTRIES: Country[] = [
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function StaffFileUploadForm({
  quoteId,
  staffId,
  value,
  onChange,
  processWithAI,
  onProcessWithAIChange,
  onPricingRefresh,
}: StaffFileUploadFormProps) {
  const [files, setFiles] = useState<FileWithAnalysis[]>(value);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Analysis modal states
  const [analyzeModalOpen, setAnalyzeModalOpen] = useState(false);
  const [manualEntryModalOpen, setManualEntryModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<QuoteFile | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);

  // File categories and selection state
  const [fileCategories, setFileCategories] = useState<FileCategory[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedQuoteFile[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [processingFileIds, setProcessingFileIds] = useState<Set<string>>(new Set());
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);

  // Translation details state
  const [translationDetails, setTranslationDetails] = useState<TranslationDetails | null>(null);
  const [translationExpanded, setTranslationExpanded] = useState(true);

  // Reference data
  const [languages, setLanguages] = useState<Language[]>([]);
  const [intendedUses, setIntendedUses] = useState<IntendedUse[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [certificationTypes, setCertificationTypes] = useState<CertificationType[]>([]);

  // Editing states
  const [savingField, setSavingField] = useState<string | null>(null);
  const [editingAnalysisId, setEditingAnalysisId] = useState<string | null>(null);
  const [editingAnalysis, setEditingAnalysis] = useState<Partial<AnalysisResult> | null>(null);
  const [removingAnalysisId, setRemovingAnalysisId] = useState<string | null>(null);

  // Quote certification state
  const [certificationExpanded, setCertificationExpanded] = useState(true);
  const [editingCertification, setEditingCertification] = useState(false);
  const [selectedCertificationId, setSelectedCertificationId] = useState<string | null>(null);
  const [savingCertification, setSavingCertification] = useState(false);

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  useEffect(() => {
    loadReferenceData();
    fetchFileCategories();
  }, []);

  useEffect(() => {
    if (quoteId) {
      fetchTranslationDetails();
      fetchAnalysisResults();
      fetchUploadedFiles();
    }
  }, [quoteId]);

  const fetchFileCategories = async () => {
    const { data, error } = await supabase
      .from("file_categories")
      .select("id, name, slug, is_billable")
      .eq("is_active", true)
      .order("display_order");

    if (error) {
      console.error("Error fetching file categories:", error);
      return;
    }
    setFileCategories(data || []);
  };

  const fetchUploadedFiles = async () => {
    if (!quoteId) return;

    const { data, error } = await supabase
      .from("quote_files")
      .select("id, original_filename, file_size, mime_type, ai_processing_status, file_category_id, created_at")
      .eq("quote_id", quoteId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching uploaded files:", error);
      return;
    }
    setUploadedFiles(data || []);
  };

  useEffect(() => {
    onChange(files);
  }, [files]);

  const loadReferenceData = async () => {
    try {
      const [langsRes, usesRes, docTypesRes, certTypesRes] = await Promise.all([
        supabase.from("languages").select("id, code, name, native_name, tier, multiplier").eq("is_active", true).order("name"),
        supabase.from("intended_uses").select("id, code, name").eq("is_active", true).order("sort_order"),
        supabase.from("document_types").select("id, code, name").eq("is_active", true).order("name"),
        supabase.from("certification_types").select("*").eq("is_active", true).order("sort_order"),
      ]);

      if (langsRes.data) setLanguages(langsRes.data);
      if (usesRes.data) setIntendedUses(usesRes.data);
      if (docTypesRes.data) setDocumentTypes(docTypesRes.data);
      if (certTypesRes.data) {
        setCertificationTypes(certTypesRes.data);
        const defaultCert = certTypesRes.data.find((c) => c.is_default);
        if (defaultCert) setSelectedCertificationId(defaultCert.id);
      }
    } catch (error) {
      console.error("Error loading reference data:", error);
    }
  };

  const fetchTranslationDetails = async () => {
    if (!quoteId) return;

    const { data, error } = await supabase
      .from("quotes")
      .select(`
        source_language_id,
        target_language_id,
        intended_use_id,
        country_of_issue,
        language_multiplier_override
      `)
      .eq("id", quoteId)
      .single();

    if (data && !error) {
      const sourceLang = languages.find((l) => l.id === data.source_language_id);
      setTranslationDetails({
        sourceLanguageId: data.source_language_id,
        targetLanguageId: data.target_language_id,
        intendedUseId: data.intended_use_id,
        countryOfIssue: data.country_of_issue,
        languageTier: sourceLang?.tier || 1,
        languageMultiplier: data.language_multiplier_override || sourceLang?.multiplier || 1.0,
        languageMultiplierOverride: data.language_multiplier_override,
      });
    }
  };

  const fetchAnalysisResults = async () => {
    if (!quoteId) return;

    // Fetch analysis results with optional file join (supports manual entries without files)
    const { data, error } = await supabase
      .from("ai_analysis_results")
      .select(`
        id,
        quote_file_id,
        manual_filename,
        detected_language,
        detected_document_type,
        document_type_other,
        assessed_complexity,
        complexity_multiplier,
        word_count,
        page_count,
        billable_pages,
        base_rate,
        line_total,
        certification_type_id,
        certification_price,
        is_staff_created,
        quote_files(original_filename)
      `)
      .eq("quote_id", quoteId);

    if (data && !error) {
      setAnalysisResults(
        data.map((r: any) => ({
          ...r,
          // Use manual_filename if no file, otherwise use the file's original_filename
          original_filename: r.quote_files?.original_filename || r.manual_filename || "Manual Entry",
        }))
      );
    }
  };

  // ============================================================================
  // TRANSLATION DETAILS HANDLERS
  // ============================================================================

  const saveTranslationField = async (field: string, value: any) => {
    if (!quoteId) return;

    setSavingField(field);
    try {
      let updateData: any = {};

      if (field === "sourceLanguageId") {
        updateData.source_language_id = value;
        // Update tier and multiplier based on new source language
        const sourceLang = languages.find((l) => l.id === value);
        if (sourceLang) {
          setTranslationDetails((prev) =>
            prev ? {
              ...prev,
              sourceLanguageId: value,
              languageTier: sourceLang.tier,
              languageMultiplier: prev.languageMultiplierOverride || sourceLang.multiplier,
            } : null
          );
        }
      } else if (field === "targetLanguageId") {
        updateData.target_language_id = value;
      } else if (field === "intendedUseId") {
        updateData.intended_use_id = value;
      } else if (field === "countryOfIssue") {
        updateData.country_of_issue = value;
      } else if (field === "languageMultiplierOverride") {
        updateData.language_multiplier_override = value;
        setTranslationDetails((prev) =>
          prev ? { ...prev, languageMultiplier: value, languageMultiplierOverride: value } : null
        );
      }

      const { error } = await supabase
        .from("quotes")
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq("id", quoteId);

      if (error) throw error;

      // Recalculate totals if language multiplier changed
      if (field === "sourceLanguageId" || field === "languageMultiplierOverride") {
        await supabase.rpc("recalculate_quote_totals", { p_quote_id: quoteId });
        onPricingRefresh?.();
      }

      toast.success("Saved");
      fetchTranslationDetails();
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Failed to save");
    } finally {
      setSavingField(null);
    }
  };

  const resetMultiplier = async () => {
    if (!quoteId || !translationDetails?.sourceLanguageId) return;

    const sourceLang = languages.find((l) => l.id === translationDetails.sourceLanguageId);
    if (!sourceLang) return;

    setSavingField("languageMultiplierOverride");
    try {
      const { error } = await supabase
        .from("quotes")
        .update({ language_multiplier_override: null, updated_at: new Date().toISOString() })
        .eq("id", quoteId);

      if (error) throw error;

      setTranslationDetails((prev) =>
        prev ? { ...prev, languageMultiplier: sourceLang.multiplier, languageMultiplierOverride: null } : null
      );

      await supabase.rpc("recalculate_quote_totals", { p_quote_id: quoteId });
      onPricingRefresh?.();
      toast.success("Multiplier reset to tier default");
    } catch (error) {
      console.error("Error resetting:", error);
      toast.error("Failed to reset");
    } finally {
      setSavingField(null);
    }
  };

  const getTierBadgeColor = (tier: number) => {
    switch (tier) {
      case 1: return "bg-green-100 text-green-700 border-green-200";
      case 2: return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case 3: return "bg-red-100 text-red-700 border-red-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  // ============================================================================
  // FILE CATEGORY HANDLERS
  // ============================================================================

  const getFileCategory = (file: UploadedQuoteFile): FileCategory | undefined => {
    return fileCategories.find((c) => c.id === file.file_category_id);
  };

  const isBillable = (file: UploadedQuoteFile): boolean => {
    const category = getFileCategory(file);
    return category?.is_billable ?? false;
  };

  const getSelectableBillableFiles = (): UploadedQuoteFile[] => {
    return uploadedFiles.filter((f) => isBillable(f));
  };

  const getSelectedBillableCount = (): number => {
    return uploadedFiles.filter((f) => isBillable(f) && selectedFileIds.has(f.id)).length;
  };

  const handleCategoryChange = async (fileId: string, categoryId: string | null) => {
    try {
      const { error } = await supabase
        .from("quote_files")
        .update({ file_category_id: categoryId })
        .eq("id", fileId);

      if (error) throw error;

      // Update local state
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, file_category_id: categoryId } : f
        )
      );

      // If changing to non-billable, deselect the file
      const newCategory = fileCategories.find((c) => c.id === categoryId);
      if (!newCategory?.is_billable) {
        setSelectedFileIds((prev) => {
          const next = new Set(prev);
          next.delete(fileId);
          return next;
        });
      }
    } catch (err) {
      console.error("Error updating category:", err);
      toast.error("Failed to update file category");
    }
  };

  // ============================================================================
  // FILE SELECTION HANDLERS
  // ============================================================================

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const billableIds = getSelectableBillableFiles().map((f) => f.id);
      setSelectedFileIds(new Set(billableIds));
    } else {
      setSelectedFileIds(new Set());
    }
  };

  const handleSelectFile = (fileId: string, checked: boolean) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(fileId);
      } else {
        next.delete(fileId);
      }
      return next;
    });
  };

  // ============================================================================
  // BATCH AI ANALYSIS
  // ============================================================================

  const handleAnalyzeSelected = async () => {
    const filesToAnalyze = uploadedFiles.filter(
      (f) => selectedFileIds.has(f.id) && isBillable(f)
    );

    if (filesToAnalyze.length === 0) {
      toast.error("No billable files selected for analysis");
      return;
    }

    setIsBatchAnalyzing(true);
    let successCount = 0;
    let failCount = 0;

    // Mark all as processing
    setProcessingFileIds(new Set(filesToAnalyze.map((f) => f.id)));

    // Update UI immediately
    setUploadedFiles((prev) =>
      prev.map((f) =>
        selectedFileIds.has(f.id) && isBillable(f)
          ? { ...f, ai_processing_status: "processing" }
          : f
      )
    );

    try {
      // Process files sequentially to avoid overwhelming the server
      for (const file of filesToAnalyze) {
        try {
          console.log(`🔄 Analyzing file: ${file.original_filename}`);

          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-document`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                fileId: file.id,
                quoteId: quoteId,
              }),
            }
          );

          const data = await response.json();

          if (response.ok && data.success) {
            console.log(`✅ Analysis complete: ${file.original_filename}`);
            successCount++;

            // Update status in UI
            setUploadedFiles((prev) =>
              prev.map((f) =>
                f.id === file.id ? { ...f, ai_processing_status: "completed" } : f
              )
            );
          } else {
            console.error(`❌ Analysis failed: ${file.original_filename}`, data);
            failCount++;

            setUploadedFiles((prev) =>
              prev.map((f) =>
                f.id === file.id ? { ...f, ai_processing_status: "failed" } : f
              )
            );
          }
        } catch (err) {
          console.error(`❌ Error analyzing ${file.original_filename}:`, err);
          failCount++;

          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === file.id ? { ...f, ai_processing_status: "failed" } : f
            )
          );
        }

        // Remove from processing set
        setProcessingFileIds((prev) => {
          const next = new Set(prev);
          next.delete(file.id);
          return next;
        });
      }

      // Show results
      if (successCount > 0 && failCount === 0) {
        toast.success(`${successCount} file(s) analyzed successfully`);
      } else if (successCount > 0 && failCount > 0) {
        toast.warning(`${successCount} succeeded, ${failCount} failed`);
      } else {
        toast.error(`Analysis failed for all files`);
      }

      // Clear selection
      setSelectedFileIds(new Set());

      // Refresh data and notify parent
      await fetchUploadedFiles();
      await fetchAnalysisResults();
      onPricingRefresh?.();
    } finally {
      setIsBatchAnalyzing(false);
      setProcessingFileIds(new Set());
    }
  };

  const handleDeleteUploadedFile = async (fileId: string) => {
    try {
      // Soft delete
      const { error } = await supabase
        .from("quote_files")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", fileId);

      if (error) throw error;

      toast.success("File removed");
      setSelectedFileIds((prev) => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
      await fetchUploadedFiles();
      await fetchAnalysisResults();
      onPricingRefresh?.();
    } catch (err) {
      console.error("Error deleting file:", err);
      toast.error("Failed to remove file");
    }
  };

  // ============================================================================
  // FILE UPLOAD HANDLERS
  // ============================================================================

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    addFiles(selectedFiles);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const addFiles = async (newFiles: File[]) => {
    const fileData: FileWithAnalysis[] = newFiles.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      file,
      uploadStatus: "pending",
      analysisStatus: "idle",
    }));

    const updatedFiles = [...files, ...fileData];
    setFiles(updatedFiles);

    if (quoteId) {
      for (const fileItem of fileData) {
        await uploadFile(fileItem);
      }
    }
  };

  const uploadFile = async (fileItem: FileWithAnalysis) => {
    if (!quoteId) return;

    setFiles((prev) =>
      prev.map((f) => (f.id === fileItem.id ? { ...f, uploadStatus: "uploading" } : f))
    );

    try {
      const formData = new FormData();
      formData.append("file", fileItem.file);
      formData.append("quoteId", quoteId);
      formData.append("staffId", staffId);
      formData.append("processWithAI", processWithAI ? "true" : "false");

      const uploadResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-staff-quote-file`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
          body: formData,
        }
      );

      if (!uploadResponse.ok) throw new Error("Upload failed");

      const result = await uploadResponse.json();
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id ? { ...f, uploadStatus: "success", uploadedFileId: result.fileId } : f
        )
      );

      // Refresh analysis results and uploaded files after upload
      setTimeout(() => {
        fetchAnalysisResults();
        fetchUploadedFiles();
      }, 2000);
    } catch (error) {
      console.error("Upload failed:", error);
      setFiles((prev) =>
        prev.map((f) => (f.id === fileItem.id ? { ...f, uploadStatus: "failed" } : f))
      );
    }
  };

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // ============================================================================
  // ANALYSIS HANDLERS
  // ============================================================================

  const handleRemoveAnalysis = async (analysisId: string, fileId: string | null, fileName: string) => {
    const isManualEntry = !fileId;
    const message = isManualEntry
      ? `Remove manual entry "${fileName}"?`
      : `Remove analysis for "${fileName}"?\n\nThe file will remain and can be re-analyzed or manually entered.`;

    const confirmed = window.confirm(message);

    if (!confirmed) return;

    setRemovingAnalysisId(analysisId);
    try {
      // Delete from ai_analysis_results
      const { error: deleteError } = await supabase
        .from("ai_analysis_results")
        .delete()
        .eq("id", analysisId);

      if (deleteError) throw deleteError;

      // Reset quote_files status to 'skipped' (only if there's a file)
      if (fileId) {
        const { error: updateError } = await supabase
          .from("quote_files")
          .update({ ai_processing_status: "skipped" })
          .eq("id", fileId);

        if (updateError) throw updateError;
      }

      // Recalculate quote totals
      if (quoteId) {
        await supabase.rpc("recalculate_quote_totals", { p_quote_id: quoteId });
      }

      toast.success(isManualEntry ? `Entry removed: "${fileName}"` : `Analysis removed for "${fileName}"`);
      fetchAnalysisResults();
      onPricingRefresh?.();
    } catch (error: any) {
      console.error("Error removing analysis:", error);
      toast.error(`Failed to remove: ${error.message}`);
    } finally {
      setRemovingAnalysisId(null);
    }
  };

  // Calculate line_total based on billable_pages, base_rate, language_multiplier, and complexity
  const recalculateLineTotal = (
    billablePages: number,
    baseRate: number,
    languageMultiplier: number,
    complexity: string
  ): number => {
    const complexityMultipliers: Record<string, number> = {
      easy: 1.0,
      low: 1.0,
      medium: 1.15,
      hard: 1.25,
      high: 1.25,
    };

    const complexityMultiplier = complexityMultipliers[complexity?.toLowerCase()] || 1.0;
    const rawTotal = billablePages * baseRate * languageMultiplier * complexityMultiplier;

    // Round to nearest $2.50
    const roundedTotal = Math.ceil(rawTotal / 2.5) * 2.5;

    return roundedTotal;
  };

  const startEditAnalysis = (analysis: AnalysisResult) => {
    setEditingAnalysisId(analysis.id);
    setEditingAnalysis({
      detected_language: analysis.detected_language,
      detected_document_type: analysis.detected_document_type,
      assessed_complexity: analysis.assessed_complexity,
      word_count: analysis.word_count,
      page_count: analysis.page_count,
      billable_pages: analysis.billable_pages,
      certification_type_id: analysis.certification_type_id,
    });
  };

  const cancelEditAnalysis = () => {
    setEditingAnalysisId(null);
    setEditingAnalysis(null);
  };

  const saveEditAnalysis = async (analysisId: string) => {
    if (!editingAnalysis) return;

    setSavingField(`analysis-${analysisId}`);
    try {
      const certType = certificationTypes.find((c) => c.id === editingAnalysis.certification_type_id);

      // Find the original analysis to get base_rate
      const originalAnalysis = analysisResults.find((a) => a.id === analysisId);
      if (!originalAnalysis) {
        throw new Error("Analysis not found");
      }

      // Map complexity to multiplier
      const complexityMultipliers: Record<string, number> = {
        easy: 1.0,
        low: 1.0,
        medium: 1.15,
        hard: 1.25,
        high: 1.25,
      };
      const newComplexity = editingAnalysis.assessed_complexity?.toLowerCase() || "medium";
      const newMultiplier = complexityMultipliers[newComplexity] || 1.0;

      // Get language multiplier from translation details
      const languageMultiplier = translationDetails?.languageMultiplier || 1.0;

      // Calculate the new line_total using the formula:
      // line_total = ceil((billable_pages × base_rate × lang_multiplier × complexity_multiplier) / 2.50) × 2.50
      const billablePagesToUse = editingAnalysis.billable_pages ?? originalAnalysis.billable_pages;
      const newLineTotal = recalculateLineTotal(
        billablePagesToUse,
        originalAnalysis.base_rate,
        languageMultiplier,
        newComplexity
      );

      const { error } = await supabase
        .from("ai_analysis_results")
        .update({
          detected_language: editingAnalysis.detected_language ?? originalAnalysis.detected_language,
          detected_document_type: editingAnalysis.detected_document_type ?? originalAnalysis.detected_document_type,
          assessed_complexity: editingAnalysis.assessed_complexity ?? originalAnalysis.assessed_complexity,
          complexity_multiplier: newMultiplier,
          word_count: editingAnalysis.word_count ?? originalAnalysis.word_count,
          page_count: editingAnalysis.page_count ?? originalAnalysis.page_count,
          billable_pages: billablePagesToUse,
          certification_type_id: editingAnalysis.certification_type_id,
          certification_price: certType?.price ?? null,
          line_total: newLineTotal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", analysisId);

      if (error) throw error;

      // Recalculate quote totals after the update
      if (quoteId) {
        const { error: rpcError } = await supabase.rpc("recalculate_quote_totals", {
          p_quote_id: quoteId,
        });
        if (rpcError) {
          console.error("RPC recalculate error:", rpcError);
        }
      }

      toast.success("Analysis updated");
      setEditingAnalysisId(null);
      setEditingAnalysis(null);
      fetchAnalysisResults();
      onPricingRefresh?.();
    } catch (error) {
      console.error("Error saving analysis:", error);
      toast.error("Failed to save");
    } finally {
      setSavingField(null);
    }
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity?.toLowerCase()) {
      case "easy":
      case "low":
        return "bg-green-100 text-green-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "hard":
      case "high":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // ============================================================================
  // QUOTE CERTIFICATION HANDLERS
  // ============================================================================

  const saveQuoteCertification = async () => {
    if (!quoteId || !selectedCertificationId) {
      toast.error("Please select a certification type");
      return;
    }

    const confirmed = window.confirm(
      `This will apply the selected certification to all ${analysisResults.length} document(s). Continue?`
    );
    if (!confirmed) return;

    setSavingCertification(true);
    try {
      const selectedCert = certificationTypes.find((c) => c.id === selectedCertificationId);
      if (!selectedCert) throw new Error("Certification type not found");

      // Update all analysis results with the new certification
      for (const analysis of analysisResults) {
        const { error } = await supabase
          .from("ai_analysis_results")
          .update({
            certification_type_id: selectedCertificationId,
            certification_price: selectedCert.price,
            updated_at: new Date().toISOString(),
          })
          .eq("id", analysis.id);

        if (error) throw error;
      }

      // Update quote certification total
      const totalCertCost = analysisResults.length * Number(selectedCert.price);
      const { error: quoteError } = await supabase
        .from("quotes")
        .update({
          certification_total: totalCertCost,
          updated_at: new Date().toISOString(),
        })
        .eq("id", quoteId);

      if (quoteError) throw quoteError;

      toast.success(`Certification updated for ${analysisResults.length} document(s)`);
      setEditingCertification(false);
      fetchAnalysisResults();
      onPricingRefresh?.();
    } catch (error: any) {
      console.error("Error saving certification:", error);
      toast.error(`Failed: ${error.message}`);
    } finally {
      setSavingCertification(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Upload Documents</h2>
        <p className="text-sm text-gray-600">
          Upload the documents that need to be translated (optional)
        </p>
      </div>

      {/* ================================================================== */}
      {/* TRANSLATION DETAILS PANEL */}
      {/* ================================================================== */}
      {quoteId && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <button
            onClick={() => setTranslationExpanded(!translationExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-t-lg"
          >
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Translation Details</h3>
            </div>
            {translationExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {translationExpanded && translationDetails && (
            <div className="px-4 py-4 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Source Language */}
                <SearchableDropdown
                  label="Source Language"
                  value={translationDetails.sourceLanguageId}
                  options={languages.map((l) => ({
                    id: l.id,
                    label: l.name,
                    sublabel: l.native_name ? `${l.native_name} (${l.code})` : `(${l.code})`,
                  }))}
                  onChange={(id) => saveTranslationField("sourceLanguageId", id)}
                  placeholder="Select source language"
                  saving={savingField === "sourceLanguageId"}
                />

                {/* Target Language */}
                <SearchableDropdown
                  label="Target Language"
                  value={translationDetails.targetLanguageId}
                  options={languages.map((l) => ({
                    id: l.id,
                    label: l.name,
                    sublabel: l.native_name ? `${l.native_name} (${l.code})` : `(${l.code})`,
                  }))}
                  onChange={(id) => saveTranslationField("targetLanguageId", id)}
                  placeholder="Select target language"
                  saving={savingField === "targetLanguageId"}
                />

                {/* Purpose */}
                <SearchableDropdown
                  label="Purpose"
                  value={translationDetails.intendedUseId}
                  options={intendedUses.map((u) => ({ id: u.id, label: u.name }))}
                  onChange={(id) => saveTranslationField("intendedUseId", id)}
                  placeholder="Select purpose"
                  saving={savingField === "intendedUseId"}
                />

                {/* Country of Issue */}
                <SearchableDropdown
                  label="Country of Issue"
                  value={translationDetails.countryOfIssue}
                  options={COUNTRIES.map((c) => ({ id: c.code, label: c.name, sublabel: c.code }))}
                  onChange={(code) => saveTranslationField("countryOfIssue", code)}
                  placeholder="Select country"
                  saving={savingField === "countryOfIssue"}
                />

                {/* Language Tier (read-only) */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Language Tier
                  </label>
                  <div className="flex items-center h-[38px]">
                    <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${getTierBadgeColor(translationDetails.languageTier)}`}>
                      Tier {translationDetails.languageTier}
                    </span>
                    <span className="ml-2 text-xs text-gray-500">
                      {translationDetails.languageTier === 1 && "(Standard)"}
                      {translationDetails.languageTier === 2 && "(Complex Script)"}
                      {translationDetails.languageTier === 3 && "(Rare/Specialized)"}
                    </span>
                  </div>
                </div>

                {/* Language Multiplier (editable) */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Language Multiplier
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="0.05"
                        min="0.5"
                        max="3.0"
                        value={translationDetails.languageMultiplier}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val >= 0.5 && val <= 3.0) {
                            saveTranslationField("languageMultiplierOverride", val);
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      {savingField === "languageMultiplierOverride" && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-blue-500" />
                      )}
                    </div>
                    {translationDetails.languageMultiplierOverride !== null && (
                      <button
                        onClick={resetMultiplier}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
                        title="Reset to tier default"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {translationDetails.languageMultiplierOverride !== null && (
                    <p className="text-xs text-orange-600 mt-1">
                      Custom override (Tier default: {languages.find((l) => l.id === translationDetails.sourceLanguageId)?.multiplier || "1.00"}x)
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* AI PROCESSING TOGGLE */}
      {/* ================================================================== */}
      <label className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors">
        <input
          type="checkbox"
          checked={processWithAI}
          onChange={(e) => onProcessWithAIChange(e.target.checked)}
          className="w-5 h-5 text-blue-600 rounded mt-0.5"
        />
        <div>
          <p className="font-medium text-blue-900">Automatically process with AI</p>
          <p className="text-sm text-blue-700">AI will analyze uploaded files (language, type, pages)</p>
        </div>
      </label>

      {/* ================================================================== */}
      {/* FILE UPLOAD AREA */}
      {/* ================================================================== */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 mb-2">Drag and drop files here, or click to browse</p>
        <label className="inline-block">
          <input
            type="file"
            multiple
            onChange={handleFileSelect}
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            className="hidden"
          />
          <span className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer transition-colors">
            Choose Files
          </span>
        </label>
        <p className="text-xs text-gray-500 mt-2">Supported: PDF, Word, Images (Max 10MB per file)</p>
      </div>

      {/* ================================================================== */}
      {/* STANDALONE MANUAL ENTRY BUTTON */}
      {/* ================================================================== */}
      {quoteId && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-orange-900 flex items-center gap-2">
                <PenTool className="w-5 h-5" />
                Manual Document Entry
              </h4>
              <p className="text-sm text-orange-700 mt-1">
                Create a document entry without uploading a file, or manually define document details.
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedFile(null);
                setManualEntryModalOpen(true);
              }}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Manual Entry
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* FILE MANAGEMENT WITH CATEGORIES */}
      {/* ================================================================== */}
      {uploadedFiles.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Header with Select All and Analyze Button */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                checked={
                  getSelectableBillableFiles().length > 0 &&
                  getSelectableBillableFiles().every((f) => selectedFileIds.has(f.id))
                }
                ref={(el) => {
                  if (el) {
                    const billableFiles = getSelectableBillableFiles();
                    const someSelected = billableFiles.some((f) => selectedFileIds.has(f.id));
                    const allSelected = billableFiles.length > 0 && billableFiles.every((f) => selectedFileIds.has(f.id));
                    el.indeterminate = someSelected && !allSelected;
                  }
                }}
                onChange={(e) => handleSelectAll(e.target.checked)}
                disabled={getSelectableBillableFiles().length === 0}
                className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
              />
              <span className="text-sm text-gray-700">
                Select All (To Translate)
              </span>
            </label>

            <button
              onClick={handleAnalyzeSelected}
              disabled={selectedFileIds.size === 0 || isBatchAnalyzing}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              {isBatchAnalyzing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Brain className="w-4 h-4" />
              )}
              {isBatchAnalyzing
                ? "Analyzing..."
                : `Analyze Selected (${getSelectedBillableCount()})`}
            </button>
          </div>

          {/* File Rows */}
          <div className="divide-y divide-gray-100">
            {uploadedFiles.map((file) => {
              const category = getFileCategory(file);
              const canSelect = category?.is_billable ?? false;
              const isSelected = selectedFileIds.has(file.id);
              const isProcessing = processingFileIds.has(file.id);
              const status = file.ai_processing_status as ProcessingStatus;

              return (
                <div
                  key={file.id}
                  className={`px-4 py-3 hover:bg-gray-50 transition-colors ${
                    isProcessing ? "bg-blue-50" : ""
                  }`}
                >
                  {/* Mobile: Stacked layout, Desktop: Horizontal layout */}
                  <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                    {/* Top row on mobile: Checkbox, File name, Delete button */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Checkbox */}
                      <div className="w-6 flex-shrink-0">
                        {canSelect ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => handleSelectFile(file.id, e.target.checked)}
                            disabled={isProcessing}
                            className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                          />
                        ) : (
                          <span className="text-gray-300">
                            <Minus className="w-4 h-4" />
                          </span>
                        )}
                      </div>

                      {/* File Icon & Name */}
                      <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-900 truncate flex-1">
                        {file.original_filename}
                      </span>

                      {/* Delete Button - visible on mobile in top row */}
                      <button
                        onClick={() => handleDeleteUploadedFile(file.id)}
                        disabled={isProcessing}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 flex-shrink-0 md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center"
                        title="Remove file"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Bottom row on mobile: Category, Size, Status */}
                    <div className="flex items-center gap-3 ml-9 md:ml-0 flex-wrap md:flex-nowrap">
                      {/* Category Dropdown */}
                      <div className="flex-1 min-w-[140px] md:w-40 md:flex-none">
                        <select
                          value={file.file_category_id || ""}
                          onChange={(e) =>
                            handleCategoryChange(file.id, e.target.value || null)
                          }
                          className="w-full text-sm border border-gray-300 rounded-lg px-2 py-2 md:py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] md:min-h-0"
                        >
                          <option value="">Select type...</option>
                          {fileCategories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* File Size */}
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {formatFileSize(file.file_size)}
                      </span>

                      {/* Status Badge */}
                      <div className="flex-shrink-0">
                        {!category?.is_billable ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded">
                            <Minus className="w-3 h-3" />
                            N/A
                          </span>
                        ) : !category ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded">
                            Select type
                          </span>
                        ) : status === "processing" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Processing
                          </span>
                        ) : status === "completed" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                            <CheckCircle2 className="w-3 h-3" />
                            Completed
                          </span>
                        ) : status === "failed" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
                            <XCircle className="w-3 h-3" />
                            Failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                            <Clock className="w-3 h-3" />
                            Pending
                          </span>
                        )}
                      </div>

                      {/* Delete Button - visible on desktop */}
                      <button
                        onClick={() => handleDeleteUploadedFile(file.id)}
                        disabled={isProcessing}
                        className="hidden md:flex p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 flex-shrink-0"
                        title="Remove file"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* PENDING UPLOADS LIST */}
      {/* ================================================================== */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900">Files ({files.length})</h3>
            {files.every((f) => f.uploadStatus === "success") && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                All files uploaded
              </span>
            )}
          </div>

          <div className="space-y-2">
            {files.map((file) => (
              <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {file.uploadStatus === "uploading" && (
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  )}
                  {file.uploadStatus === "success" && (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  )}
                  {file.uploadStatus === "failed" && (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  )}
                  <button
                    onClick={() => removeFile(file.id)}
                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* ANALYSIS RESULTS */}
      {/* ================================================================== */}
      {analysisResults.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Analysis Results</h3>

          {analysisResults.map((analysis) => {
            const isEditing = editingAnalysisId === analysis.id;
            const isRemoving = removingAnalysisId === analysis.id;
            const isSaving = savingField === `analysis-${analysis.id}`;
            const currentCert = certificationTypes.find((c) => c.id === (isEditing ? editingAnalysis?.certification_type_id : analysis.certification_type_id));

            const isManualEntry = !analysis.quote_file_id;

            return (
              <div key={analysis.id} className={`bg-white border rounded-lg p-4 ${isManualEntry ? "border-orange-200" : "border-gray-200"}`}>
                {/* File Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className={`w-5 h-5 ${isManualEntry ? "text-orange-500" : "text-gray-400"}`} />
                    <span className="font-medium text-gray-900">{analysis.original_filename}</span>
                    {isManualEntry && (
                      <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
                        Manual Entry
                      </span>
                    )}
                    {analysis.document_type_other && (
                      <span className="text-xs text-gray-500">({analysis.document_type_other})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isEditing && (
                      <>
                        <button
                          onClick={() => startEditAnalysis(analysis)}
                          className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 flex items-center gap-1"
                        >
                          <Edit2 className="w-3 h-3" />
                          Edit
                        </button>
                        {/* Only show Re-analyze if there's a file */}
                        {analysis.quote_file_id && (
                          <button
                            onClick={() => {
                              setSelectedFile({
                                id: analysis.quote_file_id!,
                                original_filename: analysis.original_filename,
                                mime_type: "",
                              });
                              setAnalyzeModalOpen(true);
                            }}
                            className="px-3 py-1.5 text-xs bg-purple-50 text-purple-700 rounded hover:bg-purple-100 flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Re-analyze
                          </button>
                        )}
                        {/* Show Edit in Modal for manual entries or files */}
                        <button
                          onClick={() => {
                            if (analysis.quote_file_id) {
                              setSelectedFile({
                                id: analysis.quote_file_id,
                                original_filename: analysis.original_filename,
                                mime_type: "",
                              });
                            } else {
                              setSelectedFile(null);
                            }
                            setManualEntryModalOpen(true);
                          }}
                          className="px-3 py-1.5 text-xs bg-orange-50 text-orange-700 rounded hover:bg-orange-100 flex items-center gap-1"
                        >
                          <PenTool className="w-3 h-3" />
                          {isManualEntry ? "Edit Entry" : "Manual Entry"}
                        </button>
                        <button
                          onClick={() => handleRemoveAnalysis(analysis.id, analysis.quote_file_id || "", analysis.original_filename)}
                          disabled={isRemoving}
                          className="px-3 py-1.5 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 flex items-center gap-1 disabled:opacity-50"
                        >
                          {isRemoving ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                          Remove
                        </button>
                      </>
                    )}
                    {isEditing && (
                      <>
                        <button
                          onClick={() => saveEditAnalysis(analysis.id)}
                          disabled={isSaving}
                          className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1 disabled:opacity-50"
                        >
                          {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          Save
                        </button>
                        <button
                          onClick={cancelEditAnalysis}
                          className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1"
                        >
                          <X className="w-3 h-3" />
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Analysis Data Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Detected Language */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Detected Language</p>
                    {isEditing ? (
                      <select
                        value={editingAnalysis?.detected_language || ""}
                        onChange={(e) => setEditingAnalysis({ ...editingAnalysis, detected_language: e.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      >
                        {languages.map((lang) => (
                          <option key={lang.id} value={lang.code}>{lang.name}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="font-medium text-gray-900">{analysis.detected_language}</p>
                    )}
                  </div>

                  {/* Document Type */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Document Type</p>
                    {isEditing ? (
                      <select
                        value={editingAnalysis?.detected_document_type || ""}
                        onChange={(e) => setEditingAnalysis({ ...editingAnalysis, detected_document_type: e.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      >
                        {documentTypes.map((dt) => (
                          <option key={dt.id} value={dt.code}>{dt.name}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="font-medium text-gray-900">{analysis.detected_document_type}</p>
                    )}
                  </div>

                  {/* Complexity */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Complexity</p>
                    {isEditing ? (
                      <select
                        value={editingAnalysis?.assessed_complexity || ""}
                        onChange={(e) => setEditingAnalysis({ ...editingAnalysis, assessed_complexity: e.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    ) : (
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getComplexityColor(analysis.assessed_complexity)}`}>
                        {analysis.assessed_complexity}
                      </span>
                    )}
                  </div>

                  {/* Multiplier (calculated from complexity during edit) */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Multiplier</p>
                    {isEditing ? (
                      <p className="font-medium text-gray-900">
                        {(() => {
                          const complexityMultipliers: Record<string, number> = {
                            easy: 1.0, low: 1.0, medium: 1.15, hard: 1.25, high: 1.25
                          };
                          const mult = complexityMultipliers[editingAnalysis?.assessed_complexity?.toLowerCase() || "medium"] || 1.0;
                          return `${mult.toFixed(2)}x`;
                        })()}
                      </p>
                    ) : (
                      <p className="font-medium text-gray-900">{analysis.complexity_multiplier?.toFixed(2)}x</p>
                    )}
                  </div>

                  {/* Word Count */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Word Count</p>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editingAnalysis?.word_count || 0}
                        onChange={(e) => setEditingAnalysis({ ...editingAnalysis, word_count: parseInt(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      />
                    ) : (
                      <p className="font-medium text-gray-900">{analysis.word_count?.toLocaleString()}</p>
                    )}
                  </div>

                  {/* Page Count */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Pages</p>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editingAnalysis?.page_count || 0}
                        onChange={(e) => setEditingAnalysis({ ...editingAnalysis, page_count: parseInt(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      />
                    ) : (
                      <p className="font-medium text-gray-900">{analysis.page_count}</p>
                    )}
                  </div>

                  {/* Billable Pages */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Billable Pages</p>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.1"
                        value={editingAnalysis?.billable_pages || 0}
                        onChange={(e) => setEditingAnalysis({ ...editingAnalysis, billable_pages: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      />
                    ) : (
                      <p className="font-medium text-gray-900">{analysis.billable_pages}</p>
                    )}
                  </div>

                  {/* Line Total (calculated in real-time during edit) */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Line Total</p>
                    {isEditing ? (
                      <p className="font-medium text-blue-600">
                        ${(() => {
                          const billablePages = editingAnalysis?.billable_pages || analysis.billable_pages || 1;
                          const baseRate = analysis.base_rate || 65;
                          const langMultiplier = translationDetails?.languageMultiplier || 1.0;
                          const complexityMultipliers: Record<string, number> = {
                            easy: 1.0, low: 1.0, medium: 1.15, hard: 1.25, high: 1.25
                          };
                          const complexityMult = complexityMultipliers[editingAnalysis?.assessed_complexity?.toLowerCase() || "medium"] || 1.0;
                          const rawTotal = billablePages * baseRate * langMultiplier * complexityMult;
                          const roundedTotal = Math.ceil(rawTotal / 2.5) * 2.5;
                          return roundedTotal.toFixed(2);
                        })()}
                      </p>
                    ) : (
                      <p className="font-medium text-blue-600">${Number(analysis.line_total || 0).toFixed(2)}</p>
                    )}
                  </div>
                </div>

                {/* Document Certification */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Document Certification</p>
                      {isEditing ? (
                        <select
                          value={editingAnalysis?.certification_type_id || ""}
                          onChange={(e) => setEditingAnalysis({ ...editingAnalysis, certification_type_id: e.target.value })}
                          className="px-2 py-1.5 border border-gray-300 rounded text-sm"
                        >
                          <option value="">No Certification</option>
                          {certificationTypes.map((ct) => (
                            <option key={ct.id} value={ct.id}>
                              {ct.name} - ${Number(ct.price).toFixed(2)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="font-medium text-gray-900">
                          {currentCert ? `${currentCert.name} - $${Number(currentCert.price).toFixed(2)}` : "No certification"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================================================================== */}
      {/* QUOTE-LEVEL CERTIFICATION PANEL */}
      {/* ================================================================== */}
      {quoteId && analysisResults.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <button
            onClick={() => setCertificationExpanded(!certificationExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-t-lg"
          >
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-gray-900">Quote Certification</h3>
            </div>
            {certificationExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {certificationExpanded && (
            <div className="px-4 py-4 border-t border-gray-200 space-y-4">
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded">
                <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-900">
                  This will apply the selected certification to <strong>all {analysisResults.length} document(s)</strong> in this quote.
                </p>
              </div>

              {!editingCertification ? (
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Current Certification:</p>
                    <p className="font-semibold text-gray-900">
                      {certificationTypes.find((c) => c.id === selectedCertificationId)?.name || "Not Set"}
                    </p>
                    {selectedCertificationId && (
                      <p className="text-sm text-purple-700 mt-1">
                        ${Number(certificationTypes.find((c) => c.id === selectedCertificationId)?.price || 0).toFixed(2)} per document
                        {" · "}
                        Total: ${(Number(certificationTypes.find((c) => c.id === selectedCertificationId)?.price || 0) * analysisResults.length).toFixed(2)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setEditingCertification(true)}
                    className="px-3 py-2 text-blue-700 hover:bg-blue-50 rounded border border-blue-300 flex items-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
              ) : (
                <div className="space-y-4 bg-gray-50 p-4 rounded border border-gray-200">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Select Certification Type
                    </label>
                    <select
                      value={selectedCertificationId || ""}
                      onChange={(e) => setSelectedCertificationId(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      disabled={savingCertification}
                    >
                      <option value="">-- Select Certification --</option>
                      {certificationTypes.map((cert) => (
                        <option key={cert.id} value={cert.id}>
                          {cert.name} - ${Number(cert.price).toFixed(2)} {cert.is_default ? "(Default)" : ""}
                        </option>
                      ))}
                    </select>

                    {selectedCertificationId && (
                      <div className="mt-3 p-3 bg-white border border-gray-200 rounded">
                        <p className="text-sm font-medium text-purple-700">
                          Cost per document: ${Number(certificationTypes.find((c) => c.id === selectedCertificationId)?.price || 0).toFixed(2)}
                        </p>
                        <p className="text-sm font-semibold text-gray-900 mt-1">
                          Total for {analysisResults.length} document{analysisResults.length !== 1 ? "s" : ""}:{" "}
                          <span className="text-purple-700">
                            ${(Number(certificationTypes.find((c) => c.id === selectedCertificationId)?.price || 0) * analysisResults.length).toFixed(2)}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={saveQuoteCertification}
                      disabled={savingCertification || !selectedCertificationId}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {savingCertification ? "Saving..." : "Save Changes"}
                    </button>
                    <button
                      onClick={() => setEditingCertification(false)}
                      disabled={savingCertification}
                      className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* HELPER TEXT */}
      {/* ================================================================== */}
      {uploadedFiles.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Only "To Translate" files will be analyzed and priced.
            Reference materials, glossaries, and style guides are for translator reference only.
          </p>
        </div>
      )}

      {/* ================================================================== */}
      {/* NOTES */}
      {/* ================================================================== */}
      <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-600">
        <p className="font-medium text-gray-700 mb-1">Note:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Files are optional - you can create a quote without uploading files</li>
          <li>Set file category to "To Translate" for documents that need translation</li>
          <li>Select files and click "Analyze Selected" to run AI analysis on chosen files</li>
          <li>Use "Remove" to clear analysis and re-analyze or enter data manually</li>
          <li>All analysis fields are editable by staff</li>
        </ul>
      </div>

      {/* ================================================================== */}
      {/* MODALS */}
      {/* ================================================================== */}
      {selectedFile && (
        <AnalyzeDocumentModal
          isOpen={analyzeModalOpen}
          onClose={() => {
            setAnalyzeModalOpen(false);
            setSelectedFile(null);
          }}
          file={selectedFile}
          quoteId={quoteId!}
          onAnalysisComplete={() => {
            fetchAnalysisResults();
            onPricingRefresh?.();
          }}
        />
      )}

      {/* Manual Entry Modal - works with or without a file */}
      <ManualEntryModal
        isOpen={manualEntryModalOpen}
        onClose={() => {
          setManualEntryModalOpen(false);
          setSelectedFile(null);
        }}
        file={selectedFile}
        quoteId={quoteId!}
        staffId={staffId}
        onSaveComplete={() => {
          fetchAnalysisResults();
          fetchUploadedFiles();
          onPricingRefresh?.();
        }}
      />
    </div>
  );
}
