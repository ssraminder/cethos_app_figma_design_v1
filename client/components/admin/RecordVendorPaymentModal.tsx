import { useState, useEffect, useCallback, useRef } from "react";
import { X, Loader2, Search, CheckCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-vendor-payments`;
const TOKEN = () =>
  localStorage.getItem("sb-access-token") || import.meta.env.VITE_SUPABASE_ANON_KEY || "";

async function callApi(payload: Record<string, unknown>) {
  const r = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}

interface VendorOption {
  id: string;
  full_name: string;
  email: string | null;
  xtrf_vendor_id: number | null;
}

interface PaymentMethodOption {
  id: string;
  code: string;
  name: string;
}

interface UnpaidInvoice {
  id: string | number;
  kind: "payable" | "xtrf_invoice";
  invoice_number: string;
  total_amount: number;
  balance_due: number;
  invoice_date: string | null;
  due_date: string | null;
  currency: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  vendorId?: string;
  vendorName?: string;
}

function fmt(amount: number | null, code: string | null): string {
  if (amount == null) return "—";
  try {
    return amount.toLocaleString("en-CA", { style: "currency", currency: code || "CAD", minimumFractionDigits: 2 });
  } catch {
    return `${code || ""} ${(amount || 0).toFixed(2)}`;
  }
}

export default function RecordVendorPaymentModal({ isOpen, onClose, onSuccess, vendorId: prefillId, vendorName: prefillName }: Props) {
  const [vendorId, setVendorId] = useState(prefillId || "");
  const [selectedName, setSelectedName] = useState(prefillName || "");
  const [vendorSearch, setVendorSearch] = useState(prefillName || "");
  const [vendorResults, setVendorResults] = useState<VendorOption[]>([]);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("CAD");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [amountCad, setAmountCad] = useState("");

  const [allocateNow, setAllocateNow] = useState(false);
  const [unpaid, setUnpaid] = useState<UnpaidInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [allocAmounts, setAllocAmounts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");

  const searchDebounce = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!isOpen) return;
    callApi({ action: "list_payment_methods" })
      .then(d => setPaymentMethods(d.payment_methods || []))
      .catch((e) => console.error("methods", e));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (prefillId) {
      setVendorId(prefillId);
      setSelectedName(prefillName || "");
      setVendorSearch(prefillName || "");
    }
  }, [isOpen, prefillId, prefillName]);

  // Search vendors
  useEffect(() => {
    if (!isOpen) return;
    if (vendorId) return; // already selected
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      if (vendorSearch.length < 2) { setVendorResults([]); return; }
      const { data } = await supabase
        .from("vendors")
        .select("id, full_name, email, xtrf_vendor_id")
        .or(`full_name.ilike.%${vendorSearch}%,email.ilike.%${vendorSearch}%`)
        .limit(15);
      setVendorResults((data as VendorOption[]) || []);
      setShowVendorDropdown(true);
    }, 250);
  }, [vendorSearch, vendorId, isOpen]);

  const fetchUnpaid = useCallback(async () => {
    if (!vendorId) return;
    setLoadingInvoices(true);
    try {
      const d = await callApi({ action: "get_unpaid_invoices", vendor_id: vendorId });
      setUnpaid(d.invoices || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load invoices");
    } finally {
      setLoadingInvoices(false);
    }
  }, [vendorId]);

  useEffect(() => {
    if (allocateNow && vendorId) fetchUnpaid();
  }, [allocateNow, vendorId, fetchUnpaid]);

  if (!isOpen) return null;

  const totalAllocated = Object.entries(allocAmounts).reduce((s, [k, v]) => {
    if (!checked[k]) return s;
    return s + (parseFloat(v) || 0);
  }, 0);
  const amountNum = parseFloat(amount) || 0;
  const overAllocated = totalAllocated > amountNum;

  const selectVendor = (v: VendorOption) => {
    setVendorId(v.id);
    setSelectedName(v.full_name);
    setVendorSearch(v.full_name);
    setShowVendorDropdown(false);
    setVendorResults([]);
  };

  const clearVendor = () => {
    setVendorId("");
    setSelectedName("");
    setVendorSearch("");
    setUnpaid([]);
    setChecked({});
    setAllocAmounts({});
  };

  const toggleInvoice = (inv: UnpaidInvoice) => {
    const key = `${inv.kind}:${inv.id}`;
    const next = !checked[key];
    setChecked({ ...checked, [key]: next });
    if (next && !allocAmounts[key]) {
      setAllocAmounts({ ...allocAmounts, [key]: inv.balance_due.toFixed(2) });
    }
  };

  const handleSubmit = async () => {
    if (!vendorId) return toast.error("Pick a vendor");
    if (!amount || amountNum <= 0) return toast.error("Enter an amount");
    if (!paymentDate) return toast.error("Enter the payment date");
    if (!paymentMethodId) return toast.error("Pick a payment method");
    if (overAllocated) return toast.error("Allocations exceed payment amount");

    setSubmitting(true);
    try {
      const method = paymentMethods.find(m => m.id === paymentMethodId);
      const recordRes = await callApi({
        action: "record_payment",
        vendor_id: vendorId,
        amount: amountNum,
        currency,
        payment_date: paymentDate,
        payment_method_id: paymentMethodId,
        payment_method_code: method?.code,
        payment_method_name: method?.name,
        reference_number: referenceNumber || null,
        notes: notes || null,
        amount_cad: amountCad ? parseFloat(amountCad) : null,
      });
      const paymentId = recordRes.payment?.id;
      if (allocateNow && paymentId) {
        const allocations = unpaid
          .filter(inv => checked[`${inv.kind}:${inv.id}`])
          .map(inv => ({
            kind: inv.kind,
            target_id: inv.id,
            amount: parseFloat(allocAmounts[`${inv.kind}:${inv.id}`]) || 0,
          }))
          .filter(a => a.amount > 0);
        if (allocations.length > 0) {
          await callApi({ action: "allocate_payment", payment_id: paymentId, allocations });
        }
      }
      toast.success("Vendor payment recorded");
      onSuccess?.();
      onClose();
      resetForm();
    } catch (e: any) {
      toast.error(e.message || "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    if (!prefillId) clearVendor();
    setAmount(""); setCurrency("CAD"); setReferenceNumber(""); setNotes(""); setAmountCad("");
    setPaymentMethodId(""); setPaymentDate(format(new Date(), "yyyy-MM-dd"));
    setAllocateNow(false); setChecked({}); setAllocAmounts({}); setUnpaid([]);
    setInvoiceSearch("");
  };

  const filteredUnpaid = invoiceSearch.trim()
    ? unpaid.filter(inv => inv.invoice_number.toLowerCase().includes(invoiceSearch.trim().toLowerCase()))
    : unpaid;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Record Vendor Payment</h2>
          <button onClick={() => { onClose(); resetForm(); }} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Vendor */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
            {vendorId ? (
              <div className="flex items-center justify-between px-3 py-2 border border-teal-300 bg-teal-50 rounded-md">
                <span className="text-sm text-teal-700 font-medium">{selectedName}</span>
                {!prefillId && (
                  <button onClick={clearVendor} className="text-teal-700 hover:text-teal-900 text-xs">Change</button>
                )}
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={vendorSearch}
                    onChange={(e) => setVendorSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                {showVendorDropdown && vendorResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {vendorResults.map(v => (
                      <button key={v.id} onClick={() => selectVendor(v)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100">
                        <div className="font-medium text-gray-900">{v.full_name}</div>
                        <div className="text-xs text-gray-500">{v.email || "—"} {v.xtrf_vendor_id ? `· XTRF #${v.xtrf_vendor_id}` : ""}</div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white">
                {["CAD","USD","EUR","GBP","INR"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment date *</label>
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Method *</label>
              <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white">
                <option value="">— select —</option>
                {paymentMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reference / receiving account</label>
              <input type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="bank txn ID, wire ref…" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (CAD equivalent)
                <span className="text-gray-400 ml-1 text-xs">— optional, for non-CAD</span>
              </label>
              <input type="number" step="0.01" value={amountCad} onChange={(e) => setAmountCad(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="auto" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-none" />
          </div>

          {vendorId && (
            <div className="border-t border-gray-100 pt-4">
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input type="checkbox" checked={allocateNow} onChange={(e) => setAllocateNow(e.target.checked)}
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                <span className="text-sm font-medium text-gray-700">Allocate to invoices now</span>
              </label>

              {allocateNow && (
                <div className="space-y-2">
                  {loadingInvoices ? (
                    <div className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading invoices…</div>
                  ) : unpaid.length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-4">No unpaid invoices for this vendor.</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>
                          {invoiceSearch.trim() && filteredUnpaid.length !== unpaid.length
                            ? `${filteredUnpaid.length} of ${unpaid.length} unpaid invoice(s)`
                            : `${unpaid.length} unpaid invoice(s)`}
                        </span>
                        <span>Allocated: <strong className={overAllocated ? "text-red-600" : "text-gray-700"}>{fmt(totalAllocated, currency)}</strong> of {fmt(amountNum, currency)}</span>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                          type="text"
                          value={invoiceSearch}
                          onChange={(e) => setInvoiceSearch(e.target.value)}
                          placeholder="Search invoice number…"
                          className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                      <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-md">
                        <table className="min-w-full text-xs">
                          <thead className="bg-gray-50 text-gray-500 sticky top-0">
                            <tr>
                              <th className="w-8 px-2 py-1.5"></th>
                              <th className="px-2 py-1.5 text-left">Invoice</th>
                              <th className="px-2 py-1.5 text-left">Source</th>
                              <th className="px-2 py-1.5 text-right">Balance</th>
                              <th className="px-2 py-1.5 text-left w-14">Curr.</th>
                              <th className="px-2 py-1.5 text-right w-28">Allocate</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {filteredUnpaid.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="px-2 py-4 text-center text-gray-500">
                                  No invoices match "{invoiceSearch}".
                                </td>
                              </tr>
                            ) : filteredUnpaid.map(inv => {
                              const key = `${inv.kind}:${inv.id}`;
                              return (
                                <tr key={key} className="hover:bg-gray-50">
                                  <td className="px-2 py-1.5">
                                    <input type="checkbox" checked={!!checked[key]} onChange={() => toggleInvoice(inv)}
                                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                                  </td>
                                  <td className="px-2 py-1.5 font-mono text-gray-700">{inv.invoice_number}</td>
                                  <td className="px-2 py-1.5 text-gray-500">{inv.kind === "xtrf_invoice" ? "XTRF" : "Portal"}</td>
                                  <td className="px-2 py-1.5 text-right text-gray-700">{fmt(inv.balance_due, inv.currency)}</td>
                                  <td className="px-2 py-1.5 text-left text-gray-500 font-mono">{inv.currency || "—"}</td>
                                  <td className="px-2 py-1.5 text-right">
                                    {checked[key] && (
                                      <input type="number" step="0.01" value={allocAmounts[key] ?? ""} onChange={(e) => setAllocAmounts({ ...allocAmounts, [key]: e.target.value })}
                                        className="w-24 px-1.5 py-1 border border-gray-300 rounded text-xs text-right" />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {overAllocated && (
                        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                          <Info className="w-4 h-4" /> Allocated amount exceeds payment.
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button onClick={() => { onClose(); resetForm(); }} disabled={submitting}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting || overAllocated || !vendorId || !amount}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Record payment
          </button>
        </div>
      </div>
    </div>
  );
}
