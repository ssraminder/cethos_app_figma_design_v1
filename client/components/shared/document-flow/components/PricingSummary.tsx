import React from 'react';
import { PricingTotals } from '../types';

interface PricingSummaryProps {
  totals: PricingTotals;
}

export const PricingSummary: React.FC<PricingSummaryProps> = ({ totals }) => {
  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b">
        <h3 className="font-semibold text-lg">Pricing Summary</h3>
      </div>
      <div className="p-4 space-y-3">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-4 border-b">
          <div>
            <p className="text-sm text-gray-500">Documents</p>
            <p className="text-xl font-semibold">{totals.total_documents}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Pages</p>
            <p className="text-xl font-semibold">{totals.total_pages}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Words</p>
            <p className="text-xl font-semibold">{totals.total_words.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Billable Pages</p>
            <p className="text-xl font-semibold">{totals.total_billable_pages.toFixed(2)}</p>
          </div>
        </div>

        {/* Costs */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Translation:</span>
            <span className="font-medium">${totals.translation_subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Certifications:</span>
            <span className="font-medium">${totals.certification_subtotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Subtotal */}
        <div className="flex justify-between pt-4 border-t">
          <span className="text-lg font-semibold">SUBTOTAL:</span>
          <span className="text-xl font-bold">${totals.subtotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

export default PricingSummary;
