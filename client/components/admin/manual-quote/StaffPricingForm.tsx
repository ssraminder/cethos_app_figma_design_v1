import { useState, useEffect, useMemo } from "react";
import { AlertCircle, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface FilePrice {
  fileId: string;
  fileName: string;
  languageId: string;
  documentTypeId?: string;
  pageCount: number;
  billablePages: number;
  complexity: "low" | "medium" | "high";
  certificationTypeId?: string;
  baseRate: number;
  languageMultiplier: number;
  complexityMultiplier: number;
  translationCost: number;
  certificationCost: number;
  lineTotal: number;
}

export interface QuotePricing {
  filePrices: FilePrice[];
  documentSubtotal: number;
  isRush: boolean;
  rushFee: number;
  deliveryOptionId?: string;
  deliveryFee: number;
  hasDiscount: boolean;
  discountType?: "fixed" | "percentage";
  discountValue?: number;
  discountAmount: number;
  discountReason?: string;
  hasSurcharge: boolean;
  surchargeType?: "fixed" | "percentage";
  surchargeValue?: number;
  surchargeAmount: number;
  surchargeReason?: string;
  preTaxTotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

interface DeliveryOption {
  id: string;
  code: string;
  name: string;
  price: number;
  estimated_days: number;
}

interface AnalysisResultRaw {
  id: string;
  quote_file_id: string | null;
  manual_filename: string | null;
  detected_language: string;
  detected_document_type: string;
  assessed_complexity: string;
  complexity_multiplier: number;
  word_count: number;
  page_count: number;
  billable_pages: number;
  base_rate: number;
  line_total: number;
  certification_type_id: string | null;
  certification_price: number | null;
  quote_files: {
    original_filename: string;
  } | null;
}

interface AnalysisResult extends Omit<AnalysisResultRaw, 'quote_files'> {
  quote_files: {
    original_filename: string;
  } | null;
}

interface StaffPricingFormProps {
  quoteId: string;
  value: QuotePricing;
  onChange: (pricing: QuotePricing) => void;
  refreshKey?: number; // Increment to trigger re-fetch of analysis data
}

const DEFAULT_TAX_RATE = 0.05; // 5% GST fallback

export default function StaffPricingForm({
  quoteId,
  value,
  onChange,
  refreshKey = 0,
}: StaffPricingFormProps) {
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [taxRate, setTaxRate] = useState(DEFAULT_TAX_RATE);
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);

  // Quote details for display (intended use, certification type, languages)
  const [quoteDetails, setQuoteDetails] = useState<{
    intendedUse: string | null;
    certificationTypeName: string | null;
    sourceLanguage: string | null;
    targetLanguage: string | null;
    languageMultiplier: number;
  } | null>(null);

  // Load delivery options
  useEffect(() => {
    const loadDeliveryOptions = async () => {
      const { data } = await supabase
        .from("delivery_options")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (data) setDeliveryOptions(data);
      setLoading(false);
    };

    loadDeliveryOptions();
  }, []);

  // Load analysis results, quote details, and settings
  useEffect(() => {
    const loadData = async () => {
      console.log(`📊 [PRICING] Loading data for quote ${quoteId}, refreshKey: ${refreshKey}`);
      setSettingsLoading(true);

      // Fetch analysis results for this quote (LEFT JOIN to include manual entries without files)
      const { data: analysisData, error: analysisError } = await supabase
        .from("ai_analysis_results")
        .select(
          `
          id,
          quote_file_id,
          manual_filename,
          detected_language,
          detected_document_type,
          assessed_complexity,
          complexity_multiplier,
          word_count,
          page_count,
          billable_pages,
          base_rate,
          line_total,
          certification_type_id,
          certification_price,
          quote_files(original_filename)
        `
        )
        .eq("quote_id", quoteId);

      if (analysisError) {
        console.error("❌ [PRICING] Error fetching analysis:", analysisError);
      }

      if (analysisData) {
        console.log(`✅ [PRICING] Fetched ${analysisData.length} analysis results:`, analysisData);
        setAnalysisResults(analysisData as unknown as AnalysisResult[]);
      }

      // Fetch quote details (intended use, languages) - certification is through junction table
      // language_multiplier_override is on quotes, base multiplier is on languages table
      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .select(`
          intended_use:intended_uses(name),
          source_language:languages!quotes_source_language_id_fkey(name, multiplier),
          target_language:languages!quotes_target_language_id_fkey(name),
          language_multiplier_override
        `)
        .eq("id", quoteId)
        .single();

      if (quoteError) {
        console.error("❌ [PRICING] Error fetching quote details:", quoteError);
      }

      // Fetch certification types through quote_certifications junction table
      const { data: certData } = await supabase
        .from("quote_certifications")
        .select(`
          certification_type:certification_types(name)
        `)
        .eq("quote_id", quoteId);

      // Get the first certification type name (if any)
      const certificationTypeName = certData?.[0]?.certification_type
        ? (certData[0].certification_type as any)?.name
        : null;

      if (quoteData) {
        console.log(`✅ [PRICING] Fetched quote details:`, quoteData);
        // Use override if set, otherwise use source language's multiplier
        const sourceLanguage = quoteData.source_language as any;
        const languageMultiplier = quoteData.language_multiplier_override
          ?? sourceLanguage?.multiplier
          ?? 1.0;
        setQuoteDetails({
          intendedUse: (quoteData.intended_use as any)?.name || null,
          certificationTypeName: certificationTypeName,
          sourceLanguage: sourceLanguage?.name || null,
          targetLanguage: (quoteData.target_language as any)?.name || null,
          languageMultiplier: languageMultiplier,
        });
      }

      // Fetch tax rate from app_settings (use maybeSingle to handle missing setting)
      const { data: settingsData } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .eq("setting_key", "default_tax_rate")
        .maybeSingle();

      if (settingsData) {
        setTaxRate(parseFloat(settingsData.setting_value) || DEFAULT_TAX_RATE);
      }

      setSettingsLoading(false);
    };

    if (quoteId) {
      loadData();
    }
  }, [quoteId, refreshKey]); // Re-fetch when refreshKey changes

  // Calculate document subtotal from ai_analysis_results (read-only from database)
  const documentSubtotal = useMemo(() => {
    return analysisResults.reduce((sum, result) => {
      return sum + (parseFloat(result.line_total as any) || 0);
    }, 0);
  }, [analysisResults]);

  // Recalculate quote-level totals when subtotal or adjustments change
  useEffect(() => {
    if (!settingsLoading) {
      recalculateTotals(value);
    }
  }, [documentSubtotal, settingsLoading]);

  const handleQuoteLevelChange = (
    field: keyof Omit<QuotePricing, "filePrices">,
    fieldValue: any
  ) => {
    const newPricing = { ...value, [field]: fieldValue };
    recalculateTotals(newPricing);
  };

  const recalculateTotals = (pricing: Partial<QuotePricing>) => {
    const subtotal = documentSubtotal;

    // Rush fee (30% of subtotal)
    const rushFee = pricing.isRush
      ? Math.round(subtotal * 0.3 * 100) / 100
      : 0;

    // Delivery fee
    const deliveryOption = deliveryOptions.find(
      (d) => d.id === pricing.deliveryOptionId
    );
    const deliveryFee = deliveryOption
      ? parseFloat(deliveryOption.price as any)
      : 0;

    // Discount
    let discountAmount = 0;
    if (pricing.hasDiscount && pricing.discountValue) {
      if (pricing.discountType === "percentage") {
        discountAmount =
          Math.round(subtotal * (pricing.discountValue / 100) * 100) / 100;
      } else {
        discountAmount = pricing.discountValue;
      }
    }

    // Surcharge
    let surchargeAmount = 0;
    if (pricing.hasSurcharge && pricing.surchargeValue) {
      if (pricing.surchargeType === "percentage") {
        surchargeAmount =
          Math.round(subtotal * (pricing.surchargeValue / 100) * 100) / 100;
      } else {
        surchargeAmount = pricing.surchargeValue;
      }
    }

    // Pre-tax total
    const preTaxTotal =
      Math.round(
        (subtotal + rushFee + deliveryFee - discountAmount + surchargeAmount) *
          100
      ) / 100;

    // Tax
    const currentTaxRate = pricing.taxRate ?? taxRate;
    const taxAmount = Math.round(preTaxTotal * currentTaxRate * 100) / 100;

    // Total
    const total = Math.round((preTaxTotal + taxAmount) * 100) / 100;

    const newPricing: QuotePricing = {
      ...value,
      ...pricing,
      documentSubtotal: Math.round(subtotal * 100) / 100,
      rushFee,
      deliveryFee,
      discountAmount,
      surchargeAmount,
      preTaxTotal,
      taxRate: currentTaxRate,
      taxAmount,
      total,
      // Map analysis results to filePrices for compatibility (handles manual entries)
      filePrices: analysisResults.map((r) => ({
        fileId: r.quote_file_id || r.id, // Use analysis ID as fallback for manual entries
        fileName: r.manual_filename || r.quote_files?.original_filename || "Unknown",
        languageId: "",
        pageCount: r.page_count,
        billablePages: r.billable_pages,
        complexity: (r.assessed_complexity?.toLowerCase() || "low") as
          | "low"
          | "medium"
          | "high",
        certificationTypeId: r.certification_type_id || undefined,
        baseRate: parseFloat(r.base_rate as any),
        languageMultiplier: 1,
        complexityMultiplier: parseFloat(r.complexity_multiplier as any),
        translationCost:
          parseFloat(r.line_total as any) -
          (parseFloat(r.certification_price as any) || 0),
        certificationCost: parseFloat(r.certification_price as any) || 0,
        lineTotal: parseFloat(r.line_total as any),
      })),
    };

    onChange(newPricing);
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity?.toLowerCase()) {
      case "low":
      case "easy":
        return "bg-green-100 text-green-800";
      case "medium":
      case "moderate":
        return "bg-yellow-100 text-yellow-800";
      case "high":
      case "hard":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Helper to get document name for display (handles manual entries)
  const getDocumentName = (item: AnalysisResult) => {
    if (item.manual_filename) {
      return item.manual_filename;
    }
    return item.quote_files?.original_filename || "Unknown Document";
  };

  if (loading || settingsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin mr-2" />
        <p className="text-gray-600">Loading pricing data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Quote Details Summary */}
      {quoteDetails && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Quote Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500 block text-xs">Languages</span>
              <span className="font-medium">
                {quoteDetails.sourceLanguage} → {quoteDetails.targetLanguage}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs">Language Multiplier</span>
              <span className="font-medium">{quoteDetails.languageMultiplier.toFixed(2)}x</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs">Intended Use</span>
              <span className="font-medium">{quoteDetails.intendedUse || "Not specified"}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs">Certification</span>
              <span className="font-medium">{quoteDetails.certificationTypeName || "None"}</span>
            </div>
          </div>
        </div>
      )}

      {/* Per-File Pricing - Read Only */}
      <div className="space-y-4">
        <h3 className="font-semibold text-gray-900">Document Pricing</h3>

        {analysisResults.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  No document analysis found
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  Go back to Step 3 to upload and analyze documents, or continue
                  with quote-level pricing adjustments only.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {analysisResults.map((result) => (
              <div
                key={result.id}
                className="border border-gray-200 rounded-lg p-4 bg-white"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start mb-3 gap-2">
                  <div className="flex items-start gap-3">
                    <FileText className={`w-5 h-5 flex-shrink-0 mt-0.5 ${result.manual_filename && !result.quote_file_id ? "text-blue-500" : "text-gray-400"}`} />
                    <div>
                      <p className="font-medium text-gray-900 flex items-center gap-2">
                        <span>{getDocumentName(result)}</span>
                        {result.manual_filename && !result.quote_file_id && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                            Manual
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {result.detected_language} • {result.detected_document_type} •{" "}
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${getComplexityColor(result.assessed_complexity)}`}>
                          {result.assessed_complexity}
                        </span>{" "}
                        complexity
                      </p>
                    </div>
                  </div>
                  <span className="text-lg font-semibold text-green-600">
                    ${parseFloat(result.line_total as any).toFixed(2)}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 text-sm bg-gray-50 rounded p-3">
                  <div>
                    <span className="text-gray-500 block text-xs">Pages</span>
                    <span className="font-medium">{result.page_count}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">Billable</span>
                    <span className="font-medium">{result.billable_pages}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">Rate</span>
                    <span className="font-medium">
                      ${parseFloat(result.base_rate as any).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">Cert</span>
                    <span className="font-medium">
                      ${(parseFloat(result.certification_price as any) || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {/* Document Subtotal */}
            <div className="flex justify-between items-center pt-3 border-t border-gray-200">
              <span className="font-medium text-gray-700">
                Document Subtotal ({analysisResults.length}{" "}
                {analysisResults.length === 1 ? "file" : "files"}):
              </span>
              <span className="text-xl font-bold text-gray-900">
                ${documentSubtotal.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Quote-Level Adjustments */}
      <div className="bg-gray-50 p-6 rounded-lg space-y-6">
        <h3 className="font-semibold text-gray-900">Quote Summary</h3>

        {/* Document Subtotal */}
        <div className="bg-white p-4 rounded-md border border-gray-200">
          <div className="flex justify-between text-lg font-semibold">
            <span>
              Documents Subtotal ({analysisResults.length}{" "}
              {analysisResults.length === 1 ? "file" : "files"}):
            </span>
            <span>${value.documentSubtotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Rush Service */}
        <div className="space-y-3">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={value.isRush}
              onChange={(e) =>
                handleQuoteLevelChange("isRush", e.target.checked)
              }
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="font-medium text-gray-700">
              Rush Service (30% surcharge)
            </span>
          </label>
          {value.isRush && (
            <div className="ml-7 bg-amber-50 border border-amber-200 rounded-md p-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Rush Fee (30%):</span>
                <span className="font-semibold text-amber-900">
                  +${value.rushFee.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Delivery Option */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Delivery Option
          </label>
          <select
            value={value.deliveryOptionId || ""}
            onChange={(e) =>
              handleQuoteLevelChange("deliveryOptionId", e.target.value)
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select delivery option...</option>
            {deliveryOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name} (${parseFloat(opt.price as any).toFixed(2)},{" "}
                {opt.estimated_days} days)
              </option>
            ))}
          </select>
          {value.deliveryFee > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Delivery Fee:</span>
                <span className="font-semibold text-blue-900">
                  +${value.deliveryFee.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Discount */}
        <div className="space-y-3">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={value.hasDiscount}
              onChange={(e) =>
                handleQuoteLevelChange("hasDiscount", e.target.checked)
              }
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="font-medium text-gray-700">Apply Discount</span>
          </label>
          {value.hasDiscount && (
            <div className="ml-7 space-y-3 bg-green-50 border border-green-200 rounded-md p-3">
              <div className="flex gap-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    checked={value.discountType === "fixed"}
                    onChange={() =>
                      handleQuoteLevelChange("discountType", "fixed")
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Fixed Amount</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    checked={value.discountType === "percentage"}
                    onChange={() =>
                      handleQuoteLevelChange("discountType", "percentage")
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Percentage</span>
                </label>
              </div>
              <input
                type="number"
                min="0"
                max={value.discountType === "percentage" ? "100" : "9999.99"}
                step={value.discountType === "percentage" ? "1" : "0.01"}
                placeholder="Enter amount"
                value={value.discountValue || ""}
                onChange={(e) =>
                  handleQuoteLevelChange(
                    "discountValue",
                    e.target.value ? parseFloat(e.target.value) : undefined
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <textarea
                placeholder="Reason for discount (e.g., loyal customer, promotional offer)"
                maxLength={500}
                value={value.discountReason || ""}
                onChange={(e) =>
                  handleQuoteLevelChange("discountReason", e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                rows={2}
              />
              {value.discountAmount > 0 && (
                <div className="flex justify-between text-sm font-semibold text-green-900 pt-2 border-t border-green-200">
                  <span>Discount Amount:</span>
                  <span>-${value.discountAmount.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Surcharge */}
        <div className="space-y-3">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={value.hasSurcharge}
              onChange={(e) =>
                handleQuoteLevelChange("hasSurcharge", e.target.checked)
              }
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="font-medium text-gray-700">Apply Surcharge</span>
          </label>
          {value.hasSurcharge && (
            <div className="ml-7 space-y-3 bg-orange-50 border border-orange-200 rounded-md p-3">
              <div className="flex gap-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    checked={value.surchargeType === "fixed"}
                    onChange={() =>
                      handleQuoteLevelChange("surchargeType", "fixed")
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Fixed Amount</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    checked={value.surchargeType === "percentage"}
                    onChange={() =>
                      handleQuoteLevelChange("surchargeType", "percentage")
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Percentage</span>
                </label>
              </div>
              <input
                type="number"
                min="0"
                max={value.surchargeType === "percentage" ? "100" : "9999.99"}
                step={value.surchargeType === "percentage" ? "1" : "0.01"}
                placeholder="Enter amount"
                value={value.surchargeValue || ""}
                onChange={(e) =>
                  handleQuoteLevelChange(
                    "surchargeValue",
                    e.target.value ? parseFloat(e.target.value) : undefined
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <textarea
                placeholder="Reason for surcharge (e.g., difficult content, tight deadline)"
                maxLength={500}
                value={value.surchargeReason || ""}
                onChange={(e) =>
                  handleQuoteLevelChange("surchargeReason", e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                rows={2}
              />
              {value.surchargeAmount > 0 && (
                <div className="flex justify-between text-sm font-semibold text-orange-900 pt-2 border-t border-orange-200">
                  <span>Surcharge Amount:</span>
                  <span>+${value.surchargeAmount.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tax Rate */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tax Rate (%)
          </label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={(value.taxRate * 100).toFixed(2)}
            onChange={(e) =>
              handleQuoteLevelChange(
                "taxRate",
                parseFloat(e.target.value) / 100
              )
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-600 mt-1">Default: 5% GST</p>
        </div>

        {/* Totals Summary */}
        <div className="bg-white p-4 rounded-md border border-gray-300 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-700">Pre-tax Total:</span>
            <span className="font-medium">${value.preTaxTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-700">
              Tax ({(value.taxRate * 100).toFixed(1)}%):
            </span>
            <span className="font-medium">${value.taxAmount.toFixed(2)}</span>
          </div>
          <div className="border-t border-gray-300 pt-2 flex justify-between text-lg font-bold text-blue-600">
            <span>TOTAL:</span>
            <span>${value.total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
