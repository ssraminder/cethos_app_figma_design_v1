import React, { useState, useEffect } from "react";
import {
  DollarSign,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Save,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface PricingSummaryData {
  quote_id: string;
  subtotal: number;
  certification_total: number;
  rush_fee?: number;
  delivery_fee?: number;
  tax_amount: number;
  tax_rate: number;
  total: number;
  document_count?: number;
  current_certification_type_id?: string;
}

interface CertificationType {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  is_default: boolean;
  is_active: boolean;
}

interface QuoteAdjustment {
  id: string;
  adjustment_type: "discount" | "surcharge";
  value_type: "percentage" | "fixed";
  value: number;
  calculated_amount: number;
  reason: string;
}

interface EditablePricingSummaryPanelProps {
  pricingData: PricingSummaryData | null;
  staffId?: string;
  loading?: boolean;
  onUpdate?: () => void;
}

export default function EditablePricingSummaryPanel({
  pricingData,
  staffId,
  loading = false,
  onUpdate,
}: EditablePricingSummaryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [adjustments, setAdjustments] = useState<QuoteAdjustment[]>([]);
  const [showAddAdjustment, setShowAddAdjustment] = useState(false);

  // Certification state
  const [certificationTypes, setCertificationTypes] = useState<CertificationType[]>([]);
  const [selectedCertificationId, setSelectedCertificationId] = useState<string>("");
  const [isSavingCertification, setIsSavingCertification] = useState(false);

  // New adjustment form
  const [newAdjustmentType, setNewAdjustmentType] = useState<
    "discount" | "surcharge"
  >("discount");
  const [newValueType, setNewValueType] = useState<"percentage" | "fixed">(
    "percentage",
  );
  const [newValue, setNewValue] = useState("");
  const [newReason, setNewReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (pricingData?.quote_id) {
      fetchAdjustments();
    }
  }, [pricingData?.quote_id]);

  useEffect(() => {
    fetchCertificationTypes();
  }, []);

  useEffect(() => {
    if (pricingData?.current_certification_type_id) {
      setSelectedCertificationId(pricingData.current_certification_type_id);
    }
  }, [pricingData?.current_certification_type_id]);

  const fetchAdjustments = async () => {
    if (!pricingData?.quote_id) return;

    try {
      const { data, error } = await supabase
        .from("quote_adjustments")
        .select("*")
        .eq("quote_id", pricingData.quote_id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setAdjustments(data || []);
    } catch (error) {
      console.error("Error fetching adjustments:", error);
    }
  };

  const fetchCertificationTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("certification_types")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setCertificationTypes(data || []);
    } catch (error) {
      console.error("Error fetching certification types:", error);
    }
  };

  const handleCertificationChange = async (certificationTypeId: string) => {
    if (!pricingData?.quote_id || !certificationTypeId) return;

    const selectedCert = certificationTypes.find((c) => c.id === certificationTypeId);
    if (!selectedCert) return;

    const documentCount = pricingData.document_count || 0;
    if (documentCount === 0) {
      alert("No documents found in this quote");
      return;
    }

    if (
      !confirm(
        `Apply "${selectedCert.name}" certification to all ${documentCount} document(s)?\n\nCost: $${selectedCert.price.toFixed(2)} × ${documentCount} = $${(selectedCert.price * documentCount).toFixed(2)}`
      )
    ) {
      // Reset to previous value if cancelled
      setSelectedCertificationId(pricingData.current_certification_type_id || "");
      return;
    }

    setIsSavingCertification(true);
    try {
      // Get all quote files for this quote
      const { data: quoteFiles, error: filesError } = await supabase
        .from("quote_files")
        .select("id")
        .eq("quote_id", pricingData.quote_id);

      if (filesError) throw filesError;

      if (!quoteFiles || quoteFiles.length === 0) {
        alert("No documents found in this quote");
        setIsSavingCertification(false);
        return;
      }

      // For each quote file, update or insert the primary certification
      for (const file of quoteFiles) {
        const { data: existing } = await supabase
          .from("document_certifications")
          .select("id")
          .eq("quote_file_id", file.id)
          .eq("is_primary", true)
          .single();

        if (existing) {
          await supabase
            .from("document_certifications")
            .update({
              certification_type_id: certificationTypeId,
              price: selectedCert.price,
              added_by: staffId || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("document_certifications")
            .insert({
              quote_file_id: file.id,
              certification_type_id: certificationTypeId,
              is_primary: true,
              price: selectedCert.price,
              added_by: staffId || null,
              added_at: new Date().toISOString(),
            });
        }
      }

      // Recalculate certification total
      const totalCertificationCost = quoteFiles.length * Number(selectedCert.price);

      await supabase
        .from("quotes")
        .update({
          certification_total: totalCertificationCost,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pricingData.quote_id);

      // Log activity
      if (staffId) {
        await supabase.from("staff_activity_log").insert({
          staff_id: staffId,
          activity_type: "quote_certification_updated",
          details: {
            quote_id: pricingData.quote_id,
            certification_type: selectedCert.name,
            certification_id: selectedCert.id,
            document_count: quoteFiles.length,
            total_cost: totalCertificationCost,
          },
        });
      }

      setSelectedCertificationId(certificationTypeId);
      alert(`✅ Certification applied to ${quoteFiles.length} document(s)!`);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Failed to update certification:", error);
      alert("Failed to update certification: " + (error as Error).message);
      // Reset to previous value on error
      setSelectedCertificationId(pricingData.current_certification_type_id || "");
    } finally {
      setIsSavingCertification(false);
    }
  };

  const calculateAdjustmentAmount = (
    type: "discount" | "surcharge",
    valueType: "percentage" | "fixed",
    value: number,
  ): number => {
    if (!pricingData) return 0;

    const baseAmount =
      pricingData.subtotal +
      (pricingData.certification_total || 0) +
      (pricingData.rush_fee || 0);

    if (valueType === "fixed") {
      return value;
    } else {
      // Percentage
      return (baseAmount * value) / 100;
    }
  };

  const handleAddAdjustment = async () => {
    if (!pricingData?.quote_id || !newValue || !newReason) {
      alert("Please fill in all fields");
      return;
    }

    const value = parseFloat(newValue);
    if (isNaN(value) || value <= 0) {
      alert("Please enter a valid positive number");
      return;
    }

    setIsSaving(true);
    try {
      const calculatedAmount = calculateAdjustmentAmount(
        newAdjustmentType,
        newValueType,
        value,
      );

      const { error } = await supabase.from("quote_adjustments").insert({
        quote_id: pricingData.quote_id,
        adjustment_type: newAdjustmentType,
        value_type: newValueType,
        value: value,
        calculated_amount: calculatedAmount,
        reason: newReason,
        created_by_staff_id: staffId || null,
      });

      if (error) throw error;

      // Recalculate quote total
      await recalculateQuoteTotal();

      // Reset form
      setNewValue("");
      setNewReason("");
      setShowAddAdjustment(false);

      alert("✅ Adjustment added successfully!");
      await fetchAdjustments();
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Failed to add adjustment:", error);
      alert("Failed to add adjustment: " + (error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAdjustment = async (adjustmentId: string) => {
    if (!confirm("Are you sure you want to remove this adjustment?")) return;

    try {
      const { error } = await supabase
        .from("quote_adjustments")
        .delete()
        .eq("id", adjustmentId);

      if (error) throw error;

      // Recalculate quote total
      await recalculateQuoteTotal();

      alert("✅ Adjustment removed successfully!");
      await fetchAdjustments();
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Failed to delete adjustment:", error);
      alert("Failed to delete adjustment: " + (error as Error).message);
    }
  };

  const recalculateQuoteTotal = async () => {
    if (!pricingData?.quote_id) return;

    try {
      // Fetch all adjustments to calculate new total
      const { data: allAdjustments } = await supabase
        .from("quote_adjustments")
        .select("*")
        .eq("quote_id", pricingData.quote_id);

      let adjustmentTotal = 0;
      allAdjustments?.forEach((adj) => {
        if (adj.adjustment_type === "discount") {
          adjustmentTotal -= adj.calculated_amount;
        } else {
          adjustmentTotal += adj.calculated_amount;
        }
      });

      const baseTotal =
        pricingData.subtotal +
        (pricingData.certification_total || 0) +
        (pricingData.rush_fee || 0) +
        (pricingData.delivery_fee || 0);

      const subtotalWithAdjustments = baseTotal + adjustmentTotal;
      const newTaxAmount =
        subtotalWithAdjustments * (pricingData.tax_rate || 0);
      const newTotal = subtotalWithAdjustments + newTaxAmount;

      // Update quote with new totals
      await supabase
        .from("quotes")
        .update({
          tax_amount: newTaxAmount,
          total: newTotal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pricingData.quote_id);
    } catch (error) {
      console.error("Error recalculating total:", error);
    }
  };

  const getTotalAdjustments = () => {
    let total = 0;
    adjustments.forEach((adj) => {
      if (adj.adjustment_type === "discount") {
        total -= adj.calculated_amount;
      } else {
        total += adj.calculated_amount;
      }
    });
    return total;
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
        </div>
      </div>
    );
  }

  if (!pricingData) {
    return null;
  }

  const adjustmentTotal = getTotalAdjustments();
  const baseTotal =
    pricingData.subtotal +
    (pricingData.certification_total || 0) +
    (pricingData.rush_fee || 0) +
    (pricingData.delivery_fee || 0);
  const subtotalWithAdjustments = baseTotal + adjustmentTotal;

  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-green-600" />
          <h3 className="text-sm font-semibold text-gray-900">Pricing</h3>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-3 space-y-3 text-sm">
          {/* Base Pricing */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-medium text-gray-900">
                ${Number(pricingData.subtotal).toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Certification:</span>
              <span className="font-medium text-gray-900">
                ${Number(pricingData.certification_total || 0).toFixed(2)}
              </span>
            </div>

            {pricingData.rush_fee > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Rush Fee:</span>
                <span className="font-medium text-gray-900">
                  ${Number(pricingData.rush_fee).toFixed(2)}
                </span>
              </div>
            )}

            {pricingData.delivery_fee > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Delivery Fee:</span>
                <span className="font-medium text-gray-900">
                  ${Number(pricingData.delivery_fee).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Quote-Level Certification Dropdown */}
          {pricingData.document_count && pricingData.document_count > 0 && (
            <div className="border-t pt-3 space-y-2">
              <label className="text-xs font-semibold text-gray-700 uppercase block">
                Quote Certification
              </label>
              <select
                value={selectedCertificationId}
                onChange={(e) => handleCertificationChange(e.target.value)}
                disabled={isSavingCertification}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">-- Select Certification --</option>
                {certificationTypes.map((cert) => (
                  <option key={cert.id} value={cert.id}>
                    {cert.name} - ${Number(cert.price).toFixed(2)} × {pricingData.document_count} = $
                    {(Number(cert.price) * (pricingData.document_count || 0)).toFixed(2)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 italic">
                Applies to all {pricingData.document_count} document{pricingData.document_count !== 1 ? "s" : ""} in quote
              </p>
            </div>
          )}

          {/* Adjustments */}
          {adjustments.length > 0 && (
            <div className="border-t pt-2 space-y-2">
              <p className="text-xs font-semibold text-gray-700 uppercase">
                Adjustments
              </p>
              {adjustments.map((adj) => (
                <div
                  key={adj.id}
                  className="flex justify-between items-start bg-gray-50 p-2 rounded"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-medium ${
                          adj.adjustment_type === "discount"
                            ? "text-green-700"
                            : "text-red-700"
                        }`}
                      >
                        {adj.adjustment_type === "discount"
                          ? "Discount"
                          : "Surcharge"}
                      </span>
                      <span className="text-xs text-gray-500">
                        (
                        {adj.value_type === "percentage"
                          ? `${adj.value}%`
                          : `$${adj.value.toFixed(2)}`}
                        )
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">{adj.reason}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-medium ${
                        adj.adjustment_type === "discount"
                          ? "text-green-700"
                          : "text-red-700"
                      }`}
                    >
                      {adj.adjustment_type === "discount" ? "-" : "+"}$
                      {adj.calculated_amount.toFixed(2)}
                    </span>
                    <button
                      onClick={() => handleDeleteAdjustment(adj.id)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Adjustment Button */}
          {!showAddAdjustment && (
            <button
              onClick={() => setShowAddAdjustment(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded hover:border-gray-400 hover:bg-gray-50 text-gray-600"
            >
              <Plus className="w-4 h-4" />
              Add Discount / Surcharge
            </button>
          )}

          {/* Add Adjustment Form */}
          {showAddAdjustment && (
            <div className="border border-blue-200 bg-blue-50 p-3 rounded space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">
                    Type
                  </label>
                  <select
                    value={newAdjustmentType}
                    onChange={(e) =>
                      setNewAdjustmentType(
                        e.target.value as "discount" | "surcharge",
                      )
                    }
                    className="w-full border rounded px-2 py-1 text-sm"
                  >
                    <option value="discount">Discount</option>
                    <option value="surcharge">Surcharge</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">
                    Value Type
                  </label>
                  <select
                    value={newValueType}
                    onChange={(e) =>
                      setNewValueType(e.target.value as "percentage" | "fixed")
                    }
                    className="w-full border rounded px-2 py-1 text-sm"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount ($)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-600 mb-1 block">
                  {newValueType === "percentage" ? "Percentage" : "Amount"}
                </label>
                <input
                  type="number"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder={
                    newValueType === "percentage" ? "e.g., 10" : "e.g., 25.00"
                  }
                  step="0.01"
                  min="0"
                />
              </div>

              <div>
                <label className="text-xs text-gray-600 mb-1 block">
                  Reason *
                </label>
                <input
                  type="text"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="e.g., Volume discount, Complex terminology surcharge"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleAddAdjustment}
                  disabled={isSaving || !newValue || !newReason}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Saving..." : "Add"}
                </button>
                <button
                  onClick={() => {
                    setShowAddAdjustment(false);
                    setNewValue("");
                    setNewReason("");
                  }}
                  disabled={isSaving}
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Tax and Total */}
          <div className="border-t pt-2 space-y-2">
            {adjustmentTotal !== 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">
                  Subtotal after adjustments:
                </span>
                <span className="font-medium">
                  ${subtotalWithAdjustments.toFixed(2)}
                </span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-gray-600">Tax:</span>
              <span className="font-medium text-gray-900">
                ${Number(pricingData.tax_amount).toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between pt-2 border-t border-gray-200">
              <span className="text-gray-900 font-semibold">Total:</span>
              <span className="text-lg font-bold text-green-600">
                ${Number(pricingData.total).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
