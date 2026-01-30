import { useState, useEffect } from "react";
import {
  AlertTriangle,
  X,
  Loader2,
  Mail,
  CreditCard,
  Banknote,
  Building,
  FileText,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface CancelOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    id: string;
    order_number: string;
    total_amount: number;
    amount_paid: number;
    customer?: {
      id: string;
      email: string;
      full_name: string;
    };
  };
  staffId: string;
  onSuccess: () => void;
}

const CANCELLATION_REASONS = [
  { code: "customer_request", label: "Customer requested cancellation" },
  { code: "payment_failed", label: "Payment could not be processed" },
  { code: "document_issue", label: "Document quality/authenticity issue" },
  {
    code: "service_unavailable",
    label: "Translation service unavailable for this language",
  },
  { code: "duplicate_order", label: "Duplicate order detected" },
  { code: "fraud_suspected", label: "Suspected fraudulent activity" },
  { code: "other", label: "Other (specify below)" },
];

const REFUND_METHODS = [
  {
    code: "stripe",
    label: "Stripe (automatic)",
    icon: CreditCard,
    stripeOnly: true,
  },
  { code: "cash", label: "Cash", icon: Banknote, stripeOnly: false },
  {
    code: "bank_transfer",
    label: "Bank Transfer",
    icon: Building,
    stripeOnly: false,
  },
  { code: "cheque", label: "Cheque", icon: FileText, stripeOnly: false },
  {
    code: "e_transfer",
    label: "E-Transfer (Interac)",
    icon: Wallet,
    stripeOnly: false,
  },
  {
    code: "store_credit",
    label: "Store Credit",
    icon: CreditCard,
    stripeOnly: false,
  },
  { code: "other", label: "Other", icon: FileText, stripeOnly: false },
];

