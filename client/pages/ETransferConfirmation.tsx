import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Mail, CheckCircle, Copy, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function ETransferConfirmation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const quoteId = searchParams.get("quote_id");

  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteData, setQuoteData] = useState<{
    quote_number: string;
    total: number;
    customer_email: string;
    customer_name: string;
  } | null>(null);

  // E-Transfer details (these should ideally come from settings/config)
  const ETRANSFER_EMAIL = "payments@cethos.com";
  const ETRANSFER_INSTRUCTIONS = [
    "Log in to your online banking",
    `Send an Interac e-Transfer to: ${ETRANSFER_EMAIL}`,
    "Use your quote number as the e-Transfer message/reference",
    "Set a security question (optional) or use auto-deposit if available",
    "Click 'I have made the payment' below once sent",
  ];

  useEffect(() => {
    if (!quoteId) {
      setError("Quote ID is missing. Please try again.");
      setLoading(false);
      return;
    }

    fetchQuoteData();
  }, [quoteId]);

  const fetchQuoteData = async () => {
    if (!supabase || !quoteId) return;

    try {
      const { data: quote, error: fetchError } = await supabase
        .from("quotes")
        .select(
          `
          quote_number,
          total,
          customers (
            email,
            full_name
          )
        `,
        )
        .eq("id", quoteId)
        .single();

      if (fetchError) throw fetchError;

      if (!quote) {
        throw new Error("Quote not found");
      }

      setQuoteData({
        quote_number: quote.quote_number,
        total: quote.total || 0,
        customer_email: quote.customers?.email || "",
        customer_name: quote.customers?.full_name || "Customer",
      });
    } catch (err: any) {
      console.error("Error fetching quote:", err);
      setError(err.message || "Failed to load quote information");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(ETRANSFER_EMAIL);
    toast.success("Email address copied to clipboard");
  };

  const handleCopyQuoteNumber = () => {
    if (quoteData?.quote_number) {
      navigator.clipboard.writeText(quoteData.quote_number);
      toast.success("Quote number copied to clipboard");
    }
  };

  const handleConfirmPayment = async () => {
    if (!quoteId || !supabase) return;

    setConfirming(true);
    setError(null);

    try {
      // 1. Update quote status to payment_confirmation_awaited
      const { error: updateError } = await supabase
        .from("quotes")
        .update({
          status: "payment_confirmation_awaited",
          payment_method_id: (
            await supabase
              .from("payment_methods")
              .select("id")
              .eq("code", "etransfer")
              .single()
          ).data?.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", quoteId);

      if (updateError) throw updateError;

      // 2. Send notification email to staff
      await supabase.functions.invoke("send-email", {
        body: {
          to: "support@cethos.com", // Update with actual staff email
          subject: `E-Transfer Payment Pending - ${quoteData?.quote_number}`,
          templateId: "staff-etransfer-notification", // Create this template
          params: {
            QUOTE_NUMBER: quoteData?.quote_number,
            CUSTOMER_NAME: quoteData?.customer_name,
            CUSTOMER_EMAIL: quoteData?.customer_email,
            AMOUNT: quoteData?.total.toFixed(2),
          },
        },
      });

      // 3. Send confirmation email to customer
      await supabase.functions.invoke("send-email", {
        body: {
          to: quoteData?.customer_email,
          toName: quoteData?.customer_name,
          subject: `Payment Confirmation Pending - ${quoteData?.quote_number}`,
          templateId: 18, // Create Brevo template for customer confirmation
          params: {
            CUSTOMER_NAME: quoteData?.customer_name,
            QUOTE_NUMBER: quoteData?.quote_number,
            AMOUNT: quoteData?.total.toFixed(2),
            ETRANSFER_EMAIL: ETRANSFER_EMAIL,
          },
        },
      });

      // 4. Navigate to success page
      toast.success("Payment confirmation received!");
      navigate(`/etransfer/success?quote_id=${quoteId}`);
    } catch (err: any) {
      console.error("Error confirming payment:", err);
      setError(
        err.message ||
          "Failed to confirm payment. Please try again or contact support.",
      );
      toast.error("Failed to confirm payment");
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-cethos-teal" />
      </div>
    );
  }

  if (error && !quoteData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
          <div className="flex items-center gap-3 text-red-600 mb-4">
            <AlertCircle className="w-6 h-6" />
            <h2 className="text-xl font-bold">Error</h2>
          </div>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="w-full py-3 bg-cethos-teal text-white rounded-lg hover:bg-cethos-teal-dark transition-colors font-medium"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-cethos-teal-50 rounded-full mb-4">
            <Mail className="w-8 h-8 text-cethos-teal" />
          </div>
          <h1 className="text-3xl font-bold text-cethos-navy mb-2">
            Pay by E-Transfer
          </h1>
          <p className="text-gray-600">
            Follow the instructions below to complete your payment
          </p>
        </div>

        {/* Quote Details Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-sm text-gray-500">Quote Number</p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold text-cethos-navy">
                  {quoteData?.quote_number}
                </p>
                <button
                  onClick={handleCopyQuoteNumber}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                  title="Copy quote number"
                >
                  <Copy className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Amount Due</p>
              <p className="text-2xl font-bold text-cethos-navy">
                ${quoteData?.total.toFixed(2)} CAD
              </p>
            </div>
          </div>
        </div>

        {/* E-Transfer Instructions Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-cethos-navy mb-4">
            E-Transfer Instructions
          </h2>

          {/* E-Transfer Email */}
          <div className="bg-cethos-teal-50 border border-cethos-teal-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-cethos-teal-dark font-medium mb-2">
              Send e-Transfer to:
            </p>
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-cethos-teal">
                {ETRANSFER_EMAIL}
              </p>
              <button
                onClick={handleCopyEmail}
                className="flex items-center gap-2 px-3 py-1.5 bg-white text-cethos-teal border border-cethos-teal rounded-lg hover:bg-cethos-teal hover:text-white transition-colors text-sm font-medium"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
            </div>
          </div>

          {/* Step-by-step Instructions */}
          <ol className="space-y-3">
            {ETRANSFER_INSTRUCTIONS.map((instruction, index) => (
              <li key={index} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-cethos-teal text-white rounded-full flex items-center justify-center text-sm font-bold">
                  {index + 1}
                </div>
                <p className="text-gray-700 pt-0.5">{instruction}</p>
              </li>
            ))}
          </ol>

          {/* Important Note */}
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              <span className="font-semibold">Important:</span> Please include
              your quote number ({quoteData?.quote_number}) in the e-Transfer
              message so we can match your payment to your order.
            </p>
          </div>
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

        {/* Confirmation Button */}
        <button
          onClick={handleConfirmPayment}
          disabled={confirming}
          className="w-full py-4 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
        >
          {confirming ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <CheckCircle className="w-6 h-6" />
              <span>I have made the payment</span>
            </>
          )}
        </button>

        {/* Help Text */}
        <p className="text-center text-sm text-gray-500 mt-6">
          Need help? Contact us at{" "}
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
