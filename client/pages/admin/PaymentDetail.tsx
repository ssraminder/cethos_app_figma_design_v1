import { useState, useEffect, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Trash2,
  Plus,
  ExternalLink,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import type {
  CustomerPayment,
  PaymentAllocation,
  UnpaidInvoice,
} from "@/types/payments";
import { callPaymentApi, formatCurrency, formatDate } from "@/lib/payment-api";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    fully_allocated: "bg-green-100 text-green-700",
    completed: "bg-green-100 text-green-700",
    partially_allocated: "bg-amber-100 text-amber-700",
    unallocated: "bg-gray-100 text-gray-600",
  };
  const labels: Record<string, string> = {
    fully_allocated: "Fully Allocated",
    completed: "Completed",
    partially_allocated: "Partially Allocated",
    unallocated: "Unallocated",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${styles[status] || "bg-gray-100 text-gray-600"}`}
    >
      {labels[status] || status}
    </span>
  );
}

export default function PaymentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [payment, setPayment] = useState<CustomerPayment | null>(null);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Allocate more state
  const [showAllocateMore, setShowAllocateMore] = useState(false);
  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [checkedInvoices, setCheckedInvoices] = useState<Record<string, boolean>>({});
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [allocating, setAllocating] = useState(false);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Remove allocation state
  const [removingAllocationId, setRemovingAllocationId] = useState<string | null>(null);

  const fetchPayment = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await callPaymentApi("manage-customer-payments", {
        action: "get_payment",
        payment_id: id,
      });
      setPayment(data.payment || null);
      setAllocations(data.allocations || []);
    } catch (err: any) {
      setError(err.message || "Failed to load payment");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPayment();
  }, [fetchPayment]);

  // Fetch unpaid invoices for allocation
  const fetchUnpaidInvoices = async () => {
    if (!payment?.customer_id) return;
    setLoadingInvoices(true);
    try {
      const data = await callPaymentApi("manage-customer-payments", {
        action: "get_unpaid_invoices",
        customer_id: payment.customer_id,
      });
      setUnpaidInvoices(data.invoices || []);
    } catch (err) {
      console.error("Failed to load unpaid invoices:", err);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const toggleAllocateMore = () => {
    const next = !showAllocateMore;
    setShowAllocateMore(next);
    if (next) {
      setCheckedInvoices({});
      setAllocationAmounts({});
      fetchUnpaidInvoices();
    }
  };

  const toggleInvoice = (inv: UnpaidInvoice) => {
    const isChecked = !checkedInvoices[inv.id];
    setCheckedInvoices((prev) => ({ ...prev, [inv.id]: isChecked }));
    if (isChecked) {
      setAllocationAmounts((prev) => ({
        ...prev,
        [inv.id]: inv.balance_due.toFixed(2),
      }));
    } else {
      setAllocationAmounts((prev) => {
        const next = { ...prev };
        delete next[inv.id];
        return next;
      });
    }
  };

  const totalNewAllocation = Object.entries(checkedInvoices)
    .filter(([, checked]) => checked)
    .reduce((sum, [invId]) => sum + (parseFloat(allocationAmounts[invId]) || 0), 0);

  const maxAllocatable = payment?.unallocated_amount || 0;

  const autoFill = () => {
    let remaining = maxAllocatable;
    const sorted = [...unpaidInvoices].sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    );
    const newChecked: Record<string, boolean> = {};
    const newAmounts: Record<string, string> = {};
    for (const inv of sorted) {
      if (remaining <= 0) break;
      const amt = Math.min(remaining, inv.balance_due);
      newChecked[inv.id] = true;
      newAmounts[inv.id] = amt.toFixed(2);
      remaining -= amt;
    }
    setCheckedInvoices(newChecked);
    setAllocationAmounts(newAmounts);
  };

  const handleAllocateMore = async () => {
    if (!payment) return;
    setAllocating(true);
    try {
      const allocs = Object.entries(checkedInvoices)
        .filter(([, checked]) => checked)
        .map(([invId]) => ({
          invoice_id: invId,
          amount: parseFloat(allocationAmounts[invId]) || 0,
        }))
        .filter((a) => a.amount > 0);

      if (allocs.length === 0) return;

      await callPaymentApi("manage-customer-payments", {
        action: "allocate_payment",
        payment_id: payment.id,
        allocations: allocs,
      });

      toast.success(`Allocated to ${allocs.length} invoice(s)`);
      setShowAllocateMore(false);
      fetchPayment();
    } catch (err: any) {
      toast.error(err.message || "Failed to allocate");
    } finally {
      setAllocating(false);
    }
  };

  const handleRemoveAllocation = async (allocationId: string) => {
    if (!confirm("Remove this allocation? The invoice balance will be restored.")) return;
    setRemovingAllocationId(allocationId);
    try {
      await callPaymentApi("manage-customer-payments", {
        action: "remove_allocation",
        allocation_id: allocationId,
      });
      toast.success("Allocation removed");
      fetchPayment();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove allocation");
    } finally {
      setRemovingAllocationId(null);
    }
  };

  const handleDelete = async () => {
    if (!payment) return;
    setDeleting(true);
    try {
      await callPaymentApi("manage-customer-payments", {
        action: "delete_payment",
        payment_id: payment.id,
      });
      toast.success("Payment deleted");
      navigate("/admin/payments");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete payment");
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
        <span className="ml-2 text-gray-500">Loading payment...</span>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Link
          to="/admin/payments"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Payments
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error || "Payment not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back */}
      <Link
        to="/admin/payments"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Payments
      </Link>

      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">
                {formatCurrency(payment.amount)}
              </h1>
              <StatusBadge status={payment.status} />
            </div>
            <div className="space-y-1 text-sm text-gray-600">
              <p>
                Customer:{" "}
                <Link
                  to={`/admin/customers/${payment.customer_id}`}
                  className="text-teal-600 hover:underline font-medium"
                >
                  {payment.customer?.full_name || "Unknown"}
                </Link>
              </p>
              <p>Date: {formatDate(payment.payment_date)}</p>
              <p>Method: {payment.payment_method_name || payment.payment_method || "—"}</p>
              {payment.reference_number && (
                <p>
                  Reference:{" "}
                  <span className="font-mono">{payment.reference_number}</span>
                </p>
              )}
              {payment.notes && <p>Notes: {payment.notes}</p>}
              <p className="text-xs text-gray-400">
                Source: {payment.source} | Created: {formatDate(payment.created_at)}
              </p>
            </div>
          </div>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              Total Amount
            </p>
            <p className="text-lg font-bold text-gray-900">
              {formatCurrency(payment.amount)}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              Allocated
            </p>
            <p className="text-lg font-bold text-green-700">
              {formatCurrency(payment.allocated_amount)}
            </p>
          </div>
          <div
            className={`rounded-lg p-3 text-center ${
              payment.unallocated_amount > 0 ? "bg-amber-50" : "bg-gray-50"
            }`}
          >
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              Unallocated
            </p>
            <p
              className={`text-lg font-bold ${
                payment.unallocated_amount > 0
                  ? "text-amber-700"
                  : "text-gray-900"
              }`}
            >
              {formatCurrency(payment.unallocated_amount)}
            </p>
          </div>
        </div>
      </div>

      {/* Allocations table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            Allocations ({allocations.length})
          </h2>
          {payment.unallocated_amount > 0 && (
            <button
              onClick={toggleAllocateMore}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              Allocate More
            </button>
          )}
        </div>

        {allocations.length === 0 ? (
          <div className="text-center py-10 text-gray-500 text-sm">
            No allocations yet. Click "Allocate More" to link this payment to
            invoices.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">
                    Invoice #
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">
                    Due Date
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">
                    Invoice Total
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">
                    Allocated
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">
                    Invoice Status
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allocations.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/invoices/customer`}
                        className="text-teal-600 hover:underline font-mono text-xs"
                      >
                        {a.invoice?.invoice_number || a.invoice_id}
                        <ExternalLink className="w-3 h-3 inline ml-1" />
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {a.invoice?.due_date ? formatDate(a.invoice.due_date) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {a.invoice?.total_amount != null
                        ? formatCurrency(a.invoice.total_amount)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(a.allocated_amount)}
                    </td>
                    <td className="px-4 py-3">
                      {a.invoice?.status && (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                            a.invoice.status === "paid"
                              ? "bg-green-100 text-green-700"
                              : a.invoice.status === "partially_paid"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {a.invoice.status.replace(/_/g, " ")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleRemoveAllocation(a.id)}
                        disabled={removingAllocationId === a.id}
                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 disabled:opacity-50"
                        title="Remove allocation"
                      >
                        {removingAllocationId === a.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Allocate More section */}
        {showAllocateMore && (
          <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">
                Allocate to Invoices (max{" "}
                {formatCurrency(maxAllocatable)})
              </h3>
              <button
                onClick={autoFill}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-teal-700 bg-teal-100 hover:bg-teal-200 rounded"
              >
                <Zap className="w-3 h-3" />
                Auto-fill
              </button>
            </div>

            {loadingInvoices ? (
              <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading invoices...
              </div>
            ) : unpaidInvoices.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">
                No unpaid invoices for this customer.
              </p>
            ) : (
              <>
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto bg-white">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="w-8 px-2 py-2" />
                        <th className="text-left px-2 py-2 font-medium text-gray-500">
                          Invoice #
                        </th>
                        <th className="text-left px-2 py-2 font-medium text-gray-500">
                          Due Date
                        </th>
                        <th className="text-right px-2 py-2 font-medium text-gray-500">
                          Balance Due
                        </th>
                        <th className="text-right px-2 py-2 font-medium text-gray-500">
                          Allocate
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {unpaidInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-gray-50">
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={!!checkedInvoices[inv.id]}
                              onChange={() => toggleInvoice(inv)}
                              className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                            />
                          </td>
                          <td className="px-2 py-2 font-mono text-gray-900">
                            {inv.invoice_number}
                          </td>
                          <td className="px-2 py-2 text-gray-600">
                            {formatDate(inv.due_date)}
                          </td>
                          <td className="px-2 py-2 text-right text-gray-900">
                            {formatCurrency(inv.balance_due)}
                          </td>
                          <td className="px-2 py-2">
                            {checkedInvoices[inv.id] && (
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                                  $
                                </span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  max={inv.balance_due}
                                  value={allocationAmounts[inv.id] || ""}
                                  onChange={(e) =>
                                    setAllocationAmounts((prev) => ({
                                      ...prev,
                                      [inv.id]: e.target.value,
                                    }))
                                  }
                                  className="w-24 pl-5 pr-2 py-1 border border-gray-300 rounded text-xs text-right focus:ring-1 focus:ring-teal-500"
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    Allocating{" "}
                    <span className="font-semibold">
                      {formatCurrency(totalNewAllocation)}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold">
                      {formatCurrency(maxAllocatable)}
                    </span>
                  </span>
                  {totalNewAllocation > maxAllocatable && (
                    <span className="text-red-600 text-xs">
                      Exceeds unallocated balance
                    </span>
                  )}
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowAllocateMore(false)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAllocateMore}
                    disabled={
                      allocating ||
                      totalNewAllocation <= 0 ||
                      totalNewAllocation > maxAllocatable
                    }
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50"
                  >
                    {allocating && (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    )}
                    Allocate
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Delete button — only if no allocations */}
      {allocations.length === 0 && (
        <div className="bg-white rounded-lg border border-red-200 p-6">
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete Payment
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-red-700">
                Are you sure you want to delete this payment? This action cannot
                be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                >
                  {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Yes, Delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
