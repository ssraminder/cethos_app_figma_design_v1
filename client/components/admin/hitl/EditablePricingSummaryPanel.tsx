import React, { useState, useEffect } from "react";
import { DollarSign, ChevronDown, ChevronUp, Edit2, Save, X, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface DeliveryOption {
  id: string;
  name: string;
  code: string;
  price: number;
  delivery_days: number;
}

interface Adjustment {
  id?: string;
  type: "discount" | "surcharge";
  value_type: "percentage" | "fixed";
  value: number;
  reason: string;
  calculated_amount: number;
}

interface EditablePricingSummaryPanelProps {
  quoteId: string;
  staffId: string;
  subtotal: number;
  certificationTotal: number;
  rushFee: number;
  deliveryFee: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currentDeliveryOptionId?: string;
  loading?: boolean;
  onUpdate?: () => void;
}

export default function EditablePricingSummaryPanel({
  quoteId,
  staffId,
  subtotal,
  certificationTotal,
  rushFee,
  deliveryFee,
  taxRate,
  taxAmount,
  total,
  currentDeliveryOptionId,
  loading = false,
  onUpdate,
}: EditablePricingSummaryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Delivery options
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);
  const [selectedDeliveryOptionId, setSelectedDeliveryOptionId] = useState<
    string | undefined
  >(currentDeliveryOptionId);

  // Adjustments
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [showAddAdjustment, setShowAddAdjustment] = useState(false);
  const [newAdjustment, setNewAdjustment] = useState<Omit<Adjustment, "id" | "calculated_amount">>({
    type: "discount",
    value_type: "percentage",
    value: 0,
    reason: "",
  });

  // Editable values
  const [editValues, setEditValues] = useState({
    subtotal,
    certificationTotal,
    rushFee,
    deliveryFee,
    taxRate,
  });

  // Calculated totals
  const [calculatedTotals, setCalculatedTotals] = useState({
    adjustmentsTotal: 0,
    finalSubtotal: subtotal,
    taxAmount,
    total,
  });

  useEffect(() => {
    loadDeliveryOptions();
    loadAdjustments();
  }, [quoteId]);

  useEffect(() => {
    if (isEditing) {
      recalculateTotals();
    }
  }, [editValues, adjustments, isEditing]);

  const loadDeliveryOptions = async () => {
    if (!supabase) return;

    try {
      const { data, error } = await supabase
        .from("delivery_options")
        .select("*")
        .eq("is_active", true)
        .order("delivery_days");

      if (error) throw error;
      setDeliveryOptions(data || []);
    } catch (error) {
      console.error("Error loading delivery options:", error);
    }
  };

  const loadAdjustments = async () => {
    if (!supabase) return;

    try {
      const { data, error } = await supabase
        .from("quote_adjustments")
        .select("*")
        .eq("quote_id", quoteId)
        .order("created_at");

      if (error) throw error;
      setAdjustments(data || []);
    } catch (error) {
      console.error("Error loading adjustments:", error);
    }
  };

  const recalculateTotals = () => {
    let baseSubtotal = editValues.subtotal + editValues.certificationTotal;

    // Calculate adjustments
    let adjustmentsTotal = 0;
    adjustments.forEach((adj) => {
      const amount =
        adj.value_type === "percentage"
          ? (baseSubtotal * adj.value) / 100
          : adj.value;

      if (adj.type === "discount") {
        adjustmentsTotal -= amount;
      } else {
        adjustmentsTotal += amount;
      }
    });

    const finalSubtotal = baseSubtotal + adjustmentsTotal;
    const withFees = finalSubtotal + editValues.rushFee + editValues.deliveryFee;
    const newTaxAmount = withFees * editValues.taxRate;
    const newTotal = withFees + newTaxAmount;

    setCalculatedTotals({
      adjustmentsTotal,
      finalSubtotal,
      taxAmount: newTaxAmount,
      total: newTotal,
    });
  };

  const addAdjustment = async () => {
    if (!newAdjustment.reason.trim() || newAdjustment.value <= 0) {
      toast.error("Please provide a reason and valid value");
      return;
    }

    if (!supabase) return;

    try {
      const baseSubtotal = editValues.subtotal + editValues.certificationTotal;
      const calculatedAmount =
        newAdjustment.value_type === "percentage"
          ? (baseSubtotal * newAdjustment.value) / 100
          : newAdjustment.value;

      const { data, error} = await supabase
        .from("quote_adjustments")
        .insert({
          quote_id: quoteId,
          adjustment_type: newAdjustment.type,
          value_type: newAdjustment.value_type,
          value: newAdjustment.value,
          reason: newAdjustment.reason,
          calculated_amount: calculatedAmount,
          created_by_staff_id: staffId,
        })
        .select()
        .single();

      if (error) throw error;

      setAdjustments([...adjustments, data]);
      setNewAdjustment({
        type: "discount",
        value_type: "percentage",
        value: 0,
        reason: "",
      });
      setShowAddAdjustment(false);
      toast.success("Adjustment added");
    } catch (error) {
      console.error("Error adding adjustment:", error);
      toast.error("Failed to add adjustment");
    }
  };

  const removeAdjustment = async (adjustmentId: string) => {
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from("quote_adjustments")
        .delete()
        .eq("id", adjustmentId);

      if (error) throw error;

      setAdjustments(adjustments.filter((a) => a.id !== adjustmentId));
      toast.success("Adjustment removed");
    } catch (error) {
      console.error("Error removing adjustment:", error);
      toast.error("Failed to remove adjustment");
    }
  };

  const handleDeliveryOptionChange = async (optionId: string) => {
    const option = deliveryOptions.find((o) => o.id === optionId);
    if (option) {
      setSelectedDeliveryOptionId(optionId);
      setEditValues((prev) => ({
        ...prev,
        deliveryFee: option.price,
      }));
    }
  };

  const saveChanges = async () => {
    if (!supabase) return;

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("quotes")
        .update({
          subtotal: calculatedTotals.finalSubtotal,
          certification_total: editValues.certificationTotal,
          rush_fee: editValues.rushFee,
          delivery_fee: editValues.deliveryFee,
          tax_rate: editValues.taxRate,
          tax_amount: calculatedTotals.taxAmount,
          total: calculatedTotals.total,
          delivery_option_id: selectedDeliveryOptionId || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", quoteId);

      if (error) throw error;

      // Log staff activity
      await supabase.from("staff_activity_log").insert({
        staff_id: staffId,
        action: "update_quote_pricing",
        details: {
          quote_id: quoteId,
          old_total: total,
          new_total: calculatedTotals.total,
          adjustments_count: adjustments.length,
        },
        created_at: new Date().toISOString(),
      });

      setIsEditing(false);
      toast.success("Pricing updated successfully");

      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error saving pricing changes:", error);
      toast.error("Failed to save pricing changes");
    } finally {
      setIsSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditValues({
      subtotal,
      certificationTotal,
      rushFee,
      deliveryFee,
      taxRate,
    });
    setSelectedDeliveryOptionId(currentDeliveryOptionId);
    setIsEditing(false);
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

  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 hover:bg-gray-50 transition-colors flex-1"
        >
          <DollarSign className="w-4 h-4 text-green-600" />
          <h3 className="text-sm font-semibold text-gray-900">Pricing & Adjustments</h3>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400 ml-auto" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
          )}
        </button>

        {isExpanded && (
          <div className="flex gap-2 ml-2">
            {isEditing ? (
              <>
                <button
                  onClick={cancelEdit}
                  className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
                <button
                  onClick={saveChanges}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 text-sm text-blue-600 border border-blue-600 rounded hover:bg-blue-50 flex items-center gap-1"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-3 space-y-4 text-sm">
          {/* Base Pricing */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 uppercase mb-2">
              Base Pricing
            </h4>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-600">Translation Subtotal:</span>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editValues.subtotal}
                    onChange={(e) =>
                      setEditValues({
                        ...editValues,
                        subtotal: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                  />
                ) : (
                  <span className="font-medium text-gray-900">
                    ${Number(subtotal).toFixed(2)}
                  </span>
                )}
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">Certification:</span>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editValues.certificationTotal}
                    onChange={(e) =>
                      setEditValues({
                        ...editValues,
                        certificationTotal: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                  />
                ) : (
                  <span className="font-medium text-gray-900">
                    ${Number(certificationTotal).toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Adjustments */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-700 uppercase">
                Discounts & Surcharges
              </h4>
              {isEditing && (
                <button
                  onClick={() => setShowAddAdjustment(!showAddAdjustment)}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add
                </button>
              )}
            </div>

            {showAddAdjustment && (
              <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newAdjustment.type}
                    onChange={(e) =>
                      setNewAdjustment({
                        ...newAdjustment,
                        type: e.target.value as "discount" | "surcharge",
                      })
                    }
                    className="px-2 py-1.5 text-xs border border-gray-300 rounded"
                  >
                    <option value="discount">Discount</option>
                    <option value="surcharge">Surcharge</option>
                  </select>

                  <select
                    value={newAdjustment.value_type}
                    onChange={(e) =>
                      setNewAdjustment({
                        ...newAdjustment,
                        value_type: e.target.value as "percentage" | "fixed",
                      })
                    }
                    className="px-2 py-1.5 text-xs border border-gray-300 rounded"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount ($)</option>
                  </select>
                </div>

                <input
                  type="number"
                  step="0.01"
                  value={newAdjustment.value || ""}
                  onChange={(e) =>
                    setNewAdjustment({
                      ...newAdjustment,
                      value: parseFloat(e.target.value) || 0,
                    })
                  }
                  placeholder="Amount"
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                />

                <input
                  type="text"
                  value={newAdjustment.reason}
                  onChange={(e) =>
                    setNewAdjustment({ ...newAdjustment, reason: e.target.value })
                  }
                  placeholder="Reason (e.g., Returning customer)"
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                />

                <div className="flex gap-2">
                  <button
                    onClick={addAdjustment}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setShowAddAdjustment(false);
                      setNewAdjustment({
                        type: "discount",
                        value_type: "percentage",
                        value: 0,
                        reason: "",
                      });
                    }}
                    className="px-3 py-1.5 border border-gray-300 text-xs rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {adjustments.length > 0 ? (
              <div className="space-y-1.5">
                {adjustments.map((adj) => (
                  <div
                    key={adj.id}
                    className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded font-medium ${
                            adj.type === "discount"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {adj.type === "discount" ? "-" : "+"}
                          {adj.value_type === "percentage"
                            ? `${adj.value}%`
                            : `$${adj.value.toFixed(2)}`}
                        </span>
                        <span className="text-gray-600">{adj.reason}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        ${Math.abs(adj.calculated_amount).toFixed(2)}
                      </span>
                      {isEditing && (
                        <button
                          onClick={() => removeAdjustment(adj.id!)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 text-center py-2">
                No adjustments applied
              </p>
            )}
          </div>

          {/* Additional Fees */}
          <div className="border-t pt-3">
            <h4 className="text-xs font-semibold text-gray-700 uppercase mb-2">
              Additional Fees
            </h4>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-600">Rush Fee:</span>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editValues.rushFee}
                    onChange={(e) =>
                      setEditValues({
                        ...editValues,
                        rushFee: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                  />
                ) : (
                  <span className="font-medium text-gray-900">
                    ${Number(rushFee).toFixed(2)}
                  </span>
                )}
              </div>

              {isEditing && (
                <div className="space-y-1.5">
                  <label className="block text-gray-600">Delivery Option:</label>
                  <select
                    value={selectedDeliveryOptionId || ""}
                    onChange={(e) => handleDeliveryOptionChange(e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                  >
                    <option value="">None</option>
                    {deliveryOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name} - ${option.price.toFixed(2)} ({option.delivery_days} days)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-gray-600">Delivery Fee:</span>
                <span className="font-medium text-gray-900">
                  ${Number(isEditing ? editValues.deliveryFee : deliveryFee).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Tax */}
          <div className="border-t pt-3">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-gray-600">Tax Rate:</span>
              {isEditing ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={editValues.taxRate}
                    onChange={(e) =>
                      setEditValues({
                        ...editValues,
                        taxRate: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-20 px-2 py-1 border border-gray-300 rounded text-right"
                  />
                  <span className="text-xs text-gray-500">
                    ({(editValues.taxRate * 100).toFixed(2)}%)
                  </span>
                </div>
              ) : (
                <span className="font-medium text-gray-900">
                  {(taxRate * 100).toFixed(2)}%
                </span>
              )}
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Tax Amount:</span>
              <span className="font-medium text-gray-900">
                ${(isEditing ? calculatedTotals.taxAmount : taxAmount).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Total */}
          <div className="border-t-2 border-gray-900 pt-3 flex justify-between">
            <span className="text-gray-900 font-bold text-base">Total:</span>
            <span className="text-lg font-bold text-green-600">
              ${(isEditing ? calculatedTotals.total : total).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
