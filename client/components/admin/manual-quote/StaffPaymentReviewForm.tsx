import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { CreditCard, Check, Mail, Loader2 } from "lucide-react";

interface PaymentMethod {
  id: string;
  name: string;
  code: string;
  description: string;
  is_online: boolean;
  requires_staff_confirmation: boolean;
  icon: string;
}

interface ReviewData {
  customer: any;
  quote: any;
  pricing: any;
  files: any[];
  entryPoint: string;
  notes: string;
}

interface StaffPaymentReviewFormProps {
  reviewData: ReviewData;
  onSubmit: (paymentMethodId: string, sendPaymentLink: boolean) => void;
  isSubmitting: boolean;
}

export default function StaffPaymentReviewForm({
  reviewData,
  onSubmit,
  isSubmitting,
}: StaffPaymentReviewFormProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<string>("");
  const [sendPaymentLink, setSendPaymentLink] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    if (!supabase) return;

    try {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;
      setPaymentMethods(data || []);

      // Auto-select online payment if available
      const onlineMethod = data?.find((m) => m.is_online);
      if (onlineMethod) {
        setSelectedPaymentMethod(onlineMethod.id);
        setSendPaymentLink(true);
      }
    } catch (error) {
      console.error("Error fetching payment methods:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectedMethod = paymentMethods.find(
    (m) => m.id === selectedPaymentMethod,
  );

  const handleSubmit = () => {
    if (!selectedPaymentMethod) {
      alert("Please select a payment method");
      return;
    }
    onSubmit(selectedPaymentMethod, sendPaymentLink);
  };

  return (
    <div className="space-y-6">
      {/* Review Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Quote Summary
        </h3>

        <div className="space-y-4">
          {/* Customer Info */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
              Customer
            </h4>
            <p className="text-sm font-medium text-gray-900">
              {reviewData.customer?.fullName}
            </p>
            {reviewData.customer?.companyName && (
              <p className="text-xs text-gray-600">
                {reviewData.customer.companyName}
              </p>
            )}
            <p className="text-xs text-gray-600">
              {reviewData.customer?.email}
            </p>
            <p className="text-xs text-gray-600">
              {reviewData.customer?.phone}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Entry Point:{" "}
              {reviewData.entryPoint
                ?.replace("staff_", "")
                .replace("_", " ")
                .toUpperCase()}
            </p>
          </div>

          {/* Translation Details */}
          {reviewData.quote?.targetLanguageId && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                Translation
              </h4>
              <p className="text-sm text-gray-900">
                {reviewData.quote.sourceLanguageId
                  ? "Language pair selected"
                  : "Target language selected"}
              </p>
            </div>
          )}

          {/* Files */}
          {reviewData.files && reviewData.files.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                Documents
              </h4>
              <p className="text-sm text-gray-900">
                {reviewData.files.length} file
                {reviewData.files.length > 1 ? "s" : ""} attached
              </p>
            </div>
          )}

          {/* Pricing */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
              Pricing
            </h4>
            <div className="bg-gray-50 rounded-md p-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">
                  ${reviewData.pricing?.subtotal?.toFixed(2) || "0.00"}
                </span>
              </div>
              {reviewData.pricing?.rushFee > 0 && (
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Rush Fee</span>
                  <span className="font-medium">
                    ${reviewData.pricing.rushFee.toFixed(2)}
                  </span>
                </div>
              )}
              {reviewData.pricing?.deliveryFee > 0 && (
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Delivery</span>
                  <span className="font-medium">
                    ${reviewData.pricing.deliveryFee.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Tax</span>
                <span className="font-medium">
                  ${reviewData.pricing?.taxAmount?.toFixed(2) || "0.00"}
                </span>
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-300 mt-2">
                <span>Total</span>
                <span className="text-indigo-600">
                  ${reviewData.pricing?.total?.toFixed(2) || "0.00"}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {reviewData.notes && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                Internal Notes
              </h4>
              <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded-md">
                {reviewData.notes}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Payment Method Selection */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Payment Method
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-3">
            {paymentMethods.map((method) => (
              <label
                key={method.id}
                className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                  selectedPaymentMethod === method.id
                    ? "border-indigo-600 bg-indigo-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={method.id}
                  checked={selectedPaymentMethod === method.id}
                  onChange={(e) => {
                    setSelectedPaymentMethod(e.target.value);
                    setSendPaymentLink(method.is_online);
                  }}
                  className="mt-1 w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                />
                <div className="ml-3 flex-1">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">
                      {method.name}
                    </span>
                    {method.is_online && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        Online
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    {method.description}
                  </p>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Send Payment Link Option */}
      {selectedMethod?.is_online && reviewData.customer?.email && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sendPaymentLink}
              onChange={(e) => setSendPaymentLink(e.target.checked)}
              className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">
                  Send payment link to customer
                </span>
              </div>
              <p className="text-xs text-blue-700 mt-1">
                Customer will receive an email with a secure payment link to
                complete the order online. Link will expire after 7 days.
              </p>
            </div>
          </label>
        </div>
      )}

      {/* Offline Payment Note */}
      {selectedMethod &&
        !selectedMethod.is_online &&
        selectedMethod.requires_staff_confirmation && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg
                  className="w-5 h-5 text-amber-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-amber-900">
                  Payment Confirmation Required
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  You'll need to manually confirm this payment after the
                  customer pays. Quote will remain in "Awaiting Payment" status
                  until confirmed.
                </p>
              </div>
            </div>
          </div>
        )}

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !selectedPaymentMethod}
          className={`inline-flex items-center gap-2 px-6 py-3 rounded-md text-white font-medium ${
            isSubmitting || !selectedPaymentMethod
              ? "bg-gray-300 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating Quote...
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              Create Quote{sendPaymentLink && " & Send Link"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
