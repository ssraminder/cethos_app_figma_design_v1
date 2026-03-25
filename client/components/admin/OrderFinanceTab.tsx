import { format } from "date-fns";

// ── Types ──

interface OrderFinanceTabProps {
  workflowData: any | null;
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
}: {
  steps: any[];
  vf: VendorFinancials;
  currency: string;
}) {
  const payableSteps = steps.filter((s: any) => s.payable != null);

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
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Step</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Vendor</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Rate</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500">Total</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Status</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500">Margin</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Invoice #</th>
                </tr>
              </thead>
              <tbody>
                {payableSteps.map((step: any) => {
                  const p: StepPayable = step.payable;
                  return (
                    <tr key={p.id} className="border-b border-gray-100">
                      <td className="py-2 px-4 text-gray-900 font-medium">{step.name}</td>
                      <td className="py-2 px-4 text-gray-600">{p.vendor_name || "\u2014"}</td>
                      <td className="py-2 px-4 text-gray-600">{formatRate(p.rate, p.rate_unit)}</td>
                      <td className="py-2 px-4 text-right font-medium text-gray-900">
                        {formatCurrency(p.total, p.currency || currency)}
                      </td>
                      <td className="py-2 px-4">
                        <PayableBadge status={p.status} />
                      </td>
                      <td className="py-2 px-4 text-right text-gray-600">
                        {p.margin_percent != null ? `${p.margin_percent.toFixed(1)}%` : "\u2014"}
                      </td>
                      <td className="py-2 px-4 text-gray-600 text-xs font-mono">
                        {p.vendor_invoice_number || "\u2014"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
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

export default function OrderFinanceTab({ workflowData }: OrderFinanceTabProps) {
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

  return (
    <div className="space-y-6">
      <SummaryCards of={of} vf={vf} margin={margin} />
      <ReceivableBreakdown of={of} invoice={invoice} />
      <PayablesBreakdown steps={steps} vf={vf} currency={of.currency} />
      <ProfitSummary of={of} vf={vf} margin={margin} />
    </div>
  );
}
