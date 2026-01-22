import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Calendar,
  CreditCard,
  Lock,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

interface QuoteDocument {
  id: string;
  original_filename: string;
  detected_language: string;
  language_name: string;
  detected_document_type: string;
  assessed_complexity: string;
  word_count: number;
  page_count: number;
  billable_pages: number;
  line_total: number;
  certification_price: number;
}

interface QuoteData {
  id: string;
  quote_number: string;
  status: string;
  source_language: string;
  target_language: string;
  subtotal: number;
  certification_total: number;
  rush_fee: number;
  delivery_fee: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  is_rush: boolean;
  turnaround_type: string;
  estimated_delivery_date: string;
  expires_at: string;
  customer: {
    first_name: string;
    last_name: string;
    email: string;
  };
  documents: QuoteDocument[];
}

export default function QuoteReviewPage() {
  const { quoteId } = useParams<{ quoteId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  useEffect(() => {
    if (quoteId) {
      fetchQuoteData();
    }
  }, [quoteId]);

  const fetchQuoteData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch quote with customer info
      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .select(
          `
          id,
          quote_number,
          status,
          subtotal,
          certification_total,
          rush_fee,
          delivery_fee,
          tax_rate,
          tax_amount,
          total,
          is_rush,
          turnaround_type,
          estimated_delivery_date,
          expires_at,
          calculated_totals,
          customer:customers (
            first_name,
            last_name,
            email
          )
        `
        )
        .eq("id", quoteId)
        .single();

      if (quoteError || !quoteData) {
        throw new Error("Quote not found");
      }

      // Fetch documents from ai_analysis_results
      const { data: analysisResults, error: analysisError } = await supabase
        .from("ai_analysis_results")
        .select("*")
        .eq("quote_id", quoteId)
        .eq("processing_status", "complete");

      if (analysisError) {
        console.error("Error fetching documents:", analysisError);
      }

      // Fetch file names
      let documents: QuoteDocument[] = [];
      if (analysisResults && analysisResults.length > 0) {
        const fileIds = analysisResults
          .map((r) => r.quote_file_id)
          .filter(Boolean);

        const { data: files } = await supabase
          .from("quote_files")
          .select("id, original_filename")
          .in("id", fileIds);

        const filesMap =
          new Map(files?.map((f) => [f.id, f.original_filename]) || []);

        documents = analysisResults.map((doc) => ({
          id: doc.id,
          original_filename: filesMap.get(doc.quote_file_id) || "Document",
          detected_language: doc.detected_language,
          language_name: doc.language_name,
          detected_document_type: doc.detected_document_type,
          assessed_complexity: doc.assessed_complexity,
          word_count: doc.word_count,
          page_count: doc.page_count,
          billable_pages: parseFloat(doc.billable_pages) || 0,
          line_total: parseFloat(doc.line_total) || 0,
          certification_price: parseFloat(doc.certification_price) || 0,
        }));
      }

      // Use calculated_totals if available, otherwise calculate
      let totals;
      if (quoteData.calculated_totals) {
        totals = quoteData.calculated_totals;
      } else {
        const translationTotal = documents.reduce(
          (sum, d) => sum + d.line_total,
          0
        );
        const certificationTotal = documents.reduce(
          (sum, d) => sum + d.certification_price,
          0
        );
        const subtotal =
          quoteData.subtotal || translationTotal + certificationTotal;
        const rushFee = quoteData.rush_fee || 0;
        const deliveryFee = quoteData.delivery_fee || 0;
        const taxRate = quoteData.tax_rate || 0.05;
        const taxAmount =
          quoteData.tax_amount ||
          (subtotal + rushFee + deliveryFee) * taxRate;
        const total =
          quoteData.total || subtotal + rushFee + deliveryFee + taxAmount;

        totals = {
          subtotal,
          certification_total: certificationTotal,
          rush_fee: rushFee,
          delivery_fee: deliveryFee,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total,
        };
      }

      setQuote({
        ...quoteData,
        subtotal: totals.subtotal,
        certification_total: totals.certification_total,
        rush_fee: totals.rush_fee,
        delivery_fee: totals.delivery_fee,
        tax_rate: totals.tax_rate,
        tax_amount: totals.tax_amount,
        total: totals.total,
        documents,
      });
    } catch (err: any) {
      console.error("Error fetching quote:", err);
      setError(err.message || "Failed to load quote");
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!quote) return;

    setPaymentLoading(true);
    setError(null);

    try {
      // Call create-checkout-session Edge Function
      const { data, error: fnError } = await supabase.functions.invoke(
        "create-checkout-session",
        {
          body: { quoteId: quote.id },
        }
      );

      if (fnError) {
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
      setPaymentLoading(false);
    }
  };

  const getStatusDisplay = (status: string) => {
    const statusMap: Record<
      string,
      { label: string; color: string; description: string }
    > = {
      draft: {
        label: "Draft",
        color: "gray",
        description: "Quote is being prepared",
      },
      processing: {
        label: "Processing",
        color: "blue",
        description: "Documents are being analyzed",
      },
      hitl_pending: {
        label: "Under Review",
        color: "yellow",
        description: "Quote is being reviewed by our team",
      },
      hitl_in_progress: {
        label: "Under Review",
        color: "yellow",
        description: "Quote is being reviewed by our team",
      },
      quote_ready: {
        label: "Ready to Pay",
        color: "green",
        description: "Your quote is ready for payment",
      },
      approved: {
        label: "Ready to Pay",
        color: "green",
        description: "Your quote is ready for payment",
      },
      pending_payment: {
        label: "Awaiting Payment",
        color: "orange",
        description: "Complete your payment to proceed",
      },
      paid: {
        label: "Paid",
        color: "green",
        description: "Payment received",
      },
      converted: {
        label: "Order Created",
        color: "green",
        description: "Your order is being processed",
      },
      expired: {
        label: "Expired",
        color: "red",
        description: "This quote has expired",
      },
      cancelled: {
        label: "Cancelled",
        color: "red",
        description: "This quote was cancelled",
      },
    };
    return (
      statusMap[status] || { label: status, color: "gray", description: "" }
    );
  };

  const canPay =
    quote &&
    ["quote_ready", "approved", "pending_payment"].includes(quote.status);
  const isExpired =
    quote?.expires_at && new Date(quote.expires_at) < new Date();
  const isPaidOrConverted =
    quote && (quote.status === "paid" || quote.status === "converted");

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading your quote...</p>
        </div>
      </div>
    );
  }

  // Error State - Quote Not Found
  if (error && !quote) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Quote Not Found
          </h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  if (!quote) return null;

  const statusInfo = getStatusDisplay(quote.status);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Quote {quote.quote_number}
              </h1>
              <p className="text-gray-500 mt-1">
                {quote.customer?.first_name} {quote.customer?.last_name}
              </p>
            </div>
            <div
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                statusInfo.color === "green"
                  ? "bg-green-100 text-green-700"
                  : statusInfo.color === "yellow"
                    ? "bg-yellow-100 text-yellow-700"
                    : statusInfo.color === "blue"
                      ? "bg-blue-100 text-blue-700"
                      : statusInfo.color === "orange"
                        ? "bg-orange-100 text-orange-700"
                        : statusInfo.color === "red"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-700"
              }`}
            >
              {statusInfo.label}
            </div>
          </div>
        </div>

        {/* Status Message for Non-Payable Quotes */}
        {!canPay && !isExpired && !isPaidOrConverted && (
          <div
            className={`mb-6 p-4 rounded-xl ${
              statusInfo.color === "yellow"
                ? "bg-yellow-50 border border-yellow-200"
                : statusInfo.color === "blue"
                  ? "bg-blue-50 border border-blue-200"
                  : "bg-gray-50 border border-gray-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <AlertCircle
                className={`w-6 h-6 ${
                  statusInfo.color === "yellow"
                    ? "text-yellow-600"
                    : statusInfo.color === "blue"
                      ? "text-blue-600"
                      : "text-gray-600"
                }`}
              />
              <div>
                <p className="font-medium text-gray-900">
                  {statusInfo.description}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  We'll send you an email when your quote is ready for payment.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Expired Notice */}
        {isExpired && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-red-600" />
              <div>
                <p className="font-medium text-red-800">
                  This quote has expired
                </p>
                <p className="text-sm text-red-600 mt-1">
                  Please create a new quote or contact us for assistance.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Documents Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">
              Documents ({quote.documents.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {quote.documents.map((doc) => (
              <div key={doc.id} className="px-6 py-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {doc.original_filename}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        {doc.language_name || doc.detected_language}
                      </span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {doc.billable_pages.toFixed(1)} pages
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          doc.assessed_complexity === "easy"
                            ? "bg-green-100 text-green-700"
                            : doc.assessed_complexity === "medium"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {doc.assessed_complexity}
                      </span>
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded capitalize">
                        {doc.detected_document_type?.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <p className="font-semibold text-gray-900">
                      ${doc.line_total.toFixed(2)}
                    </p>
                    {doc.certification_price > 0 && (
                      <p className="text-xs text-gray-500">
                        +${doc.certification_price.toFixed(2)} cert
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Price Summary Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Price Summary</h2>
          </div>
          <div className="px-6 py-4 space-y-3">
            <div className="flex justify-between text-gray-600">
              <span>Translation</span>
              <span>
                ${(quote.subtotal - quote.certification_total).toFixed(2)}
              </span>
            </div>

            {quote.certification_total > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Certification</span>
                <span>${quote.certification_total.toFixed(2)}</span>
              </div>
            )}

            {quote.rush_fee > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>
                  Rush Fee (
                  {quote.turnaround_type === "same_day" ? "+100%" : "+30%"})
                </span>
                <span>${quote.rush_fee.toFixed(2)}</span>
              </div>
            )}

            {quote.delivery_fee > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Delivery</span>
                <span>${quote.delivery_fee.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between text-gray-600">
              <span>GST ({(quote.tax_rate * 100).toFixed(0)}%)</span>
              <span>${quote.tax_amount.toFixed(2)}</span>
            </div>

            <div className="border-t border-gray-200 pt-3 mt-3">
              <div className="flex justify-between text-xl font-bold text-gray-900">
                <span>Total</span>
                <span>${quote.total.toFixed(2)} CAD</span>
              </div>
            </div>
          </div>
        </div>

        {/* Delivery Info */}
        {quote.estimated_delivery_date && (
          <div className="bg-blue-50 rounded-xl p-4 mb-6 border border-blue-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  Estimated Delivery
                </p>
                <p className="text-sm text-gray-600">
                  {new Date(quote.estimated_delivery_date).toLocaleDateString(
                    "en-US",
                    {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    }
                  )}
                  {quote.is_rush && (
                    <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                      Rush
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Quote Expiry */}
        {quote.expires_at && !isExpired && (
          <div className="text-center text-sm text-gray-500 mb-6">
            Quote valid until{" "}
            {new Date(quote.expires_at).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Payment Button */}
        {canPay && !isExpired && (
          <div className="space-y-4">
            <button
              onClick={handlePayment}
              disabled={paymentLoading}
              className="w-full py-4 px-6 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {paymentLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-6 h-6" />
                  <span>Pay ${quote.total.toFixed(2)} CAD</span>
                </>
              )}
            </button>

            {/* Security Badge */}
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <Lock className="w-4 h-4" />
              <span>Secure payment powered by Stripe</span>
            </div>
          </div>
        )}

        {/* Already Paid */}
        {isPaidOrConverted && (
          <div className="bg-green-50 rounded-xl p-6 text-center border border-green-200">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <p className="font-semibold text-gray-900">Payment Received</p>
            <p className="text-sm text-gray-600 mt-1">
              Your order is being processed. Check your email for updates.
            </p>
          </div>
        )}

        {/* Contact Support */}
        <div className="text-center mt-8">
          <p className="text-sm text-gray-500">
            Questions about your quote?{" "}
            <a
              href="mailto:support@cethos.com"
              className="text-blue-600 hover:underline"
            >
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
