import { useState, useEffect } from "react";
import {
  X,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { format } from "date-fns";

interface PaymentMethod {
  id: string;
  code: string;
  name: string;
}

interface RecordARPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  arRecord: {
    id: string;
    order_id: string;
    order_number?: string;
    customer_name?: string;
    customer_email?: string;
    original_amount: number;
    amount_paid: number;
    balance_due: number;
    due_date: string;
    status: string;
  };
  staffId: string;
  onSuccess: () => void;
}

export default function RecordARPaymentModal({
  isOpen,
  onClose,
  arRecord,
  staffId,
  onSuccess,
}: RecordARPaymentModalProps) {
  // Form state
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");

  // UI state
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingMethods, setIsLoadingMethods] = useState(true);

  // Load payment methods on mount
  useEffect(() => {
    if (isOpen) {
      loadPaymentMethods();
      // Pre-fill amount with balance due
      setAmount(arRecord.balance_due.toFixed(2));
    }
  }, [isOpen, arRecord.balance_due]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setAmount("");
      setPaymentMethodId("");
      setPaymentDate(format(new Date(), "yyyy-MM-dd"));
      setReferenceNumber("");
      setNotes("");
    }
  }, [isOpen]);

  const loadPaymentMethods = async () => {
    setIsLoadingMethods(true);
    try {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("id, code, name")
        .eq("is_active", true)
        .neq("code", "stripe") // Exclude online payment methods
        .neq("code", "account") // Exclude account payment (AR is already account)
        .order("display_order");

      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (error) {
      console.error("Error loading payment methods:", error);
      toast.error("Failed to load payment methods");
    } finally {
      setIsLoadingMethods(false);
    }
  };

  const parsedAmount = parseFloat(amount) || 0;
  const newTotalPaid = arRecord.amount_paid + parsedAmount;
  const remainingBalance = arRecord.original_amount - newTotalPaid;
  const isOverpayment = remainingBalance < 0;
  const isPaidInFull = remainingBalance <= 0;

  const isValid = () => {
    if (parsedAmount <= 0) return false;
    if (!paymentMethodId) return false;
    if (!paymentDate) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!isValid()) return;

    setIsSubmitting(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/record-ar-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            ar_id: arRecord.id,
            amount: parsedAmount,
            payment_method_id: paymentMethodId,
            payment_date: paymentDate,
            reference_number: referenceNumber.trim() || null,
            notes: notes.trim() || null,
            staff_id: staffId,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to record payment");
      }

      toast.success(
        isPaidInFull
          ? "Payment recorded - AR invoice paid in full!"
          : `Payment of $${parsedAmount.toFixed(2)} recorded successfully`
      );

      onSuccess();
      onClose();
    } catch (error: unknown) {
      console.error("Error recording payment:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to record payment";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-teal-600" />
            Record Payment
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* AR Invoice Details */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              AR Invoice Details
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">Order:</span>{" "}
                <span className="font-medium">{arRecord.order_number || "—"}</span>
              </div>
              <div>
                <span className="text-gray-500">Due Date:</span>{" "}
                <span className="font-medium">
                  {arRecord.due_date
                    ? format(new Date(arRecord.due_date), "MMM d, yyyy")
                    : "—"}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500">Customer:</span>{" "}
                <span className="font-medium">
                  {arRecord.customer_name || "Unknown"}
                  {arRecord.customer_email && (
                    <span className="text-gray-400 ml-1">
                      ({arRecord.customer_email})
                    </span>
                  )}
                </span>
              </div>
            </div>
            <div className="border-t pt-2 mt-2 grid grid-cols-3 gap-2 text-sm">
              <div>
                <span className="text-gray-500 block">Original</span>
                <span className="font-semibold">
                  ${arRecord.original_amount.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block">Paid</span>
                <span className="font-semibold text-green-600">
                  ${arRecord.amount_paid.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block">Balance</span>
                <span className="font-semibold text-amber-600">
                  ${arRecord.balance_due.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Form */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Payment Details
            </h3>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount Received <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  $
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Balance due: ${arRecord.balance_due.toFixed(2)}
              </p>
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method <span className="text-red-500">*</span>
              </label>
              {isLoadingMethods ? (
                <div className="flex items-center gap-2 text-gray-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                <select
                  value={paymentMethodId}
                  onChange={(e) => setPaymentMethodId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="">Select payment method</option>
                  {paymentMethods.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Payment Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                max={format(new Date(), "yyyy-MM-dd")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            {/* Reference Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference Number
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="e.g., Cheque #1234, Interac ref #ABC123"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this payment"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
              />
            </div>
          </div>

          {/* Payment Summary */}
          {parsedAmount > 0 && (
            <div
              className={`rounded-lg p-4 ${
                isOverpayment
                  ? "bg-amber-50 border border-amber-200"
                  : isPaidInFull
                  ? "bg-green-50 border border-green-200"
                  : "bg-blue-50 border border-blue-200"
              }`}
            >
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                {isOverpayment ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span className="text-amber-800">Overpayment Detected</span>
                  </>
                ) : isPaidInFull ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-green-800">Payment Summary</span>
                  </>
                ) : (
                  <>
                    <DollarSign className="w-4 h-4 text-blue-600" />
                    <span className="text-blue-800">Payment Summary</span>
                  </>
                )}
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Amount Received:</span>
                  <span className="font-medium">${parsedAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Previous Payments:</span>
                  <span className="font-medium">
                    ${arRecord.amount_paid.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-1">
                  <span className="text-gray-600">New Total Paid:</span>
                  <span className="font-semibold">${newTotalPaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Remaining Balance:</span>
                  <span
                    className={`font-semibold ${
                      isOverpayment
                        ? "text-amber-600"
                        : isPaidInFull
                        ? "text-green-600"
                        : "text-gray-900"
                    }`}
                  >
                    {isOverpayment
                      ? `-$${Math.abs(remainingBalance).toFixed(2)} (overpaid)`
                      : isPaidInFull
                      ? "$0.00 - PAID IN FULL"
                      : `$${remainingBalance.toFixed(2)}`}
                  </span>
                </div>
              </div>
              {isOverpayment && (
                <p className="mt-2 text-xs text-amber-700">
                  The overpayment will be recorded. You may need to issue a refund
                  or apply as credit to a future order.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid() || isSubmitting}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Recording...
              </>
            ) : (
              <>
                <DollarSign className="w-4 h-4" />
                Record Payment
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
