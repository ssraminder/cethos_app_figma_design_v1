import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircle, Info } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function QuoteConfirmationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const quoteId = searchParams.get("quote_id");
  const reason = searchParams.get("reason");

  const [quoteNumber, setQuoteNumber] = useState<string>("");
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
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
          .select("quote_number, customer:customers(full_name, email)")
          .eq("id", quoteId)
          .single();

        if (quote) {
          setQuoteNumber(quote.quote_number || "");
          setCustomerEmail(quote.customer?.email || "");
          setCustomerName(quote.customer?.full_name || "");
        }
      } catch (error) {
        console.error("Error fetching quote:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuoteInfo();
  }, [quoteId, navigate]);

  const handleStartNewQuote = () => {
    // Clear both localStorage items
    localStorage.removeItem("cethos_upload_draft");
    localStorage.removeItem("cethos_quote_draft");

    // Force full page reload to ensure clean state
    window.location.href = "/quote?step=1";
  };

  const getCustomerFriendlyReason = (reason: string): string => {
    const messages: Record<string, string> = {
      timeout:
        "Our system took longer than expected to analyze your documents.",
      processing_error: "We encountered a technical issue while processing.",
      low_ocr_confidence: "Some text was difficult to read clearly.",
      low_language_confidence:
        "We need to verify the language in your documents.",
      low_classification_confidence: "We need to confirm the document type.",
      high_value_order:
        "Due to the size of your order, we provide personalized review.",
      high_page_count:
        "Due to the number of pages, we provide personalized review.",
      quality_check: "We want to ensure the most accurate quote possible.",
    };
    return messages[reason] || messages["quality_check"];
  };

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
            <CheckCircle className="w-20 h-20 text-green-500" />
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-cethos-navy">
            Your Quote is Being Reviewed
          </h1>

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

          {/* Reason for Fallback */}
          {reason && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 max-w-lg mx-auto">
              <div className="flex items-start gap-3 text-left">
                <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-800 mb-2">
                    Why manual review?
                  </p>
                  <p className="text-amber-700 text-sm mb-3">
                    {getCustomerFriendlyReason(reason)}
                  </p>
                  <p className="text-amber-600 text-sm">
                    This ensures you receive the most accurate quote for your
                    documents.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 max-w-lg mx-auto">
            <p className="text-base text-gray-700 leading-relaxed">
              Our team will review your documents and email you a detailed quote
              at <strong className="text-cethos-navy">{customerEmail}</strong>{" "}
              within <strong>4 business hours</strong>.
            </p>
          </div>

          {/* Confirmation Email Notice */}
          <p className="text-sm text-cethos-slate italic">
            A confirmation email has been sent to your inbox.
          </p>

          {/* Action Buttons */}
          <div className="pt-6 flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleStartNewQuote}
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
            <p className="text-xs text-cethos-slate">
              If you have any questions or need immediate assistance, please
              contact us at{" "}
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
