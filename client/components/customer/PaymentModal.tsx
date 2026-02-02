import { useState } from "react";
import {
  X,
  CreditCard,
  Building2,
  FileText,
  Loader2,
  CheckCircle,
  Copy,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Invoice {
  id: string;
  invoice_number: string;
  balance_due: number;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  invoices: Invoice[];
  totalAmount: number;
  onSuccess: () => void;
}

type PaymentMethod = "stripe" | "e_transfer" | "cheque";

export default function PaymentModal({
  isOpen,
  onClose,
  customerId,
  invoices,
  totalAmount,
  onSuccess,
}: PaymentModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("stripe");
  const [processing, setProcessing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [customerMemo, setCustomerMemo] = useState("");

  const invoiceNumbers = invoices.map(inv => inv.invoice_number).join(", ");

  if (!isOpen) return null;

  const handleStripePayment = async () => {
    setProcessing(true);
    try {
      // Create payment intent
      const { data: intentData, error: intentError } = await supabase
        .from("customer_payment_intents")
        .insert({
          customer_id: customerId,
          total_amount: totalAmount,
          payment_method: "stripe",
          status: "pending",
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
        })
        .select()
        .single();

      if (intentError) throw intentError;

      // Link invoices to intent
      const invoiceLinks = invoices.map(inv => ({
        payment_intent_id: intentData.id,
        invoice_id: inv.id,
        allocated_amount: inv.balance_due,
      }));

      await supabase
        .from("customer_payment_intent_invoices")
        .insert(invoiceLinks);

      // Create Stripe checkout session
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-invoice-checkout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            payment_intent_id: intentData.id,
            customer_id: customerId,
            invoices: invoices.map(inv => ({
              id: inv.id,
              invoice_number: inv.invoice_number,
              amount: inv.balance_due,
            })),
            total_amount: totalAmount,
          }),
        }
      );

      const { url, error } = await response.json();

      if (error) throw new Error(error);
      if (!url) throw new Error("Failed to create checkout session");

      // Redirect to Stripe
      window.location.href = url;
    } catch (err: any) {
      console.error("Stripe error:", err);
      toast.error(err.message || "Failed to process payment");
      setProcessing(false);
    }
  };

  const handleManualPayment = async () => {
    setProcessing(true);
    try {
      // Create payment intent
      const { data: intentData, error: intentError } = await supabase
        .from("customer_payment_intents")
        .insert({
          customer_id: customerId,
          total_amount: totalAmount,
          payment_method: selectedMethod,
          customer_memo: customerMemo || `Payment for ${invoiceNumbers}`,
          status: "pending",
        })
        .select()
        .single();

      if (intentError) throw intentError;

      // Link invoices to intent
      const invoiceLinks = invoices.map(inv => ({
        payment_intent_id: intentData.id,
        invoice_id: inv.id,
        allocated_amount: inv.balance_due,
      }));

      await supabase
        .from("customer_payment_intent_invoices")
        .insert(invoiceLinks);

      setSubmitted(true);
      toast.success("Payment submitted! We'll confirm once received.");
    } catch (err: any) {
      console.error("Error:", err);
      toast.error(err.message || "Failed to submit payment");
    } finally {
      setProcessing(false);
    }
  };

  const handlePay = () => {
    if (selectedMethod === "stripe") {
      handleStripePayment();
    } else {
      handleManualPayment();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  // Success state after manual payment submission
  if (submitted) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Payment Submitted
          </h2>
          <p className="text-gray-600 mb-6">
            {selectedMethod === "e_transfer"
              ? "Please complete your e-transfer. We'll confirm your payment within 1-2 business days."
              : "Please mail your cheque. We'll confirm your payment once received."}
          </p>
          <button
            onClick={() => {
              onClose();
              onSuccess();
            }}
            className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Pay Invoices</h2>
            <p className="text-sm text-gray-500">{invoices.length} invoice(s) selected</p>
          </div>
          <button
            onClick={onClose}
            disabled={processing}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Invoice Summary */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Invoices</h3>
            <div className="space-y-1 text-sm">
              {invoices.map(inv => (
                <div key={inv.id} className="flex justify-between">
                  <span className="text-gray-600">{inv.invoice_number}</span>
                  <span className="font-medium">${inv.balance_due.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t mt-3 pt-3 flex justify-between font-semibold">
              <span>Total</span>
              <span className="text-teal-600">${totalAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Method Selection */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Payment Method</h3>
            <div className="space-y-2">
              {/* Stripe */}
              <label
                className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedMethod === "stripe"
                    ? "border-teal-500 bg-teal-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="payment_method"
                  value="stripe"
                  checked={selectedMethod === "stripe"}
                  onChange={() => setSelectedMethod("stripe")}
                  className="w-4 h-4 text-teal-600"
                />
                <CreditCard className="w-5 h-5 text-gray-400" />
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Credit/Debit Card</p>
                  <p className="text-sm text-gray-500">Pay instantly with Stripe</p>
                </div>
              </label>

              {/* E-Transfer */}
              <label
                className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedMethod === "e_transfer"
                    ? "border-teal-500 bg-teal-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="payment_method"
                  value="e_transfer"
                  checked={selectedMethod === "e_transfer"}
                  onChange={() => setSelectedMethod("e_transfer")}
                  className="w-4 h-4 text-teal-600"
                />
                <Building2 className="w-5 h-5 text-gray-400" />
                <div className="flex-1">
                  <p className="font-medium text-gray-900">E-Transfer</p>
                  <p className="text-sm text-gray-500">1-2 business days processing</p>
                </div>
              </label>

              {/* Cheque */}
              <label
                className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedMethod === "cheque"
                    ? "border-teal-500 bg-teal-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="payment_method"
                  value="cheque"
                  checked={selectedMethod === "cheque"}
                  onChange={() => setSelectedMethod("cheque")}
                  className="w-4 h-4 text-teal-600"
                />
                <FileText className="w-5 h-5 text-gray-400" />
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Cheque</p>
                  <p className="text-sm text-gray-500">5-7 business days processing</p>
                </div>
              </label>
            </div>
          </div>

          {/* E-Transfer Instructions */}
          {selectedMethod === "e_transfer" && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">E-Transfer Instructions</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-blue-700">Send to:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">payments@cethoscorp.com</span>
                    <button
                      onClick={() => copyToClipboard("payments@cethoscorp.com")}
                      className="p-1 hover:bg-blue-100 rounded"
                    >
                      <Copy className="w-4 h-4 text-blue-600" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-blue-700">Amount:</span>
                  <span className="font-medium">${totalAmount.toFixed(2)} CAD</span>
                </div>
                <div className="flex items-start justify-between">
                  <span className="text-blue-700">Reference:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-right">{invoiceNumbers}</span>
                    <button
                      onClick={() => copyToClipboard(invoiceNumbers)}
                      className="p-1 hover:bg-blue-100 rounded"
                    >
                      <Copy className="w-4 h-4 text-blue-600" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-sm text-blue-700 mb-1">
                  Add a note (optional)
                </label>
                <textarea
                  value={customerMemo}
                  onChange={(e) => setCustomerMemo(e.target.value)}
                  placeholder="Any additional details..."
                  rows={2}
                  className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Cheque Instructions */}
          {selectedMethod === "cheque" && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="font-medium text-amber-900 mb-2">Cheque Instructions</h4>
              <div className="space-y-2 text-sm text-amber-800">
                <p><strong>Make cheque payable to:</strong> CETHOS Corp</p>
                <p><strong>Amount:</strong> ${totalAmount.toFixed(2)} CAD</p>
                <p><strong>Reference:</strong> {invoiceNumbers}</p>
                <div className="mt-3 pt-3 border-t border-amber-200">
                  <p className="font-medium">Mail to:</p>
                  <p className="mt-1">
                    CETHOS Corp<br />
                    123 Main Street<br />
                    Calgary, AB T2P 1A1<br />
                    Canada
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={processing}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handlePay}
            disabled={processing}
            className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
          >
            {processing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : selectedMethod === "stripe" ? (
              <>
                <CreditCard className="w-4 h-4" />
                Pay ${totalAmount.toFixed(2)}
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Submit Payment
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