export default function CancelOrderModal({
  isOpen,
  onClose,
  order,
  staffId,
  onSuccess,
}: CancelOrderModalProps) {
  // Form state
  const [reasonCode, setReasonCode] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [refundType, setRefundType] = useState<"full" | "partial" | "none">(
    "full"
  );
  const [partialAmount, setPartialAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("");
  const [refundReference, setRefundReference] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [refundAlreadyCompleted, setRefundAlreadyCompleted] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [confirmText, setConfirmText] = useState("");

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingPayment, setIsLoadingPayment] = useState(true);

  // Payment info
  const [paymentInfo, setPaymentInfo] = useState<{
    method: string;
    hasStripe: boolean;
    stripePaymentIntentId: string | null;
  } | null>(null);

  // Fetch payment info when modal opens
  useEffect(() => {
    if (isOpen && order.id) {
      setIsLoadingPayment(true);
      supabase
        .from("payments")
        .select("payment_method, stripe_payment_intent_id")
        .eq("order_id", order.id)
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(1)
        .single()
        .then(({ data }) => {
          if (data) {
            setPaymentInfo({
              method: data.payment_method || "unknown",
              hasStripe: !!data.stripe_payment_intent_id,
              stripePaymentIntentId: data.stripe_payment_intent_id,
            });
            // Default refund method based on payment
            if (data.stripe_payment_intent_id) {
              setRefundMethod("stripe");
            } else {
              setRefundMethod("cash");
            }
          } else {
            setPaymentInfo({
              method: "unknown",
              hasStripe: false,
              stripePaymentIntentId: null,
            });
            setRefundMethod("cash");
          }
          setIsLoadingPayment(false);
        });
    }
  }, [isOpen, order.id]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setReasonCode("");
      setAdditionalNotes("");
      setRefundType("full");
      setPartialAmount("");
      setRefundMethod("");
      setRefundReference("");
      setRefundNotes("");
      setRefundAlreadyCompleted(false);
      setSendEmail(true);
      setConfirmText("");
      setPaymentInfo(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const amountPaid = order.amount_paid || 0;
  const canRefund = amountPaid > 0;

  const getRefundAmount = () => {
    if (refundType === "full") return amountPaid;
    if (refundType === "partial")
      return Math.min(parseFloat(partialAmount) || 0, amountPaid);
    return 0;
  };

  const isValid = () => {
    if (!reasonCode) return false;
    if (reasonCode === "other" && !additionalNotes.trim()) return false;
    if (refundType === "partial") {
      const amount = parseFloat(partialAmount);
      if (isNaN(amount) || amount <= 0 || amount > amountPaid) return false;
    }
    if (refundType !== "none" && getRefundAmount() > 0 && !refundMethod)
      return false;
    if (confirmText !== order.order_number) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!isValid()) return;

    setIsSubmitting(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            orderId: order.id,
            staffId,
            reasonCode,
            additionalNotes: additionalNotes.trim() || null,
            refundType,
            refundAmount:
              refundType === "partial" ? parseFloat(partialAmount) : undefined,
            refundMethod: refundType !== "none" ? refundMethod : null,
            refundReference: refundReference.trim() || null,
            refundNotes: refundNotes.trim() || null,
            refundAlreadyCompleted,
            sendEmail,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to cancel order");
      }

      // Build success message
      let message = "Order cancelled successfully";
      if (result.refundAmount > 0) {
        if (result.refundStatus === "completed") {
          message += ` - $${result.refundAmount.toFixed(2)} refund processed`;
        } else if (result.refundStatus === "pending") {
          message += ` - $${result.refundAmount.toFixed(2)} refund pending`;
        } else if (result.refundStatus === "failed") {
          message += ` - Refund failed: ${result.stripeError}`;
        }
      }
      if (result.emailSent) {
        message += " - Email sent";
      } else if (result.emailError) {
        message += ` - Email failed: ${result.emailError}`;
      }

      toast.success(message);
      onSuccess();
      onClose();
    } catch (error: unknown) {
      console.error("Cancel order error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to cancel order";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableRefundMethods = REFUND_METHODS.filter((method) => {
    if (method.stripeOnly) {
      return paymentInfo?.hasStripe;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3 p-6 border-b bg-red-50">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">
              Cancel Order
            </h2>
            <p className="text-sm text-gray-500">{order.order_number}</p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800 font-medium">
              This action cannot be undone. The order will be permanently marked
              as cancelled.
            </p>
          </div>

          {/* Order Info */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Customer:</span>
              <span className="font-medium">
                {order.customer?.full_name || "Unknown"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Email:</span>
              <span>{order.customer?.email || "-"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Order Total:</span>
              <span className="font-medium">
                ${order.total_amount?.toFixed(2) || "0.00"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Amount Paid:</span>
              <span className="font-medium text-green-600">
                ${amountPaid.toFixed(2)}
              </span>
            </div>
            {paymentInfo && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Payment Method:</span>
                <span className="capitalize">
                  {paymentInfo.hasStripe
                    ? "Stripe (Card)"
                    : paymentInfo.method}
                </span>
              </div>
            )}
          </div>

          {/* Reason Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cancellation Reason <span className="text-red-500">*</span>
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
            >
              <option value="">Select a reason...</option>
              {CANCELLATION_REASONS.map((reason) => (
                <option key={reason.code} value={reason.code}>
                  {reason.label}
                </option>
              ))}
            </select>
          </div>

          {/* Additional Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Additional Notes{" "}
              {reasonCode === "other" && (
                <span className="text-red-500">*</span>
              )}
            </label>
            <textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder={
                reasonCode === "other"
                  ? "Please specify the reason..."
                  : "Optional notes..."
              }
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
            />
          </div>

          {/* Refund Options */}
          {canRefund && (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-700">
                Refund Options
              </label>

              {/* Refund Type */}
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="refundType"
                    checked={refundType === "full"}
                    onChange={() => setRefundType("full")}
                    className="w-4 h-4 text-red-600"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Full refund</p>
                    <p className="text-xs text-gray-500">
                      ${amountPaid.toFixed(2)} CAD
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="refundType"
                    checked={refundType === "partial"}
                    onChange={() => setRefundType("partial")}
                    className="w-4 h-4 text-red-600"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Partial refund</p>
                    {refundType === "partial" && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-gray-500">$</span>
                        <input
                          type="number"
                          min="0.01"
                          max={amountPaid}
                          step="0.01"
                          value={partialAmount}
                          onChange={(e) => setPartialAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-32 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-red-500"
                        />
                        <span className="text-xs text-gray-500">
                          Max: ${amountPaid.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="refundType"
                    checked={refundType === "none"}
                    onChange={() => setRefundType("none")}
                    className="w-4 h-4 text-red-600"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-sm">No refund</p>
                    <p className="text-xs text-gray-500">
                      Customer forfeits payment
                    </p>
                  </div>
                </label>
              </div>

              {/* Refund Method */}
              {refundType !== "none" && getRefundAmount() > 0 && (
                <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <label className="block text-sm font-medium text-gray-700">
                    Refund Method <span className="text-red-500">*</span>
                  </label>

                  {isLoadingPayment ? (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading payment info...
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        {availableRefundMethods.map((method) => {
                          const Icon = method.icon;
                          return (
                            <label
                              key={method.code}
                              className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-colors ${
                                refundMethod === method.code
                                  ? "border-blue-500 bg-blue-100"
                                  : "border-gray-200 hover:bg-gray-50"
                              }`}
                            >
                              <input
                                type="radio"
                                name="refundMethod"
                                value={method.code}
                                checked={refundMethod === method.code}
                                onChange={(e) =>
                                  setRefundMethod(e.target.value)
                                }
                                className="sr-only"
                              />
                              <Icon className="w-4 h-4 text-gray-500" />
                              <span className="text-sm">{method.label}</span>
                            </label>
                          );
                        })}
                      </div>

                      {/* Reference/Notes for non-Stripe */}
                      {refundMethod && refundMethod !== "stripe" && (
                        <div className="space-y-3 pt-3 border-t border-blue-200">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">
                              Reference # (optional)
                            </label>
                            <input
                              type="text"
                              value={refundReference}
                              onChange={(e) =>
                                setRefundReference(e.target.value)
                              }
                              placeholder="e.g., Cheque #, Confirmation #, Transaction ID"
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-gray-600 mb-1">
                              Refund Notes (optional)
                            </label>
                            <input
                              type="text"
                              value={refundNotes}
                              onChange={(e) => setRefundNotes(e.target.value)}
                              placeholder="Any additional notes about the refund"
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={refundAlreadyCompleted}
                              onChange={(e) =>
                                setRefundAlreadyCompleted(e.target.checked)
                              }
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                            <span className="text-sm text-gray-700">
                              Refund already given to customer
                            </span>
                          </label>
                        </div>
                      )}

                      {refundMethod === "stripe" && (
                        <p className="text-xs text-blue-700">
                          Refund will be automatically processed via Stripe and
                          credited to the customer's card.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* No payment */}
          {!canRefund && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600">
                No payment was made for this order. No refund is required.
              </p>
            </div>
          )}

          {/* Email Option */}
          <label className="flex items-center gap-3 p-3 bg-gray-50 border rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="w-4 h-4 text-red-600 rounded"
            />
            <div className="flex-1">
              <p className="font-medium text-sm flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Send cancellation email to customer
              </p>
              <p className="text-xs text-gray-500">
                {order.customer?.email || "No email available"}
              </p>
            </div>
          </label>

          {/* Confirmation */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-gray-700 mb-2">
              Type{" "}
              <span className="font-mono font-bold text-red-600">
                {order.order_number}
              </span>{" "}
              to confirm:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={order.order_number}
              className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono"
            />
          </div>
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
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Cancelling...
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4" />
                Confirm Cancellation
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
