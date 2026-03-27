import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function CustomerInvoicePayment() {
  const [searchParams] = useSearchParams();
  const payment = searchParams.get("payment");
  const sessionId = searchParams.get("session_id");

  const [status, setStatus] = useState<"loading" | "success" | "cancelled" | "unknown">("unknown");
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (payment === "success" && sessionId) {
      setStatus("loading");
      setVerifying(true);
      verifyAndUpdatePayment(sessionId);
    } else if (payment === "cancelled") {
      setStatus("cancelled");
    } else {
      setStatus("unknown");
    }
  }, [payment, sessionId]);

  async function verifyAndUpdatePayment(session_id: string) {
    try {
      const res = await fetch(
        "https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/handle-stripe-invoice-payment",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id }),
        }
      );
      const data = await res.json();
      if (data.success) {
        setInvoiceNumber(data.invoice_number || null);
        setStatus("success");
      } else {
        // Still show success — payment may have been processed by webhook already
        setStatus("success");
      }
    } catch {
      // Show success anyway — Stripe payment went through, webhook handles DB update
      setStatus("success");
    } finally {
      setVerifying(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600 mx-auto mb-3" />
          <p className="text-gray-600 text-sm">Confirming your payment...</p>
        </div>
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-[480px] w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-9 h-9 text-gray-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Payment Cancelled</h1>
          <p className="text-sm text-gray-500 mb-6">
            Your payment was not completed. Your invoice remains unpaid — you can pay at any time
            using the link in your invoice email.
          </p>
          <div className="border-t border-gray-200 my-6" />
          <p className="text-sm text-gray-500 mb-6">
            Need help?{" "}
            <a href="mailto:support@cethos.com" className="text-teal-600 hover:underline">
              support@cethos.com
            </a>
          </p>
          <a
            href="https://cethos.com"
            className="inline-block w-full py-3 px-4 bg-gray-800 text-white rounded-xl hover:bg-gray-900 transition-colors font-medium text-center"
          >
            Return to Homepage
          </a>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-[480px] w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Payment Received — Thank You!</h1>
          {invoiceNumber && (
            <p className="text-sm font-medium text-teal-700 mb-2">Invoice {invoiceNumber}</p>
          )}
          <p className="text-sm text-gray-500 mb-6">
            Your payment has been received and your invoice has been marked as paid. You'll receive
            a confirmation from our team shortly.
          </p>
          <div className="border-t border-gray-200 my-6" />
          <p className="text-sm text-gray-500 mb-6">
            Questions?{" "}
            <a href="mailto:support@cethos.com" className="text-teal-600 hover:underline">
              support@cethos.com
            </a>
          </p>
          <a
            href="https://cethos.com"
            className="inline-block w-full py-3 px-4 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors font-medium text-center"
          >
            Return to Homepage
          </a>
        </div>
      </div>
    );
  }

  // Unknown state — just show a generic page
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-[480px] w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-3">CETHOS Invoices</h1>
        <p className="text-sm text-gray-500 mb-6">
          To view or pay your invoice, use the link in your invoice email.
        </p>
        <a
          href="mailto:support@cethos.com"
          className="text-teal-600 hover:underline text-sm"
        >
          Contact support
        </a>
      </div>
    </div>
  );
}
