import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircle, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { handleStartNewQuote } from "@/utils/navigationHelpers";

export default function QuoteSavedPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const quoteId = searchParams.get("quote_id");

  const [quoteNumber, setQuoteNumber] = useState<string>("");
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQuoteInfo = async () => {
      if (!quoteId) {
        navigate("/quote");
        return;
      }

      try {
        const { data: quote } = await supabase
          .from("quotes")
          .select("quote_number, customer:customers(email)")
          .eq("id", quoteId)
          .single();

        if (quote) {
          setQuoteNumber(quote.quote_number || "");
          setCustomerEmail(quote.customer?.email || "");
        }
      } catch (error) {
        console.error("Error fetching quote:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuoteInfo();
  }, [quoteId, navigate]);

  // handleStartNewQuote is imported from navigationHelpers

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cethos-bg-light to-white flex items-center justify-center">
        <div className="text-cethos-slate">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cethos-bg-light to-white">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          {/* Success Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <CheckCircle className="w-20 h-20 text-green-500" />
              <div className="absolute -bottom-1 -right-1 bg-cethos-teal rounded-full p-2">
                <Mail className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-cethos-navy">Quote Saved</h1>

          {/* Quote Number */}
          {quoteNumber && (
            <div className="bg-cethos-bg-light border-2 border-cethos-border rounded-xl p-6 max-w-md mx-auto">
              <p className="text-sm text-cethos-slate mb-2">
                Your quote number is:
              </p>
              <p className="text-2xl font-bold font-mono text-cethos-navy">
                {quoteNumber}
              </p>
            </div>
          )}

          {/* Description */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 max-w-lg mx-auto">
            <p className="text-base text-gray-700 leading-relaxed">
              Your quote has been emailed to{" "}
              <strong className="text-cethos-navy">{customerEmail}</strong>.
            </p>
            <p className="text-base text-gray-700 leading-relaxed mt-3">
              Click the link in your email to complete payment anytime within
              the next <strong>30 days</strong>.
            </p>
          </div>

          {/* Email Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-lg mx-auto">
            <div className="flex items-start gap-3 text-left">
              <Mail className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-amber-700">
                  Check your inbox for the payment link. Don't forget to check
                  your spam folder if you don't see it within a few minutes.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-6 flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => handleStartNewQuote(navigate)}
              className="px-6 py-3 border-2 border-cethos-border text-cethos-gray rounded-lg hover:bg-cethos-bg-light font-medium transition-colors"
            >
              Start New Quote
            </button>
            <button
              onClick={() => navigate("/")}
              className="px-6 py-3 bg-cethos-teal text-white rounded-lg hover:bg-cethos-teal-light font-semibold transition-colors"
            >
              Return to Home
            </button>
          </div>

          {/* Additional Info */}
          <div className="pt-8 border-t border-gray-200 max-w-lg mx-auto">
            <p className="text-xs text-cethos-slate mb-2">
              <strong>Note:</strong> This quote is valid for 30 days. After
              that, you'll need to request a new quote.
            </p>
            <p className="text-xs text-cethos-slate">
              If you have any questions or need assistance, please contact us at{" "}
              <a
                href="mailto:support@cethos.com"
                className="text-cethos-teal hover:underline"
              >
                support@cethos.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
