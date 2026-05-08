import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

// ── Types ──

interface OrderFinanceTabProps {
  workflowData: any | null;
  onRefresh?: () => void;
  // Direct-order receivables: when isDirectOrder is true, the Receivable
  // Breakdown switches from the read-only quote-derived view to an
  // editable order_receivables list. Locked when hasIssuedInvoice is true
  // (the parent computes this from a non-void customer_invoice on the
  // order). Quote-converted orders ignore both flags.
  orderId?: string;
  isDirectOrder?: boolean;
  hasIssuedInvoice?: boolean;
}

interface OrderReceivable {
  id: string;
  order_id: string;
  description: string;
  calculation_unit: string;
  quantity: number;
  rate: number;
  line_subtotal: number;
  surcharge_total: number;
  discount_total: number;
  tax_rate: number;
  tax_amount: number;
  line_total: number;
  currency: string;
  po_number: string | null;
  client_project_number: string | null;
  sort_order: number;
  status: "draft" | "invoiced" | "voided";
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

// ── Section 2 (direct-order variant): Editable Receivables list ──
// Renders order_receivables rows for direct orders. Each row carries its
// own PO + client project number; staff can add, edit, and remove rows.
// Recalc is automatic via the AFTER trigger on order_receivables, so the
// only thing this component does on save is write the row.
function EditableReceivablesBreakdown({
  orderId,
  invoice,
  hasIssuedInvoice,
  currency,
  onRefresh,
}: {
  orderId: string;
  invoice: Invoice | null;
  hasIssuedInvoice: boolean;
  currency: string;
  onRefresh?: () => void;
}) {
  const [rows, setRows] = useState<OrderReceivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Default tax rate from the customer profile (customers.default_tax_rate_id
  // → tax_rates.rate). Falls back to 5% (Canadian GST baseline) if the
  // customer has no default set.
  const [defaultTaxRate, setDefaultTaxRate] = useState<number>(0.05);
  const [defaultTaxLabel, setDefaultTaxLabel] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    description: "",
    quantity: 1,
    rate: 0,
    tax_rate: 0.05,
    surcharge_total: 0,
    discount_total: 0,
    po_number: "",
    client_project_number: "",
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("order_receivables")
        .select(
          "id, order_id, description, calculation_unit, quantity, rate, line_subtotal, surcharge_total, discount_total, tax_rate, tax_amount, line_total, currency, po_number, client_project_number, sort_order, status",
        )
        .eq("order_id", orderId)
        .neq("status", "voided")
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      setRows((data || []) as OrderReceivable[]);
    } catch (err) {
      console.error("Failed to load receivables", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Resolve customer's default tax rate once per order. We hop
  // orders → customers → tax_rates so the staff portal doesn't need
  // an API change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: ord } = await supabase
          .from("orders")
          .select("customer_id")
          .eq("id", orderId)
          .maybeSingle();
        if (!ord?.customer_id) return;
        const { data: cust } = await supabase
          .from("customers")
          .select("default_tax_rate_id")
          .eq("id", ord.customer_id)
          .maybeSingle();
        if (!cust?.default_tax_rate_id) return;
        const { data: tax } = await supabase
          .from("tax_rates")
          .select("rate, tax_name, region_code")
          .eq("id", cust.default_tax_rate_id)
          .maybeSingle();
        if (cancelled || !tax) return;
        const r = Number(tax.rate);
        if (Number.isFinite(r)) {
          setDefaultTaxRate(r);
          setDefaultTaxLabel(
            [tax.tax_name, tax.region_code].filter(Boolean).join(" · ") || null,
          );
          setDraft((d) => (d.tax_rate === 0.05 ? { ...d, tax_rate: r } : d));
        }
      } catch (err) {
        console.warn("Failed to resolve customer default tax rate", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const computeDerived = (q: number, r: number, t: number, su: number, di: number) => {
    const line_subtotal = Math.round(q * r * 100) / 100;
    const taxableBase = line_subtotal + su - di;
    const tax_amount = Math.round(taxableBase * t * 100) / 100;
    const line_total = Math.round((taxableBase + tax_amount) * 100) / 100;
    return { line_subtotal, tax_amount, line_total };
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const q = Number(draft.quantity) || 0;
      const r = Number(draft.rate) || 0;
      const t = Number(draft.tax_rate) || 0;
      const su = Number(draft.surcharge_total) || 0;
      const di = Number(draft.discount_total) || 0;
      const derived = computeDerived(q, r, t, su, di);
      const payload = {
        description: draft.description.trim() || "Line item",
        calculation_unit: "flat",
        quantity: q,
        rate: r,
        tax_rate: t,
        surcharge_total: su,
        discount_total: di,
        po_number: draft.po_number.trim() || null,
        client_project_number: draft.client_project_number.trim() || null,
        ...derived,
      };

      if (editId) {
        const { error } = await supabase
          .from("order_receivables")
          .update(payload)
          .eq("id", editId);
        if (error) throw error;
        toast.success("Line updated");
      } else {
        const { error } = await supabase
          .from("order_receivables")
          .insert({
            order_id: orderId,
            ...payload,
            currency,
            sort_order: rows.length,
            status: "draft",
          });
        if (error) throw error;
        toast.success("Line added");
      }
      setEditId(null);
      setAdding(false);
      setDraft({
        description: "",
        quantity: 1,
        rate: 0,
        tax_rate: defaultTaxRate,
        surcharge_total: 0,
        discount_total: 0,
        po_number: "",
        client_project_number: "",
      });
      await load();
      onRefresh?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save line");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (r: OrderReceivable) => {
    setAdding(false);
    setEditId(r.id);
    setDraft({
      description: r.description,
      quantity: Number(r.quantity),
      rate: Number(r.rate),
      tax_rate: Number(r.tax_rate),
      surcharge_total: Number(r.surcharge_total),
      discount_total: Number(r.discount_total),
      po_number: r.po_number || "",
      client_project_number: r.client_project_number || "",
    });
  };

  const removeRow = async (r: OrderReceivable) => {
    if (!window.confirm(`Remove "${r.description}" from this order?`)) return;
    try {
      // Soft-delete (set status='voided') if it's been invoiced; hard-delete
      // otherwise. The AFTER trigger recalcs orders.total either way.
      if (r.status === "invoiced") {
        const { error } = await supabase
          .from("order_receivables")
          .update({ status: "voided" })
          .eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("order_receivables")
          .delete()
          .eq("id", r.id);
        if (error) throw error;
      }
      toast.success("Line removed");
      await load();
      onRefresh?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove line");
    }
  };

  const fmt = (n: number) => formatCurrency(n, currency);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Receivable Breakdown
        </h3>
        {!hasIssuedInvoice && !adding && !editId && (
          <button
            onClick={() => {
              setAdding(true);
              setEditId(null);
              setDraft({
                description: "",
                quantity: 1,
                rate: 0,
                tax_rate: defaultTaxRate,
                surcharge_total: 0,
                discount_total: 0,
                po_number: "",
                client_project_number: "",
              });
            }}
            className="text-xs px-3 py-1 bg-teal-600 text-white rounded hover:bg-teal-700"
          >
            + Add line
          </button>
        )}
      </div>

      {hasIssuedInvoice && (
        <div className="mb-3 bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-900">
          Invoice {invoice?.invoice_number} is issued. Void it before editing pricing.
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
        ) : rows.length === 0 && !adding ? (
          <div className="p-6 text-center text-sm text-gray-500">
            No receivable lines yet. {!hasIssuedInvoice && "Click + Add line to create one."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Description</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Qty</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Rate</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Subtotal</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Tax</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Total</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">PO</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Project</th>
                {!hasIssuedInvoice && <th className="py-2 px-3"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2 px-3 text-gray-900">{r.description}</td>
                  <td className="py-2 px-3 text-right text-gray-700 tabular-nums">{Number(r.quantity)}</td>
                  <td className="py-2 px-3 text-right text-gray-700 tabular-nums">{fmt(Number(r.rate))}</td>
                  <td className="py-2 px-3 text-right text-gray-700 tabular-nums">{fmt(Number(r.line_subtotal))}</td>
                  <td className="py-2 px-3 text-right text-gray-700 tabular-nums">{fmt(Number(r.tax_amount))}</td>
                  <td className="py-2 px-3 text-right font-medium text-gray-900 tabular-nums">{fmt(Number(r.line_total))}</td>
                  <td className="py-2 px-3 text-gray-700">
                    {r.po_number || (
                      <span className="text-orange-600 text-xs italic">PO pending</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-gray-700 truncate max-w-[10rem]">
                    {r.client_project_number || "—"}
                  </td>
                  {!hasIssuedInvoice && (
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(r)} className="text-xs text-teal-700 hover:underline mr-3">
                        Edit
                      </button>
                      <button onClick={() => removeRow(r)} className="text-xs text-gray-500 hover:text-red-600 hover:underline">
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {(adding || editId) && !hasIssuedInvoice && (
          <div className="bg-teal-50 border-t border-teal-200 p-4 space-y-3">
            <div className="text-sm font-medium text-teal-800">
              {editId ? "Edit line" : "New receivable line"}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Description *</label>
                <input
                  type="text"
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">PO number</label>
                <input
                  type="text"
                  value={draft.po_number}
                  onChange={(e) => setDraft((d) => ({ ...d, po_number: e.target.value }))}
                  placeholder="Pending — fill in when received"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Client project #</label>
                <input
                  type="text"
                  value={draft.client_project_number}
                  onChange={(e) => setDraft((d) => ({ ...d, client_project_number: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Qty</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={draft.quantity}
                    onChange={(e) => setDraft((d) => ({ ...d, quantity: Number(e.target.value) }))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm tabular-nums focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Rate</label>
                  <input
                    type="number"
                    step="0.01"
                    value={draft.rate}
                    onChange={(e) => setDraft((d) => ({ ...d, rate: Number(e.target.value) }))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm tabular-nums focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Tax %</label>
                  <input
                    type="number"
                    step="0.01"
                    value={Math.round(draft.tax_rate * 10000) / 100}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, tax_rate: (Number(e.target.value) || 0) / 100 }))
                    }
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm tabular-nums focus:ring-2 focus:ring-teal-500"
                  />
                  {defaultTaxLabel && (
                    <div className="mt-1 text-[11px] text-gray-500">
                      Default: {Math.round(defaultTaxRate * 10000) / 100}% ({defaultTaxLabel})
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="text-xs text-gray-600">
              Computed: subtotal {fmt((Number(draft.quantity) || 0) * (Number(draft.rate) || 0))} ·
              tax {fmt(((Number(draft.quantity) || 0) * (Number(draft.rate) || 0)) * (Number(draft.tax_rate) || 0))} ·
              total {fmt(((Number(draft.quantity) || 0) * (Number(draft.rate) || 0)) * (1 + (Number(draft.tax_rate) || 0)))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveDraft}
                disabled={saving}
                className="px-4 py-1.5 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : editId ? "Update" : "Add line"}
              </button>
              <button
                onClick={() => {
                  setAdding(false);
                  setEditId(null);
                }}
                disabled={saving}
                className="px-4 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {invoice && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-600">
            Invoice: <span className="font-medium text-gray-900">{invoice.invoice_number}</span>
            {" · "}Status: <span className="font-medium">{invoice.status}</span>
            {invoice.invoice_date && (
              <>
                {" · "}Date:{" "}
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

export default function OrderFinanceTab({ workflowData, onRefresh, orderId, isDirectOrder, hasIssuedInvoice }: OrderFinanceTabProps) {
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
      {isDirectOrder && orderId ? (
        <EditableReceivablesBreakdown
          orderId={orderId}
          invoice={invoice}
          hasIssuedInvoice={hasIssuedInvoice ?? false}
          currency={of.currency}
          onRefresh={onRefresh}
        />
      ) : (
        <ReceivableBreakdown of={of} invoice={invoice} />
      )}
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
