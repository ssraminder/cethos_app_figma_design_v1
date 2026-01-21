import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Checkout() {
  const { quoteId } = useParams();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchQuote();
  }, [quoteId]);

  const fetchQuote = async () => {
    try {
      const { data, error } = await supabase
        .from("quotes")
        .select(
          `
          *,
          customer:customers(*),
          files:quote_files(
            id,
            original_filename,
            analysis:ai_analysis_results(*)
          )
        `,
        )
        .eq("id", quoteId)
        .single();

      if (error) throw error;

      // Check if quote is ready for payment
      if (!["approved", "quote_ready"].includes(data.status)) {
        setError("This quote is not ready for payment.");
      }

      setQuote(data);
    } catch (err) {
      console.error("Error fetching quote:", err);
      setError("Failed to load quote");
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    setProcessing(true);
    setError("");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ quoteId }),
        },
      );

      const result = await response.json();

      if (result.checkoutUrl) {
        // Redirect to Stripe Checkout
        window.location.href = result.checkoutUrl;
      } else {
        throw new Error(result.error || "Failed to create checkout session");
      }
    } catch (err: any) {
      console.error("Payment error:", err);
      setError(err.message || "Failed to initiate payment");
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="text-blue-600 hover:underline"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  const totals = quote?.calculated_totals || {};

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Complete Your Order
          </h1>
          <p className="text-gray-600 mt-2">Quote #{quote?.quote_number}</p>
        </div>

        {/* Order Summary Card */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Order Summary</h2>

          {/* Documents */}
          <div className="space-y-3 mb-6">
            {quote?.files?.map((file: any, idx: number) => {
              const analysis = file.analysis?.[0] || file.analysis;
              return (
                <div
                  key={idx}
                  className="flex justify-between items-start py-2 border-b"
                >
                  <div>
                    <p className="font-medium text-gray-800">
                      {file.original_filename}
                    </p>
                    <p className="text-sm text-gray-500">
                      {analysis?.detected_document_type || "Document"} •
                      {analysis?.word_count || 0} words
                    </p>
                  </div>
                  <p className="font-medium">
                    ${analysis?.line_total?.toFixed(2) || "0.00"}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Totals */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex justify-between text-gray-600">
              <span>Translation</span>
              <span>${totals.translation_total?.toFixed(2) || "0.00"}</span>
            </div>

            {totals.certification_total > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Certification</span>
                <span>${totals.certification_total?.toFixed(2)}</span>
              </div>
            )}

            {totals.rush_fee > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Rush Fee</span>
                <span>${totals.rush_fee?.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>${totals.subtotal?.toFixed(2) || "0.00"}</span>
            </div>

            <div className="flex justify-between text-gray-600">
              <span>GST (5%)</span>
              <span>${totals.tax_amount?.toFixed(2) || "0.00"}</span>
            </div>

            <div className="flex justify-between text-xl font-bold pt-2 border-t">
              <span>Total</span>
              <span>${totals.total?.toFixed(2) || "0.00"} CAD</span>
            </div>
          </div>
        </div>

        {/* Customer Info */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Customer Information</h2>
          <div className="text-gray-600">
            <p className="font-medium text-gray-800">
              {quote?.customer?.full_name}
            </p>
            <p>{quote?.customer?.email}</p>
            {quote?.customer?.phone && <p>{quote?.customer?.phone}</p>}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Payment Button */}
        <button
          onClick={handlePayment}
          disabled={processing || !!error}
          className="w-full bg-blue-600 text-white py-4 rounded-lg font-semibold text-lg
                     hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed
                     transition-colors flex items-center justify-center gap-2"
        >
          {processing ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Processing...
            </>
          ) : (
            <>🔒 Pay ${totals.total?.toFixed(2) || "0.00"} CAD</>
          )}
        </button>

        <p className="text-center text-sm text-gray-500 mt-4">
          Secure payment powered by Stripe
        </p>

        {/* Cancel Link */}
        <div className="text-center mt-6">
          <button
            onClick={() => navigate(`/quote/${quoteId}/review`)}
            className="text-gray-500 hover:text-gray-700"
          >
            ← Back to Quote Review
          </button>
        </div>
      </div>
    </div>
  );
}
