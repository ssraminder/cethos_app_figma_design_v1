import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Calculator, Plus, X, Percent, DollarSign } from "lucide-react";

interface PricingData {
  translationTotal: number;
  certificationTotal: number;
  subtotal: number;
  rushFee: number;
  deliveryFee: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  discount?: number;
  surcharge?: number;
}

interface Adjustment {
  id: string;
  type: "discount" | "surcharge";
  valueType: "percentage" | "fixed";
  value: number;
  reason: string;
}

interface StaffPricingFormProps {
  quoteId: string | null;
  onPricingChange: (pricing: PricingData) => void;
  initialPricing?: PricingData | null;
}

export default function StaffPricingForm({
  quoteId,
  onPricingChange,
  initialPricing,
}: StaffPricingFormProps) {
  const [pricing, setPricing] = useState<PricingData>(
    initialPricing || {
      translationTotal: 0,
      certificationTotal: 0,
      subtotal: 0,
      rushFee: 0,
      deliveryFee: 0,
      taxRate: 0.05,
      taxAmount: 0,
      total: 0,
    }
  );
  
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [showAddAdjustment, setShowAddAdjustment] = useState(false);
  const [newAdjustment, setNewAdjustment] = useState<Partial<Adjustment>>({
    type: "discount",
    valueType: "percentage",
    value: 0,
    reason: "",
  });

  // Manual pricing inputs
  const [manualInputs, setManualInputs] = useState({
    translationTotal: pricing.translationTotal || 0,
    certificationTotal: pricing.certificationTotal || 0,
    rushFee: pricing.rushFee || 0,
    deliveryFee: pricing.deliveryFee || 0,
    taxRate: pricing.taxRate || 0.05,
  });

  const handleManualInputChange = (field: string, value: number) => {
    setManualInputs((prev) => ({ ...prev, [field]: value }));
  };

  const calculatePricing = () => {
    // Start with base amounts
    let subtotal = manualInputs.translationTotal + manualInputs.certificationTotal;
    
    // Apply adjustments
    let totalDiscount = 0;
    let totalSurcharge = 0;
    
    adjustments.forEach((adj) => {
      const amount = adj.valueType === "percentage" 
        ? (subtotal * adj.value) / 100
        : adj.value;
      
      if (adj.type === "discount") {
        totalDiscount += amount;
      } else {
        totalSurcharge += amount;
      }
    });
    
    // Calculate final amounts
    const adjustedSubtotal = subtotal - totalDiscount + totalSurcharge;
    const withRushAndDelivery = adjustedSubtotal + manualInputs.rushFee + manualInputs.deliveryFee;
    const taxAmount = withRushAndDelivery * manualInputs.taxRate;
    const total = withRushAndDelivery + taxAmount;
    
    const newPricing = {
      translationTotal: manualInputs.translationTotal,
      certificationTotal: manualInputs.certificationTotal,
      subtotal: adjustedSubtotal,
      rushFee: manualInputs.rushFee,
      deliveryFee: manualInputs.deliveryFee,
      taxRate: manualInputs.taxRate,
      taxAmount,
      total,
      discount: totalDiscount,
      surcharge: totalSurcharge,
    };
    
    setPricing(newPricing);
    onPricingChange(newPricing);
  };

  const addAdjustment = () => {
    if (newAdjustment.value && newAdjustment.reason) {
      const adjustment: Adjustment = {
        id: `adj-${Date.now()}`,
        type: newAdjustment.type!,
        valueType: newAdjustment.valueType!,
        value: newAdjustment.value!,
        reason: newAdjustment.reason!,
      };
      
      setAdjustments([...adjustments, adjustment]);
      setNewAdjustment({
        type: "discount",
        valueType: "percentage",
        value: 0,
        reason: "",
      });
      setShowAddAdjustment(false);
    }
  };

  const removeAdjustment = (id: string) => {
    setAdjustments(adjustments.filter((a) => a.id !== id));
  };

  // Auto-calculate when adjustments change
  useEffect(() => {
    if (adjustments.length > 0 || manualInputs.translationTotal > 0) {
      calculatePricing();
    }
  }, [adjustments]);

  return (
    <div className="space-y-6">
      {/* Manual Pricing Inputs */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Base Pricing</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Translation Total */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Translation Total
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <DollarSign className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="number"
                step="0.01"
                value={manualInputs.translationTotal}
                onChange={(e) => handleManualInputChange("translationTotal", parseFloat(e.target.value) || 0)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Certification Total */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Certification Total
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <DollarSign className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="number"
                step="0.01"
                value={manualInputs.certificationTotal}
                onChange={(e) => handleManualInputChange("certificationTotal", parseFloat(e.target.value) || 0)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Rush Fee */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rush Fee
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <DollarSign className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="number"
                step="0.01"
                value={manualInputs.rushFee}
                onChange={(e) => handleManualInputChange("rushFee", parseFloat(e.target.value) || 0)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Delivery Fee */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Delivery Fee
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <DollarSign className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="number"
                step="0.01"
                value={manualInputs.deliveryFee}
                onChange={(e) => handleManualInputChange("deliveryFee", parseFloat(e.target.value) || 0)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Tax Rate */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tax Rate (%)
            </label>
            <div className="relative max-w-xs">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Percent className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="number"
                step="0.01"
                value={manualInputs.taxRate * 100}
                onChange={(e) => handleManualInputChange("taxRate", (parseFloat(e.target.value) || 0) / 100)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Adjustments */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Discounts & Surcharges
          </h3>
          <button
            type="button"
            onClick={() => setShowAddAdjustment(!showAddAdjustment)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>

        {/* Add Adjustment Form */}
        {showAddAdjustment && (
          <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-md space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={newAdjustment.type}
                  onChange={(e) => setNewAdjustment({ ...newAdjustment, type: e.target.value as "discount" | "surcharge" })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                >
                  <option value="discount">Discount</option>
                  <option value="surcharge">Surcharge</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Value Type
                </label>
                <select
                  value={newAdjustment.valueType}
                  onChange={(e) => setNewAdjustment({ ...newAdjustment, valueType: e.target.value as "percentage" | "fixed" })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount ($)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Value
              </label>
              <input
                type="number"
                step="0.01"
                value={newAdjustment.value || ""}
                onChange={(e) => setNewAdjustment({ ...newAdjustment, value: parseFloat(e.target.value) })}
                placeholder="Enter amount"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Reason
              </label>
              <input
                type="text"
                value={newAdjustment.reason || ""}
                onChange={(e) => setNewAdjustment({ ...newAdjustment, reason: e.target.value })}
                placeholder="e.g., Returning customer, Bulk discount"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={addAdjustment}
                className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddAdjustment(false);
                  setNewAdjustment({ type: "discount", valueType: "percentage", value: 0, reason: "" });
                }}
                className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Adjustment List */}
        {adjustments.length > 0 && (
          <div className="space-y-2">
            {adjustments.map((adj) => (
              <div key={adj.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                      adj.type === "discount" 
                        ? "bg-green-100 text-green-800" 
                        : "bg-red-100 text-red-800"
                    }`}>
                      {adj.type === "discount" ? "Discount" : "Surcharge"}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">
                      {adj.valueType === "percentage" ? `${adj.value}%` : `$${adj.value.toFixed(2)}`}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{adj.reason}</p>
                </div>
                <button
                  onClick={() => removeAdjustment(adj.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {adjustments.length === 0 && !showAddAdjustment && (
          <p className="text-sm text-gray-500 text-center py-4">
            No adjustments applied
          </p>
        )}
      </div>

      {/* Recalculate Button */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={calculatePricing}
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700"
        >
          <Calculator className="w-5 h-5" />
          Recalculate Pricing
        </button>
      </div>

      {/* Pricing Summary */}
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Price Summary</h3>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Translation</span>
            <span className="font-medium">${pricing.translationTotal.toFixed(2)}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-600">Certification</span>
            <span className="font-medium">${pricing.certificationTotal.toFixed(2)}</span>
          </div>
          
          {pricing.discount && pricing.discount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount</span>
              <span className="font-medium">-${pricing.discount.toFixed(2)}</span>
            </div>
          )}
          
          {pricing.surcharge && pricing.surcharge > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Surcharge</span>
              <span className="font-medium">+${pricing.surcharge.toFixed(2)}</span>
            </div>
          )}
          
          <div className="flex justify-between pt-2 border-t border-gray-300">
            <span className="text-gray-600">Subtotal</span>
            <span className="font-medium">${pricing.subtotal.toFixed(2)}</span>
          </div>
          
          {pricing.rushFee > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Rush Fee</span>
              <span className="font-medium">${pricing.rushFee.toFixed(2)}</span>
            </div>
          )}
          
          {pricing.deliveryFee > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Delivery</span>
              <span className="font-medium">${pricing.deliveryFee.toFixed(2)}</span>
            </div>
          )}
          
          <div className="flex justify-between">
            <span className="text-gray-600">Tax ({(pricing.taxRate * 100).toFixed(2)}%)</span>
            <span className="font-medium">${pricing.taxAmount.toFixed(2)}</span>
          </div>
          
          <div className="flex justify-between pt-3 border-t-2 border-gray-900 text-lg font-bold">
            <span>Total</span>
            <span className="text-indigo-600">${pricing.total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
