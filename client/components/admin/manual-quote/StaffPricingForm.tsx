import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, AlertCircle, DollarSign } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { FileWithAnalysis } from "./StaffFileUploadForm";

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

interface Language {
  id: string;
  code: string;
  name: string;
  native_name: string;
  multiplier: number;
}

interface CertificationType {
  id: string;
  code: string;
  name: string;
  price: number;
}

interface DeliveryOption {
  id: string;
  code: string;
  name: string;
  price: number;
  estimated_days: number;
}

interface DocumentType {
  id: string;
  code: string;
  name: string;
}

interface StaffPricingFormProps {
  quoteId: string;
  files: FileWithAnalysis[];
  value: QuotePricing;
  onChange: (pricing: QuotePricing) => void;
}

const BASE_RATE = 65.0;
const DEFAULT_TAX_RATE = 0.05; // 5% GST for Alberta

const COMPLEXITY_MULTIPLIERS = {
  low: 1.0,
  medium: 1.15,
  high: 1.3,
};

export default function StaffPricingForm({
  quoteId,
  files,
  value,
  onChange,
}: StaffPricingFormProps) {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [certifications, setCertifications] = useState<CertificationType[]>([]);
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Load reference data
  useEffect(() => {
    const loadData = async () => {
      const [langsRes, certRes, deliveryRes, docTypesRes] = await Promise.all([
        supabase
          .from("languages")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("certification_types")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("delivery_options")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("document_types")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
      ]);

      if (langsRes.data) setLanguages(langsRes.data);
      if (certRes.data) setCertifications(certRes.data);
      if (deliveryRes.data) setDeliveryOptions(deliveryRes.data);
      if (docTypesRes.data) setDocumentTypes(docTypesRes.data);
      setLoading(false);
    };

    loadData();
  }, []);

  // Initialize pricing for files
  useEffect(() => {
    if (files.length > 0 && value.filePrices.length === 0) {
      const initialFilePrices = files.map((file) => {
        const language =
          languages.find((l) => l.code === file.detectedLanguageCode) ||
          languages[0];
        const complexity = file.complexity || "low";
        const pageCount = file.pageCount || 1;

        return calculateFilePrice({
          fileId: file.id,
          fileName: file.name,
          languageId: language?.id || "",
          documentTypeId: "",
          pageCount,
          billablePages: pageCount,
          complexity,
          certificationTypeId: certifications[0]?.id || "",
          language: language,
        });
      });

      const newPricing = { ...value, filePrices: initialFilePrices };
      recalculateTotals(newPricing);
    }
  }, [files, languages, certifications]);

  const calculateFilePrice = ({
    fileId,
    fileName,
    languageId,
    documentTypeId,
    pageCount,
    billablePages,
    complexity,
    certificationTypeId,
    language: langOverride,
  }: {
    fileId: string;
    fileName: string;
    languageId: string;
    documentTypeId?: string;
    pageCount: number;
    billablePages: number;
    complexity: "low" | "medium" | "high";
    certificationTypeId?: string;
    language?: Language;
  }): FilePrice => {
    const language = langOverride || languages.find((l) => l.id === languageId);
    const languageMultiplier = language?.multiplier
      ? parseFloat(language.multiplier as any)
      : 1.0;
    const complexityMultiplier =
      COMPLEXITY_MULTIPLIERS[complexity] || COMPLEXITY_MULTIPLIERS.low;
    const certification = certifications.find(
      (c) => c.id === certificationTypeId,
    );
    const certificationCost = certification?.price
      ? parseFloat(certification.price as any)
      : 0;

    const translationCost =
      BASE_RATE * billablePages * languageMultiplier * complexityMultiplier;
    const lineTotal = translationCost + certificationCost;

    return {
      fileId,
      fileName,
      languageId,
      documentTypeId,
      pageCount,
      billablePages,
      complexity,
      certificationTypeId: certificationTypeId || certifications[0]?.id || "",
      baseRate: BASE_RATE,
      languageMultiplier,
      complexityMultiplier,
      translationCost: Math.round(translationCost * 100) / 100,
      certificationCost,
      lineTotal: Math.round(lineTotal * 100) / 100,
    };
  };

  const handleFileFieldChange = (
    fileId: string,
    field: keyof Omit<
      FilePrice,
      | "baseRate"
      | "translationCost"
      | "certificationCost"
      | "lineTotal"
      | "languageMultiplier"
      | "complexityMultiplier"
    >,
    fieldValue: any,
  ) => {
    const newFilePrices = value.filePrices.map((fp) => {
      if (fp.fileId !== fileId) return fp;

      const updated: any = { ...fp, [field]: fieldValue };

      // Recalculate costs when relevant fields change
      const language = languages.find((l) => l.id === updated.languageId);
      const languageMultiplier = language?.multiplier
        ? parseFloat(language.multiplier as any)
        : 1.0;
      const complexityMultiplier =
        COMPLEXITY_MULTIPLIERS[updated.complexity] || 1.0;
      const certification = certifications.find(
        (c) => c.id === updated.certificationTypeId,
      );
      const certificationCost = certification?.price
        ? parseFloat(certification.price as any)
        : 0;

      updated.languageMultiplier = languageMultiplier;
      updated.complexityMultiplier = complexityMultiplier;
      updated.translationCost =
        Math.round(
          BASE_RATE *
            updated.billablePages *
            languageMultiplier *
            complexityMultiplier *
            100,
        ) / 100;
      updated.certificationCost = certificationCost;
      updated.lineTotal =
        Math.round(
          (updated.translationCost + updated.certificationCost) * 100,
        ) / 100;

      return updated;
    });

    const newPricing = { ...value, filePrices: newFilePrices };
    recalculateTotals(newPricing);
  };

  const handleQuoteLevelChange = (
    field: keyof Omit<QuotePricing, "filePrices">,
    fieldValue: any,
  ) => {
    const newPricing = { ...value, [field]: fieldValue };
    recalculateTotals(newPricing);
  };

  const recalculateTotals = (pricing: QuotePricing) => {
    // Calculate document subtotal
    const documentSubtotal = pricing.filePrices.reduce(
      (sum, fp) => sum + fp.lineTotal,
      0,
    );

    // Calculate rush fee
    const rushFee = pricing.isRush
      ? Math.round(documentSubtotal * 0.3 * 100) / 100
      : 0;

    // Calculate delivery fee
    const deliveryOption = deliveryOptions.find(
      (d) => d.id === pricing.deliveryOptionId,
    );
    const deliveryFee = deliveryOption?.price
      ? parseFloat(deliveryOption.price as any)
      : 0;

    // Calculate discount
    let discountAmount = 0;
    if (pricing.hasDiscount && pricing.discountValue) {
      if (pricing.discountType === "percentage") {
        discountAmount =
          Math.round(((documentSubtotal * pricing.discountValue) / 100) * 100) /
          100;
      } else {
        discountAmount = pricing.discountValue;
      }
    }

    // Calculate surcharge
    let surchargeAmount = 0;
    if (pricing.hasSurcharge && pricing.surchargeValue) {
      if (pricing.surchargeType === "percentage") {
        surchargeAmount =
          Math.round(
            ((documentSubtotal * pricing.surchargeValue) / 100) * 100,
          ) / 100;
      } else {
        surchargeAmount = pricing.surchargeValue;
      }
    }

    // Calculate pre-tax total
    const preTaxTotal =
      Math.round(
        (documentSubtotal +
          rushFee +
          deliveryFee +
          surchargeAmount -
          discountAmount) *
          100,
      ) / 100;

    // Calculate tax
    const taxRate = pricing.taxRate || DEFAULT_TAX_RATE;
    const taxAmount = Math.round(preTaxTotal * taxRate * 100) / 100;

    // Calculate final total
    const total = Math.round((preTaxTotal + taxAmount) * 100) / 100;

    const updated: QuotePricing = {
      ...pricing,
      documentSubtotal: Math.round(documentSubtotal * 100) / 100,
      rushFee,
      deliveryFee,
      discountAmount,
      surchargeAmount,
      preTaxTotal,
      taxRate,
      taxAmount,
      total,
    };

    onChange(updated);
  };

  const toggleFileExpanded = (fileId: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(fileId)) {
      newExpanded.delete(fileId);
    } else {
      newExpanded.add(fileId);
    }
    setExpandedFiles(newExpanded);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-gray-600">Loading pricing data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Per-File Pricing Cards */}
      <div className="space-y-4">
        <h3 className="font-semibold text-gray-900">
          Document Pricing ({value.filePrices.length} files)
        </h3>

        {value.filePrices.map((filePrice) => {
          const isExpanded = expandedFiles.has(filePrice.fileId);

          return (
            <div
              key={filePrice.fileId}
              className="border border-gray-200 rounded-lg overflow-hidden"
            >
              {/* File Header */}
              <button
                onClick={() => toggleFileExpanded(filePrice.fileId)}
                className="w-full p-4 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left"
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {filePrice.fileName}
                  </p>
                  <p className="text-sm text-gray-600">
                    ${filePrice.lineTotal.toFixed(2)}
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-600" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-600" />
                )}
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="p-4 space-y-4 border-t border-gray-200">
                  {/* Language */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Language (Editable)
                    </label>
                    <select
                      value={filePrice.languageId}
                      onChange={(e) =>
                        handleFileFieldChange(
                          filePrice.fileId,
                          "languageId",
                          e.target.value,
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {languages.map((lang) => (
                        <option key={lang.id} value={lang.id}>
                          {lang.name} ({lang.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Page Count */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Page Count
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="999"
                        value={filePrice.pageCount}
                        onChange={(e) =>
                          handleFileFieldChange(
                            filePrice.fileId,
                            "pageCount",
                            parseInt(e.target.value) || 1,
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Billable Pages
                      </label>
                      <input
                        type="number"
                        min="0.5"
                        max="999.99"
                        step="0.5"
                        value={filePrice.billablePages}
                        onChange={(e) =>
                          handleFileFieldChange(
                            filePrice.fileId,
                            "billablePages",
                            parseFloat(e.target.value) || 1,
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Complexity & Certification */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Complexity
                      </label>
                      <select
                        value={filePrice.complexity}
                        onChange={(e) =>
                          handleFileFieldChange(
                            filePrice.fileId,
                            "complexity",
                            e.target.value as "low" | "medium" | "high",
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="low">Low (1.0x)</option>
                        <option value="medium">Medium (1.15x)</option>
                        <option value="high">High (1.30x)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Certification
                      </label>
                      <select
                        value={filePrice.certificationTypeId}
                        onChange={(e) =>
                          handleFileFieldChange(
                            filePrice.fileId,
                            "certificationTypeId",
                            e.target.value,
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {certifications.map((cert) => (
                          <option key={cert.id} value={cert.id}>
                            {cert.name} (${cert.price.toFixed(2)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Price Breakdown */}
                  <div className="bg-blue-50 p-3 rounded-md space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">Base Rate:</span>
                      <span>${filePrice.baseRate.toFixed(2)}/page</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">× Billable Pages:</span>
                      <span>{filePrice.billablePages}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">× Language Tier:</span>
                      <span>{filePrice.languageMultiplier.toFixed(2)}x</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">× Complexity:</span>
                      <span>{filePrice.complexityMultiplier.toFixed(2)}x</span>
                    </div>
                    <div className="border-t border-blue-200 pt-2 flex justify-between font-medium text-sm">
                      <span>Translation Cost:</span>
                      <span>${filePrice.translationCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">Certification:</span>
                      <span>${filePrice.certificationCost.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-blue-200 pt-2 flex justify-between font-semibold text-sm text-blue-900">
                      <span>File Total:</span>
                      <span>${filePrice.lineTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quote-Level Adjustments */}
      <div className="bg-gray-50 p-6 rounded-lg space-y-6">
        <h3 className="font-semibold text-gray-900">Quote Summary</h3>

        {/* Document Subtotal */}
        <div className="bg-white p-4 rounded-md border border-gray-200">
          <div className="flex justify-between text-lg font-semibold">
            <span>Documents Subtotal ({value.filePrices.length} files):</span>
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
                {opt.name} (${opt.price.toFixed(2)}, {opt.estimated_days} days)
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
                    e.target.value ? parseFloat(e.target.value) : undefined,
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
                    e.target.value ? parseFloat(e.target.value) : undefined,
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
                parseFloat(e.target.value) / 100,
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
