import { useState, useEffect } from "react";
import { X, DollarSign, Loader2, CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { format } from "date-fns";

interface RecordOrderPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    id: string;
    order_number: string;
    total_amount: number;
    amount_paid: number;
    balance_due: number;
    customer?: {
      full_name: string;
      email: string;
    };
  };
  staffId: string;
  onSuccess: () => void;
}

interface PaymentMethod {
  id: string;
  code: string;
  name: string;
}

export default function RecordOrderPaymentModal({
  isOpen,
  onClose,
  order,
  staffId,
  onSuccess,
}: RecordOrderPaymentModalProps) {
  const [amount, setAmount] = useState(order.balance_due.toFixed(2));
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPaymentMethods();
      setAmount(order.balance_due.toFixed(2));
    }
  }, [isOpen, order.balance_due]);

  const loadPaymentMethods = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("id, code, name")
        .eq("is_active", true)
        .not("code", "in", '("stripe","account")') // Exclude Stripe and Account
        .order("sort_order");

      if (error) throw error;
      setPaymentMethods(data || []);
      if (data && data.length > 0 && !paymentMethodId) {
        setPaymentMethodId(data[0].id);
      }
    } catch (err) {
      console.error("Error loading payment methods:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const parsedAmount = parseFloat(amount) || 0;
  const newTotalPaid = order.amount_paid + parsedAmount;
  const newBalanceDue = order.total_amount - newTotalPaid;
  const isFullPayment = newBalanceDue <= 0;
  const isOverpayment = newBalanceDue < 0;

  const isValid = () => {
    return parsedAmount > 0 && paymentMethodId && paymentDate;
  };

  const handleSubmit = async () => {
    if (!isValid()) return;

    setSaving(true);
    try {
      const selectedMethod = paymentMethods.find((pm) => pm.id === paymentMethodId);
      const now = new Date().toISOString();

      // 1. Create payment record
      const { error: paymentError } = await supabase.from("payments").insert({
        order_id: order.id,
        amount: parsedAmount,
        currency: "CAD",
        status: "succeeded",
        payment_method: selectedMethod?.code || "manual",
        reference_number: referenceNumber || null,
        notes: notes || null,
        confirmed_by_staff_id: staffId,
        created_at: now,
      });

      if (paymentError) throw paymentError;

      // 2. Update order
      const { error: orderError } = await supabase
        .from("orders")
        .update({
          amount_paid: newTotalPaid,
          balance_due: Math.max(0, newBalanceDue),
          status: isFullPayment ? "paid" : "balance_due",
          updated_at: now,
        })
        .eq("id", order.id);

      if (orderError) throw orderError;

      // 3. Log staff activity
      await supabase.from("staff_activity_log").insert({
        staff_id: staffId,
        action_type: "record_order_payment",
        entity_type: "order",
        entity_id: order.id,
        details: {
          order_number: order.order_number,
          amount: parsedAmount,
          payment_method: selectedMethod?.name,
          reference_number: referenceNumber,
          previous_paid: order.amount_paid,
          new_total_paid: newTotalPaid,
          new_balance_due: Math.max(0, newBalanceDue),
          is_full_payment: isFullPayment,
        },
      });

      toast.success(
        isFullPayment
          ? `Payment recorded - Order ${order.order_number} paid in full!`
          : `Payment of $${parsedAmount.toFixed(2)} recorded`
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Error recording payment:", err);
      toast.error(err.message || "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-teal-600" />
              Record Payment
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Order {order.order_number}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
            </div>
          ) : (
            <>
              {/* Customer Info */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="font-medium">{order.customer?.full_name}</p>
                <p className="text-gray-500">{order.customer?.email}</p>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Balance due: ${order.balance_due.toFixed(2)}
                </p>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method <span className="text-red-500">*</span>
                </label>
                <select
                  value={paymentMethodId}
                  onChange={(e) => setPaymentMethodId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Select method...</option>
                  {paymentMethods.map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.name}
                    </option>
                  ))}
                </select>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
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
                  placeholder="e.g., E-transfer confirmation #"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
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
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>

              {/* Payment Summary */}
              <div
                className={`rounded-lg p-4 ${
                  isFullPayment
                    ? "bg-green-50 border border-green-200"
                    : isOverpayment
                    ? "bg-amber-50 border border-amber-200"
                    : "bg-blue-50 border border-blue-200"
                }`}
              >
                <h4
                  className={`text-sm font-medium mb-2 ${
                    isFullPayment
                      ? "text-green-800"
                      : isOverpayment
                      ? "text-amber-800"
                      : "text-blue-800"
                  }`}
                >
                  Payment Summary
                </h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Order Total:</span>
                    <span className="font-medium">${order.total_amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Previously Paid:</span>
                    <span>${order.amount_paid.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">This Payment:</span>
                    <span className="font-medium text-teal-600">
                      +${parsedAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-1 mt-1">
                    <span className="text-gray-600">New Balance:</span>
                    <span
                      className={`font-semibold ${
                        isFullPayment ? "text-green-600" : "text-gray-900"
                      }`}
                    >
                      ${Math.max(0, newBalanceDue).toFixed(2)}
                      {isFullPayment && (
                        <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                          PAID IN FULL
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                {isOverpayment && (
                  <p className="text-xs text-amber-700 mt-2">
                    This will result in an overpayment of ${Math.abs(newBalanceDue).toFixed(2)}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid() || saving}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Recording...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Record Payment
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
