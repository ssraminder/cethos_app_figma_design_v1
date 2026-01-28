import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/CustomerAuthContext";
import CustomerLayout from "../../components/layouts/CustomerLayout";
import {
  FileText,
  Calendar,
  DollarSign,
  ArrowLeft,
  CreditCard,
  Download,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Quote {
  id: string;
  quote_number: string;
  status: string;
  total_amount: number;
  created_at: string;
  valid_until: string;
  source_language: string;
  target_language: string;
  country_of_issue: string;
  delivery_method: string;
  estimated_delivery_date: string;
  stripe_session_id: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending_payment: "bg-yellow-100 text-yellow-800",
  quote_ready: "bg-green-100 text-green-800",
  hitl_pending: "bg-blue-100 text-blue-800",
  ai_processing: "bg-purple-100 text-purple-800",
  quote_expired: "bg-gray-100 text-gray-800",
  quote_cancelled: "bg-red-100 text-red-800",
  paid: "bg-teal-100 text-teal-800",
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Pending Payment",
  quote_ready: "Ready",
  hitl_pending: "Under Review",
  ai_processing: "Processing",
  quote_expired: "Expired",
  quote_cancelled: "Cancelled",
  paid: "Paid",
};

export default function CustomerQuoteDetail() {
  const { id } = useParams();
  const { customer } = useAuth();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id && customer?.id) {
      loadQuote();
    }
  }, [id, customer?.id]);

  const loadQuote = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", id)
        .eq("customer_id", customer?.id)
        .single();

      if (error) throw error;
      setQuote(data);
    } catch (err) {
      console.error("Failed to load quote:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = () => {
    if (quote?.id) {
      navigate(`/quote/${quote.id}/checkout`);
    }
  };

  if (loading) {
    return (
      <CustomerLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  if (!quote) {
    return (
      <CustomerLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">Quote not found</p>
            <Link
              to="/dashboard/quotes"
              className="text-red-600 hover:text-red-700 text-sm mt-2 inline-block"
            >
              ← Back to quotes
            </Link>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Link
          to="/dashboard/quotes"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Quotes
        </Link>

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {quote.quote_number}
              </h1>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Created: {new Date(quote.created_at).toLocaleDateString()}
                </div>
                {quote.valid_until && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Valid until:{" "}
                    {new Date(quote.valid_until).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
            <span
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                STATUS_COLORS[quote.status] || "bg-gray-100 text-gray-800"
              }`}
            >
              {STATUS_LABELS[quote.status] || quote.status}
            </span>
          </div>
        </div>

        {/* Quote Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Quote Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Source Language</p>
              <p className="font-medium text-gray-900">
                {quote.source_language}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Target Language</p>
              <p className="font-medium text-gray-900">
                {quote.target_language}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Country of Issue</p>
              <p className="font-medium text-gray-900">
                {quote.country_of_issue}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Delivery Method</p>
              <p className="font-medium text-gray-900">
                {quote.delivery_method || "N/A"}
              </p>
            </div>
            {quote.estimated_delivery_date && (
              <div>
                <p className="text-sm text-gray-600 mb-1">
                  Estimated Delivery
                </p>
                <p className="font-medium text-gray-900">
                  {new Date(quote.estimated_delivery_date).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Pricing</h2>
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-teal-600" />
              <span className="text-2xl font-bold text-gray-900">
                ${quote.total_amount.toFixed(2)}
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            All prices include applicable taxes and fees
          </p>
        </div>

        {/* Actions */}
        {quote.status === "pending_payment" && (
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-teal-900 mb-1">
                  Ready for Payment
                </h3>
                <p className="text-sm text-teal-700">
                  This quote is ready for payment. Click the button to proceed
                  to checkout.
                </p>
              </div>
              <button
                onClick={handlePayment}
                className="flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
              >
                <CreditCard className="w-5 h-5" />
                Pay Now
              </button>
            </div>
          </div>
        )}

        {quote.status === "paid" && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-green-900">Payment Received</h3>
                <p className="text-sm text-green-700">
                  Your payment has been received and your order is being
                  processed.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
