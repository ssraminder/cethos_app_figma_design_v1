import { useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

// ── Types ──

interface OrderFinanceTabProps {
  workflowData: any | null;
  onRefresh?: () => void;
}

interface OrderFinancials {
  service_id?: string;
  subtotal: number;
  certification_total: number;
  rush_fee: number;
  delivery_fee: number;
  discount_total: number;
  surcharge_total: number;
  pre_tax: number;
  tax_rate: number;
  tax: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  currency: string;
  payment_status: string;
}

interface VendorFinancials {
  total_committed: number;
  total_approved: number;
  total_paid: number;
  payable_count: number;
}

interface MarginData {
  amount: number;
  percent: number | null;
}

interface Invoice {
  invoice_number: string;
  status: string;
  invoice_date: string;
  total_amount: number;
  has_pdf: boolean;
}

interface StepPayable {
  id: string;
  workflow_step_id: string;
  vendor_id: string;
  vendor_name: string | null;
  rate: number;
  rate_unit: string;
  units: number;
  subtotal: number;
  currency: string;
  tax_amount: number | null;
  total: number;
  status: string;
  margin_percent: number | null;
  description: string;
  approved_at: string | null;
  invoiced_at: string | null;
  paid_at: string | null;
  vendor_invoice_number: string | null;
}

interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  payment_type: string | null;
  status: string | null;
  payment_method: string | null;
  failure_reason: string | null;
  receipt_url: string | null;
  created_at: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  card_exp_month: number | null;
  card_exp_year: number | null;
  cardholder_name: string | null;
  card_country: string | null;
}

// ── Helpers ──

function formatCurrency(amount: number | null | undefined, currency = "CAD"): string {
  if (amount == null) return "\u2014";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function PayableBadge({ status }: { status: string }) {
  const s = status?.toLowerCase() || "pending";
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    paid: "bg-green-100 text-green-700",
    invoiced: "bg-blue-100 text-blue-700",
    cancelled: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${styles[s] || styles.pending}`}>
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </span>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const s = status?.toLowerCase() || "unpaid";
  const styles: Record<string, string> = {
    paid: "bg-green-100 text-green-700",
    partial: "bg-amber-100 text-amber-700",
    unpaid: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${styles[s] || styles.unpaid}`}>
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </span>
  );
}

function formatRate(rate: number, rateUnit: string): string {
  const formatted = formatCurrency(rate);
  if (rateUnit === "flat") return `${formatted} flat`;
  const unitLabel: Record<string, string> = {
    per_word: "word",
    per_page: "page",
    per_hour: "hour",
  };
  return `${formatted}/${unitLabel[rateUnit] || rateUnit}`;
}

// ── Section 1: Summary Cards ──

