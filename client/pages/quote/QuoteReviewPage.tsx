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
  Languages,
  FileText,
  Globe,
  Truck,
  Zap,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

interface QuoteDocument {
  id: string;
  original_filename: string;
  detected_language: string;
  language_name: string;
  detected_document_type: string;
  document_type_other: string | null;
  assessed_complexity: string;
  word_count: number;
  page_count: number;
  billable_pages: number;
  line_total: number;
  certification_price: number;
  certification_name: string | null;
  isManual: boolean;
}

interface QuoteData {
  id: string;
  quote_number: string;
  status: string;
  source_language_id: string;
  target_language_id: string;
  source_language_name: string;
  target_language_name: string;
  intended_use_name: string | null;
  country_of_issue: string | null;
  delivery_option_name: string | null;
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
    full_name: string;
    email: string;
  };
  documents: QuoteDocument[];
}

// Helper to get country name from ISO code
const getCountryName = (code: string | null): string => {
  if (!code) return "";
  const countries: Record<string, string> = {
    CA: "Canada",
    US: "United States",
    MX: "Mexico",
    GB: "United Kingdom",
    IN: "India",
    CN: "China",
    FR: "France",
    DE: "Germany",
    ES: "Spain",
    IT: "Italy",
    BR: "Brazil",
    JP: "Japan",
    KR: "South Korea",
    RU: "Russia",
    AU: "Australia",
    PK: "Pakistan",
    BD: "Bangladesh",
    PH: "Philippines",
    VN: "Vietnam",
    IR: "Iran",
    TR: "Turkey",
    EG: "Egypt",
    SA: "Saudi Arabia",
    AE: "United Arab Emirates",
    NG: "Nigeria",
    ZA: "South Africa",
    AR: "Argentina",
    CO: "Colombia",
    PE: "Peru",
    VE: "Venezuela",
    CL: "Chile",
    EC: "Ecuador",
    GT: "Guatemala",
    CU: "Cuba",
    HT: "Haiti",
    DO: "Dominican Republic",
    HN: "Honduras",
    NI: "Nicaragua",
    SV: "El Salvador",
    CR: "Costa Rica",
    PA: "Panama",
    PR: "Puerto Rico",
    JM: "Jamaica",
    TT: "Trinidad and Tobago",
    PL: "Poland",
    UA: "Ukraine",
    RO: "Romania",
    NL: "Netherlands",
    BE: "Belgium",
    GR: "Greece",
    CZ: "Czech Republic",
    PT: "Portugal",
    SE: "Sweden",
    HU: "Hungary",
    AT: "Austria",
    CH: "Switzerland",
    IL: "Israel",
    MY: "Malaysia",
    SG: "Singapore",
    ID: "Indonesia",
    TH: "Thailand",
    NZ: "New Zealand",
  };
  return countries[code] || code;
};

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
      // Fetch quote with all related data
      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .select(
          `
          id,
          quote_number,
          status,
          source_language_id,
          target_language_id,
          country_of_issue,
          delivery_option_id,
          intended_use_id,
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
            full_name,
            email
          ),
          source_language:languages!quotes_source_language_id_fkey (
            name
          ),
          target_language:languages!quotes_target_language_id_fkey (
            name
          )
        `
        )
        .eq("id", quoteId)
        .single();

      // Fetch intended_use and delivery_option separately if IDs exist
      let intendedUseName = null;
      let deliveryOptionName = null;

      if (quoteError || !quoteData) {
        const details = quoteError?.message || quoteError?.details;
        throw new Error(details || "Quote not found");
      }

      if (quoteData.intended_use_id) {
        const { data: intendedUse } = await supabase
          .from("intended_uses")
          .select("name")
          .eq("id", quoteData.intended_use_id)
          .single();
        intendedUseName = intendedUse?.name;
      }

      if (quoteData.delivery_option_id) {
        const { data: deliveryOption } = await supabase
          .from("delivery_options")
          .select("name")
          .eq("id", quoteData.delivery_option_id)
          .single();
        deliveryOptionName = deliveryOption?.name;
      }

      // Fetch documents from ai_analysis_results (including manual entries)
      const { data: analysisResults, error: analysisError } = await supabase
        .from("ai_analysis_results")
        .select(
          `
          *,
          certification_types (
            name
          ),
          quote_files (
            original_filename
          )
        `
        )
        .eq("quote_id", quoteId);

      if (analysisError) {
        console.error("Error fetching documents:", analysisError);
      }

      // Transform documents (including manual entries where quote_file_id is NULL)
      const documents: QuoteDocument[] = (analysisResults || []).map((doc) => ({
        id: doc.id,
        original_filename:
          doc.manual_filename ||
          doc.quote_files?.original_filename ||
          "Document",
        detected_language: doc.detected_language,
        language_name: doc.language_name,
        detected_document_type: doc.detected_document_type,
        document_type_other: doc.document_type_other,
        assessed_complexity: doc.assessed_complexity,
        word_count: doc.word_count,
        page_count: doc.page_count,
        billable_pages: parseFloat(doc.billable_pages) || 0,
        line_total: parseFloat(doc.line_total) || 0,
        certification_price: parseFloat(doc.certification_price) || 0,
        certification_name: doc.certification_types?.name || null,
        isManual: !doc.quote_file_id,
      }));

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
          quoteData.tax_amount || (subtotal + rushFee + deliveryFee) * taxRate;
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
        source_language_name: (quoteData.source_language as any)?.name || "",
        target_language_name: (quoteData.target_language as any)?.name || "",
        intended_use_name: intendedUseName,
        delivery_option_name: deliveryOptionName,
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

  const handleStartNewQuote = () => {
    // Clear all quote-related localStorage
    localStorage.removeItem("cethos_quote_draft");
    localStorage.removeItem("cethos_upload_draft");
    localStorage.removeItem("quoteId");
    localStorage.removeItem("quoteData");
    localStorage.removeItem("quoteStep");
    localStorage.removeItem("currentStep");
    // Force navigation with page reload to ensure clean state
    window.location.href = "/quote";
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
      in_review: {
        label: "Under Review",
        color: "yellow",
        description: "Quote is being reviewed by our team",
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
      awaiting_payment: {
        label: "Ready to Pay",
        color: "green",
        description: "Your quote is ready for payment",
      },
      pending_payment: {
        label: "Ready to Pay",
        color: "green",
        description: "Your quote is ready for payment",
      },
      checkout_started: {
        label: "Ready to Pay",
        color: "green",
        description: "Your quote is ready for payment",
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
    [
      "quote_ready",
      "approved",
      "pending_payment",
      "awaiting_payment",
      "checkout_started",
    ].includes(quote.status);
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
            Return Home
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
        {/* Back Button */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Quote {quote.quote_number}
              </h1>
              <p className="text-gray-500 mt-1">{quote.customer?.full_name}</p>
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

        {/* Status Message */}
        {canPay && !isExpired && (
          <div className="mb-6 p-4 rounded-xl bg-green-50 border border-green-200">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-medium text-green-800">Quote Ready</p>
                <p className="text-sm text-green-700 mt-1">
                  Your quote is ready. Click the button below to proceed to
                  payment.
                </p>
              </div>
            </div>
          </div>
        )}

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

        {/* Quote Details Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Quote Details</h2>
          </div>
          <div className="p-6 space-y-4">
            {/* Translation Languages */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Languages className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-500">Translation</p>
                <p className="font-medium text-gray-800">
                  {quote.source_language_name} → {quote.target_language_name}
                </p>
              </div>
            </div>

            {/* Purpose / Intended Use */}
            {quote.intended_use_name && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <FileText className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-500">Purpose</p>
                  <p className="font-medium text-gray-800">
                    {quote.intended_use_name}
                  </p>
                </div>
              </div>
            )}

            {/* Country of Issue */}
            {quote.country_of_issue && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <Globe className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-500">Country of Issue</p>
                  <p className="font-medium text-gray-800">
                    {getCountryName(quote.country_of_issue)}
                  </p>
                </div>
              </div>
            )}

            {/* Delivery Option */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <Truck className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-500">Delivery Method</p>
                <p className="font-medium text-gray-800">
                  {quote.delivery_option_name || "Digital Delivery"}
                </p>
              </div>
            </div>

            {/* Rush Service */}
            {quote.is_rush && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Zap className="w-5 h-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-500">Rush Service</p>
                  <p className="font-medium text-red-600">
                    Yes (
                    {quote.turnaround_type === "same_day" ? "+100%" : "+30%"}{" "}
                    surcharge)
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Documents Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">
              Documents ({quote.documents.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {quote.documents.length === 0 ? (
              <div className="px-6 py-4 text-gray-500 text-sm">
                No documents
              </div>
            ) : (
              quote.documents.map((doc, index) => (
                <div key={doc.id} className="px-6 py-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {index + 1}. {doc.original_filename}
                        </span>
                        {doc.isManual && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                            Manual Entry
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-semibold text-gray-900 ml-4">
                      ${doc.line_total.toFixed(2)}
                    </span>
                  </div>

                  {/* Document Details Grid */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Type:</span>
                      <span className="ml-1 text-gray-700">
                        {doc.document_type_other ||
                          doc.detected_document_type?.replace(/_/g, " ") ||
                          "Unknown"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Pages:</span>
                      <span className="ml-1 text-gray-700">
                        {doc.billable_pages.toFixed(1)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Complexity:</span>
                      <span
                        className={`ml-1 capitalize ${
                          doc.assessed_complexity === "easy"
                            ? "text-green-600"
                            : doc.assessed_complexity === "medium"
                            ? "text-yellow-600"
                            : "text-red-600"
                        }`}
                      >
                        {doc.assessed_complexity || "Standard"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Certification:</span>
                      <span className="ml-1 text-gray-700">
                        {doc.certification_name || "Standard"}
                        {doc.certification_price > 0 &&
                          ` (+$${doc.certification_price.toFixed(2)})`}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Price Summary Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Price Summary</h2>
          </div>
          <div className="px-6 py-4 space-y-3">
            <div className="flex justify-between text-gray-600">
              <span>
                Translation ({quote.documents.length} document
                {quote.documents.length !== 1 ? "s" : ""})
              </span>
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
              <div className="flex justify-between text-red-600">
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
                <p className="font-medium text-gray-900">Estimated Delivery</p>
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

        {/* Footer Links */}
        <div className="text-center space-y-3 mt-8 pt-6 border-t border-gray-200">
          {/* Login / Dashboard Link */}
          <p className="text-gray-600 text-sm">
            <a
              href="/"
              className="text-blue-600 hover:underline font-medium"
            >
              Sign in to your account
            </a>{" "}
            to view all your quotes and orders
          </p>

          {/* Start New Quote */}
          <button
            onClick={handleStartNewQuote}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            Start a New Quote
          </button>

          {/* Contact Support */}
          <p className="text-sm text-gray-500">
            Questions?{" "}
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
