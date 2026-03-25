import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  DollarSign,
  FileText,
  ExternalLink,
  Loader2,
} from "lucide-react";
import type {
  VendorFinancials,
  StepPayable,
} from "./OrderFinancialSummary";

// ── Types ──

interface OrderFinanceSectionProps {
  order: any;
  invoice: any | null;
  payments: any[];
  paymentAllocations: any[];
  paymentRequests: any[];
  refunds: any[];
  workflowData: any | null;
  onRefresh: () => void;
}

type FinanceTab = "receivable" | "payables" | "profit" | "payments";

const TABS: { key: FinanceTab; label: string }[] = [
  { key: "receivable", label: "Receivable" },
  { key: "payables", label: "Payables" },
  { key: "profit", label: "Profit" },
  { key: "payments", label: "Payments" },
];

const RATE_UNIT_LABELS: Record<string, string> = {
  per_word: "word",
  per_page: "page",
  per_hour: "hour",
  flat: "flat",
};

// ── Helpers ──

function fmt(val: any): string {
  return `$${parseFloat(String(val || 0)).toFixed(2)}`;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-gray-100 text-gray-600",
    approved: "bg-blue-100 text-blue-700",
    invoiced: "bg-amber-100 text-amber-700",
    paid: "bg-green-100 text-green-700",
    succeeded: "bg-green-100 text-green-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    cancelled: "bg-red-100 text-red-700",
  };
  const dots: Record<string, string> = {
    pending: "text-gray-400",
    approved: "text-blue-500",
    invoiced: "text-amber-500",
    paid: "text-green-500",
    succeeded: "text-green-500",
    completed: "text-green-500",
    failed: "text-red-500",
  };
  const s = status?.toLowerCase() || "pending";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${styles[s] || styles.pending}`}>
      <span className={dots[s] || dots.pending}>●</span>
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </span>
  );
}

// ── Tab: Receivable ──

function ReceivableTab({ order, invoice }: { order: any; invoice: any | null }) {
  const [pdfLoading, setPdfLoading] = useState(false);

  const subtotal = parseFloat(String(order.subtotal || 0));
  const certTotal = parseFloat(String(order.certification_total || 0));
  const rushFee = parseFloat(String(order.rush_fee || 0));
  const deliveryFee = parseFloat(String(order.delivery_fee || 0));
  const discountTotal = parseFloat(String(order.discount_total || 0));
  const surchargeTotal = parseFloat(String(order.surcharge_total || 0));
  const taxRate = parseFloat(String(order.tax_rate || 0));
  const taxAmount = parseFloat(String(order.tax_amount || 0));
  const totalAmount = parseFloat(String(order.total_amount || 0));
  const amountPaid = parseFloat(String(order.amount_paid || 0));
  const balanceDue = parseFloat(String(order.balance_due || 0));

  const preTax = subtotal + certTotal + rushFee + deliveryFee - discountTotal + surchargeTotal;

  const handleViewPdf = async () => {
    if (!invoice?.pdf_storage_path) return;
    setPdfLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from("invoices")
        .createSignedUrl(invoice.pdf_storage_path, 300);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    } catch {
      toast.error("Failed to open invoice PDF");
    }
    setPdfLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* Pricing Breakdown */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Pricing Breakdown</h4>
        <div className="bg-gray-50 rounded-lg p-4 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Translation subtotal</span>
            <span className="text-gray-900 font-medium">{fmt(subtotal)}</span>
          </div>
          {certTotal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Certification</span>
              <span className="text-gray-900 font-medium">{fmt(certTotal)}</span>
            </div>
          )}
          {rushFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Rush fee</span>
              <span className="text-gray-900 font-medium">{fmt(rushFee)}</span>
            </div>
          )}
          {deliveryFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Delivery fee</span>
              <span className="text-gray-900 font-medium">{fmt(deliveryFee)}</span>
            </div>
          )}
          {discountTotal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-green-600">Discount</span>
              <span className="text-green-600 font-medium">-{fmt(discountTotal)}</span>
            </div>
          )}
          {surchargeTotal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Surcharge</span>
              <span className="text-gray-900 font-medium">{fmt(surchargeTotal)}</span>
            </div>
          )}
          <div className="border-t border-gray-200 my-1" />
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Subtotal (pre-tax)</span>
            <span className="text-gray-900 font-medium">{fmt(preTax)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Tax ({(taxRate * 100).toFixed(taxRate * 100 % 1 === 0 ? 0 : 2)}%)</span>
            <span className="text-gray-900 font-medium">{fmt(taxAmount)}</span>
          </div>
          <div className="border-t border-gray-300 my-1" />
          <div className="flex justify-between text-sm font-semibold">
            <span className="text-gray-900">Total</span>
            <span className="text-gray-900">{fmt(totalAmount)}</span>
          </div>
        </div>
      </div>

      {/* Payment Status */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Payment Status</h4>
        <div className="bg-gray-50 rounded-lg p-4 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Amount paid</span>
            <span className="text-gray-900 font-medium flex items-center gap-1">
              {fmt(amountPaid)}
              {amountPaid >= totalAmount && totalAmount > 0 && (
                <span className="text-green-500">✅</span>
              )}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Balance due</span>
            <span className={`font-medium ${balanceDue > 0 ? "text-amber-600" : "text-gray-900"}`}>
              {fmt(balanceDue)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Currency</span>
            <span className="text-gray-900 font-medium">CAD</span>
          </div>
        </div>
      </div>

      {/* Invoice */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Invoice</h4>
        <div className="bg-gray-50 rounded-lg p-4">
          {invoice ? (
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Invoice #</span>
                <span className="text-gray-900 font-medium">{invoice.invoice_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Status</span>
                <span className="flex items-center gap-1">
                  <span className={`text-sm font-medium ${invoice.status === "paid" ? "text-green-600" : "text-blue-600"}`}>
                    {invoice.status?.charAt(0).toUpperCase() + invoice.status?.slice(1)}
                  </span>
                  {invoice.status === "paid" && <span>✅</span>}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Date</span>
                <span className="text-gray-900 font-medium">
                  {invoice.created_at ? format(new Date(invoice.created_at), "MMM d, yyyy") : "—"}
                </span>
              </div>
              {invoice.pdf_storage_path && (
                <button
                  onClick={handleViewPdf}
                  disabled={pdfLoading}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  {pdfLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                  View Invoice PDF
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">No invoice generated yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Payables ──

function PayablesTab({ workflowData, onRefresh }: { workflowData: any | null; onRefresh: () => void }) {
  const [editingPayableId, setEditingPayableId] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("wire");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  if (!workflowData || !workflowData.steps) {
    return <p className="text-sm text-gray-400 italic py-4">No workflow assigned</p>;
  }

  const vf: VendorFinancials | null = workflowData.vendor_financials || null;
  const steps: any[] = workflowData.steps || [];
  const hasPayables = steps.some((s: any) => s.payable);

  if (!hasPayables) {
    return (
      <div className="py-4">
        <p className="text-sm text-gray-400 italic">Assign vendors to see payables</p>
      </div>
    );
  }

  const handleMarkInvoiced = async (payableId: string) => {
    if (!invoiceNumber.trim()) {
      toast.error("Vendor invoice number is required");
      return;
    }
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke("manage-vendor-payables", {
        body: {
          action: "update_status",
          payable_id: payableId,
          status: "invoiced",
          vendor_invoice_number: invoiceNumber,
          vendor_invoice_date: invoiceDate || null,
        },
      });
      if (error) throw error;
      toast.success("Payable marked as invoiced");
      setEditingPayableId(null);
      setInvoiceNumber("");
      setInvoiceDate("");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to update payable");
    }
    setActionLoading(false);
  };

  const handleMarkPaid = async (payableId: string) => {
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke("manage-vendor-payables", {
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
      toast.success("Payable marked as paid");
      setEditingPayableId(null);
      setPaymentMethod("wire");
      setPaymentReference("");
      setPaymentNotes("");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to update payable");
    }
    setActionLoading(false);
  };

  const vendorCount = new Set(steps.filter((s: any) => s.vendor_name).map((s: any) => s.vendor_name)).size;

  return (
    <div className="space-y-4">
      {/* Summary */}
      {vf && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Summary</h4>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-gray-500">Total committed: </span>
                <span className="font-medium">{fmt(vf.total_committed)}</span>
              </div>
              <div>
                <span className="text-gray-500">Approved: </span>
                <span className="font-medium">{fmt(vf.total_approved)}</span>
              </div>
              <div>
                <span className="text-gray-500">Paid: </span>
                <span className="font-medium">{fmt(vf.total_paid)}</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {vf.payable_count} payable{vf.payable_count !== 1 ? "s" : ""} · {vendorCount} vendor{vendorCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      )}

      {/* Payable Records */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Payable Records</h4>
        <div className="space-y-2">
          {steps.map((step: any) => {
            const p: StepPayable | null = step.payable || null;
            const rateLabel = p ? RATE_UNIT_LABELS[p.rate_unit] || p.rate_unit : "";

            return (
              <div key={step.step_number} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400 font-mono text-xs">#{step.step_number}</span>
                      <span className="font-medium text-gray-900">{step.vendor_name || "—"}</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-600">{step.service_name || step.name}</span>
                    </div>
                    {p ? (
                      <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                        <span>${p.rate}/{rateLabel}</span>
                        <span>{p.units} {rateLabel}{p.units !== 1 ? "s" : ""}</span>
                        <span className="font-medium text-gray-900">{fmt(p.total)}</span>
                        <StatusBadge status={p.status} />
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-gray-400 italic">No vendor cost</p>
                    )}
                  </div>

                  {/* Action buttons */}
                  {p && p.status === "approved" && editingPayableId !== `invoiced-${p.id}` && (
                    <button
                      onClick={() => {
                        setEditingPayableId(`invoiced-${p.id}`);
                        setInvoiceNumber("");
                        setInvoiceDate("");
                      }}
                      className="ml-2 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                    >
                      Mark Invoiced
                    </button>
                  )}
                  {p && p.status === "invoiced" && editingPayableId !== `paid-${p.id}` && (
                    <button
                      onClick={() => {
                        setEditingPayableId(`paid-${p.id}`);
                        setPaymentMethod("wire");
                        setPaymentReference("");
                        setPaymentNotes("");
                      }}
                      className="ml-2 px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                    >
                      Mark Paid
                    </button>
                  )}
                </div>

                {/* Inline form: Mark Invoiced */}
                {p && editingPayableId === `invoiced-${p.id}` && (
                  <div className="mt-3 p-3 bg-white border border-amber-200 rounded-lg space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Vendor Invoice #</label>
                      <input
                        type="text"
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                        placeholder="INV-001"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Vendor Invoice Date</label>
                      <input
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleMarkInvoiced(p.id)}
                        disabled={actionLoading}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition-colors"
                      >
                        {actionLoading ? "Saving..." : "Confirm"}
                      </button>
                      <button
                        onClick={() => setEditingPayableId(null)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Inline form: Mark Paid */}
                {p && editingPayableId === `paid-${p.id}` && (
                  <div className="mt-3 p-3 bg-white border border-green-200 rounded-lg space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500"
                      >
                        <option value="wire">Wire Transfer</option>
                        <option value="paypal">PayPal</option>
                        <option value="wise">Wise</option>
                        <option value="cheque">Cheque</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Reference</label>
                      <input
                        type="text"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500"
                        placeholder="TXN-12345"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                      <input
                        type="text"
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500"
                        placeholder="Optional notes"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleMarkPaid(p.id)}
                        disabled={actionLoading}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg transition-colors"
                      >
                        {actionLoading ? "Saving..." : "Confirm"}
                      </button>
                      <button
                        onClick={() => setEditingPayableId(null)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
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
      </div>
    </div>
  );
}

// ── Tab: Profit ──

function ProfitTab({ order, workflowData, minMarginPercent }: { order: any; workflowData: any | null; minMarginPercent: number }) {
  const subtotal = parseFloat(String(order.subtotal || 0));
  const certTotal = parseFloat(String(order.certification_total || 0));
  const rushFee = parseFloat(String(order.rush_fee || 0));
  const deliveryFee = parseFloat(String(order.delivery_fee || 0));

  const revenueLines: { label: string; amount: number }[] = [
    { label: "Subtotal", amount: subtotal },
  ];
  if (certTotal > 0) revenueLines.push({ label: "Certification", amount: certTotal });
  if (rushFee > 0) revenueLines.push({ label: "Rush fee", amount: rushFee });
  if (deliveryFee > 0) revenueLines.push({ label: "Delivery fee", amount: deliveryFee });
  const revenueTotal = revenueLines.reduce((s, l) => s + l.amount, 0);

  const vf: VendorFinancials | null = workflowData?.vendor_financials || null;
  const costTotal = vf?.total_committed || 0;
  const steps: any[] = workflowData?.steps || [];

  const marginAmount = revenueTotal - costTotal;
  const marginPercent = revenueTotal > 0 ? (marginAmount / revenueTotal) * 100 : 0;
  const barWidth = Math.min(100, Math.max(0, marginPercent));

  const hasVendorCosts = costTotal > 0;

  let healthLabel: string;
  let healthBg: string;
  let healthIcon: string;
  let barColor: string;
  if (marginPercent >= 50) {
    healthLabel = "Healthy";
    healthBg = "bg-green-50 border-green-200";
    healthIcon = "🟢";
    barColor = "bg-green-500";
  } else if (marginPercent >= minMarginPercent) {
    healthLabel = "Acceptable";
    healthBg = "bg-yellow-50 border-yellow-200";
    healthIcon = "🟡";
    barColor = "bg-yellow-500";
  } else {
    healthLabel = "Low";
    healthBg = "bg-red-50 border-red-200";
    healthIcon = "🔴";
    barColor = "bg-red-500";
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Revenue Card */}
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
        <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-3">Revenue</h4>
        <div className="space-y-1.5">
          {revenueLines.map((line) => (
            <div key={line.label} className="flex justify-between text-sm">
              <span className="text-blue-600">{line.label}</span>
              <span className="text-blue-900 font-medium">{fmt(line.amount)}</span>
            </div>
          ))}
          <div className="border-t border-blue-200 my-1" />
          <div className="flex justify-between text-sm font-semibold">
            <span className="text-blue-900">Total</span>
            <span className="text-blue-900">{fmt(revenueTotal)}</span>
          </div>
        </div>
      </div>

      {/* Cost Card */}
      <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
        <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-3">Cost</h4>
        <div className="space-y-1.5">
          {steps.length > 0 ? (
            steps
              .filter((s: any) => s.payable || s.vendor_total)
              .map((s: any) => (
                <div key={s.step_number} className="flex justify-between text-sm">
                  <span className="text-amber-600 truncate mr-2">Step {s.step_number}</span>
                  <span className="text-amber-900 font-medium">{fmt(s.payable?.total || s.vendor_total || 0)}</span>
                </div>
              ))
          ) : null}
          {!hasVendorCosts && (
            <p className="text-xs text-amber-400 italic">No vendor costs</p>
          )}
          <div className="border-t border-amber-200 my-1" />
          <div className="flex justify-between text-sm font-semibold">
            <span className="text-amber-900">Total</span>
            <span className="text-amber-900">{fmt(costTotal)}</span>
          </div>
        </div>
      </div>

      {/* Margin Card */}
      <div className={`rounded-lg p-4 border ${hasVendorCosts ? healthBg : "bg-gray-50 border-gray-200"}`}>
        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">Margin</h4>
        {hasVendorCosts ? (
          <div className="space-y-2">
            <p className="text-xl font-bold text-gray-900">{fmt(marginAmount)}</p>
            <p className="text-sm font-medium text-gray-700">{marginPercent.toFixed(1)}%</p>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div className={`h-2.5 rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
            </div>
            <p className="text-sm font-medium">{healthIcon} {healthLabel}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">No vendor costs assigned</p>
        )}
      </div>
    </div>
  );
}

