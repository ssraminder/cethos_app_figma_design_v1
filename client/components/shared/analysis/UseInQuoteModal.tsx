import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types (local to this component)
// ---------------------------------------------------------------------------

interface DocumentCertification {
  index: number;
  subDocumentType: string;
  subDocumentHolderName: string;
  certificationTypeId: string;
  certificationTypeName: string;
  certificationPrice: number;
}

interface PricingRow {
  analysisId: string;
  fileId: string;
  originalFilename: string;
  documentType: string;
  wordCount: number;
  pageCount: number;
  documentCount: number;
  billablePages: number;
  billablePagesOverridden: boolean;
  complexity: "easy" | "medium" | "hard";
  complexityMultiplier: number;
  baseRate: number;
  baseRateOverridden: boolean;
  defaultCertTypeId: string;
  defaultCertTypeName: string;
  defaultCertUnitPrice: number;
  documentCertifications: DocumentCertification[];
  hasPerDocCertOverrides: boolean;
  certificationCost: number;
  translationCost: number;
  lineTotal: number;
}

interface AnalysisJob {
  id: string;
  status: string;
  totalFiles?: number;
  completedFiles?: number;
  failedFiles?: number;
  totalDocumentsFound?: number;
  startedAt?: string;
  completedAt?: string;
  staffName?: string;
}

interface AnalysisResult {
  id: string;
  fileId: string;
  originalFilename: string;
  fileGroupId: string | null;
  chunkCount: number;
  documentType: string;
  documentTypeConfidence: number;
  holderName: string;
  holderNameNormalized: string;
  language: string;
  languageName: string;
  issuingCountry: string;
  issuingCountryCode: string;
  issuingAuthority: string;
  documentDate: string | null;
  documentNumber: string | null;
  wordCount: number;
  pageCount: number;
  billablePages: number;
  complexity: "easy" | "medium" | "hard";
  complexityConfidence: number;
  complexityFactors: string[];
  complexityReasoning: string;
  documentCount: number;
  subDocuments: Array<{
    type: string;
    holderName: string;
    pageRange: string;
    language: string;
  }> | null;
  actionableItems: Array<{
    type: "warning" | "note" | "suggestion";
    message: string;
  }>;
  processingStatus: "completed" | "failed";
  errorMessage: string | null;
}

interface Language {
  id: string;
  name: string;
  code: string;
  price_multiplier: number;
  is_active: boolean;
}

interface IntendedUse {
  id: string;
  name: string;
  description: string | null;
  default_certification_type_id: string | null;
  is_active: boolean;
}

interface Customer {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  customer_type: "individual" | "business";
  company_name: string | null;
}

interface UseInQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  pricingRows: PricingRow[];
  analysisJob: AnalysisJob;
  batchId: string;
  analysisResults: AnalysisResult[];
  onQuoteCreated: (quoteId: string, quoteNumber: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectMostCommonLanguage(results: AnalysisResult[]): string {
  const langCounts: Record<string, number> = {};
  results
    .filter((r) => r.processingStatus === "completed")
    .forEach((r) => {
      if (r.language) {
        langCounts[r.language] = (langCounts[r.language] || 0) + 1;
      }
    });
  const entries = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] || "";
}

function detectMostCommonCountry(results: AnalysisResult[]): string {
  const countryCounts: Record<string, number> = {};
  results
    .filter((r) => r.processingStatus === "completed" && r.issuingCountry)
    .forEach((r) => {
      countryCounts[r.issuingCountry] =
        (countryCounts[r.issuingCountry] || 0) + 1;
    });
  const entries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] || "";
}

// ---------------------------------------------------------------------------
// UseInQuoteModal
// ---------------------------------------------------------------------------

