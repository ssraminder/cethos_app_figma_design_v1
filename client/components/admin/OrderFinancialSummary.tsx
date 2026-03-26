import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

// ── Types ──

export interface StepPayable {
  id: string;
  rate: number;
  rate_unit: string;
  units: number;
  subtotal: number;
  total: number;
  currency: string;
  status: "pending" | "approved" | "invoiced" | "paid" | "cancelled";
  margin_percent: number;
  description: string;
  vendor_invoice_number: string | null;
  approved_at: string | null;
  paid_at: string | null;
  original_subtotal: number | null;
  original_total: number | null;
}

export interface VendorFinancials {
  total_committed: number;
  total_approved: number;
  total_paid: number;
  payable_count: number;
}

export interface MarginData {
  amount: number;
  percent: number;
}

export interface FinancialStep {
  step_number: number;
  name: string;
  actor_type: string;
  vendor_name: string | null;
  service_name: string | null;
  vendor_total: number | null;
  payable: StepPayable | null;
}

interface OrderFinancials {
  subtotal: number;
  pre_tax: number;
  tax: number;
  total: number;
}

interface OrderFinancialSummaryProps {
  orderFinancials: OrderFinancials | null;
  vendorFinancials: VendorFinancials | null;
  margin: MarginData | null;
  steps: FinancialStep[];
  minMarginPercent: number;
  onRefresh: () => void;
}

// ── Helpers ──

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `$${amount.toFixed(2)}`;
}

function formatRateUnit(unit: string): string {
  const map: Record<string, string> = {
    per_page: "/page",
    per_word: "/word",
    per_hour: "/hour",
    flat: " flat",
    per_document: "/doc",
  };
  return map[unit] || `/${unit}`;
}

const PAYABLE_STATUS_STYLES: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  pending: { dot: "bg-gray-400", bg: "bg-gray-100", text: "text-gray-600", label: "Pending" },
  approved: { dot: "bg-blue-500", bg: "bg-blue-100", text: "text-blue-700", label: "Approved" },
  invoiced: { dot: "bg-amber-500", bg: "bg-amber-100", text: "text-amber-700", label: "Invoiced" },
  paid: { dot: "bg-green-500", bg: "bg-green-100", text: "text-green-700", label: "Paid" },
  cancelled: { dot: "bg-gray-300", bg: "bg-gray-100", text: "text-gray-400", label: "Cancelled" },
};

