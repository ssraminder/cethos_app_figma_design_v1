import { useState, useEffect, useCallback } from "react";
import {
  X,
  Loader2,
  Search,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { callPaymentApi, formatCurrency, formatDate } from "@/lib/payment-api";
import type { UnpaidInvoice } from "@/types/payments";
import { format } from "date-fns";

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Pre-fill customer */
  customerId?: string;
  customerName?: string;
  /** Pre-select an invoice in the allocation step */
  preselectedInvoiceId?: string;
}

interface CustomerOption {
  id: string;
  full_name: string;
  company_name: string | null;
  email: string;
}

interface AllocationEntry {
  invoice_id: string;
  amount: number;
}

export default function RecordPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  customerId: prefillCustomerId,
  customerName: prefillCustomerName,
  preselectedInvoiceId,
}: RecordPaymentModalProps) {
  // Step 1 — Payment details
  const [customerId, setCustomerId] = useState(prefillCustomerId || "");
  const [customerSearch, setCustomerSearch] = useState(prefillCustomerName || "");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomerName, setSelectedCustomerName] = useState(prefillCustomerName || "");
  const [searchingCustomers, setSearchingCustomers] = useState(false);

  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");

  // Step 2 — Allocation
  const [allocateNow, setAllocateNow] = useState(!!preselectedInvoiceId);
  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [checkedInvoices, setCheckedInvoices] = useState<Record<string, boolean>>({});
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [showAllocations, setShowAllocations] = useState(!!preselectedInvoiceId);

  // UI
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const { manualMethods, loading: methodsLoading } = usePaymentMethods();

  // Reset when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      if (!prefillCustomerId) {
        setCustomerId("");
        setCustomerSearch("");
        setSelectedCustomerName("");
      }
      setAmount("");
      setPaymentDate(format(new Date(), "yyyy-MM-dd"));
      setPaymentMethodId("");
      setReferenceNumber("");
      setNotes("");
      setAllocateNow(!!preselectedInvoiceId);
      setShowAllocations(!!preselectedInvoiceId);
      setCheckedInvoices({});
      setAllocationAmounts({});
      setUnpaidInvoices([]);
      setError("");
    }
  }, [isOpen, prefillCustomerId, preselectedInvoiceId]);

  // Customer search
  useEffect(() => {
    if (!customerSearch || customerSearch.length < 2 || customerId) {
      setCustomerResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingCustomers(true);
      try {
        const { data } = await supabase
          .from("customers")
          .select("id, full_name, company_name, email")
          .or(
            `full_name.ilike.%${customerSearch}%,company_name.ilike.%${customerSearch}%,email.ilike.%${customerSearch}%`
          )
          .limit(10);
        setCustomerResults(data || []);
        setShowCustomerDropdown(true);
      } catch {
        // ignore
      } finally {
        setSearchingCustomers(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, customerId]);

  // Fetch unpaid invoices when customer selected and allocation toggled
  const fetchUnpaidInvoices = useCallback(async () => {
    if (!customerId) return;
    setLoadingInvoices(true);
    try {
      const data = await callPaymentApi("manage-customer-payments", {
        action: "get_unpaid_invoices",
        customer_id: customerId,
      });
      const invoices: UnpaidInvoice[] = data.invoices || [];
      setUnpaidInvoices(invoices);

      // Pre-select invoice if provided
      if (preselectedInvoiceId) {
        const inv = invoices.find((i) => i.id === preselectedInvoiceId);
        if (inv) {
          setCheckedInvoices({ [inv.id]: true });
          setAllocationAmounts({ [inv.id]: inv.balance_due.toFixed(2) });
        }
      }
    } catch (err) {
      console.error("Failed to load unpaid invoices:", err);
    } finally {
      setLoadingInvoices(false);
    }
  }, [customerId, preselectedInvoiceId]);

  useEffect(() => {
    if (allocateNow && customerId) {
      fetchUnpaidInvoices();
    }
  }, [allocateNow, customerId, fetchUnpaidInvoices]);

  // Handlers
  const selectCustomer = (c: CustomerOption) => {
    setCustomerId(c.id);
    setSelectedCustomerName(c.full_name);
    setCustomerSearch(c.full_name);
    setShowCustomerDropdown(false);
    setCustomerResults([]);
  };

  const clearCustomer = () => {
    setCustomerId("");
    setSelectedCustomerName("");
    setCustomerSearch("");
    setCheckedInvoices({});
    setAllocationAmounts({});
    setUnpaidInvoices([]);
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

  const setAllocationAmount = (invoiceId: string, val: string) => {
    setAllocationAmounts((prev) => ({ ...prev, [invoiceId]: val }));
  };

  const totalAllocated = Object.entries(checkedInvoices)
    .filter(([, checked]) => checked)
    .reduce((sum, [id]) => sum + (parseFloat(allocationAmounts[id]) || 0), 0);

  const paymentAmount = parseFloat(amount) || 0;

  const autoFill = () => {
    if (!paymentAmount) return;
    let remaining = paymentAmount;
    const sorted = [...unpaidInvoices].sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    );
    const newChecked: Record<string, boolean> = {};
    const newAmounts: Record<string, string> = {};

    for (const inv of sorted) {
      if (remaining <= 0) break;
      const allocAmt = Math.min(remaining, inv.balance_due);
      newChecked[inv.id] = true;
      newAmounts[inv.id] = allocAmt.toFixed(2);
      remaining -= allocAmt;
    }
    setCheckedInvoices(newChecked);
    setAllocationAmounts(newAmounts);
  };

  // Validation
  const canSubmit =
    customerId &&
    paymentAmount > 0 &&
    paymentMethodId &&
    paymentDate &&
    !isSubmitting &&
    (allocateNow ? totalAllocated <= paymentAmount : true);

  const handleSubmit = async () => {
    setError("");
    setIsSubmitting(true);
    try {
      // Record payment
      const paymentData = await callPaymentApi("manage-customer-payments", {
        action: "record_payment",
        customer_id: customerId,
        amount: paymentAmount,
        payment_date: paymentDate,
        payment_method_id: paymentMethodId,
        reference_number: referenceNumber || null,
        notes: notes || null,
      });

      const paymentId = paymentData.payment?.id;

      // Allocate if needed
      let allocCount = 0;
      if (allocateNow && paymentId) {
        const allocations: AllocationEntry[] = Object.entries(checkedInvoices)
          .filter(([, checked]) => checked)
          .map(([id]) => ({
            invoice_id: id,
            amount: parseFloat(allocationAmounts[id]) || 0,
          }))
          .filter((a) => a.amount > 0);

        if (allocations.length > 0) {
          await callPaymentApi("manage-customer-payments", {
            action: "allocate_payment",
            payment_id: paymentId,
            allocations,
          });
          allocCount = allocations.length;
        }
      }

      const msg =
        allocCount > 0
          ? `Payment of ${formatCurrency(paymentAmount)} recorded and allocated to ${allocCount} invoice(s)`
          : `Payment of ${formatCurrency(paymentAmount)} recorded`;
      toast.success(msg);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to record payment");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Record Payment
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Customer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Customer <span className="text-red-500">*</span>
            </label>
            {customerId ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-teal-50 border border-teal-200 rounded-lg">
                <CheckCircle className="w-4 h-4 text-teal-600 flex-shrink-0" />
                <span className="text-sm font-medium text-teal-800 flex-1">
                  {selectedCustomerName}
                </span>
                {!prefillCustomerId && (
                  <button
                    onClick={clearCustomer}
                    className="text-teal-600 hover:text-teal-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    if (!e.target.value) setShowCustomerDropdown(false);
                  }}
                  placeholder="Search by name, company, or email..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
                {searchingCustomers && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
                )}
                {showCustomerDropdown && customerResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {customerResults.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => selectCustomer(c)}
                        className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
                      >
                        <div className="font-medium text-gray-900">
                          {c.full_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {c.company_name ? `${c.company_name} · ` : ""}
                          {c.email}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Amount & Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Method & Reference */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <select
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
                disabled={methodsLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="">Select method...</option>
                {manualMethods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference Number
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Cheque #, wire ref, EFT trace..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Allocation toggle */}
          {customerId && (
            <div className="border-t border-gray-200 pt-4">
              <button
                onClick={() => {
                  const next = !allocateNow;
                  setAllocateNow(next);
                  setShowAllocations(next);
                }}
                className="flex items-center gap-2 text-sm font-medium text-gray-700"
              >
                <div
                  className={`w-9 h-5 rounded-full transition-colors relative ${
                    allocateNow ? "bg-teal-600" : "bg-gray-300"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      allocateNow ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </div>
                Allocate to Invoices
                {allocateNow ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showAllocations && allocateNow && (
                <div className="mt-3 space-y-3">
                  {loadingInvoices ? (
                    <div className="flex items-center gap-2 py-4 text-gray-500 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading invoices...
                    </div>
                  ) : unpaidInvoices.length === 0 ? (
                    <p className="text-sm text-gray-500 py-2">
                      No unpaid invoices found for this customer.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {unpaidInvoices.length} unpaid invoice(s)
                        </span>
                        <button
                          onClick={autoFill}
                          disabled={!paymentAmount}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded disabled:opacity-40"
                        >
                          <Zap className="w-3 h-3" />
                          Auto-fill
                        </button>
                      </div>

                      <div className="border border-gray-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
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
                              <tr
                                key={inv.id}
                                className="hover:bg-gray-50"
                              >
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
                                          setAllocationAmount(
                                            inv.id,
                                            e.target.value
                                          )
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

                      {/* Running total */}
                      <div className="flex items-center justify-between text-sm px-1">
                        <span className="text-gray-600">
                          Allocating{" "}
                          <span className="font-semibold">
                            {formatCurrency(totalAllocated)}
                          </span>{" "}
                          of{" "}
                          <span className="font-semibold">
                            {formatCurrency(paymentAmount)}
                          </span>
                        </span>
                        {paymentAmount > 0 && (
                          <span
                            className={`font-medium ${
                              totalAllocated > paymentAmount
                                ? "text-red-600"
                                : "text-gray-500"
                            }`}
                          >
                            Remaining:{" "}
                            {formatCurrency(
                              Math.max(0, paymentAmount - totalAllocated)
                            )}
                          </span>
                        )}
                      </div>
                      {totalAllocated > paymentAmount && (
                        <p className="text-xs text-red-600">
                          Total allocations cannot exceed the payment amount.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Record Payment
          </button>
        </div>
      </div>
    </div>
  );
}
