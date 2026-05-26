import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Search,
  RefreshCw,
  CheckCircle,
  CreditCard,
  FileText,
  Download,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface PortalInvoice {
  id: string;
  invoice_number: string;
  vendor_id: string;
  step_id: string | null;
  amount: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  status: string;
  invoice_date: string;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  order_reference: string | null;
  description: string | null;
  vendor_invoice_number: string | null;
  vendor_invoice_file_path: string | null;
  submitted_at: string | null;
  notes: string | null;
  created_at: string;
  vendor_name?: string;
  vendor_email?: string;
}

type StatusFilter = "all" | "draft" | "submitted" | "approved" | "paid";

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: "bg-gray-100", text: "text-gray-600", label: "Draft" },
  submitted: { bg: "bg-blue-100", text: "text-blue-700", label: "Submitted" },
  approved: { bg: "bg-indigo-100", text: "text-indigo-700", label: "Approved" },
  paid: { bg: "bg-green-100", text: "text-green-700", label: "Paid" },
  cancelled: { bg: "bg-red-100", text: "text-red-700", label: "Cancelled" },
  pending: { bg: "bg-amber-100", text: "text-amber-700", label: "Pending" },
};

function fmtCurrency(val: number, currency = "CAD"): string {
  return val.toLocaleString("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  });
}

function fmtDate(val: string | null): string {
  if (!val) return "—";
  try {
    return format(new Date(val), "MMM d, yyyy");
  } catch {
    return val;
  }
}

export default function PortalInvoices() {
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  // Approve / Pay modal state
  const [actionInvoice, setActionInvoice] = useState<PortalInvoice | null>(null);
  const [actionType, setActionType] = useState<"approve" | "pay" | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cvp_payments")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data || []) as PortalInvoice[];

      // Fetch vendor names
      const vendorIds = [...new Set(rows.map((r) => r.vendor_id))];
      if (vendorIds.length > 0) {
        const { data: vendors } = await supabase
          .from("vendors")
          .select("id, full_name, email")
          .in("id", vendorIds);
        if (vendors) {
          const vmap = new Map(
            vendors.map((v: { id: string; full_name: string; email: string }) => [
              v.id,
              { name: v.full_name, email: v.email },
            ]),
          );
          for (const row of rows) {
            const v = vmap.get(row.vendor_id);
            if (v) {
              row.vendor_name = v.name;
              row.vendor_email = v.email;
            }
          }
        }
      }

      setInvoices(rows);
    } catch (err) {
      console.error("Failed to fetch portal invoices:", err);
      toast.error("Failed to load portal invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const filtered = invoices.filter((inv) => {
    if (filter !== "all" && inv.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        inv.invoice_number?.toLowerCase().includes(q) ||
        inv.vendor_name?.toLowerCase().includes(q) ||
        inv.vendor_invoice_number?.toLowerCase().includes(q) ||
        inv.order_reference?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Summary counts
  const counts = invoices.reduce(
    (acc, inv) => {
      acc[inv.status] = (acc[inv.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const handleApprove = async () => {
    if (!actionInvoice) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("cvp_payments")
        .update({
          status: "approved",
          updated_at: new Date().toISOString(),
        })
        .eq("id", actionInvoice.id);
      if (error) throw error;
      toast.success("Invoice approved");
      setActionInvoice(null);
      setActionType(null);
      fetchInvoices();
    } catch (err) {
      console.error(err);
      toast.error("Failed to approve invoice");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!actionInvoice) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("cvp_payments")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          payment_method: paymentMethod || null,
          payment_reference: paymentRef || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", actionInvoice.id);
      if (error) throw error;
      toast.success("Invoice marked as paid");
      setActionInvoice(null);
      setActionType(null);
      setPaymentMethod("");
      setPaymentRef("");
      fetchInvoices();
    } catch (err) {
      console.error(err);
      toast.error("Failed to mark as paid");
    } finally {
      setActionLoading(false);
    }
  };

  const downloadVendorInvoice = async (inv: PortalInvoice) => {
    if (!inv.vendor_invoice_file_path) return;
    try {
      const { data, error } = await supabase.storage
        .from("vendor-invoices")
        .createSignedUrl(inv.vendor_invoice_file_path, 300);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    } catch (err) {
      console.error(err);
      toast.error("Failed to get download URL");
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Portal Invoices
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Vendor invoices generated from the CVP portal
          </p>
        </div>
        <button
          onClick={fetchInvoices}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {(["submitted", "approved", "paid", "draft"] as const).map((s) => {
          const cfg = STATUS_CONFIG[s];
          return (
            <button
              key={s}
              onClick={() => setFilter(filter === s ? "all" : s)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                filter === s
                  ? "border-teal-400 bg-teal-50"
                  : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <div className="text-xs text-gray-500 capitalize">{cfg.label}</div>
              <div className="text-xl font-semibold text-gray-900">
                {counts[s] || 0}
              </div>
            </button>
          );
        })}
        <button
          onClick={() => setFilter("all")}
          className={`rounded-lg border p-3 text-left transition-colors ${
            filter === "all"
              ? "border-teal-400 bg-teal-50"
              : "border-gray-200 bg-white hover:bg-gray-50"
          }`}
        >
          <div className="text-xs text-gray-500">All</div>
          <div className="text-xl font-semibold text-gray-900">
            {invoices.length}
          </div>
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice, vendor, order..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Invoice
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Vendor
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Order / Description
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Vendor Ref
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <RefreshCw className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    No invoices found
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => {
                  const badge = STATUS_CONFIG[inv.status] || STATUS_CONFIG.draft;
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-medium text-gray-900">
                          {inv.invoice_number}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">
                          {inv.vendor_name || "—"}
                        </div>
                        <div className="text-xs text-gray-400">
                          {inv.vendor_email || ""}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">
                          {inv.order_reference || inv.description || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-medium text-gray-900 tabular-nums">
                          {fmtCurrency(inv.total_amount, inv.currency)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${badge.bg} ${badge.text}`}
                        >
                          {badge.label}
                        </span>
                        {inv.submitted_at && (
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {fmtDate(inv.submitted_at)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">
                          {inv.vendor_invoice_number || "—"}
                        </span>
                        {inv.vendor_invoice_file_path && (
                          <button
                            onClick={() => downloadVendorInvoice(inv)}
                            className="ml-1 text-teal-600 hover:text-teal-800"
                            title="Download vendor invoice"
                          >
                            <Download className="w-3.5 h-3.5 inline" />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {fmtDate(inv.invoice_date)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {inv.status === "submitted" && (
                            <button
                              onClick={() => {
                                setActionInvoice(inv);
                                setActionType("approve");
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                              title="Approve"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Approve
                            </button>
                          )}
                          {(inv.status === "approved" ||
                            inv.status === "submitted") && (
                            <button
                              onClick={() => {
                                setActionInvoice(inv);
                                setActionType("pay");
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md transition-colors"
                              title="Mark as paid"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              Pay
                            </button>
                          )}
                          {inv.paid_at && (
                            <span className="text-xs text-green-600">
                              {fmtDate(inv.paid_at)}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Modal */}
      {actionInvoice && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {actionType === "approve"
                  ? "Approve Invoice"
                  : "Mark as Paid"}
              </h3>
              <button
                onClick={() => {
                  setActionInvoice(null);
                  setActionType(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Invoice</span>
                  <span className="font-mono font-medium">
                    {actionInvoice.invoice_number}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Vendor</span>
                  <span>{actionInvoice.vendor_name || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount</span>
                  <span className="font-semibold">
                    {fmtCurrency(
                      actionInvoice.total_amount,
                      actionInvoice.currency,
                    )}
                  </span>
                </div>
                {actionInvoice.vendor_invoice_number && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Vendor Ref</span>
                    <span>{actionInvoice.vendor_invoice_number}</span>
                  </div>
                )}
                {actionInvoice.order_reference && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Order</span>
                    <span className="text-xs">
                      {actionInvoice.order_reference}
                    </span>
                  </div>
                )}
              </div>

              {actionType === "pay" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payment method
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="">Select...</option>
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="wise">Wise</option>
                      <option value="paypal">PayPal</option>
                      <option value="cheque">Cheque</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payment reference
                    </label>
                    <input
                      type="text"
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                      placeholder="e.g. transaction ID"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setActionInvoice(null);
                  setActionType(null);
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={
                  actionType === "approve" ? handleApprove : handleMarkPaid
                }
                disabled={actionLoading}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${
                  actionType === "approve"
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {actionLoading
                  ? "Processing..."
                  : actionType === "approve"
                    ? "Approve Invoice"
                    : "Mark as Paid"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