function SummaryCards({
  of,
  vf,
  margin,
}: {
  of: OrderFinancials;
  vf: VendorFinancials;
  margin: MarginData | null;
}) {
  const receivableColor =
    of.payment_status === "paid"
      ? "text-green-600"
      : of.payment_status === "partial"
      ? "text-amber-600"
      : "text-red-600";

  const marginPercent = margin?.percent;
  const marginColor =
    marginPercent == null
      ? "text-gray-400"
      : marginPercent >= 30
      ? "text-green-600"
      : marginPercent >= 20
      ? "text-amber-600"
      : "text-red-600";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Receivable */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <p className="text-xs font-medium text-gray-500 mb-1">Receivable</p>
        <p className={`text-xl font-semibold ${receivableColor}`}>
          {formatCurrency(of.total, of.currency)}
        </p>
        <p className="text-xs text-gray-400 mt-1">Total owed by customer</p>
      </div>

      {/* Payable */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <p className="text-xs font-medium text-gray-500 mb-1">Payable</p>
        <p className="text-xl font-semibold text-gray-900">
          {formatCurrency(vf.total_committed, of.currency)}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {vf.payable_count} payable{vf.payable_count !== 1 ? "s" : ""} committed
        </p>
      </div>

      {/* Profit */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <p className="text-xs font-medium text-gray-500 mb-1">Profit</p>
        <p className={`text-xl font-semibold ${marginColor}`}>
          {margin ? formatCurrency(margin.amount, of.currency) : "\u2014"}
        </p>
        <p className={`text-xs mt-1 ${marginColor}`}>
          {margin?.percent != null ? `${margin.percent.toFixed(1)}% margin` : "N/A"}
        </p>
      </div>

      {/* Payment */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <p className="text-xs font-medium text-gray-500 mb-1">Payment</p>
        <div className="mt-1">
          <PaymentBadge status={of.payment_status} />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {formatCurrency(of.amount_paid, of.currency)} of{" "}
          {formatCurrency(of.total, of.currency)}
        </p>
        {of.balance_due > 0 && (
          <p className="text-xs text-amber-600 mt-0.5">
            Balance: {formatCurrency(of.balance_due, of.currency)}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Section 2: Receivable Breakdown ──

function ReceivableBreakdown({
  of,
  invoice,
}: {
  of: OrderFinancials;
  invoice: Invoice | null;
}) {
  const lines: { label: string; amount: number; isDiscount?: boolean }[] = [];

  // Always show Translation
  lines.push({ label: "Translation", amount: of.subtotal });
  if (of.certification_total > 0) lines.push({ label: "Certification", amount: of.certification_total });
  if (of.rush_fee > 0) lines.push({ label: "Rush Fee", amount: of.rush_fee });
  if (of.delivery_fee > 0) lines.push({ label: "Delivery Fee", amount: of.delivery_fee });
  if (of.discount_total > 0) lines.push({ label: "Discount", amount: of.discount_total, isDiscount: true });
  if (of.surcharge_total > 0) lines.push({ label: "Surcharge", amount: of.surcharge_total });

  const taxPercent = (of.tax_rate * 100);
  const taxLabel = `Tax (${taxPercent % 1 === 0 ? taxPercent.toFixed(0) : taxPercent.toFixed(2)}%)`;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Receivable Breakdown</h3>
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Line Item</th>
              <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.label} className="border-b border-gray-100">
                <td className={`py-2 px-4 ${line.isDiscount ? "text-green-600" : "text-gray-600"}`}>
                  {line.label}
                </td>
                <td className={`py-2 px-4 text-right font-medium ${line.isDiscount ? "text-green-600" : "text-gray-900"}`}>
                  {line.isDiscount ? `-${formatCurrency(line.amount, of.currency)}` : formatCurrency(line.amount, of.currency)}
                </td>
              </tr>
            ))}
            <tr className="border-b border-gray-100">
              <td className="py-2 px-4 text-gray-600">Pre-tax Subtotal</td>
              <td className="py-2 px-4 text-right font-medium text-gray-900">
                {formatCurrency(of.pre_tax, of.currency)}
              </td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 px-4 text-gray-600">{taxLabel}</td>
              <td className="py-2 px-4 text-right font-medium text-gray-900">
                {formatCurrency(of.tax, of.currency)}
              </td>
            </tr>
            <tr className="bg-gray-50">
              <td className="py-2.5 px-4 font-semibold text-gray-900">Total</td>
              <td className="py-2.5 px-4 text-right font-semibold text-gray-900">
                {formatCurrency(of.total, of.currency)}
              </td>
            </tr>
          </tbody>
        </table>

        {invoice && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-600">
            Invoice: <span className="font-medium text-gray-900">{invoice.invoice_number}</span>
            {" \u00B7 "}Status: <span className="font-medium">{invoice.status}</span>
            {invoice.invoice_date && (
              <>
                {" \u00B7 "}Date:{" "}
                <span className="font-medium">
                  {format(new Date(invoice.invoice_date), "MMM d, yyyy")}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section 3: Payables Breakdown ──

function PayablesBreakdown({
  steps,
  vf,
  currency,
  onRefresh,
}: {
  steps: any[];
  vf: VendorFinancials;
  currency: string;
  onRefresh?: () => void;
}) {
  const payableSteps = steps.filter((s: any) => s.payable != null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("wire");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const handleMarkInvoiced = async (payableId: string) => {
    if (!invoiceNumber.trim()) {
      toast.error("Vendor invoice number is required");
      return;
    }
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-vendor-payables", {
        body: {
          action: "update_status",
          payable_id: payableId,
          status: "invoiced",
          vendor_invoice_number: invoiceNumber,
          vendor_invoice_date: invoiceDate || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Payable marked as invoiced");
      setEditingId(null);
      setInvoiceNumber("");
      setInvoiceDate("");
      onRefresh?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to update payable");
    }
    setActionLoading(false);
  };

  const handleMarkPaid = async (payableId: string) => {
    if (!paymentMethod) {
      toast.error("Payment method is required");
      return;
    }
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-vendor-payables", {
        body: {
          action: "update_status",
          payable_id: payableId,
          status: "paid",
          payment_method: paymentMethod,
          payment_reference: paymentReference || null,
          payment_notes: paymentNotes || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Payable marked as paid");
      setEditingId(null);
      setPaymentMethod("wire");
      setPaymentReference("");
      setPaymentNotes("");
      onRefresh?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to update payable");
    }
    setActionLoading(false);
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Payables Breakdown</h3>
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {payableSteps.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-400">
              No vendor payables yet. Assign vendors to workflow steps to create payables.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {payableSteps.map((step: any) => {
              const p: StepPayable = step.payable;
              return (
                <div key={p.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-sm flex-1 min-w-0">
                      <span className="font-medium text-gray-900">{step.name}</span>
                      <span className="text-gray-400">{p.vendor_name || "\u2014"}</span>
                      <span className="text-gray-500">{formatRate(p.rate, p.rate_unit)}</span>
                      <span className="font-medium text-gray-900">{formatCurrency(p.total, p.currency || currency)}</span>
                      <PayableBadge status={p.status} />
                      {p.vendor_invoice_number && (
                        <span className="text-xs text-gray-500 font-mono">{p.vendor_invoice_number}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {p.status === "approved" && editingId !== `inv-${p.id}` && (
                        <button
                          onClick={() => { setEditingId(`inv-${p.id}`); setInvoiceNumber(""); setInvoiceDate(""); }}
                          className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                        >
                          Mark Invoiced
                        </button>
                      )}
                      {(p.status === "approved" || p.status === "invoiced") && editingId !== `pay-${p.id}` && (
                        <button
                          onClick={() => { setEditingId(`pay-${p.id}`); setPaymentMethod("wire"); setPaymentReference(""); setPaymentNotes(""); }}
                          className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                        >
                          Mark Paid
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline form: Mark Invoiced */}
                  {editingId === `inv-${p.id}` && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                      <div className="text-xs font-medium text-amber-800">Mark as Invoiced</div>
                      <div className="flex gap-2 items-end flex-wrap">
                        <div>
                          <label className="block text-xs text-gray-600 mb-0.5">Invoice #</label>
                          <input
                            type="text"
                            value={invoiceNumber}
                            onChange={(e) => setInvoiceNumber(e.target.value)}
                            className="border rounded px-2 py-1 text-sm w-32"
                            placeholder="INV-001"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-0.5">Date</label>
                          <input
                            type="date"
                            value={invoiceDate}
                            onChange={(e) => setInvoiceDate(e.target.value)}
                            className="border rounded px-2 py-1 text-sm w-36"
                          />
                        </div>
                        <button
                          onClick={() => handleMarkInvoiced(p.id)}
                          disabled={actionLoading}
                          className="px-3 py-1 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg"
                        >
                          {actionLoading ? "Saving..." : "Confirm"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Inline form: Mark Paid */}
                  {editingId === `pay-${p.id}` && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
                      <div className="text-xs font-medium text-green-800">Mark as Paid</div>
                      <div className="flex gap-2 items-end flex-wrap">
                        <div>
                          <label className="block text-xs text-gray-600 mb-0.5">Method</label>
                          <select
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            className="border rounded px-2 py-1 text-sm w-28"
                          >
                            <option value="wire">Wire</option>
                            <option value="interac">Interac</option>
                            <option value="paypal">PayPal</option>
                            <option value="wise">Wise</option>
                            <option value="cheque">Cheque</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-0.5">Reference</label>
                          <input
                            type="text"
                            value={paymentReference}
                            onChange={(e) => setPaymentReference(e.target.value)}
                            className="border rounded px-2 py-1 text-sm w-32"
                            placeholder="TXN-12345"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-0.5">Notes</label>
                          <input
                            type="text"
                            value={paymentNotes}
                            onChange={(e) => setPaymentNotes(e.target.value)}
                            className="border rounded px-2 py-1 text-sm w-32"
                            placeholder="Optional"
                          />
                        </div>
                        <button
                          onClick={() => handleMarkPaid(p.id)}
                          disabled={actionLoading}
                          className="px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg"
                        >
                          {actionLoading ? "Saving..." : "Confirm"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Summary row */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-600">
          Total Committed: <span className="font-medium text-gray-900">{formatCurrency(vf.total_committed, currency)}</span>
          {" \u00B7 "}Approved: <span className="font-medium text-gray-900">{formatCurrency(vf.total_approved, currency)}</span>
          {" \u00B7 "}Paid: <span className="font-medium text-gray-900">{formatCurrency(vf.total_paid, currency)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Section 4: Profit Summary ──

function ProfitSummary({
  of,
  vf,
  margin,
}: {
  of: OrderFinancials;
  vf: VendorFinancials;
  margin: MarginData | null;
}) {
  const revenue = of.subtotal;
  const cost = vf.total_committed;
  const profit = margin?.amount ?? revenue - cost;
  const percent = margin?.percent;

  const noCosts = cost === 0;
  const negative = profit < 0;
  const belowMin = percent != null && percent < 30 && !negative;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Profit Summary</h3>
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Customer Revenue</span>
          <span className="font-medium text-gray-900">{formatCurrency(revenue, of.currency)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Vendor Cost</span>
          <span className="font-medium text-gray-900">-{formatCurrency(cost, of.currency)}</span>
        </div>
        <div className="border-t border-gray-200 my-1" />
        <div className="flex justify-between text-sm">
          <span className="font-semibold text-gray-900">Gross Profit</span>
          <span className={`font-semibold ${negative ? "text-red-600" : "text-gray-900"}`}>
            {formatCurrency(profit, of.currency)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="font-semibold text-gray-900">Margin</span>
          <span className={`font-semibold ${negative ? "text-red-600" : percent != null && percent < 30 ? "text-amber-600" : "text-green-600"}`}>
            {percent != null ? `${percent.toFixed(1)}%` : "N/A"}
          </span>
        </div>

        {noCosts && (
          <p className="text-xs text-gray-400 mt-2">No vendor costs assigned yet</p>
        )}
        {negative && !noCosts && (
          <div className="mt-3 flex items-start gap-2 p-2.5 bg-red-50 rounded-lg border border-red-100">
            <span className="text-red-500 text-sm flex-shrink-0">&#9888;</span>
            <p className="text-xs text-red-700">
              Negative margin — vendor cost exceeds revenue
            </p>
          </div>
        )}
        {belowMin && !noCosts && (
          <div className="mt-3 flex items-start gap-2 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
            <span className="text-amber-500 text-sm flex-shrink-0">&#9888;</span>
            <p className="text-xs text-amber-700">
              Below minimum margin (30%)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──

export default function OrderFinanceTab({ workflowData, onRefresh }: OrderFinanceTabProps) {
  if (!workflowData) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-gray-400">Loading financial data...</p>
      </div>
    );
  }

  const of: OrderFinancials = workflowData.order_financials || {
    subtotal: 0,
    certification_total: 0,
    rush_fee: 0,
    delivery_fee: 0,
    discount_total: 0,
    surcharge_total: 0,
    pre_tax: 0,
    tax_rate: 0,
    tax: 0,
    total: 0,
    amount_paid: 0,
    balance_due: 0,
    currency: "CAD",
    payment_status: "unpaid",
  };

  const vf: VendorFinancials = workflowData.vendor_financials || {
    total_committed: 0,
    total_approved: 0,
    total_paid: 0,
    payable_count: 0,
  };

  const margin: MarginData | null = workflowData.margin || null;
  const invoice: Invoice | null = workflowData.invoice || null;
  const steps: any[] = workflowData.steps || [];
  const payments: PaymentRecord[] = workflowData.payments || [];

  return (
    <div className="space-y-6">
      <SummaryCards of={of} vf={vf} margin={margin} />
      <ReceivableBreakdown of={of} invoice={invoice} />
      <PaymentDetails payments={payments} />
      <PayablesBreakdown steps={steps} vf={vf} currency={of.currency} onRefresh={onRefresh} />
      <ProfitSummary of={of} vf={vf} margin={margin} />
    </div>
  );
}

// ── Payment Details ──

function PaymentDetails({ payments }: { payments: PaymentRecord[] }) {
  if (!payments || payments.length === 0) return null;

  const cardBrandLabel = (brand: string | null) => {
    if (!brand) return null;
    const map: Record<string, string> = {
      visa: "Visa",
      mastercard: "Mastercard",
      amex: "American Express",
      discover: "Discover",
      jcb: "JCB",
      diners: "Diners Club",
      unionpay: "UnionPay",
    };
    return map[brand.toLowerCase()] || brand;
  };

  const statusBadge = (status: string | null) => {
    const s = (status || "").toLowerCase();
    if (s === "succeeded" || s === "paid" || s === "completed") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded">
          Succeeded
        </span>
      );
    }
    if (s === "failed" || s === "canceled") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded">
          {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded">
        {status || "—"}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Payment Details</h3>
      <div className="space-y-3">
        {payments.map((p) => {
          const isCard = !!p.card_last4;
          const exp =
            p.card_exp_month && p.card_exp_year
              ? `${String(p.card_exp_month).padStart(2, "0")}/${String(
                  p.card_exp_year
                ).slice(-2)}`
              : null;
          return (
            <div
              key={p.id}
              className="border border-gray-200 rounded-md p-3 space-y-2 text-sm"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900">
                    {formatCurrency(p.amount, p.currency)}
                  </span>
                  {p.payment_type && (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded capitalize">
                      {p.payment_type}
                    </span>
                  )}
                  {statusBadge(p.status)}
                </div>
                <span className="text-xs text-gray-500">
                  {format(new Date(p.created_at), "MMM d, yyyy · h:mm a")}
                </span>
              </div>

              {isCard && (
                <div className="flex items-center gap-3 text-sm text-gray-700">
                  <span className="font-medium">
                    {cardBrandLabel(p.card_brand)} •••• {p.card_last4}
                  </span>
                  {exp && <span className="text-gray-500">exp {exp}</span>}
                  {p.card_country && (
                    <span className="text-gray-500">{p.card_country}</span>
                  )}
                  {p.cardholder_name && (
                    <span className="text-gray-500">· {p.cardholder_name}</span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600">
                {p.stripe_payment_intent_id && (
                  <div>
                    <span className="text-gray-400">Payment Intent</span>{" "}
                    <code className="font-mono text-gray-700">
                      {p.stripe_payment_intent_id}
                    </code>
                  </div>
                )}
                {p.stripe_charge_id && (
                  <div>
                    <span className="text-gray-400">Charge</span>{" "}
                    <code className="font-mono text-gray-700">
                      {p.stripe_charge_id}
                    </code>
                  </div>
                )}
                {p.stripe_checkout_session_id && (
                  <div className="sm:col-span-2">
                    <span className="text-gray-400">Checkout Session</span>{" "}
                    <code className="font-mono text-gray-700">
                      {p.stripe_checkout_session_id}
                    </code>
                  </div>
                )}
                {!isCard && p.payment_method && (
                  <div>
                    <span className="text-gray-400">Method</span>{" "}
                    <span className="text-gray-700 capitalize">
                      {p.payment_method}
                    </span>
                  </div>
                )}
              </div>

              {p.failure_reason && (
                <p className="text-xs text-red-600">
                  Failure: {p.failure_reason}
                </p>
              )}

              {p.receipt_url && (
                <a
                  href={p.receipt_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                >
                  View Stripe receipt →
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
