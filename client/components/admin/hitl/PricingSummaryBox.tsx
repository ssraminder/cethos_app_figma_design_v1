import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  RefreshCw,
  Plus,
  X,
  ChevronDown,
  DollarSign,
  AlertCircle,
  Send,
  CreditCard,
} from "lucide-react";

// Types
interface CertificationType {
  id: string;
  code: string;
  name: string;
  price: number;
}

interface TaxRate {
  id: string;
  region_code: string;
  region_name: string;
  tax_name: string;
  rate: number;
}

interface QuoteCertification {
  id: string;
  certification_type_id: string;
  name: string;
  price: number;
  quantity: number;
}

interface QuoteAdjustment {
  id: string;
  adjustment_type: "discount" | "surcharge";
  value_type: "fixed" | "percentage";
  value: number;
  calculated_amount: number;
  reason: string;
}

interface PricingData {
  subtotal: number;
  certifications: QuoteCertification[];
  adjustments: QuoteAdjustment[];
  taxRateId: string | null;
  taxRate: number;
  taxAmount: number;
  total: number;
  rushFee: number;
  deliveryFee: number;
}

interface Props {
  quoteId: string;
  staffId?: string;
  onPricingChange?: () => void;
  // Action button handlers
  showActions?: boolean;
  isSubmitting?: boolean;
  onUpdateAndSendPaymentLink?: () => void;
  onManualPayment?: () => void;
}