export default function UseInQuoteModal({
  isOpen,
  onClose,
  pricingRows,
  analysisJob,
  batchId,
  analysisResults,
  onQuoteCreated,
}: UseInQuoteModalProps) {
  // Form state
  const [selectedSourceLanguageId, setSelectedSourceLanguageId] =
    useState<string>("");
  const [selectedTargetLanguageId, setSelectedTargetLanguageId] =
    useState<string>("");
  const [selectedIntendedUseId, setSelectedIntendedUseId] =
    useState<string>("");
  const [countryOfIssue, setCountryOfIssue] = useState<string>("");
  const [customerNote, setCustomerNote] = useState<string>("");

  // Customer state
  const [customerSearch, setCustomerSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [isSearching, setIsSearching] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({
    fullName: "",
    email: "",
    phone: "",
    customerType: "individual" as "individual" | "business",
    companyName: "",
  });
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  // Reference data
  const [languages, setLanguages] = useState<Language[]>([]);
  const [intendedUses, setIntendedUses] = useState<IntendedUse[]>([]);
  const [refDataLoaded, setRefDataLoaded] = useState(false);

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI-detected hints
  const [aiDetectedSourceLang, setAiDetectedSourceLang] = useState(false);
  const [aiDetectedCountry, setAiDetectedCountry] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Reference data fetch
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) {
      // Reset on close
      setSelectedSourceLanguageId("");
      setSelectedTargetLanguageId("");
      setSelectedIntendedUseId("");
      setCountryOfIssue("");
      setCustomerNote("");
      setCustomerSearch("");
      setSearchResults([]);
      setSelectedCustomer(null);
      setShowNewCustomerForm(false);
      setNewCustomerData({
        fullName: "",
        email: "",
        phone: "",
        customerType: "individual",
        companyName: "",
      });
      setNewCustomerError(null);
      setError(null);
      setAiDetectedSourceLang(false);
      setAiDetectedCountry(false);
      setRefDataLoaded(false);
      return;
    }

    const fetchReferenceData = async () => {
      const [langsRes, usesRes] = await Promise.all([
        supabase
          .from("languages")
          .select("id, name, code, price_multiplier, is_active")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("intended_uses")
          .select(
            "id, name, description, default_certification_type_id, is_active"
          )
          .eq("is_active", true)
          .order("sort_order"),
      ]);

      const langs = langsRes.data || [];
      const uses = usesRes.data || [];

      setLanguages(langs);
      setIntendedUses(uses);

      // Pre-fill from AI detection
      const detectedCode = detectMostCommonLanguage(analysisResults);
      if (detectedCode && langs.length > 0) {
        const match = langs.find(
          (l: Language) => l.code.toLowerCase() === detectedCode.toLowerCase()
        );
        if (match) {
          setSelectedSourceLanguageId(match.id);
          setAiDetectedSourceLang(true);
        }
      }

      const detectedCountry = detectMostCommonCountry(analysisResults);
      if (detectedCountry) {
        setCountryOfIssue(detectedCountry);
        setAiDetectedCountry(true);
      }

      setRefDataLoaded(true);
    };

    fetchReferenceData();
  }, [isOpen, analysisResults]);

  // -------------------------------------------------------------------------
  // Customer search
  // -------------------------------------------------------------------------

  const performSearch = useCallback(async (query: string) => {
    setIsSearching(true);
    try {
      const searchTerm = `%${query}%`;
      const { data, error: searchErr } = await supabase
        .from("customers")
        .select("id, full_name, email, phone, customer_type, company_name")
        .or(
          `full_name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm},company_name.ilike.${searchTerm}`
        )
        .limit(10);

      if (searchErr) {
        console.error("Customer search error:", searchErr);
        setSearchResults([]);
      } else {
        setSearchResults((data as Customer[]) || []);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (customerSearch.length < 2) {
      setSearchResults([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      performSearch(customerSearch.trim());
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [customerSearch, performSearch]);

  // -------------------------------------------------------------------------
  // Add new customer
  // -------------------------------------------------------------------------

  const handleAddCustomer = async () => {
    // Validation
    if (!newCustomerData.fullName.trim()) {
      setNewCustomerError("Full name is required");
      return;
    }
    if (!newCustomerData.email.trim() && !newCustomerData.phone.trim()) {
      setNewCustomerError("Email or phone is required");
      return;
    }
    if (
      newCustomerData.customerType === "business" &&
      !newCustomerData.companyName.trim()
    ) {
      setNewCustomerError("Company name is required for business customers");
      return;
    }

    setIsCreatingCustomer(true);
    setNewCustomerError(null);

    try {
      const { data: newCust, error: insertErr } = await supabase
        .from("customers")
        .insert({
          full_name: newCustomerData.fullName.trim(),
          email: newCustomerData.email.trim() || null,
          phone: newCustomerData.phone.trim() || null,
          customer_type: newCustomerData.customerType,
          company_name: newCustomerData.companyName.trim() || null,
        })
        .select()
        .single();

      if (insertErr) {
        if (insertErr.code === "23505") {
          setNewCustomerError(
            "A customer with this email already exists"
          );
        } else {
          setNewCustomerError(insertErr.message);
        }
        return;
      }

      setSelectedCustomer(newCust as Customer);
      setShowNewCustomerForm(false);
      setCustomerSearch("");
      setSearchResults([]);
      toast.success(`Customer "${newCust.full_name}" created`);
    } catch (err: unknown) {
      setNewCustomerError(
        err instanceof Error ? err.message : "Failed to create customer"
      );
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  // -------------------------------------------------------------------------
  // Submit — create quote
  // -------------------------------------------------------------------------

  const handleCreateQuote = async () => {
    setError(null);

    if (!selectedSourceLanguageId) {
      setError("Source language is required");
      return;
    }
    if (!selectedTargetLanguageId) {
      setError("Target language is required");
      return;
    }
    if (selectedSourceLanguageId === selectedTargetLanguageId) {
      setError("Source and target languages must be different");
      return;
    }
    if (!selectedCustomer) {
      setError("Please select or create a customer");
      return;
    }

    setIsSubmitting(true);

    try {
      const staffSession = JSON.parse(
        localStorage.getItem("staffSession") || "{}"
      );

      const requestBody = {
        jobId: analysisJob.id,
        analysisIds: pricingRows.map((r) => r.analysisId),
        pricingOverrides: pricingRows.map((r) => ({
          analysisId: r.analysisId,
          billablePages: r.billablePages,
          complexity: r.complexity,
          complexityMultiplier: r.complexityMultiplier,
          baseRate: r.baseRate,
          documentCertifications: r.documentCertifications.map((dc) => ({
            index: dc.index,
            certificationTypeId: dc.certificationTypeId,
            certificationPrice: dc.certificationPrice,
          })),
        })),
        quoteDetails: {
          sourceLanguageId: selectedSourceLanguageId,
          targetLanguageId: selectedTargetLanguageId,
          intendedUseId: selectedIntendedUseId || null,
          countryOfIssue: countryOfIssue || null,
          customerId: selectedCustomer.id,
          customerNote: customerNote.trim() || null,
        },
        staffId: staffSession.staffId,
        staffName: staffSession.staffName,
        staffEmail: staffSession.staffEmail,
      };

      const response = await supabase.functions.invoke(
        "create-quote-from-analysis",
        { body: requestBody }
      );

      if (response.error) throw new Error(response.error.message);

      const data = response.data as Record<string, unknown>;

      if (!data.success) {
        throw new Error((data.error as string) || "Failed to create quote");
      }

      toast.success(
        `Quote ${data.quoteNumber || ""} created successfully`
      );
      onQuoteCreated(data.quoteId as string, data.quoteNumber as string);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to create quote"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Pricing summary calculations
  // -------------------------------------------------------------------------

  const translationSubtotal = pricingRows.reduce(
    (sum, r) => sum + r.translationCost,
    0
  );
  const totalDocuments = pricingRows.reduce(
    (sum, r) => sum + r.documentCount,
    0
  );
  const certificationTotal = pricingRows.reduce(
    (sum, r) => sum + r.certificationCost,
    0
  );
  const estimatedTotal = translationSubtotal + certificationTotal;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-[640px] w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Create Quote from Analysis
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* --- Translation Details --- */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Translation Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Source Language */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Source Language <span className="text-red-500">*</span>
                  {aiDetectedSourceLang && (
                    <span className="ml-1 text-xs text-blue-600 font-normal">
                      (AI detected)
                    </span>
                  )}
                </label>
                <select
                  value={selectedSourceLanguageId}
                  onChange={(e) => {
                    setSelectedSourceLanguageId(e.target.value);
                    if (aiDetectedSourceLang)
                      setAiDetectedSourceLang(false);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select language...</option>
                  {languages.map((lang) => (
                    <option key={lang.id} value={lang.id}>
                      {lang.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Language */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Language <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedTargetLanguageId}
                  onChange={(e) =>
                    setSelectedTargetLanguageId(e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select language...</option>
                  {languages.map((lang) => (
                    <option key={lang.id} value={lang.id}>
                      {lang.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Intended Use */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Intended Use
                </label>
                <select
                  value={selectedIntendedUseId}
                  onChange={(e) =>
                    setSelectedIntendedUseId(e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select intended use...</option>
                  {intendedUses.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Country of Issue */}
            <div className="mt-4 max-w-[calc(50%-0.5rem)]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Country of Issue
                {aiDetectedCountry && (
                  <span className="ml-1 text-xs text-blue-600 font-normal">
                    (AI detected)
                  </span>
                )}
              </label>
              <input
                type="text"
                value={countryOfIssue}
                onChange={(e) => {
                  setCountryOfIssue(e.target.value);
                  if (aiDetectedCountry) setAiDetectedCountry(false);
                }}
                placeholder="e.g. Mexico, Canada..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* ── Customer Note ── */}
          <div className="border-t border-gray-200 pt-4 mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Customer Note
              <span className="text-xs text-gray-400 ml-1">
                (visible to customer on quote)
              </span>
            </label>
            <textarea
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              placeholder="e.g. Rush delivery included per your request. Please review and approve at your earliest convenience."
              rows={3}
              maxLength={1000}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
            />
            <div className="text-xs text-gray-400 text-right mt-1">
              {customerNote.length}/1000
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200" />

          {/* --- Customer --- */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Customer <span className="text-red-500">*</span>
            </h3>

            {selectedCustomer ? (
              /* Selected customer card */
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="font-medium text-gray-900 text-sm">
                      {selectedCustomer.full_name}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerSearch("");
                      setSearchResults([]);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Change
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-1 ml-6">
                  {[
                    selectedCustomer.email,
                    selectedCustomer.phone,
                    selectedCustomer.customer_type === "business"
                      ? `Business: ${selectedCustomer.company_name}`
                      : "Individual",
                  ]
                    .filter(Boolean)
                    .join(" \u00B7 ")}
                </p>
              </div>
            ) : (
              /* Search box + results */
              <div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                  )}
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search by name, email, or phone..."
                    className="w-full pl-9 pr-9 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Search Results */}
                {(searchResults.length > 0 || customerSearch.length >= 2) && (
                  <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
                    {searchResults.map((cust) => (
                      <button
                        key={cust.id}
                        onClick={() => {
                          setSelectedCustomer(cust);
                          setCustomerSearch("");
                          setSearchResults([]);
                          setShowNewCustomerForm(false);
                        }}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                      >
                        <div className="text-sm font-medium text-gray-900">
                          {cust.full_name}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {[
                            cust.email,
                            cust.phone,
                            cust.customer_type === "business" &&
                              cust.company_name
                              ? `Business: ${cust.company_name}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" \u00B7 ")}
                        </div>
                      </button>
                    ))}

                    {searchResults.length === 0 &&
                      customerSearch.length >= 2 &&
                      !isSearching && (
                        <div className="px-3 py-3 text-sm text-gray-500 text-center">
                          No customers found
                        </div>
                      )}

                    {/* Add New Customer button */}
                    {!showNewCustomerForm && (
                      <button
                        onClick={() => {
                          setShowNewCustomerForm(true);
                          setNewCustomerData((prev) => ({
                            ...prev,
                            fullName:
                              customerSearch.length >= 2
                                ? customerSearch
                                : "",
                          }));
                        }}
                        className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-t border-gray-200 text-sm font-medium text-blue-600 flex items-center gap-1.5 transition-colors"
                      >
                        <UserPlus className="w-4 h-4" />
                        Add New Customer
                      </button>
                    )}
                  </div>
                )}

                {/* New Customer Inline Form */}
                {showNewCustomerForm && (
                  <div className="mt-3 border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">
                      New Customer
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Full Name{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newCustomerData.fullName}
                          onChange={(e) =>
                            setNewCustomerData((prev) => ({
                              ...prev,
                              fullName: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Email
                          </label>
                          <input
                            type="email"
                            value={newCustomerData.email}
                            onChange={(e) =>
                              setNewCustomerData((prev) => ({
                                ...prev,
                                email: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Phone
                          </label>
                          <input
                            type="tel"
                            value={newCustomerData.phone}
                            onChange={(e) =>
                              setNewCustomerData((prev) => ({
                                ...prev,
                                phone: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Type
                          </label>
                          <select
                            value={newCustomerData.customerType}
                            onChange={(e) =>
                              setNewCustomerData((prev) => ({
                                ...prev,
                                customerType: e.target.value as
                                  | "individual"
                                  | "business",
                              }))
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="individual">Individual</option>
                            <option value="business">Business</option>
                          </select>
                        </div>
                        {newCustomerData.customerType === "business" && (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Company Name{" "}
                              <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={newCustomerData.companyName}
                              onChange={(e) =>
                                setNewCustomerData((prev) => ({
                                  ...prev,
                                  companyName: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                        )}
                      </div>

                      {newCustomerError && (
                        <p className="text-xs text-red-600">
                          {newCustomerError}
                        </p>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => {
                            setShowNewCustomerForm(false);
                            setNewCustomerError(null);
                          }}
                          className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddCustomer}
                          disabled={isCreatingCustomer}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
                        >
                          {isCreatingCustomer && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          )}
                          Add Customer
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200" />

          {/* --- Pricing Summary --- */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Pricing Summary
            </h4>
            <div className="text-sm text-gray-700 space-y-0.5">
              <p>
                Files: {pricingRows.length} &middot; Documents:{" "}
                {totalDocuments} &middot; Translation: $
                {translationSubtotal.toFixed(2)}
              </p>
              <p>
                Certification: ${certificationTotal.toFixed(2)}
                {" \u00B7 "}
                <span className="font-semibold text-gray-900">
                  Est. Total: ${estimatedTotal.toFixed(2)}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          {error && (
            <div className="flex items-start gap-2 mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateQuote}
              disabled={isSubmitting || !refDataLoaded}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating Quote...
                </>
              ) : (
                <>
                  Create Quote
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
