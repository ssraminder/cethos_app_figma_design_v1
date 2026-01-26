import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Home, RefreshCw, XCircle } from "lucide-react";

export default function PaymentCancel() {
  const [searchParams] = useSearchParams();
  const [quoteId, setQuoteId] = useState<string | null>(null);

  useEffect(() => {
    const urlQuoteId = searchParams.get("quote_id");
    const storedQuoteId = sessionStorage.getItem("cethos_current_quote_id");

    setQuoteId(urlQuoteId || storedQuoteId || null);
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-8 h-8 text-amber-600" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Payment Cancelled
          </h1>

          <p className="text-gray-600 mb-8">
            Your payment was not completed. Don&apos;t worry — your quote has
            been saved and you can complete payment anytime.
          </p>

          <div className="space-y-3">
            {quoteId ? (
              <>
                <Link
                  to={`/quote/new?quoteId=${quoteId}&step=6`}
                  className="w-full bg-teal-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-teal-700 flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-5 h-5" />
                  Try Payment Again
                </Link>

                <Link
                  to={`/quote/${quoteId}/review`}
                  className="w-full bg-white text-gray-700 py-3 px-4 rounded-lg font-medium border hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                  Review Quote
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </>
            ) : (
              <Link
                to="/quote/recover"
                className="w-full bg-teal-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-teal-700 flex items-center justify-center gap-2"
              >
                Find My Quote
                <ArrowRight className="w-5 h-5" />
              </Link>
            )}

            <Link
              to="/quote"
              className="w-full text-gray-500 py-2 hover:text-gray-700 flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              Return to Quote Form
            </Link>
          </div>

          <p className="mt-8 text-sm text-gray-500">
            Questions? Contact us at{" "}
            <a
              href="mailto:support@cethos.com"
              className="text-teal-600 hover:underline"
            >
              support@cethos.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
