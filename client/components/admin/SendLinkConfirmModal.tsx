import { Send, Loader2, AlertTriangle } from "lucide-react";

interface SendLinkConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  mode: "quote" | "payment";
  quoteNumber: string;
  customerName: string;
  customerEmail: string;
  calculatedTotals: {
    translation_total?: number;
    certification_total?: number;
    rush_fee?: number;
    delivery_fee?: number;
    adjustments_total?: number;
    tax_name?: string;
    tax_rate?: number;
    tax_amount?: number;
    total?: number;
    [key: string]: number | string | undefined;
  };
  isSending?: boolean;
}

function formatCurrency(amount: number): string {
  const formatted = Math.abs(amount).toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-$${formatted} CAD` : `$${formatted} CAD`;
}

export default function SendLinkConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  mode,
  quoteNumber,
  customerName,
  customerEmail,
  calculatedTotals,
  isSending = false,
}: SendLinkConfirmModalProps) {
  if (!isOpen) return null;

  const isQuote = mode === "quote";
  const accentColor = isQuote ? "blue" : "teal";

  const translationTotal = Number(calculatedTotals.translation_total || 0);
  const certificationTotal = Number(calculatedTotals.certification_total || 0);
  const rushFee = Number(calculatedTotals.rush_fee || 0);
  const deliveryFee = Number(calculatedTotals.delivery_fee || 0);
  const adjustmentsTotal = Number(calculatedTotals.adjustments_total || 0);
  const taxAmount = Number(calculatedTotals.tax_amount || 0);
  const taxRate = Number(calculatedTotals.tax_rate || 0);
  const taxName = calculatedTotals.tax_name as string | undefined;
  const total = Number(calculatedTotals.total || 0);
  const subtotal = total - taxAmount;

  const hasDiscount = adjustmentsTotal < 0;

  const rows: { label: string; value: number; className?: string }[] = [];

  if (translationTotal !== 0) {
    rows.push({ label: "Translation Services", value: translationTotal });
  }
  if (certificationTotal !== 0) {
    rows.push({ label: "Certification", value: certificationTotal });
  }
  if (rushFee !== 0) {
    rows.push({ label: "⚡ Rush Fee", value: rushFee, className: "text-red-600" });
  }
  if (deliveryFee !== 0) {
    rows.push({ label: "Delivery", value: deliveryFee });
  }
  if (adjustmentsTotal !== 0) {
    rows.push({ label: "Volume Discount", value: adjustmentsTotal, className: "text-green-600" });
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isQuote ? "bg-blue-100" : "bg-teal-100"}`}>
            <Send className={`w-5 h-5 ${isQuote ? "text-blue-600" : "text-teal-600"}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {isQuote ? "Confirm & Send Quote Link" : "Confirm & Send Payment Link"}
            </h3>
            <p className="text-sm text-gray-500">
              Review the pricing below before sending to the customer.
            </p>
          </div>
        </div>

        {/* Customer Info Box */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <span className="text-base">👤</span>
            <div className="text-sm">
              <p className="font-medium text-gray-900">{customerName}</p>
              <p className="text-gray-600">{customerEmail}</p>
            </div>
          </div>
        </div>

        {/* Pricing Breakdown */}
        <div className="mb-4 space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {quoteNumber} — Pricing Breakdown
          </p>

          <div className="border border-gray-200 rounded-lg p-3 space-y-1.5">
            {rows.map((row) => (
              <div key={row.label} className="flex justify-between text-sm">
                <span className={row.className || "text-gray-700"}>{row.label}</span>
                <span className={row.className || "text-gray-900"}>{formatCurrency(row.value)}</span>
              </div>
            ))}

            {rows.length > 0 && (
              <div className="border-t border-gray-200 my-1" />
            )}

            {taxAmount > 0 && (
              <>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>
                    {taxName
                      ? `${taxName} (${(taxRate * 100).toFixed(taxRate * 100 % 1 === 0 ? 0 : 2)}%)`
                      : `Tax (${(taxRate * 100).toFixed(taxRate * 100 % 1 === 0 ? 0 : 2)}%)`}
                  </span>
                  <span>{formatCurrency(taxAmount)}</span>
                </div>
              </>
            )}

            <div className="flex justify-between font-bold text-lg text-teal-700 pt-1">
              <span>Total (CAD)</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Amber Warning Banner */}
        {hasDiscount && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm mb-4 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">A volume discount has been applied to this quote.</p>
              <p className="text-xs mt-0.5">Please verify the total is correct before sending.</p>
            </div>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex justify-between">
          <button
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isSending}
            className={`px-4 py-2 rounded-lg text-white disabled:opacity-50 flex items-center gap-2 ${
              isQuote
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-teal-600 hover:bg-teal-700"
            }`}
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                Confirm & Send →
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
