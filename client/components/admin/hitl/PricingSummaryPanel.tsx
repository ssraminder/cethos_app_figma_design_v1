import React, { useState } from "react";
import { DollarSign, ChevronDown, ChevronUp } from "lucide-react";

interface PricingSummaryData {
  subtotal: number;
  certification_total: number;
  tax_amount: number;
  total: number;
}

interface PricingSummaryPanelProps {
  pricingData: PricingSummaryData | null;
  loading?: boolean;
}

export default function PricingSummaryPanel({
  pricingData,
  loading = false,
}: PricingSummaryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

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
        <div className="px-4 py-3 space-y-2 text-sm">
          {/* Subtotal */}
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal:</span>
            <span className="font-medium text-gray-900">
              ${Number(pricingData.subtotal).toFixed(2)}
            </span>
          </div>

          {/* Certification */}
          <div className="flex justify-between">
            <span className="text-gray-600">Certification:</span>
            <span className="font-medium text-gray-900">
              ${Number(pricingData.certification_total).toFixed(2)}
            </span>
          </div>

          {/* Tax */}
          <div className="flex justify-between">
            <span className="text-gray-600">Tax:</span>
            <span className="font-medium text-gray-900">
              ${Number(pricingData.tax_amount).toFixed(2)}
            </span>
          </div>

          {/* Total */}
          <div className="flex justify-between pt-2 border-t border-gray-200">
            <span className="text-gray-900 font-semibold">Total:</span>
            <span className="text-lg font-bold text-green-600">
              ${Number(pricingData.total).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
