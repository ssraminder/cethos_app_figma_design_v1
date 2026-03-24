import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Save, RefreshCw, CreditCard } from "lucide-react";
import SearchableSelect from "@/components/ui/SearchableSelect";
import type { TabPropsWithCurrencies } from "./types";
import { PAYMENT_METHODS, POPULAR_CURRENCIES } from "./constants";

// Dynamic field definitions per payment method
const PAYMENT_FIELDS: Record<string, { key: string; label: string; optional?: boolean }[]> = {
  interac: [
    { key: "email", label: "e-Transfer Email" },
    { key: "security_question", label: "Security Question", optional: true },
    { key: "security_answer", label: "Security Answer", optional: true },
  ],
  wire: [
    { key: "bank_name", label: "Bank Name" },
    { key: "account_holder", label: "Account Holder Name" },
    { key: "account_number", label: "Account Number" },
    { key: "swift_code", label: "Routing / SWIFT Code" },
    { key: "bank_address", label: "Bank Address" },
    { key: "intermediary_bank", label: "Intermediary Bank", optional: true },
  ],
  paypal: [{ key: "email", label: "PayPal Email" }],
  direct_deposit: [
    { key: "institution_number", label: "Institution Number" },
    { key: "transit_number", label: "Transit Number" },
    { key: "account_number", label: "Account Number" },
    { key: "account_holder", label: "Account Holder Name" },
  ],
  wise: [
    { key: "wise_id", label: "Wise Email or Account ID" },
    { key: "account_holder", label: "Account Holder Name" },
  ],
  cheque: [
    { key: "payee_name", label: "Payee Name" },
    { key: "mailing_address", label: "Mailing Address" },
    { key: "city", label: "City" },
    { key: "province", label: "Province / State" },
    { key: "country", label: "Country" },
    { key: "postal_code", label: "Postal / Zip Code" },
  ],
};

export default function VendorPaymentTab({
  vendorData,
  currencies,
  onRefresh,
}: TabPropsWithCurrencies) {
  const { vendor, paymentInfo } = vendorData;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [paymentCurrency, setPaymentCurrency] = useState(
    paymentInfo?.payment_currency ?? vendor.preferred_rate_currency ?? vendor.rate_currency ?? ""
  );
  const [paymentMethod, setPaymentMethod] = useState(
    paymentInfo?.payment_method ?? ""
  );
  const [paymentDetails, setPaymentDetails] = useState<Record<string, string>>(
    (paymentInfo?.payment_details as Record<string, string>) ?? {}
  );
  const [invoiceNotes, setInvoiceNotes] = useState(
    paymentInfo?.invoice_notes ?? ""
  );

  // Reset form when paymentInfo changes
  useEffect(() => {
    setPaymentCurrency(
      paymentInfo?.payment_currency ?? vendor.preferred_rate_currency ?? vendor.rate_currency ?? ""
    );
    setPaymentMethod(paymentInfo?.payment_method ?? "");
    setPaymentDetails(
      (paymentInfo?.payment_details as Record<string, string>) ?? {}
    );
    setInvoiceNotes(paymentInfo?.invoice_notes ?? "");
  }, [paymentInfo, vendor]);

  const updateDetail = (key: string, value: string) => {
    setPaymentDetails((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/update-vendor-payment-info`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            vendor_id: vendor.id,
            payment_currency: paymentCurrency,
            payment_method: paymentMethod,
            payment_details: paymentDetails,
            invoice_notes: invoiceNotes,
          }),
        }
      );

      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      toast.success("Payment information saved");
      setEditing(false);
      await onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save payment info"
      );
    }
    setSaving(false);
  };

  // Currency options
  const currencyOptions = [
    ...currencies
      .filter((c) => POPULAR_CURRENCIES.includes(c.code))
      .sort(
        (a, b) =>
          POPULAR_CURRENCIES.indexOf(a.code) -
          POPULAR_CURRENCIES.indexOf(b.code)
      )
      .map((c) => ({
        value: c.code,
        label: `${c.code} — ${c.name}${c.symbol ? ` (${c.symbol})` : ""}`,
        group: "Popular",
      })),
    ...currencies
      .filter((c) => !POPULAR_CURRENCIES.includes(c.code))
      .map((c) => ({
        value: c.code,
        label: `${c.code} — ${c.name}${c.symbol ? ` (${c.symbol})` : ""}`,
        group: "All Currencies",
      })),
  ];

  const fields = PAYMENT_FIELDS[paymentMethod] ?? [];
  const methodLabel =
    PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label ?? paymentMethod;

  // No payment info state
  if (!paymentInfo && !editing) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-10 text-center">
        <CreditCard className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500 mb-3">
          No payment information on file
        </p>
        <button
          onClick={() => setEditing(true)}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
        >
          Set Up Payment
        </button>
      </div>
    );
  }

  // View mode
  if (!editing) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Payment Information
          </h3>
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-teal-600 hover:text-teal-700 font-medium"
          >
            Edit
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-gray-50">
            <span className="text-sm text-gray-500">Payment Currency</span>
            <span className="text-sm text-gray-800 font-medium">
              {paymentInfo?.payment_currency ?? "—"}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-50">
            <span className="text-sm text-gray-500">Payment Method</span>
            <span className="text-sm text-gray-800 font-medium">
              {methodLabel || "—"}
            </span>
          </div>
          {paymentInfo?.payment_details &&
            Object.entries(paymentInfo.payment_details).map(([key, val]) => (
              <div
                key={key}
                className="flex justify-between py-2 border-b border-gray-50"
              >
                <span className="text-sm text-gray-500 capitalize">
                  {key.replace(/_/g, " ")}
                </span>
                <span className="text-sm text-gray-800">{val || "—"}</span>
              </div>
            ))}
          {paymentInfo?.invoice_notes && (
            <div className="py-2">
              <span className="text-sm text-gray-500">Invoice Notes</span>
              <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">
                {paymentInfo.invoice_notes}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Edit mode
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
      <h3 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider">
        Payment Information
      </h3>

      <div className="space-y-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payment Currency
          </label>
          <SearchableSelect
            options={currencyOptions}
            value={paymentCurrency}
            onChange={setPaymentCurrency}
            placeholder="Search currencies..."
            groupOrder={["Popular", "All Currencies"]}
          />
          <p className="text-xs text-gray-400 mt-1">
            The currency this vendor wants to receive payment in. This can
            differ from the rate currency.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payment Method
          </label>
          <select
            value={paymentMethod}
            onChange={(e) => {
              setPaymentMethod(e.target.value);
              setPaymentDetails({});
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">Select method...</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Dynamic fields */}
        {fields.length > 0 && (
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {methodLabel} Details
            </h4>
            {fields.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label}
                  {field.optional && (
                    <span className="text-gray-400 font-normal ml-1">
                      (optional)
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={paymentDetails[field.key] ?? ""}
                  onChange={(e) => updateDetail(field.key, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Invoice Notes
          </label>
          <textarea
            value={invoiceNotes}
            onChange={(e) => setInvoiceNotes(e.target.value)}
            rows={3}
            placeholder="Custom text to appear on vendor invoices"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => setEditing(false)}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Payment Info
          </button>
        </div>
      </div>
    </div>
  );
}
