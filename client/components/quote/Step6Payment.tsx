import { useState, useEffect } from "react";
import { useQuote } from "@/context/QuoteContext";
import { supabase } from "@/lib/supabase";
import { CreditCard, Calendar, Lock, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PricingSummary {
  translation_total: number;
  certification_total: number;
  subtotal: number;
  rush_fee: number;
  delivery_fee: number;
  tax_amount: number;
  tax_rate: number;
  total: number;
}

export default function Step6Payment() {
  const { state, goToPreviousStep } = useQuote();
  const [loading, setLoading] = useState(false);
  const [pricing, setPricing] = useState<PricingSummary | null>(null);
  const [loadingPricing, setLoadingPricing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentCount, setDocumentCount] = useState<number | null>(null);

  const shippingAddress = state.shippingAddress;
  const billingAddress = state.billingAddress;
  const hasShippingSummary =
    !!shippingAddress?.firstName &&
    !!shippingAddress?.addressLine1 &&
    !!shippingAddress?.city &&
    !!shippingAddress?.state &&
    !!shippingAddress?.postalCode;

  useEffect(() => {
    fetchPricingData();
  }, [state.quoteId]);

  const fetchPricingData = async () => {
    if (!state.quoteId) {
      setError("Quote ID not found. Please go back and try again.");
      setLoadingPricing(false);
      return;
    }

    try {
      const { data: quoteData, error: fetchError } = await supabase
        .from("quotes")
        .select("calculated_totals")
        .eq("id", state.quoteId)
        .single();

      const { count: fileCount, error: filesError } = await supabase
        .from("quote_files")
        .select("id", { count: "exact", head: true })
        .eq("quote_id", state.quoteId);

      if (fetchError) throw fetchError;
      if (filesError) throw filesError;

      if (quoteData?.calculated_totals) {
        setPricing(quoteData.calculated_totals as PricingSummary);
      } else {
        setError(
          "Pricing information not available. Please go back and complete the previous steps.",
        );
      }

      if (typeof fileCount === "number") {
        setDocumentCount(fileCount);
      }
    } catch (err: any) {
      console.error("Error fetching pricing:", err);
      setError("Failed to load pricing information");
    } finally {
      setLoadingPricing(false);
    }
  };

  const handlePayment = async () => {
    setLoading(true);
    setError(null);

    try {
      const quoteId = state.quoteId;

      if (!quoteId) {
        throw new Error("Quote ID not found. Please go back and try again.");
      }

      if (!pricing || pricing.total <= 0) {
        throw new Error(
          "Invalid order total. Please go back and review your quote.",
        );
      }

      // Call the create-checkout-session Edge Function
      const { data, error: fnError } = await supabase.functions.invoke(
        "create-checkout-session",
        {
          body: { quoteId },
        },
      );

      if (fnError) {
        console.error("Edge function error:", fnError);
        throw new Error(fnError.message || "Failed to create checkout session");
      }

      if (!data?.success || !data?.checkoutUrl) {
        throw new Error(data?.error || "Failed to create checkout session");
      }

      // Redirect to Stripe Checkout
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      console.error("Payment error:", err);
      setError(err.message || "An error occurred. Please try again.");
      toast.error(err.message || "Failed to process payment");
      setLoading(false);
    }
  };

  if (loadingPricing) {
    return (
      <div className="max-w-2xl mx-auto px-4 pb-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-cethos-teal" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pb-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-cethos-navy mb-2">
          Complete Your Order
        </h2>
        <p className="text-cethos-gray">
          Review your order and proceed to secure payment
        </p>
      </div>

      {/* Order Summary Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Order Summary</h3>
        </div>
        <div className="px-6 py-4">
          {/* Documents */}
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
            <div className="p-2 bg-cethos-teal-50 rounded-lg">
              <svg
                className="w-5 h-5 text-cethos-teal"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">
                {(documentCount ?? state.files?.length || 0)} Document
                {(documentCount ?? state.files?.length || 0) !== 1 ? "s" : ""}
              </p>
              <p className="text-sm text-gray-500">
                Translation & Certification
              </p>
            </div>
          </div>

          {/* Price Breakdown */}
          {pricing && (
            <div className="space-y-2">
              <div className="flex justify-between text-gray-600">
                <span>Translation</span>
                <span>${pricing.translation_total.toFixed(2)}</span>
              </div>

              {pricing.certification_total > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Certification</span>
                  <span>${pricing.certification_total.toFixed(2)}</span>
                </div>
              )}

              {pricing.rush_fee > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>
                    {state.turnaroundType === "rush"
                      ? "Rush Fee"
                      : "Same-Day Fee"}
                  </span>
                  <span>${pricing.rush_fee.toFixed(2)}</span>
                </div>
              )}

              {pricing.delivery_fee > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Delivery</span>
                  <span>${pricing.delivery_fee.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-gray-600">
                <span>GST ({(pricing.tax_rate * 100).toFixed(0)}%)</span>
                <span>${pricing.tax_amount.toFixed(2)}</span>
              </div>

              <div className="border-t-2 border-gray-300 pt-3 mt-3">
                <div className="flex justify-between text-lg font-semibold text-gray-900">
                  <span>Total</span>
                  <span>${pricing.total.toFixed(2)} CAD</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Address Summary */}
      {billingAddress && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
            Address Summary
          </h3>
          <div
            className={`grid gap-6 ${hasShippingSummary ? "md:grid-cols-2" : "grid-cols-1"}`}
          >
            <div className="text-sm text-gray-600">
              <p className="text-sm font-semibold text-gray-700 mb-2">
                Billing Address
              </p>
              <p className="font-medium text-gray-900">
                {billingAddress.firstName} {billingAddress.lastName}
              </p>
              {billingAddress.company && <p>{billingAddress.company}</p>}
              <p>{billingAddress.addressLine1}</p>
              {billingAddress.addressLine2 && (
                <p>{billingAddress.addressLine2}</p>
              )}
              <p>
                {billingAddress.city}, {billingAddress.state}{" "}
                {billingAddress.postalCode}
              </p>
              <p>{billingAddress.country}</p>
            </div>

            {hasShippingSummary && shippingAddress && (
              <div className="text-sm text-gray-600">
                <p className="text-sm font-semibold text-gray-700 mb-2">
                  Shipping Address
                </p>
                <p className="font-medium text-gray-900">
                  {shippingAddress.firstName} {shippingAddress.lastName}
                </p>
                {shippingAddress.company && <p>{shippingAddress.company}</p>}
                <p>{shippingAddress.addressLine1}</p>
                {shippingAddress.addressLine2 && (
                  <p>{shippingAddress.addressLine2}</p>
                )}
                <p>
                  {shippingAddress.city}, {shippingAddress.state}{" "}
                  {shippingAddress.postalCode}
                </p>
                <p>{shippingAddress.country}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Security Badge */}
      <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-6">
        <Lock className="w-4 h-4" />
        <span>Secure payment powered by Stripe</span>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4">
        <button
          type="button"
          onClick={goToPreviousStep}
          disabled={loading}
          className="flex-1 py-3 px-4 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={handlePayment}
          disabled={loading || !pricing || pricing.total <= 0}
          className="flex-1 py-3 px-4 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              <span>
                Pay ${pricing ? pricing.total.toFixed(2) : "0.00"} CAD
              </span>
            </>
          )}
        </button>
      </div>

      {/* Terms */}
      <p className="text-xs text-gray-500 text-center mt-4">
        By clicking "Pay", you agree to our{" "}
        <a href="/terms" className="text-cethos-teal hover:underline">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy" className="text-cethos-teal hover:underline">
          Privacy Policy
        </a>
      </p>
    </div>
  );
}
