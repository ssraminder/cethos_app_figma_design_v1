import { useQuote } from "@/context/QuoteContext";
import { ChevronLeft } from "lucide-react";

export default function Step6Payment() {
  const { state, goToPreviousStep } = useQuote();

  // Calculate breakdown from pricing data
  const baseSubtotal = state.shippingAddress ? 0 : 0; // Would come from calculated_totals
  const rushFee = 0; // Would come from calculated_totals
  const deliveryFee = 0; // Would come from physical delivery option
  const tax = 0; // Would come from calculated_totals
  const total = 0; // Would come from calculated_totals

  return (
    <div className="max-w-2xl mx-auto px-4 pb-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Payment</h1>
        <p className="text-gray-600">Complete your order</p>
      </div>

      {/* Order Summary */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4 text-lg">
          Order Summary
        </h2>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Translation & Certification</span>
            <span className="text-gray-900 font-medium">
              ${baseSubtotal.toFixed(2)}
            </span>
          </div>
          
          {rushFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Rush Fee</span>
              <span className="text-gray-900 font-medium">
                ${rushFee.toFixed(2)}
              </span>
            </div>
          )}
          
          {deliveryFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Delivery</span>
              <span className="text-gray-900 font-medium">
                ${deliveryFee.toFixed(2)}
              </span>
            </div>
          )}
          
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Tax (5% GST)</span>
            <span className="text-gray-900 font-medium">
              ${tax.toFixed(2)}
            </span>
          </div>
          
          <div className="border-t-2 border-gray-300 pt-3 flex justify-between items-center">
            <span className="text-xl font-bold text-gray-900">TOTAL CAD</span>
            <span className="text-2xl font-bold text-gray-900">
              ${total.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Billing Information Summary */}
      {state.shippingAddress && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Billing Address</h3>
          <div className="text-sm text-gray-600">
            <p>{state.shippingAddress.firstName} {state.shippingAddress.lastName}</p>
            <p>{state.shippingAddress.addressLine1}</p>
            {state.shippingAddress.addressLine2 && (
              <p>{state.shippingAddress.addressLine2}</p>
            )}
            <p>
              {state.shippingAddress.city}, {state.shippingAddress.state}{" "}
              {state.shippingAddress.postalCode}
            </p>
            <p>{state.shippingAddress.country}</p>
          </div>
        </div>
      )}

      {/* Payment Form Placeholder */}
      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6 mb-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-6 h-6 text-yellow-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-yellow-800 mb-1">
              Payment Integration Coming Soon
            </p>
            <p className="text-sm text-yellow-700">
              Stripe payment processing will be added in Phase 5. For now, you
              can complete the quote flow and receive a payment invoice via
              email.
            </p>
          </div>
        </div>
      </div>

      {/* Payment Method Preview (Placeholder) */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 mb-6 opacity-50">
        <h3 className="font-semibold text-gray-900 mb-4">Payment Method</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3 p-4 border-2 border-gray-300 rounded-lg cursor-not-allowed">
            <input type="radio" disabled className="w-4 h-4" />
            <div className="flex items-center gap-3">
              <svg className="w-10 h-6" viewBox="0 0 40 24" fill="none">
                <rect width="40" height="24" rx="4" fill="#1434CB" />
                <path
                  d="M15 12L17 14L21 10"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="font-medium text-gray-700">Credit Card</span>
            </div>
          </label>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-4">
        <button
          type="button"
          onClick={goToPreviousStep}
          className="flex-1 py-3 px-4 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium flex items-center justify-center gap-2"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </button>
        <button
          type="button"
          disabled
          className="flex-1 py-3 px-4 bg-gray-300 text-gray-500 rounded-xl cursor-not-allowed font-medium"
          title="Payment integration coming soon"
        >
          Pay Now (Coming Soon)
        </button>
      </div>

      {/* Help Text */}
      <div className="mt-6 text-center">
        <p className="text-sm text-gray-500">
          Need help?{" "}
          <a href="mailto:support@cethos.com" className="text-blue-600 hover:underline">
            Contact Support
          </a>
        </p>
      </div>
    </div>
  );
}
