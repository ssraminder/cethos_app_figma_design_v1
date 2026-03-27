import { useState, useEffect } from "react";
import {
  Download,
  Loader2,
  ChevronDown,
  ChevronRight,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import type { AgingRow } from "@/types/payments";
import { callPaymentApi, formatCurrency, formatDate } from "@/lib/payment-api";
import { formatCurrencyAmount, getCurrencyBadgeClasses } from "@/utils/currency";
import RecordPaymentModal from "@/components/admin/RecordPaymentModal";

interface AgingSummaryTotals {
  total_outstanding: number;
  current_amount: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
}

interface CustomerAgingInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  days_overdue: number;
  last_reminder_sent_at: string | null;
  reminder_count: number;
  status: string;
  currency?: string;
}

export default function ARAgingReport() {
  const [rows, setRows] = useState<AgingRow[]>([]);
  const [totals, setTotals] = useState<AgingSummaryTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [outstandingByCurrency, setOutstandingByCurrency] = useState<Record<string, number>>({});

  // Expanded rows
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [customerInvoices, setCustomerInvoices] = useState<CustomerAgingInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Record payment modal
  const [paymentModal, setPaymentModal] = useState<{
    open: boolean;
    customerId?: string;
    customerName?: string;
  }>({ open: false });

  useEffect(() => {
    fetchAging();
  }, []);

  const fetchAging = async () => {
    setLoading(true);
    try {
      const data = await callPaymentApi("manage-ar-aging", {
        action: "get_aging_summary",
      });
      const agingRows: AgingRow[] = data.rows || data.aging || [];
      // Sort by total outstanding descending
      agingRows.sort((a, b) => b.total_outstanding - a.total_outstanding);
      setRows(agingRows);

      // Store per-currency breakdown if available
      if (data.outstanding_by_currency) {
        setOutstandingByCurrency(data.outstanding_by_currency);
      }

      // Calculate totals
      if (data.totals) {
        setTotals(data.totals);
      } else {
        setTotals({
          total_outstanding: agingRows.reduce((s, r) => s + r.total_outstanding, 0),
          current_amount: agingRows.reduce((s, r) => s + r.current_amount, 0),
          days_1_30: agingRows.reduce((s, r) => s + r.days_1_30, 0),
          days_31_60: agingRows.reduce((s, r) => s + r.days_31_60, 0),
          days_61_90: agingRows.reduce((s, r) => s + r.days_61_90, 0),
          days_90_plus: agingRows.reduce((s, r) => s + r.days_90_plus, 0),
        });
      }
    } catch (err) {
      toast.error("Failed to load aging report");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleCustomer = async (customerId: string) => {
    if (expandedCustomerId === customerId) {
      setExpandedCustomerId(null);
      return;
    }
    setExpandedCustomerId(customerId);
    setLoadingInvoices(true);
    try {
      const data = await callPaymentApi("manage-ar-aging", {
        action: "get_customer_aging",
        customer_id: customerId,
      });
      setCustomerInvoices(data.invoices || []);
    } catch (err) {
      console.error("Failed to load customer invoices:", err);
      setCustomerInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const exportCSV = () => {
    if (rows.length === 0) return;
    const headers = [
      "Customer",
      "Company",
      "Type",
      "Payment Terms",
      "# Invoices",
      "Current",
      "1-30 Days",
      "31-60 Days",
      "61-90 Days",
      "90+ Days",
      "Total Outstanding",
    ];
    const csvRows = rows.map((r) =>
      [
        `"${r.full_name}"`,
        `"${r.company_name || ""}"`,
        `"${r.customer_type || ""}"`,
        `"${r.payment_terms || ""}"`,
        r.total_invoices,
        r.current_amount.toFixed(2),
        r.days_1_30.toFixed(2),
        r.days_31_60.toFixed(2),
        r.days_61_90.toFixed(2),
        r.days_90_plus.toFixed(2),
        r.total_outstanding.toFixed(2),
      ].join(",")
    );
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ar-aging-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const buckets: { key: keyof AgingSummaryTotals; label: string; color: string }[] = [
    { key: "total_outstanding", label: "Total Outstanding", color: "bg-gray-50 text-gray-700" },
    { key: "current_amount", label: "Current", color: "bg-green-50 text-green-700" },
    { key: "days_1_30", label: "1-30 Days", color: "bg-amber-50 text-amber-700" },
    { key: "days_31_60", label: "31-60 Days", color: "bg-orange-50 text-orange-700" },
    { key: "days_61_90", label: "61-90 Days", color: "bg-red-50 text-red-600" },
    { key: "days_90_plus", label: "90+ Days", color: "bg-red-100 text-red-700" },
  ];

  // Check if multi-currency data exists
  const hasMultiCurrency = Object.keys(outstandingByCurrency).length > 1;

  // Format per-currency breakdown for totals row
  const formatMultiCurrencyTotal = (total: number) => {
    if (!hasMultiCurrency) return formatCurrency(total);
    const parts = Object.entries(outstandingByCurrency)
      .filter(([, amt]) => amt > 0)
      .map(([code, amt]) => formatCurrencyAmount(amt, code));
    return parts.join(" + ");
  };

  // Compute per-currency subtotals for expanded customer invoices
  const customerInvoiceCurrencies = [...new Set(customerInvoices.map((inv) => inv.currency || "CAD"))];
  const customerHasMultiCurrency = customerInvoiceCurrencies.length > 1;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Accounts Receivable Aging
        </h1>
        <button
          onClick={exportCSV}
          disabled={rows.length === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {buckets.map((b) => (
          <div
            key={b.key}
            className={`rounded-lg p-3 text-center ${b.color.split(" ")[0]} border border-gray-200`}
          >
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              {b.label}
            </p>
            {loading ? (
              <div className="h-6 bg-gray-100 rounded animate-pulse w-20 mx-auto" />
            ) : (
              <>
                <p className={`text-lg font-bold ${b.color.split(" ")[1]}`}>
                  {formatCurrency(totals?.[b.key] ?? 0)}
                </p>
                {/* Show per-currency breakdown for total outstanding */}
                {b.key === "total_outstanding" && hasMultiCurrency && (
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {Object.entries(outstandingByCurrency)
                      .filter(([, amt]) => amt > 0)
                      .map(([code, amt]) => `${formatCurrencyAmount(amt, code)}`)
                      .join(" + ")}
                  </p>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Main table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
            <span className="ml-2 text-gray-500">Loading aging report...</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p>No outstanding invoices found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="w-8 px-2 py-3" />
                  <th className="text-left px-4 py-3 font-medium text-gray-500">
                    Customer
                  </th>
                  <th className="text-left px-3 py-3 font-medium text-gray-500">
                    Type
                  </th>
                  <th className="text-left px-3 py-3 font-medium text-gray-500">
                    Terms
                  </th>
                  <th className="text-center px-3 py-3 font-medium text-gray-500">
                    #
                  </th>
                  <th className="text-right px-3 py-3 font-medium text-green-600">
                    Current
                  </th>
                  <th className="text-right px-3 py-3 font-medium text-amber-600">
                    1-30
                  </th>
                  <th className="text-right px-3 py-3 font-medium text-orange-600">
                    31-60
                  </th>
                  <th className="text-right px-3 py-3 font-medium text-red-500">
                    61-90
                  </th>
                  <th className="text-right px-3 py-3 font-medium text-red-700">
                    90+
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <>
                    <tr
                      key={r.customer_id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => toggleCustomer(r.customer_id)}
                    >
                      <td className="px-2 py-3 text-center text-gray-400">
                        {expandedCustomerId === r.customer_id ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {r.full_name}
                        </div>
                        {r.company_name && (
                          <div className="text-xs text-gray-500">
                            {r.company_name}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-600 text-xs">
                        {r.customer_type || "—"}
                      </td>
                      <td className="px-3 py-3 text-gray-600 text-xs">
                        {r.payment_terms || "—"}
                      </td>
                      <td className="px-3 py-3 text-center text-gray-700">
                        {r.total_invoices}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-900">
                        {r.current_amount > 0
                          ? formatCurrency(r.current_amount)
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-900">
                        {r.days_1_30 > 0
                          ? formatCurrency(r.days_1_30)
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-900">
                        {r.days_31_60 > 0
                          ? formatCurrency(r.days_31_60)
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-900">
                        {r.days_61_90 > 0
                          ? formatCurrency(r.days_61_90)
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-900">
                        {r.days_90_plus > 0
                          ? formatCurrency(r.days_90_plus)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {formatCurrency(r.total_outstanding)}
                      </td>
                    </tr>

                    {/* Expanded row */}
                    {expandedCustomerId === r.customer_id && (
                      <tr key={`${r.customer_id}-detail`}>
                        <td colSpan={11} className="bg-gray-50 px-6 py-4">
                          {loadingInvoices ? (
                            <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Loading invoices...
                            </div>
                          ) : customerInvoices.length === 0 ? (
                            <p className="text-sm text-gray-500">
                              No invoice details available.
                            </p>
                          ) : (
                            <>
                              {/* Per-currency summary for this customer */}
                              {customerHasMultiCurrency && (
                                <div className="flex items-center gap-3 mb-3 text-sm">
                                  <span className="text-gray-600 font-medium">Outstanding:</span>
                                  {customerInvoiceCurrencies.map((curr) => {
                                    const total = customerInvoices
                                      .filter((inv) => (inv.currency || "CAD") === curr)
                                      .reduce((s, inv) => s + inv.balance_due, 0);
                                    return (
                                      <span key={curr} className="flex items-center gap-1">
                                        <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${getCurrencyBadgeClasses(curr)}`}>
                                          {curr}
                                        </span>
                                        <span className="font-semibold">{formatCurrencyAmount(total, curr)}</span>
                                      </span>
                                    );
                                  })}
                                </div>
                              )}

                              <table className="w-full text-xs mb-3">
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    <th className="text-left px-2 py-2 font-medium text-gray-500">
                                      Invoice #
                                    </th>
                                    {customerHasMultiCurrency && (
                                      <th className="text-left px-2 py-2 font-medium text-gray-500">
                                        Currency
                                      </th>
                                    )}
                                    <th className="text-left px-2 py-2 font-medium text-gray-500">
                                      Date
                                    </th>
                                    <th className="text-left px-2 py-2 font-medium text-gray-500">
                                      Due Date
                                    </th>
                                    <th className="text-right px-2 py-2 font-medium text-gray-500">
                                      Total
                                    </th>
                                    <th className="text-right px-2 py-2 font-medium text-gray-500">
                                      Paid
                                    </th>
                                    <th className="text-right px-2 py-2 font-medium text-gray-500">
                                      Balance
                                    </th>
                                    <th className="text-center px-2 py-2 font-medium text-gray-500">
                                      Days Overdue
                                    </th>
                                    <th className="text-left px-2 py-2 font-medium text-gray-500">
                                      Last Reminder
                                    </th>
                                    <th className="text-left px-2 py-2 font-medium text-gray-500">
                                      Status
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {customerInvoices.map((inv) => {
                                    const invCurr = inv.currency || "CAD";
                                    return (
                                      <tr key={inv.id} className="hover:bg-white">
                                        <td className="px-2 py-2 font-mono text-gray-900">
                                          {inv.invoice_number}
                                        </td>
                                        {customerHasMultiCurrency && (
                                          <td className="px-2 py-2">
                                            <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${getCurrencyBadgeClasses(invCurr)}`}>
                                              {invCurr}
                                            </span>
                                          </td>
                                        )}
                                        <td className="px-2 py-2 text-gray-600">
                                          {formatDate(inv.invoice_date)}
                                        </td>
                                        <td className="px-2 py-2 text-gray-600">
                                          {formatDate(inv.due_date)}
                                        </td>
                                        <td className="px-2 py-2 text-right text-gray-900">
                                          {formatCurrencyAmount(inv.total_amount, invCurr)}
                                        </td>
                                        <td className="px-2 py-2 text-right text-gray-600">
                                          {formatCurrencyAmount(inv.amount_paid, invCurr)}
                                        </td>
                                        <td className="px-2 py-2 text-right font-medium text-gray-900">
                                          {formatCurrencyAmount(inv.balance_due, invCurr)}
                                        </td>
                                        <td className="px-2 py-2 text-center">
                                          {inv.days_overdue > 0 ? (
                                            <span className="text-red-600 font-medium">
                                              {inv.days_overdue}
                                            </span>
                                          ) : (
                                            <span className="text-green-600">
                                              —
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-2 py-2 text-gray-500">
                                          {inv.last_reminder_sent_at
                                            ? formatDate(inv.last_reminder_sent_at)
                                            : "—"}
                                        </td>
                                        <td className="px-2 py-2">
                                          <span
                                            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                                              inv.status === "overdue"
                                                ? "bg-red-100 text-red-700"
                                                : inv.status === "partially_paid"
                                                  ? "bg-amber-100 text-amber-700"
                                                  : "bg-gray-100 text-gray-600"
                                            }`}
                                          >
                                            {inv.status.replace(/_/g, " ")}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPaymentModal({
                                      open: true,
                                      customerId: r.customer_id,
                                      customerName: r.full_name,
                                    });
                                  }}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                  Record Payment
                                </button>
                                <span
                                  className="text-xs text-gray-400 cursor-not-allowed"
                                  title="Coming soon"
                                >
                                  Send Reminder (coming soon)
                                </span>
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}

                {/* Totals row */}
                {totals && (
                  <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                    <td className="px-2 py-3" />
                    <td className="px-4 py-3 text-gray-700" colSpan={3}>
                      TOTAL
                    </td>
                    <td className="px-3 py-3 text-center text-gray-700">
                      {rows.reduce((s, r) => s + r.total_invoices, 0)}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-900">
                      {formatCurrency(totals.current_amount)}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-900">
                      {formatCurrency(totals.days_1_30)}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-900">
                      {formatCurrency(totals.days_31_60)}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-900">
                      {formatCurrency(totals.days_61_90)}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-900">
                      {formatCurrency(totals.days_90_plus)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      <div>{formatCurrency(totals.total_outstanding)}</div>
                      {hasMultiCurrency && (
                        <div className="text-[10px] font-normal text-gray-500">
                          ({Object.entries(outstandingByCurrency)
                            .filter(([, amt]) => amt > 0)
                            .map(([code, amt]) => formatCurrencyAmount(amt, code))
                            .join(" + ")})
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={paymentModal.open}
        onClose={() => setPaymentModal({ open: false })}
        onSuccess={() => {
          setPaymentModal({ open: false });
          fetchAging();
        }}
        customerId={paymentModal.customerId}
        customerName={paymentModal.customerName}
      />
    </div>
  );
}
