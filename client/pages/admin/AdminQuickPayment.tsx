import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import { supabase } from "@/lib/supabase";
import { Loader2, CheckCircle2, Copy, Info, AlertTriangle } from "lucide-react";

interface CustomerLookup {
  status: "idle" | "loading" | "found" | "not_found";
  customer: { id: string; full_name: string; phone: string | null } | null;
}

interface PaymentResult {
  payment_url: string;
  customer_name: string;
  customer_email: string;
  customer_created: boolean;
  amount: number;
}

export default function AdminQuickPayment() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAdminAuthContext();

  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    phone: "",
    amount: "",
    notes: "",
  });
  const [customerLookup, setCustomerLookup] = useState<CustomerLookup>({
    status: "idle",
    customer: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [copied, setCopied] = useState(false);

  const handleEmailBlur = async () => {
    const email = formData.email.toLowerCase().trim();
    if (!email || !email.includes("@") || !email.includes(".")) return;

    setCustomerLookup({ status: "loading", customer: null });

    try {
      const { data } = await supabase
        .from("customers")
        .select("id, full_name, phone")
        .eq("email", email)
        .maybeSingle();

      if (data) {
        setCustomerLookup({ status: "found", customer: data });
        setFormData((prev) => ({
          ...prev,
          full_name: data.full_name || prev.full_name,
          phone: data.phone || prev.phone,
        }));
      } else {
        setCustomerLookup({ status: "not_found", customer: null });
      }
    } catch {
      setCustomerLookup({ status: "not_found", customer: null });
    }
  };

  const handleFieldChange = (
    field: string,
    value: string,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  const parsedAmount = parseFloat(formData.amount);
  const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0;
  const canSubmit =
    !submitting &&
    formData.email.trim() !== "" &&
    formData.full_name.trim() !== "" &&
    isAmountValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const staffId = session?.staffId;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-deposit-payment-link`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            email: formData.email.toLowerCase().trim(),
            full_name: formData.full_name.trim(),
            phone: formData.phone?.trim() || null,
            amount: parsedAmount,
            notes: formData.notes?.trim() || null,
            staff_id: staffId,
          }),
        },
      );

      const data = await response.json();

      if (!data.success)
        throw new Error(data.error || "Failed to generate payment link");

      setResult(data);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!result?.payment_url) return;
    try {
      await navigator.clipboard.writeText(result.payment_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = result.payment_url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetForm = () => {
    setFormData({ email: "", full_name: "", phone: "", amount: "", notes: "" });
    setCustomerLookup({ status: "idle", customer: null });
    setSubmitting(false);
    setError(null);
    setResult(null);
    setCopied(false);
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(value);

  if (authLoading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate("/admin")}
          className="mb-2 text-teal-600 hover:text-teal-800 font-medium text-sm"
        >
          &larr; Admin
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          Quick Payment Link
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Generate a Stripe deposit link for a customer. Payment will be
          credited to their account.
        </p>
      </div>

      {result ? (
        /* Success State */
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Payment Link Sent!
          </h2>
          <p className="text-gray-600 mb-6">
            A payment link for{" "}
            <span className="font-semibold">
              {formatCurrency(result.amount)}
            </span>{" "}
            CAD has been sent to{" "}
            <span className="font-semibold">{result.customer_email}</span>
          </p>

          {result.customer_created && (
            <div className="flex items-center gap-2 justify-center text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>
                New customer record created for{" "}
                <span className="font-medium">{result.customer_name}</span>
              </span>
            </div>
          )}

          {/* Copyable link */}
          <div className="text-left mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment URL (share if needed)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={result.payment_url}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm text-gray-700 font-mono"
              />
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 text-sm font-medium text-gray-700 transition-colors"
              >
                <Copy className="w-4 h-4" />
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="border-t border-gray-200 pt-4 mb-6">
            <div className="grid grid-cols-1 gap-2 text-sm text-left">
              <div className="flex justify-between">
                <span className="text-gray-500">Customer</span>
                <span className="font-medium text-gray-900">
                  {result.customer_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="font-medium text-gray-900">
                  {result.customer_email}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Amount</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(result.amount)} CAD
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={resetForm}
            className="w-full py-2.5 px-4 bg-teal-600 text-white rounded-md hover:bg-teal-700 font-medium transition-colors"
          >
            Send Another Payment Link
          </button>
        </div>
      ) : (
        /* Form */
        <div className="bg-white rounded-lg shadow p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Customer Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Customer Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => handleFieldChange("email", e.target.value)}
                onBlur={handleEmailBlur}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="customer@example.com"
              />
              {/* Customer lookup status */}
              {customerLookup.status === "loading" && (
                <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Checking...</span>
                </div>
              )}
              {customerLookup.status === "found" && customerLookup.customer && (
                <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-200">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Existing customer &mdash;{" "}
                  {customerLookup.customer.full_name}
                </div>
              )}
              {customerLookup.status === "not_found" && (
                <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium border border-gray-200">
                  New customer will be created
                </div>
              )}
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.full_name}
                onChange={(e) => handleFieldChange("full_name", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="John Doe"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleFieldChange("phone", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="+1 (416) 555-0100"
              />
            </div>

            {/* Amount (CAD) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (CAD) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min="1"
                step="0.01"
                value={formData.amount}
                onChange={(e) => handleFieldChange("amount", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="0.00"
              />
              {isAmountValid && (
                <p className="text-sm text-teal-700 font-medium mt-1">
                  {formatCurrency(parsedAmount)} CAD
                </p>
              )}
            </div>

            {/* Notes / Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes / Description
              </label>
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => handleFieldChange("notes", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-vertical"
                placeholder="e.g. 2 birth certificates, Spanish to English — IRCC spousal sponsorship"
              />
              <p className="text-xs text-gray-500 mt-1">
                This appears in the customer's email and in internal records.
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-2.5 px-4 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate & Send Payment Link"
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
