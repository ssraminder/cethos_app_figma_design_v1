import { useState, useEffect } from "react";
import { X, CheckCircle, Loader2, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { formatCurrencyAmount, getCurrencyBadgeClasses, getCurrencySymbol } from "@/utils/currency";

interface Invoice {
  id: string;
  invoice_number: string;
  balance_due: number;
  due_date: string;
  currency?: string;
}

interface QueueItem {
  id: string;
  amount: number;
  currency?: string;
  customer_id: string;
  invoices?: Invoice[];
  ai_allocations?: any[];
}

interface Allocation {
  invoice_id: string;
  invoice_number: string;
  allocated_amount: number;
}

interface PaymentAllocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  queueItem: QueueItem;
  onConfirm: (allocations: Allocation[]) => void;
  isProcessing: boolean;
}

export default function PaymentAllocationModal({
  isOpen,
  onClose,
  queueItem,
  onConfirm,
  isProcessing,
}: PaymentAllocationModalProps) {
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  const paymentCurrency = queueItem.currency || "CAD";
  const isNonCad = paymentCurrency !== "CAD";
  const currSymbol = getCurrencySymbol(paymentCurrency);

  // Filter invoices to only show those matching the payment currency
  const matchingInvoices = (queueItem.invoices || []).filter(
    (inv) => !inv.currency || inv.currency === paymentCurrency
  );
  const otherCurrencyInvoices = (queueItem.invoices || []).filter(
    (inv) => inv.currency && inv.currency !== paymentCurrency
  );

  useEffect(() => {
    // Pre-fill from AI allocations if available (only matching currency)
    if (queueItem.ai_allocations) {
      const initial: Record<string, number> = {};
      const matchingIds = new Set(matchingInvoices.map((i) => i.id));
      queueItem.ai_allocations.forEach((alloc: any) => {
        if (matchingIds.has(alloc.invoice_id)) {
          initial[alloc.invoice_id] = alloc.allocated_amount;
        }
      });
      setAllocations(initial);
    }
  }, [queueItem]);

  if (!isOpen) return null;

  const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + (val || 0), 0);
  const unallocated = queueItem.amount - totalAllocated;
  const isBalanced = Math.abs(unallocated) < 0.01;

  const handleAllocationChange = (invoiceId: string, value: string) => {
    const amount = parseFloat(value) || 0;
    setAllocations((prev) => ({
      ...prev,
      [invoiceId]: amount,
    }));
  };

  const handleAutoAllocate = () => {
    // Auto-allocate oldest first, only matching currency
    const newAllocations: Record<string, number> = {};
    let remaining = queueItem.amount;

    const sortedInvoices = [...matchingInvoices].sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    );

    for (const invoice of sortedInvoices) {
      if (remaining <= 0) break;
      const toAllocate = Math.min(remaining, invoice.balance_due);
      newAllocations[invoice.id] = toAllocate;
      remaining -= toAllocate;
    }

    setAllocations(newAllocations);
  };

  const handleConfirm = () => {
    if (!isBalanced) {
      toast.error("Allocations must equal payment amount");
      return;
    }

    const allocationList: Allocation[] = Object.entries(allocations)
      .filter(([_, amount]) => amount > 0)
      .map(([invoiceId, amount]) => {
        const invoice = matchingInvoices.find((i) => i.id === invoiceId);
        return {
          invoice_id: invoiceId,
          invoice_number: invoice?.invoice_number || "",
          allocated_amount: amount,
        };
      });

    if (allocationList.length === 0) {
      toast.error("Please allocate to at least one invoice");
      return;
    }

    onConfirm(allocationList);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Allocate Payment</h2>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              Payment Amount:{" "}
              <strong>
                {formatCurrencyAmount(queueItem.amount, paymentCurrency)}
              </strong>
              {isNonCad && (
                <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${getCurrencyBadgeClasses(paymentCurrency)}`}>
                  {paymentCurrency}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Info banner for non-CAD */}
          {isNonCad && (
            <div className="flex items-start gap-2 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                This payment was recorded in {paymentCurrency}. It can only be allocated to {paymentCurrency} invoices.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-700">Outstanding Invoices</h3>
            <button
              onClick={handleAutoAllocate}
              className="text-sm text-teal-600 hover:text-teal-700"
            >
              Auto-allocate (Oldest First)
            </button>
          </div>

          {matchingInvoices.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-500 mb-2">
                No unpaid invoices in {paymentCurrency}.
              </p>
              {otherCurrencyInvoices.length > 0 && (
                <p className="text-xs text-gray-400">
                  This customer has {otherCurrencyInvoices.length} unpaid invoice(s) in other currencies (
                  {[...new Set(otherCurrencyInvoices.map((i) => i.currency))].join(", ")}).
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3 mb-6">
              {matchingInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{invoice.invoice_number}</p>
                      {invoice.currency && invoice.currency !== "CAD" && (
                        <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${getCurrencyBadgeClasses(invoice.currency)}`}>
                          {invoice.currency}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      Balance: {formatCurrencyAmount(invoice.balance_due, paymentCurrency)}
                    </p>
                  </div>
                  <div className="w-32">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {currSymbol}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={invoice.balance_due}
                        value={allocations[invoice.id] || ""}
                        onChange={(e) => handleAllocationChange(invoice.id, e.target.value)}
                        className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-teal-500"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          {matchingInvoices.length > 0 && (
            <>
              <div
                className={`p-4 rounded-lg ${
                  isBalanced
                    ? "bg-green-50 border border-green-200"
                    : "bg-amber-50 border border-amber-200"
                }`}
              >
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">Payment Amount:</span>
                  <span className="font-medium">{formatCurrencyAmount(queueItem.amount, paymentCurrency)}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">Total Allocated:</span>
                  <span className="font-medium">{formatCurrencyAmount(totalAllocated, paymentCurrency)}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-600">Unallocated:</span>
                  <span
                    className={`font-semibold ${
                      isBalanced ? "text-green-600" : "text-amber-600"
                    }`}
                  >
                    {formatCurrencyAmount(unallocated, paymentCurrency)}
                    {isBalanced && <CheckCircle className="w-4 h-4 inline ml-1" />}
                  </span>
                </div>
              </div>

              {!isBalanced && (
                <div className="flex items-center gap-2 mt-4 text-amber-600 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  Allocations must equal the payment amount
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isBalanced || isProcessing || matchingInvoices.length === 0}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Confirm Payment
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