export default function PricingSummaryBox({
  quoteId,
  staffId,
  onPricingChange,
  showActions = false,
  isSubmitting = false,
  onUpdateAndSendPaymentLink,
  onManualPayment,
}: Props) {
  // State
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [certificationTypes, setCertificationTypes] = useState<
    CertificationType[]
  >([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dropdown states
  const [showCertDropdown, setShowCertDropdown] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);

  // Adjustment form state
  const [adjustmentForm, setAdjustmentForm] = useState({
    type: "discount" as "discount" | "surcharge",
    valueType: "fixed" as "fixed" | "percentage",
    value: "",
    reason: "",
  });

  // Fetch all data on mount
  useEffect(() => {
    fetchAllData();
  }, [quoteId]);

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch quote pricing data
      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .select(
          `
          subtotal,
          certification_total,
          rush_fee,
          delivery_fee,
          tax_rate_id,
          tax_rate,
          tax_amount,
          total,
          calculated_totals
        `
        )
        .eq("id", quoteId)
        .single();

      if (quoteError) throw quoteError;

      // Fetch quote certifications
      const { data: certsData, error: certsError } = await supabase
        .from("quote_certifications")
        .select(
          `
          id,
          certification_type_id,
          price,
          quantity,
          certification_types (name)
        `
        )
        .eq("quote_id", quoteId);

      if (certsError && certsError.code !== "PGRST116") {
        // PGRST116 = table doesn't exist yet, which is fine
        console.warn("Error fetching quote certifications:", certsError);
      }

      // Fetch adjustments
      const { data: adjData, error: adjError } = await supabase
        .from("quote_adjustments")
        .select("*")
        .eq("quote_id", quoteId);

      if (adjError && adjError.code !== "PGRST116") {
        console.warn("Error fetching adjustments:", adjError);
      }

      // Fetch certification types for dropdown
      const { data: certTypes, error: certTypesError } = await supabase
        .from("certification_types")
        .select("id, code, name, price")
        .eq("is_active", true)
        .order("sort_order");

      if (certTypesError) throw certTypesError;

      // Fetch tax rates for dropdown
      const { data: taxes, error: taxError } = await supabase
        .from("tax_rates")
        .select("id, region_code, region_name, tax_name, rate")
        .eq("is_active", true)
        .order("region_name");

      if (taxError) throw taxError;

      // Set state
      setCertificationTypes(certTypes || []);
      setTaxRates(taxes || []);

      setPricing({
        subtotal:
          quoteData?.subtotal || quoteData?.calculated_totals?.subtotal || 0,
        certifications: (certsData || []).map((c: any) => ({
          id: c.id,
          certification_type_id: c.certification_type_id,
          name: c.certification_types?.name || "Unknown",
          price: c.price,
          quantity: c.quantity,
        })),
        adjustments: adjData || [],
        taxRateId: quoteData?.tax_rate_id,
        taxRate: quoteData?.tax_rate || 0.05,
        taxAmount:
          quoteData?.tax_amount ||
          quoteData?.calculated_totals?.tax_amount ||
          0,
        total: quoteData?.total || quoteData?.calculated_totals?.total || 0,
        rushFee:
          quoteData?.rush_fee || quoteData?.calculated_totals?.rush_fee || 0,
        deliveryFee: quoteData?.delivery_fee || 0,
      });
    } catch (err: any) {
      console.error("Error fetching pricing data:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Add certification
  const handleAddCertification = async (certTypeId: string) => {
    const certType = certificationTypes.find((c) => c.id === certTypeId);
    if (!certType) return;

    try {
      const { error } = await supabase.from("quote_certifications").insert({
        quote_id: quoteId,
        certification_type_id: certTypeId,
        price: certType.price,
        quantity: 1,
        added_by: staffId || null,
      });

      if (error) throw error;

      setShowCertDropdown(false);
      await handleRecalculate();
    } catch (err: any) {
      console.error("Error adding certification:", err);
      setError(err.message);
    }
  };

  // Remove certification
  const handleRemoveCertification = async (certId: string) => {
    try {
      const { error } = await supabase
        .from("quote_certifications")
        .delete()
        .eq("id", certId);

      if (error) throw error;

      await handleRecalculate();
    } catch (err: any) {
      console.error("Error removing certification:", err);
      setError(err.message);
    }
  };

  // Add adjustment
  const handleAddAdjustment = async () => {
    if (!adjustmentForm.value || parseFloat(adjustmentForm.value) <= 0) {
      setError("Please enter a valid value");
      return;
    }

    try {
      const { error } = await supabase.from("quote_adjustments").insert({
        quote_id: quoteId,
        adjustment_type: adjustmentForm.type,
        value_type: adjustmentForm.valueType,
        value: parseFloat(adjustmentForm.value),
        reason: adjustmentForm.reason || null,
        added_by: staffId || null,
      });

      if (error) throw error;

      setShowAdjustmentModal(false);
      setAdjustmentForm({
        type: "discount",
        valueType: "fixed",
        value: "",
        reason: "",
      });
      await handleRecalculate();
    } catch (err: any) {
      console.error("Error adding adjustment:", err);
      setError(err.message);
    }
  };

  // Remove adjustment
  const handleRemoveAdjustment = async (adjId: string) => {
    try {
      const { error } = await supabase
        .from("quote_adjustments")
        .delete()
        .eq("id", adjId);

      if (error) throw error;

      await handleRecalculate();
    } catch (err: any) {
      console.error("Error removing adjustment:", err);
      setError(err.message);
    }
  };

  // Change tax rate
  const handleTaxRateChange = async (taxRateId: string) => {
    try {
      const { error } = await supabase
        .from("quotes")
        .update({ tax_rate_id: taxRateId })
        .eq("id", quoteId);

      if (error) throw error;

      await handleRecalculate();
    } catch (err: any) {
      console.error("Error updating tax rate:", err);
      setError(err.message);
    }
  };

  // Recalculate totals
  const handleRecalculate = async () => {
    setRecalculating(true);
    setError(null);

    try {
      const { error } = await supabase.rpc("recalculate_quote_totals", {
        p_quote_id: quoteId,
      });

      if (error) throw error;

      await fetchAllData();
      onPricingChange?.();
    } catch (err: any) {
      console.error("Error recalculating:", err);
      setError(err.message);
    } finally {
      setRecalculating(false);
    }
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(amount);
  };

  // Format percentage
  const formatPercent = (rate: number) => {
    return `${(rate * 100).toFixed(rate % 0.01 === 0 ? 0 : 2)}%`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-8 bg-gray-200 rounded"></div>
          <div className="h-8 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-green-600" />
          Pricing Summary
        </h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Error display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Subtotal */}
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Subtotal:</span>
          <span className="font-medium">
            {formatCurrency(pricing?.subtotal || 0)}
          </span>
        </div>

        <hr className="border-gray-200" />

        {/* Certifications Section */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Quote Certifications
          </p>

          {/* Certification List */}
          {pricing?.certifications && pricing.certifications.length > 0 ? (
            <div className="space-y-2 mb-2">
              {pricing.certifications.map((cert) => (
                <div
                  key={cert.id}
                  className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2"
                >
                  <span className="text-sm text-gray-700">{cert.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {formatCurrency(cert.price)}
                    </span>
                    <button
                      onClick={() => handleRemoveCertification(cert.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove certification"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic mb-2">
              No quote certifications added
            </p>
          )}

          {/* Add Certification Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowCertDropdown(!showCertDropdown)}
              className="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Certification
              <ChevronDown
                className={`w-4 h-4 transition-transform ${showCertDropdown ? "rotate-180" : ""}`}
              />
            </button>

            {showCertDropdown && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                {certificationTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => handleAddCertification(type.id)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex justify-between"
                  >
                    <span>{type.name}</span>
                    <span className="text-gray-500">
                      {formatCurrency(type.price)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* Adjustments Section */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Adjustments
          </p>

          {/* Adjustments List */}
          {pricing?.adjustments && pricing.adjustments.length > 0 ? (
            <div className="space-y-2 mb-2">
              {pricing.adjustments.map((adj) => (
                <div
                  key={adj.id}
                  className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2"
                >
                  <div>
                    <span className="text-sm text-gray-700 capitalize">
                      {adj.adjustment_type}
                    </span>
                    {adj.reason && (
                      <p className="text-xs text-gray-500">{adj.reason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        adj.adjustment_type === "discount"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {adj.adjustment_type === "discount" ? "-" : "+"}
                      {adj.value_type === "percentage"
                        ? `${adj.value}%`
                        : formatCurrency(adj.value)}
                    </span>
                    <button
                      onClick={() => handleRemoveAdjustment(adj.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove adjustment"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic mb-2">No adjustments</p>
          )}

          {/* Add Adjustment Button */}
          <button
            onClick={() => setShowAdjustmentModal(true)}
            className="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Discount / Surcharge
          </button>
        </div>

        <hr className="border-gray-200" />

        {/* Rush Fee (if applicable) */}
        {pricing && pricing.rushFee > 0 && (
          <>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Rush Fee (30%):</span>
              <span className="font-medium text-orange-600">
                +{formatCurrency(pricing.rushFee)}
              </span>
            </div>
            <hr className="border-gray-200" />
          </>
        )}

        {/* Delivery Fee (if applicable) */}
        {pricing && pricing.deliveryFee > 0 && (
          <>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Delivery:</span>
              <span className="font-medium">
                {formatCurrency(pricing.deliveryFee)}
              </span>
            </div>
            <hr className="border-gray-200" />
          </>
        )}

        {/* Tax Section */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Tax
          </p>

          {/* Tax Rate Dropdown */}
          <select
            value={pricing?.taxRateId || ""}
            onChange={(e) => handleTaxRateChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="">Select Tax Rate...</option>
            {taxRates.map((tax) => (
              <option key={tax.id} value={tax.id}>
                {tax.region_name} ({tax.tax_name} {formatPercent(tax.rate)})
              </option>
            ))}
          </select>

          <div className="flex justify-between items-center mt-2">
            <span className="text-gray-600">Tax Amount:</span>
            <span className="font-medium">
              {formatCurrency(pricing?.taxAmount || 0)}
            </span>
          </div>
        </div>

        <hr className="border-gray-300" />

        {/* Total */}
        <div className="flex justify-between items-center">
          <span className="text-lg font-semibold text-gray-900">TOTAL:</span>
          <span className="text-xl font-bold text-green-600">
            {formatCurrency(pricing?.total || 0)}
          </span>
        </div>

        {/* Recalculate Button */}
        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`w-4 h-4 ${recalculating ? "animate-spin" : ""}`}
          />
          {recalculating ? "Recalculating..." : "Recalculate Totals"}
        </button>

        {/* Action Buttons - Payment Actions */}
        {showActions && (
          <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
            <button
              onClick={onUpdateAndSendPaymentLink}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              Update & Send Payment Link
            </button>
            <button
              onClick={onManualPayment}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CreditCard className="w-4 h-4" />
              Manual Payment
            </button>
          </div>
        )}
      </div>

      {/* Adjustment Modal */}
      {showAdjustmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Add Adjustment</h3>

            {/* Type Toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() =>
                  setAdjustmentForm((f) => ({ ...f, type: "discount" }))
                }
                className={`flex-1 py-2 rounded-md font-medium transition-colors ${
                  adjustmentForm.type === "discount"
                    ? "bg-green-100 text-green-700 border-2 border-green-500"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                Discount
              </button>
              <button
                onClick={() =>
                  setAdjustmentForm((f) => ({ ...f, type: "surcharge" }))
                }
                className={`flex-1 py-2 rounded-md font-medium transition-colors ${
                  adjustmentForm.type === "surcharge"
                    ? "bg-red-100 text-red-700 border-2 border-red-500"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                Surcharge
              </button>
            </div>

            {/* Value Type Toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() =>
                  setAdjustmentForm((f) => ({ ...f, valueType: "fixed" }))
                }
                className={`flex-1 py-2 rounded-md font-medium transition-colors ${
                  adjustmentForm.valueType === "fixed"
                    ? "bg-blue-100 text-blue-700 border-2 border-blue-500"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                Fixed ($)
              </button>
              <button
                onClick={() =>
                  setAdjustmentForm((f) => ({ ...f, valueType: "percentage" }))
                }
                className={`flex-1 py-2 rounded-md font-medium transition-colors ${
                  adjustmentForm.valueType === "percentage"
                    ? "bg-blue-100 text-blue-700 border-2 border-blue-500"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                Percentage (%)
              </button>
            </div>

            {/* Value Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Value {adjustmentForm.valueType === "fixed" ? "($)" : "(%)"}
              </label>
              <input
                type="number"
                step={adjustmentForm.valueType === "fixed" ? "0.01" : "1"}
                min="0"
                value={adjustmentForm.value}
                onChange={(e) =>
                  setAdjustmentForm((f) => ({ ...f, value: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder={
                  adjustmentForm.valueType === "fixed" ? "25.00" : "10"
                }
              />
            </div>

            {/* Reason Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason (optional)
              </label>
              <input
                type="text"
                value={adjustmentForm.reason}
                onChange={(e) =>
                  setAdjustmentForm((f) => ({ ...f, reason: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="e.g., Loyalty discount, Rush fee"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAdjustmentModal(false);
                  setAdjustmentForm({
                    type: "discount",
                    valueType: "fixed",
                    value: "",
                    reason: "",
                  });
                }}
                className="flex-1 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAdjustment}
                className="flex-1 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700"
              >
                Add {adjustmentForm.type === "discount" ? "Discount" : "Surcharge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
