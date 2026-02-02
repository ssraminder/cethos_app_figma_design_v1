import { useState, useEffect } from "react";
import {
  X,
  Loader2,
  DollarSign,
  CreditCard,
  AlertTriangle,
  Send,
  Percent,
  Banknote,
  Building,
  Wallet,
  FileText,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
}

interface Customer {
  id: string;
  full_name: string;
  email: string;
}

interface PaymentInfo {
  hasStripePayment: boolean;
  stripePaymentIntentId: string | null;
  originalMethod: string;
  last4?: string;
  brand?: string;
}

interface BalanceResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  customer: Customer;
  originalTotal: number;
  balanceChange: number; // positive = underpayment, negative = overpayment
  staffId: string;
  staffRole: "reviewer" | "senior_reviewer" | "super_admin" | string;
  onSuccess: () => void;
}

// Role-based offset limits
const OFFSET_LIMITS: Record<string, number> = {
  reviewer: 10,
  senior_reviewer: 25,
  super_admin: Infinity,
};

const MANUAL_METHODS = [
  { code: "e_transfer", label: "E-Transfer (Interac)", icon: Wallet },
  { code: "cheque", label: "Cheque", icon: FileText },
  { code: "bank_transfer", label: "Bank Transfer", icon: Building },
  { code: "cash", label: "Cash", icon: Banknote },
];

type ResolutionType =
  | "stripe_payment"
  | "manual_payment"
  | "offset_discount"
  | "stripe_refund"
  | "manual_refund"
  | "offset_credit";

