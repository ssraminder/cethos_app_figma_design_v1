import { useState, useEffect } from "react";
import { X, CheckCircle, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Invoice {
  id: string;
  invoice_number: string;
  balance_due: number;
  due_date: string;
}

interface QueueItem {
  id: string;
  amount: number;
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

  useEffect(() => {
    // Pre-fill from AI allocations if available
    if (queueItem.ai_allocations) {
      const initial: Record<string, number> = {};
      queueItem.ai_allocations.forEach((alloc: any) => {
        initial[alloc.invoice_id] = alloc.allocated_amount;
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
    // Auto-allocate oldest first
    const newAllocations: Record<string, number> = {};
    let remaining = queueItem.amount;

    const sortedInvoices = [...(queueItem.invoices || [])].sort(
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
        const invoice = queueItem.invoices?.find((i) => i.id === invoiceId);
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
            <p className="text-sm text-gray-500">
              Payment Amount: <strong>${queueItem.amount.toFixed(2)}</strong>
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
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-700">Outstanding Invoices</h3>
            <button
              onClick={handleAutoAllocate}
              className="text-sm text-teal-600 hover:text-teal-700"
            >
              Auto-allocate (Oldest First)
            </button>
          </div>

          <div className="space-y-3 mb-6">
            {queueItem.invoices?.map((invoice) => (
              <div
                key={invoice.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900">{invoice.invoice_number}</p>
                  <p className="text-sm text-gray-500">
                    Balance: ${invoice.balance_due.toFixed(2)}
                  </p>
                </div>
                <div className="w-32">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      $
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

          {/* Summary */}
          <div
            className={`p-4 rounded-lg ${
              isBalanced
                ? "bg-green-50 border border-green-200"
                : "bg-amber-50 border border-amber-200"
            }`}
          >
            <div className="flex justify-between mb-2">
              <span className="text-gray-600">Payment Amount:</span>
              <span className="font-medium">${queueItem.amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-gray-600">Total Allocated:</span>
              <span className="font-medium">${totalAllocated.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-gray-600">Unallocated:</span>
              <span
                className={`font-semibold ${
                  isBalanced ? "text-green-600" : "text-amber-600"
                }`}
              >
                ${unallocated.toFixed(2)}
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
            disabled={!isBalanced || isProcessing}
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
