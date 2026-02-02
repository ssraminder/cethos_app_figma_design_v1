import { useState } from "react";
import {
  X,
  AlertTriangle,
  CreditCard,
  DollarSign,
  Loader2,
  Check,
  Receipt,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

interface OrderPriceChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerType: string; // 'individual' | 'business'
  orderStatus: string;
  originalTotal: number;
  newTotal: number;
  difference: number; // positive = increase (customer owes more), negative = decrease (refund)
  staffId: string;
  onSuccess: () => void;
}

export default function OrderPriceChangeModal({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  customerId,
  customerName,
  customerEmail,
  customerType,
  orderStatus,
  originalTotal,
  newTotal,
  difference,
  staffId,
  onSuccess,
}: OrderPriceChangeModalProps) {
  const [handling, setHandling] = useState<string>("");
  const [waiveReason, setWaiveReason] = useState("");
  const [stripeExpiry, setStripeExpiry] = useState(7);
  const [refundMethod, setRefundMethod] = useState<string>("stripe");
  const [isProcessing, setIsProcessing] = useState(false);

  const isIncrease = difference > 0;
  const isDecrease = difference < 0;
  const absoluteDifference = Math.abs(difference);
  const isDelivered = orderStatus === "delivered";

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!handling) {
      toast.error("Please select how to handle the price change");
      return;
    }

    if (handling === "waive" && !waiveReason.trim()) {
      toast.error("Please enter a reason for waiving the difference");
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-order-price-change`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            order_id: orderId,
            customer_id: customerId,
            original_total: originalTotal,
            new_total: newTotal,
            difference: difference,
            handling_method: handling,
            waive_reason: waiveReason.trim() || null,
            stripe_expiry_days: stripeExpiry,
            refund_method: refundMethod,
            staff_id: staffId,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to process price change");
      }

      if (result.stripe_payment_link) {
        await navigator.clipboard.writeText(result.stripe_payment_link);
        toast.success("Payment link copied to clipboard");
      }

      if (handling === "waive") {
        toast.success("Difference waived successfully");
      } else if (handling === "ar") {
        toast.success("Difference added to Accounts Receivable");
      } else if (handling === "stripe") {
        toast.success("Payment request sent to customer");
      } else if (handling === "refund") {
        toast.success("Refund initiated successfully");
      }

      onSuccess();
      onClose();
    } catch (error: unknown) {
      console.error("Price change handling error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to process";
      toast.error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isIncrease ? "bg-amber-100" : "bg-green-100"
              }`}
            >
              {isIncrease ? (
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              ) : (
                <CreditCard className="w-5 h-5 text-green-600" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {isIncrease ? "Additional Payment Required" : "Refund Required"}
              </h2>
              <p className="text-sm text-gray-500">Order {orderNumber}</p>
            </div>
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
        <div className="p-6 space-y-6">
          {/* Price Summary */}
          <div
            className={`rounded-lg p-4 ${
              isIncrease ? "bg-amber-50" : "bg-green-50"
            }`}
          >
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-600">Original Total:</div>
              <div className="text-right font-medium">
                ${originalTotal.toFixed(2)}
              </div>
              <div className="text-gray-600">New Total:</div>
              <div className="text-right font-medium">
                ${newTotal.toFixed(2)}
              </div>
              <div
                className={`font-medium border-t pt-2 ${
                  isIncrease ? "text-amber-700" : "text-green-700"
                }`}
              >
                {isIncrease ? "Additional Required:" : "Refund Amount:"}
              </div>
              <div
                className={`text-right font-bold border-t pt-2 ${
                  isIncrease ? "text-amber-700" : "text-green-700"
                }`}
              >
                ${absoluteDifference.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Customer Info */}
          <div className="text-sm text-gray-600">
            <p>
              <span className="font-medium">Customer:</span> {customerName}
            </p>
            <p>
              <span className="font-medium">Email:</span> {customerEmail}
            </p>
          </div>

          {/* Handling Options */}
          {isIncrease ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">
                How would you like to handle this?
              </p>

              {/* Auto AR for delivered orders */}
              {isDelivered ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    This order has been delivered. The ${absoluteDifference.toFixed(2)}{" "}
                    difference will be added to Accounts Receivable.
                  </p>
                </div>
              ) : (
                <>
                  {/* Request via Stripe */}
                  <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:border-teal-400">
                    <input
                      type="radio"
                      name="handling"
                      value="stripe"
                      checked={handling === "stripe"}
                      onChange={(e) => setHandling(e.target.value)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        Request Payment via Stripe
                      </p>
                      <p className="text-sm text-gray-500">
                        Generate payment link and email to customer
                      </p>
                      {handling === "stripe" && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-sm text-gray-600">
                            Link expires in:
                          </span>
                          <select
                            value={stripeExpiry}
                            onChange={(e) =>
                              setStripeExpiry(parseInt(e.target.value))
                            }
                            className="px-2 py-1 text-sm border rounded"
                          >
                            <option value={3}>3 days</option>
                            <option value={7}>7 days</option>
                            <option value={14}>14 days</option>
                            <option value={30}>30 days</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </label>

                  {/* Add to AR (Business customers only) */}
                  {customerType === "business" && (
                    <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:border-teal-400">
                      <input
                        type="radio"
                        name="handling"
                        value="ar"
                        checked={handling === "ar"}
                        onChange={(e) => setHandling(e.target.value)}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-medium text-gray-900">
                          Add to Accounts Receivable
                        </p>
                        <p className="text-sm text-gray-500">
                          Invoice the customer later (Net 30)
                        </p>
                      </div>
                    </label>
                  )}

                  {/* Waive */}
                  <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:border-teal-400">
                    <input
                      type="radio"
                      name="handling"
                      value="waive"
                      checked={handling === "waive"}
                      onChange={(e) => setHandling(e.target.value)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        Waive Difference
                      </p>
                      <p className="text-sm text-gray-500">
                        Apply as goodwill discount
                      </p>
                      {handling === "waive" && (
                        <input
                          type="text"
                          value={waiveReason}
                          onChange={(e) => setWaiveReason(e.target.value)}
                          placeholder="Reason for waiving..."
                          className="mt-2 w-full px-3 py-1.5 text-sm border rounded-lg"
                          required
                        />
                      )}
                    </div>
                  </label>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">
                The customer will be refunded ${absoluteDifference.toFixed(2)}
              </p>

              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:border-teal-400">
                  <input
                    type="radio"
                    name="refund"
                    value="stripe"
                    checked={refundMethod === "stripe"}
                    onChange={(e) => {
                      setRefundMethod(e.target.value);
                      setHandling("refund");
                    }}
                    className=""
                  />
                  <div>
                    <p className="font-medium text-gray-900">
                      Refund via Stripe
                    </p>
                    <p className="text-sm text-gray-500">
                      Refund to original payment method
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:border-teal-400">
                  <input
                    type="radio"
                    name="refund"
                    value="credit"
                    checked={refundMethod === "credit"}
                    onChange={(e) => {
                      setRefundMethod(e.target.value);
                      setHandling("refund");
                    }}
                    className=""
                  />
                  <div>
                    <p className="font-medium text-gray-900">
                      Credit to Account
                    </p>
                    <p className="text-sm text-gray-500">
                      Add to customer's credit balance for future orders
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:border-teal-400">
                  <input
                    type="radio"
                    name="refund"
                    value="manual"
                    checked={refundMethod === "manual"}
                    onChange={(e) => {
                      setRefundMethod(e.target.value);
                      setHandling("refund");
                    }}
                    className=""
                  />
                  <div>
                    <p className="font-medium text-gray-900">Manual Refund</p>
                    <p className="text-sm text-gray-500">
                      Process refund manually (check, e-transfer, etc.)
                    </p>
                  </div>
                </label>
              </div>
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
            disabled={
              isProcessing ||
              (!isDelivered && isIncrease && !handling) ||
              (isDecrease && !refundMethod)
            }
            className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 flex items-center gap-2 ${
              isIncrease
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                {isDelivered
                  ? "Add to AR"
                  : isIncrease
                  ? "Confirm"
                  : "Process Refund"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