export default function BalanceResolutionModal({
  isOpen,
  onClose,
  order,
  customer,
  originalTotal,
  balanceChange,
  staffId,
  staffRole,
  onSuccess,
}: BalanceResolutionModalProps) {
  const isUnderpayment = balanceChange > 0;
  const absAmount = Math.abs(balanceChange);
  const maxOffset = OFFSET_LIMITS[staffRole] || 10;
  const canOffset = absAmount <= maxOffset;

  // Payment info for Stripe refunds
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [loadingPaymentInfo, setLoadingPaymentInfo] = useState(true);

  // Resolution type
  const [resolutionType, setResolutionType] = useState<ResolutionType>(
    isUnderpayment ? "stripe_payment" : "stripe_refund"
  );

  // Form state
  const [manualMethod, setManualMethod] = useState("");
  const [offsetReason, setOffsetReason] = useState("");
  const [customerNote, setCustomerNote] = useState(
    isUnderpayment
      ? "Your order total has been adjusted. Please complete payment to proceed with your translation."
      : ""
  );
  const [refundReference, setRefundReference] = useState("");

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load payment info for refunds
  useEffect(() => {
    if (isOpen && !isUnderpayment) {
      loadPaymentInfo();
    } else {
      setLoadingPaymentInfo(false);
    }
  }, [isOpen, isUnderpayment, order.id]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setResolutionType(isUnderpayment ? "stripe_payment" : "stripe_refund");
      setManualMethod("");
      setOffsetReason("");
      setRefundReference("");
      setCustomerNote(
        isUnderpayment
          ? "Your order total has been adjusted. Please complete payment to proceed with your translation."
          : ""
      );
    }
  }, [isOpen, isUnderpayment]);

  const loadPaymentInfo = async () => {
    setLoadingPaymentInfo(true);
    try {
      const { data: payment, error } = await supabase
        .from("payments")
        .select("*")
        .eq("order_id", order.id)
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !payment) {
        setPaymentInfo({
          hasStripePayment: false,
          stripePaymentIntentId: null,
          originalMethod: "unknown",
        });
        setResolutionType("manual_refund");
      } else {
        const hasStripe = !!payment.stripe_payment_intent_id;
        setPaymentInfo({
          hasStripePayment: hasStripe,
          stripePaymentIntentId: payment.stripe_payment_intent_id,
          originalMethod: hasStripe ? "stripe" : "manual",
          last4: payment.card_last4,
          brand: payment.card_brand,
        });
        setResolutionType(hasStripe ? "stripe_refund" : "manual_refund");
      }
    } catch (err) {
      console.error("Error loading payment info:", err);
      setPaymentInfo({
        hasStripePayment: false,
        stripePaymentIntentId: null,
        originalMethod: "unknown",
      });
      setResolutionType("manual_refund");
    } finally {
      setLoadingPaymentInfo(false);
    }
  };

  if (!isOpen) return null;

  const isValid = () => {
    switch (resolutionType) {
      case "manual_payment":
      case "manual_refund":
        return !!manualMethod;
      case "offset_discount":
      case "offset_credit":
        return !!offsetReason.trim() && canOffset;
      default:
        return true;
    }
  };

  const getButtonText = () => {
    switch (resolutionType) {
      case "stripe_payment":
        return "Send Payment Link";
      case "manual_payment":
        return "Send Payment Request";
      case "offset_discount":
        return "Apply Discount";
      case "stripe_refund":
        return "Process Stripe Refund";
      case "manual_refund":
        return "Record Manual Refund";
      case "offset_credit":
        return "Record as Credit";
    }
  };

  const handleSubmit = async () => {
    if (!isValid()) return;

    setIsSubmitting(true);

    try {
      let endpoint = "";
      let payload: Record<string, unknown> = {
        order_id: order.id,
        staff_id: staffId,
        amount: absAmount,
      };

      switch (resolutionType) {
        case "stripe_payment":
          endpoint = "request-balance-payment";
          payload.method = "stripe";
          payload.customer_email = customer.email;
          payload.customer_name = customer.full_name;
          payload.customer_note = customerNote.trim() || null;
          break;

        case "manual_payment":
          endpoint = "request-balance-payment";
          payload.method = manualMethod;
          payload.customer_email = customer.email;
          payload.customer_name = customer.full_name;
          payload.customer_note = customerNote.trim() || null;
          break;

        case "offset_discount":
          endpoint = "offset-order-balance";
          payload.offset_type = "discount";
          payload.reason = offsetReason.trim();
          break;

        case "stripe_refund":
          endpoint = "process-order-refund";
          payload.method = "stripe";
          payload.stripe_payment_intent_id = paymentInfo?.stripePaymentIntentId;
          break;

        case "manual_refund":
          endpoint = "process-order-refund";
          payload.method = manualMethod;
          payload.reference = refundReference.trim() || null;
          break;

        case "offset_credit":
          endpoint = "offset-order-balance";
          payload.offset_type = "credit";
          payload.reason = offsetReason.trim();
          break;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to resolve balance");
      }

      // Success messages
      const messages: Record<ResolutionType, string> = {
        stripe_payment: "Payment link sent to customer",
        manual_payment: "Payment request email sent",
        offset_discount: `$${absAmount.toFixed(2)} discount applied`,
        stripe_refund: "Refund processed via Stripe",
        manual_refund: "Manual refund recorded",
        offset_credit: `$${absAmount.toFixed(2)} recorded as customer credit`,
      };

      toast.success(messages[resolutionType]);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error("Balance resolution error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to resolve balance";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div
          className={`p-6 border-b ${
            isUnderpayment ? "bg-amber-50" : "bg-green-50"
          }`}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Resolve Balance: {isUnderpayment ? "Underpayment" : "Overpayment"}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Order {order.order_number}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Order Summary */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
            <p className="font-medium">
              {customer.full_name}{" "}
              <span className="text-gray-500">({customer.email})</span>
            </p>
            {!isUnderpayment && paymentInfo?.hasStripePayment && (
              <p className="text-gray-600">
                Original Payment: Stripe{" "}
                {paymentInfo.brand && paymentInfo.last4 && (
                  <span>
                    ({paymentInfo.brand} ****{paymentInfo.last4})
                  </span>
                )}
              </p>
            )}
            <div className="border-t pt-2 mt-2 space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Original Total:</span>
                <span>${originalTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">New Total:</span>
                <span>${order.total_amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Amount Paid:</span>
                <span>${order.amount_paid.toFixed(2)}</span>
              </div>
              <div
                className={`flex justify-between font-semibold border-t pt-1 ${
                  isUnderpayment ? "text-amber-700" : "text-green-700"
                }`}
              >
                <span>{isUnderpayment ? "BALANCE DUE:" : "REFUND DUE:"}</span>
                <span>${absAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Loading state for payment info */}
          {!isUnderpayment && loadingPaymentInfo && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
              <span className="ml-2 text-gray-600">Loading payment information...</span>
            </div>
          )}

          {/* Resolution Options */}
          {(!loadingPaymentInfo || isUnderpayment) && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">
                How would you like to resolve this?
              </p>

              {isUnderpayment ? (
                <>
                  {/* Stripe Payment Link */}
                  <label
                    className={`block p-4 border rounded-lg cursor-pointer transition-colors ${
                      resolutionType === "stripe_payment"
                        ? "border-teal-500 bg-teal-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="resolution"
                        checked={resolutionType === "stripe_payment"}
                        onChange={() => setResolutionType("stripe_payment")}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-gray-500" />
                          <span className="font-medium">Send Stripe Payment Link</span>
                          <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded">
                            Recommended
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          Customer receives email with secure payment link
                        </p>
                      </div>
                    </div>
                  </label>

                  {/* Manual Payment Request */}
                  <label
                    className={`block p-4 border rounded-lg cursor-pointer transition-colors ${
                      resolutionType === "manual_payment"
                        ? "border-teal-500 bg-teal-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="resolution"
                        checked={resolutionType === "manual_payment"}
                        onChange={() => setResolutionType("manual_payment")}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Banknote className="w-4 h-4 text-gray-500" />
                          <span className="font-medium">Request Manual Payment</span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          E-transfer, cheque, or other method
                        </p>
                      </div>
                    </div>
                  </label>

                  {/* Offset as Discount */}
                  <label
                    className={`block p-4 border rounded-lg cursor-pointer transition-colors ${
                      resolutionType === "offset_discount"
                        ? "border-teal-500 bg-teal-50"
                        : canOffset
                        ? "border-gray-200 hover:bg-gray-50"
                        : "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="resolution"
                        checked={resolutionType === "offset_discount"}
                        onChange={() => canOffset && setResolutionType("offset_discount")}
                        disabled={!canOffset}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Percent className="w-4 h-4 text-gray-500" />
                          <span className="font-medium">Waive as Discount</span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          Apply ${absAmount.toFixed(2)} discount (requires reason)
                        </p>
                        {!canOffset && (
                          <p className="text-sm text-amber-600 mt-2 flex items-center gap-1">
                            <AlertTriangle className="w-4 h-4" />
                            Amount exceeds your limit (${maxOffset}). Contact a manager.
                          </p>
                        )}
                      </div>
                    </div>
                  </label>
                </>
              ) : (
                <>
                  {/* Stripe Refund */}
                  {paymentInfo?.hasStripePayment && (
                    <label
                      className={`block p-4 border rounded-lg cursor-pointer transition-colors ${
                        resolutionType === "stripe_refund"
                          ? "border-teal-500 bg-teal-50"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="resolution"
                          checked={resolutionType === "stripe_refund"}
                          onChange={() => setResolutionType("stripe_refund")}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 text-gray-500" />
                            <span className="font-medium">Refund via Stripe</span>
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                              Recommended
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            Automatic refund to customer's original payment method
                          </p>
                        </div>
                      </div>
                    </label>
                  )}

                  {/* Manual Refund */}
                  <label
                    className={`block p-4 border rounded-lg cursor-pointer transition-colors ${
                      resolutionType === "manual_refund"
                        ? "border-teal-500 bg-teal-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="resolution"
                        checked={resolutionType === "manual_refund"}
                        onChange={() => setResolutionType("manual_refund")}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Banknote className="w-4 h-4 text-gray-500" />
                          <span className="font-medium">Manual Refund</span>
                          {!paymentInfo?.hasStripePayment && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                              No Stripe payment found
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          E-transfer, cheque, or other method
                        </p>
                      </div>
                    </div>
                  </label>

                  {/* Offset as Credit */}
                  <label
                    className={`block p-4 border rounded-lg cursor-pointer transition-colors ${
                      resolutionType === "offset_credit"
                        ? "border-teal-500 bg-teal-50"
                        : canOffset
                        ? "border-gray-200 hover:bg-gray-50"
                        : "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="resolution"
                        checked={resolutionType === "offset_credit"}
                        onChange={() => canOffset && setResolutionType("offset_credit")}
                        disabled={!canOffset}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Percent className="w-4 h-4 text-gray-500" />
                          <span className="font-medium">Record as Customer Credit</span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          Note ${absAmount.toFixed(2)} overpayment (requires reason)
                        </p>
                        {!canOffset && (
                          <p className="text-sm text-amber-600 mt-2 flex items-center gap-1">
                            <AlertTriangle className="w-4 h-4" />
                            Amount exceeds your limit (${maxOffset}). Contact a manager.
                          </p>
                        )}
                      </div>
                    </div>
                  </label>
                </>
              )}
            </div>
          )}

          {/* Manual Method Selection */}
          {(resolutionType === "manual_payment" || resolutionType === "manual_refund") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {isUnderpayment ? "Payment" : "Refund"} Method <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {MANUAL_METHODS.map((method) => {
                  const Icon = method.icon;
                  return (
                    <label
                      key={method.code}
                      className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                        manualMethod === method.code
                          ? "border-teal-500 bg-teal-50"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="manualMethod"
                        value={method.code}
                        checked={manualMethod === method.code}
                        onChange={(e) => setManualMethod(e.target.value)}
                        className="sr-only"
                      />
                      <Icon className="w-4 h-4 text-gray-500" />
                      <span className="text-sm">{method.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Customer Note (for payment requests) */}
          {(resolutionType === "stripe_payment" || resolutionType === "manual_payment") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Note to Customer
              </label>
              <textarea
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
                placeholder="Explain why additional payment is needed..."
              />
              <p className="text-xs text-gray-500 mt-1">
                This note will be included in the payment request email.
              </p>
            </div>
          )}

          {/* Refund Reference (for manual refunds) */}
          {resolutionType === "manual_refund" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reference # (optional)
              </label>
              <input
                type="text"
                value={refundReference}
                onChange={(e) => setRefundReference(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="e.g., E-transfer confirmation #"
              />
            </div>
          )}

          {/* Offset Reason */}
          {(resolutionType === "offset_discount" || resolutionType === "offset_credit") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={offsetReason}
                onChange={(e) => setOffsetReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
                placeholder={
                  isUnderpayment
                    ? "e.g., Customer goodwill, rounding difference, service recovery..."
                    : "e.g., Customer requested credit for next order..."
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                This will be recorded for audit purposes.
              </p>
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
            disabled={!isValid() || isSubmitting || (!isUnderpayment && loadingPaymentInfo)}
            className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 flex items-center gap-2 ${
              isUnderpayment
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {resolutionType.includes("refund") ? (
                  <RefreshCw className="w-4 h-4" />
                ) : resolutionType.includes("offset") ? (
                  <Percent className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {getButtonText()}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