function PayableStatusBadge({ status }: { status: string }) {
  const style = PAYABLE_STATUS_STYLES[status] ?? PAYABLE_STATUS_STYLES.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

function MarginHealthIndicator({ percent, minMarginPercent }: { percent: number; minMarginPercent: number }) {
  if (percent >= 50) return <span className="text-green-600 font-medium text-sm">🟢 Healthy</span>;
  if (percent >= minMarginPercent) return <span className="text-yellow-600 font-medium text-sm">🟡 Acceptable</span>;
  return <span className="text-red-600 font-medium text-sm">🔴 Low</span>;
}

function MarginColor(percent: number, minMarginPercent: number): string {
  if (percent >= 50) return "text-green-600";
  if (percent >= minMarginPercent) return "text-yellow-600";
  return "text-red-600";
}

function CollapsedSummary({
  orderFinancials,
  vendorFinancials,
  margin,
  minMarginPercent,
}: {
  orderFinancials: OrderFinancials | null;
  vendorFinancials: VendorFinancials | null;
  margin: MarginData | null;
  minMarginPercent: number;
}) {
  const clientTotal = orderFinancials?.total;
  const vendorTotal = vendorFinancials?.total_committed;
  const marginPercent = margin?.percent;

  return (
    <span className="text-sm text-gray-600">
      📊 Financials:{" "}
      <span className="font-medium">Client {formatCurrency(clientTotal)}</span>
      <span className="mx-1.5">·</span>
      <span className="font-medium">
        Vendor {vendorTotal != null ? formatCurrency(vendorTotal) : "—"}
      </span>
      <span className="mx-1.5">·</span>
      {marginPercent != null ? (
        <span className={`font-medium ${MarginColor(marginPercent, minMarginPercent)}`}>
          Margin {marginPercent.toFixed(1)}%{" "}
          {marginPercent >= 50 ? "🟢" : marginPercent >= minMarginPercent ? "🟡" : "🔴"}
        </span>
      ) : (
        <span className="text-gray-400">No margin data</span>
      )}
    </span>
  );
}

// ── Mark Invoiced Form ──

function MarkInvoicedForm({
  payableId,
  onSuccess,
  onCancel,
}: {
  payableId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!invoiceNumber.trim()) {
      toast.error("Vendor invoice number is required");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-vendor-payables", {
        body: {
          action: "update_status",
          payable_id: payableId,
          status: "invoiced",
          vendor_invoice_number: invoiceNumber.trim(),
          vendor_invoice_date: invoiceDate || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Payable marked as invoiced");
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update payable";
      toast.error(message);
    }
    setSubmitting(false);
  };

  return (
    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
      <div className="text-xs font-medium text-amber-800">Mark as Invoiced</div>
      <div className="flex gap-2 items-end flex-wrap">
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Invoice #</label>
          <input
            type="text"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="INV-001"
            className="border rounded px-2 py-1 text-sm w-32"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Invoice Date</label>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-36"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-3 py-1 bg-amber-600 text-white text-sm rounded hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1"
        >
          {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
          Confirm
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded hover:bg-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Mark Paid Form ──

function MarkPaidForm({
  payableId,
  onSuccess,
  onCancel,
}: {
  payableId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!method) {
      toast.error("Payment method is required");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-vendor-payables", {
        body: {
          action: "update_status",
          payable_id: payableId,
          status: "paid",
          payment_method: method,
          payment_reference: reference.trim() || undefined,
          payment_notes: notes.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Payable marked as paid");
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update payable";
      toast.error(message);
    }
    setSubmitting(false);
  };

  return (
    <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
      <div className="text-xs font-medium text-green-800">Mark as Paid</div>
      <div className="flex gap-2 items-end flex-wrap">
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Payment Method</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-32"
          >
            <option value="">Select...</option>
            <option value="wire">Wire</option>
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
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="TXN-123"
            className="border rounded px-2 py-1 text-sm w-32"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            className="border rounded px-2 py-1 text-sm w-36"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
        >
          {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
          Confirm
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded hover:bg-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Payables Detail Table ──

function PayablesDetailTable({
  steps,
  onRefresh,
}: {
  steps: FinancialStep[];
  onRefresh: () => void;
}) {
  const [activeForm, setActiveForm] = useState<{ payableId: string; type: "invoiced" | "paid" } | null>(null);

  const handleSuccess = () => {
    setActiveForm(null);
    onRefresh();
  };

  return (
    <div className="mt-4 border rounded-lg overflow-hidden">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-2 bg-gray-50 border-b">
        Payables Detail
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-2 font-medium">Step</th>
              <th className="px-4 py-2 font-medium">Vendor</th>
              <th className="px-4 py-2 font-medium">Service</th>
              <th className="px-4 py-2 font-medium text-right">Rate</th>
              <th className="px-4 py-2 font-medium text-right">Units</th>
              <th className="px-4 py-2 font-medium text-right">Total</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {steps.map((step) => {
              const p = step.payable;
              const hasVendor = step.actor_type === "vendor" && step.vendor_name;
              const showNoPayableNote = hasVendor && !p && step.vendor_total != null;

              return (
                <tr key={step.step_number} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-700">Step {step.step_number}</td>
                  <td className="px-4 py-2.5 text-gray-700">{step.vendor_name || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-700">{step.service_name || "—"}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">
                    {p ? `$${p.rate}${formatRateUnit(p.rate_unit)}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700">
                    {p ? p.units : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700">
                    {p ? formatCurrency(p.total) : showNoPayableNote ? (
                      <span>
                        {formatCurrency(step.vendor_total)}
                        <span className="text-xs text-gray-400 ml-1">(no payable record)</span>
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {p ? <PayableStatusBadge status={p.status} /> : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {p && p.status === "approved" && (
                      <button
                        onClick={() => setActiveForm({ payableId: p.id, type: "invoiced" })}
                        className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 font-medium"
                      >
                        Mark Invoiced
                      </button>
                    )}
                    {p && p.status === "invoiced" && (
                      <button
                        onClick={() => setActiveForm({ payableId: p.id, type: "paid" })}
                        className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 font-medium"
                      >
                        Mark Paid
                      </button>
                    )}
                    {!p && "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Inline forms */}
      {activeForm && activeForm.type === "invoiced" && (
        <div className="px-4 pb-3">
          <MarkInvoicedForm
            payableId={activeForm.payableId}
            onSuccess={handleSuccess}
            onCancel={() => setActiveForm(null)}
          />
        </div>
      )}
      {activeForm && activeForm.type === "paid" && (
        <div className="px-4 pb-3">
          <MarkPaidForm
            payableId={activeForm.payableId}
            onSuccess={handleSuccess}
            onCancel={() => setActiveForm(null)}
          />
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

export default function OrderFinancialSummary({
  orderFinancials,
  vendorFinancials,
  margin,
  steps,
  minMarginPercent,
  onRefresh,
}: OrderFinancialSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  const hasVendorCosts = vendorFinancials && vendorFinancials.payable_count > 0;

  return (
    <div className="mt-4 border rounded-lg overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <CollapsedSummary
          orderFinancials={orderFinancials}
          vendorFinancials={vendorFinancials}
          margin={margin}
          minMarginPercent={minMarginPercent}
        />
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Three summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Receivable Card */}
            <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
              <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">
                Receivable (Client)
              </div>
              {orderFinancials ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(orderFinancials.subtotal)}
                    </span>
                  </div>
                  {orderFinancials.tax != null && orderFinancials.tax > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tax</span>
                      <span className="font-medium text-gray-900">
                        {formatCurrency(orderFinancials.tax)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm pt-1 border-t border-blue-200">
                    <span className="font-semibold text-gray-700">Total</span>
                    <span className="font-bold text-gray-900">
                      {formatCurrency(orderFinancials.total)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-400">—</div>
              )}
            </div>

            {/* Payables Card */}
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
              <div className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-3">
                Payables (Vendors)
              </div>
              {hasVendorCosts ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Committed</span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(vendorFinancials.total_committed)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Approved</span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(vendorFinancials.total_approved)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Paid</span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(vendorFinancials.total_paid)}
                    </span>
                  </div>
                  <div className="pt-1 border-t border-amber-200 text-xs text-gray-500">
                    {vendorFinancials.payable_count} payable record{vendorFinancials.payable_count !== 1 ? "s" : ""}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-400">No vendor costs assigned yet</div>
              )}
            </div>

            {/* Margin Card */}
            <div
              className={`border rounded-lg p-4 ${
                !hasVendorCosts
                  ? "border-gray-200 bg-gray-50"
                  : margin && margin.percent >= 50
                    ? "border-green-200 bg-green-50"
                    : margin && margin.percent >= minMarginPercent
                      ? "border-yellow-200 bg-yellow-50"
                      : "border-red-200 bg-red-50"
              }`}
            >
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
                Margin
              </div>
              {hasVendorCosts && margin ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Amount</span>
                    <span className={`font-bold ${MarginColor(margin.percent, minMarginPercent)}`}>
                      {formatCurrency(margin.amount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Margin</span>
                    <span className={`font-bold ${MarginColor(margin.percent, minMarginPercent)}`}>
                      {margin.percent.toFixed(1)}%
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        margin.percent >= 50
                          ? "bg-green-500"
                          : margin.percent >= minMarginPercent
                            ? "bg-yellow-500"
                            : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, margin.percent))}%` }}
                    />
                  </div>
                  <MarginHealthIndicator percent={margin.percent} minMarginPercent={minMarginPercent} />
                </div>
              ) : (
                <div className="text-sm text-gray-400">No vendor costs assigned</div>
              )}
            </div>
          </div>

          {/* Payables detail table */}
          {steps.length > 0 && (
            <PayablesDetailTable steps={steps} onRefresh={onRefresh} />
          )}
        </div>
      )}
    </div>
  );
}