// ── Tab: Payments ──

function PaymentsTab({
  order,
  payments,
  paymentAllocations,
  paymentRequests,
  refunds,
}: {
  order: any;
  payments: any[];
  paymentAllocations: any[];
  paymentRequests: any[];
  refunds: any[];
}) {
  // Combine all payment sources into a unified view
  const allPayments: {
    date: string;
    method: string;
    amount: number;
    status: string;
    reference: string | null;
    receiptUrl: string | null;
  }[] = [];

  // Stripe payment requests (paid)
  paymentRequests
    .filter((pr) => pr.status === "paid")
    .forEach((pr) => {
      allPayments.push({
        date: pr.paid_at || pr.created_at,
        method: "Stripe",
        amount: pr.amount,
        status: "succeeded",
        reference: pr.stripe_payment_link_url ? "Stripe Link" : null,
        receiptUrl: null,
      });
    });

  // Payment allocations
  paymentAllocations.forEach((alloc) => {
    const cp = alloc.customer_payments;
    if (cp) {
      allPayments.push({
        date: cp.payment_date || alloc.created_at,
        method: cp.payment_method_name || "Online Payment",
        amount: alloc.allocated_amount,
        status: cp.status || "completed",
        reference: cp.reference_number || null,
        receiptUrl: null,
      });
    }
  });

  // Direct payments array (if any from Stripe)
  payments.forEach((p) => {
    allPayments.push({
      date: p.created_at,
      method: p.payment_method || "card",
      amount: p.amount,
      status: p.status || "succeeded",
      reference: p.stripe_payment_intent_id || null,
      receiptUrl: p.receipt_url || null,
    });
  });

  const totalPaid = parseFloat(String(order.amount_paid || 0));
  const totalRefunded = parseFloat(String(order.refund_amount || 0));
  const netAmount = totalPaid - totalRefunded;

  const hasPaymentData = allPayments.length > 0 || totalPaid > 0;

  return (
    <div className="space-y-4">
      {/* Payments */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Payments</h4>
        {hasPaymentData ? (
          <div className="bg-gray-50 rounded-lg overflow-hidden">
            {allPayments.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Date</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Method</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Amount</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Status</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {allPayments.map((p, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 px-3 text-gray-600">
                        {p.date ? format(new Date(p.date), "MMM d") : "—"}
                      </td>
                      <td className="py-2 px-3 text-gray-600">{p.method}</td>
                      <td className="py-2 px-3 text-right font-medium text-gray-900">{fmt(p.amount)}</td>
                      <td className="py-2 px-3">
                        <PaymentStatusIcon status={p.status} />
                      </td>
                      <td className="py-2 px-3 text-gray-500 text-xs font-mono truncate max-w-[120px]">
                        {p.receiptUrl ? (
                          <a
                            href={p.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            {p.reference ? truncateRef(p.reference) : "Receipt"}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : p.reference ? (
                          truncateRef(p.reference)
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{fmt(totalPaid)}</span>
                  <span className="text-sm text-gray-500">paid</span>
                </div>
                <p className="text-xs text-gray-400 italic mt-1">Payment details not yet available</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic py-2">No payments recorded</p>
        )}
      </div>

      {/* Refunds */}
      {refunds.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Refunds</h4>
          <div className="bg-gray-50 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Date</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Amount</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Method</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Status</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Reason</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((r: any, i: number) => (
                  <tr key={r.id || i} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 px-3 text-gray-600">
                      {r.created_at ? format(new Date(r.created_at), "MMM d") : "—"}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-red-600">{fmt(r.amount)}</td>
                    <td className="py-2 px-3 text-gray-600">{r.refund_method || "—"}</td>
                    <td className="py-2 px-3">
                      <PaymentStatusIcon status={r.status} />
                    </td>
                    <td className="py-2 px-3 text-gray-500 text-xs truncate max-w-[150px]">{r.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-2 text-sm">
        <span className="text-gray-600">
          Paid <span className="font-medium text-gray-900">{fmt(totalPaid)}</span>
        </span>
        <span className="text-gray-300">·</span>
        <span className="text-gray-600">
          Refunded <span className="font-medium text-red-600">{fmt(totalRefunded)}</span>
        </span>
        <span className="text-gray-300">·</span>
        <span className="text-gray-600">
          Net <span className="font-medium text-gray-900">{fmt(netAmount)}</span>
        </span>
      </div>
    </div>
  );
}

function PaymentStatusIcon({ status }: { status: string }) {
  const s = status?.toLowerCase() || "";
  if (s === "succeeded" || s === "completed" || s === "paid") {
    return <span className="text-green-500 text-xs">✅ Paid</span>;
  }
  if (s === "pending") {
    return <span className="text-amber-500 text-xs">⏳ Pending</span>;
  }
  if (s === "failed") {
    return <span className="text-red-500 text-xs">❌ Failed</span>;
  }
  return <span className="text-gray-400 text-xs">{status}</span>;
}

function truncateRef(ref: string): string {
  if (ref.length > 16) return ref.slice(0, 10) + "...";
  return ref;
}

// ── Main Component ──

export default function OrderFinanceSection({
  order,
  invoice,
  payments,
  paymentAllocations,
  paymentRequests,
  refunds,
  workflowData,
  onRefresh,
}: OrderFinanceSectionProps) {
  const [activeTab, setActiveTab] = useState<FinanceTab>("receivable");
  const [minMarginPercent, setMinMarginPercent] = useState(30);

  useEffect(() => {
    const fetchMarginSetting = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", "min_vendor_margin_percent")
        .single();
      if (data) setMinMarginPercent(parseFloat(data.setting_value || "30"));
    };
    fetchMarginSetting();
  }, []);

  return (
    <div className="bg-white rounded-lg border p-6">
      {/* Header */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-gray-400" />
        Finance
      </h2>

      {/* Tab Bar */}
      <div className="flex border-b border-gray-200 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600 font-semibold"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "receivable" && (
        <ReceivableTab order={order} invoice={invoice} />
      )}
      {activeTab === "payables" && (
        <PayablesTab workflowData={workflowData} onRefresh={onRefresh} />
      )}
      {activeTab === "profit" && (
        <ProfitTab order={order} workflowData={workflowData} minMarginPercent={minMarginPercent} />
      )}
      {activeTab === "payments" && (
        <PaymentsTab
          order={order}
          payments={payments}
          paymentAllocations={paymentAllocations}
          paymentRequests={paymentRequests}
          refunds={refunds}
        />
      )}
    </div>
  );
}
