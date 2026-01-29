import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { CheckCircle, Mail, Home, Loader2 } from "lucide-react";

export default function ETransferSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const quoteId = searchParams.get("quote_id");

  const [loading, setLoading] = useState(true);
  const [quoteNumber, setQuoteNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!quoteId) {
      navigate("/");
      return;
    }

    fetchQuoteNumber();
  }, [quoteId]);

  const fetchQuoteNumber = async () => {
    if (!supabase || !quoteId) return;

    try {
      const { data: quote } = await supabase
        .from("quotes")
        .select("quote_number")
        .eq("id", quoteId)
        .single();

      if (quote?.quote_number) {
        setQuoteNumber(quote.quote_number);
      }
    } catch (err) {
      console.error("Error fetching quote number:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-cethos-teal" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-xl shadow-lg p-8">
        {/* Success Icon */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-cethos-navy mb-2">
            Payment Confirmation Received!
          </h1>
          <p className="text-lg text-gray-600">
            Thank you for confirming your e-Transfer payment
          </p>
        </div>

        {/* Quote Details */}
        {quoteNumber && (
          <div className="bg-cethos-teal-50 border border-cethos-teal-200 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-cethos-teal-dark font-medium mb-1">
                  Quote Number
                </p>
                <p className="text-2xl font-bold text-cethos-teal">
                  {quoteNumber}
                </p>
              </div>
              <Mail className="w-12 h-12 text-cethos-teal opacity-50" />
            </div>
          </div>
        )}

        {/* What's Next */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-cethos-navy mb-4">
            What happens next?
          </h2>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-cethos-teal text-white rounded-full flex items-center justify-center text-sm font-bold mt-0.5">
                1
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  Our team will verify your payment
                </p>
                <p className="text-sm text-gray-600">
                  We'll check for your e-Transfer within 1-2 business days
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-cethos-teal text-white rounded-full flex items-center justify-center text-sm font-bold mt-0.5">
                2
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  You'll receive a confirmation email
                </p>
                <p className="text-sm text-gray-600">
                  We'll send you an email once your payment is confirmed
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-cethos-teal text-white rounded-full flex items-center justify-center text-sm font-bold mt-0.5">
                3
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  We'll start working on your translation
                </p>
                <p className="text-sm text-gray-600">
                  Your order will be processed according to the turnaround time
                  you selected
                </p>
              </div>
            </li>
          </ul>
        </div>

        {/* Important Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">Note:</span> If you haven't sent the
            e-Transfer yet, please do so as soon as possible to avoid delays in
            processing your order. Send to{" "}
            <span className="font-mono font-semibold">
              payments@cethos.com
            </span>{" "}
            and include your quote number ({quoteNumber}) in the message.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={() => navigate("/")}
            className="flex-1 py-3 px-6 bg-cethos-teal text-white rounded-lg hover:bg-cethos-teal-dark transition-colors font-medium flex items-center justify-center gap-2"
          >
            <Home className="w-5 h-5" />
            Go to Home
          </button>
        </div>

        {/* Support */}
        <p className="text-center text-sm text-gray-500 mt-6">
          Questions? Contact us at{" "}
          <a
            href="mailto:support@cethos.com"
            className="text-cethos-teal hover:underline"
          >
            support@cethos.com
          </a>
        </p>
      </div>
    </div>
  );
}
