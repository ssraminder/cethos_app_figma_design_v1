import { Calendar } from "lucide-react";

interface QuoteSummaryProps {
  translationTotal: number;
  certificationTotal: number;
  taxRate?: number;
  estimatedDays?: string;
}

export default function QuoteSummary({
  translationTotal,
  certificationTotal,
  taxRate = 0.05,
  estimatedDays = "2-3 business days",
}: QuoteSummaryProps) {
  const subtotal = translationTotal + certificationTotal;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  return (
    <div className="bg-background rounded-xl p-6">
      <h3 className="text-cethos-slate-dark font-semibold text-base mb-4">
        Quote Summary
      </h3>

      {/* Line Items */}
      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center text-sm">
          <span className="text-cethos-slate">Translation</span>
          <span className="text-cethos-slate-dark font-medium">
            ${translationTotal.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-cethos-slate">Certification</span>
          <span className="text-cethos-slate-dark font-medium">
            ${certificationTotal.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Subtotal */}
      <div className="border-t border-cethos-border pt-3 mb-3">
        <div className="flex justify-between items-center text-sm">
          <span className="text-cethos-slate">Subtotal</span>
          <span className="text-cethos-slate-dark font-medium">
            ${subtotal.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Tax */}
      <div className="flex justify-between items-center text-sm mb-4">
        <span className="text-cethos-slate">
          GST ({(taxRate * 100).toFixed(0)}%)
        </span>
        <span className="text-cethos-slate-dark font-medium">
          ${tax.toFixed(2)}
        </span>
      </div>

      {/* Total */}
      <div className="border-t-2 border-cethos-slate-dark pt-4 mb-6">
        <div className="flex justify-between items-center">
          <span className="text-cethos-slate-dark font-bold text-lg">
            TOTAL CAD
          </span>
          <span className="text-cethos-navy font-bold text-2xl">
            ${total.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Estimated Delivery */}
      <div className="flex items-center gap-2 text-sm text-cethos-slate">
        <Calendar className="w-4 h-4" />
        <span>Estimated delivery: {estimatedDays}</span>
      </div>
    </div>
  );
}
