import { useEffect, useState } from "react";
import { Calculator, Download, Loader2, Printer, Save } from "lucide-react";
import { callPaymentApi } from "@/lib/payment-api";
import { downloadXlsx } from "@/lib/xlsx-export";

export interface GstReturnRow {
  branch_id: number;
  branch_name: string;
  branch_code: string | null;
  period_start: string;
  period_end: string;
  line_101: number;
  line_103: number;
  line_104: number;
  line_104_notes: string | null;
  line_105: number;
  line_106_computed: number;
  line_106_additional: number;
  line_106: number;
  additional_itc_notes: string | null;
  line_107: number;
  line_107_notes: string | null;
  line_108: number;
  line_109: number;
  line_110: number;
  line_110_notes: string | null;
  line_111: number;
  line_111_notes: string | null;
  line_112: number;
  line_113A: number;
  line_205: number;
  line_205_notes: string | null;
  line_405: number;
  line_405_notes: string | null;
  line_113B: number;
  line_113C: number;
  refund_or_payment: {
    kind: "refund" | "payment";
    line: 114 | 115;
    amount: number;
  };
  vendor_invoice_count: number;
  customer_invoice_count: number;
  filed_at: string | null;
}

interface Props {
  branchIds: number[];
  dateFrom: string;
  dateTo: string;
  basis: "accrual" | "cash";
}

type EditState = Record<number, Partial<GstReturnRow>>;

export default function GstReturnView({ branchIds, dateFrom, dateTo, basis }: Props) {
  const [returns, setReturns] = useState<GstReturnRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<EditState>({});
  const [savingBranchId, setSavingBranchId] = useState<number | null>(null);

  const load = async () => {
    if (!dateFrom || !dateTo || branchIds.length === 0) {
      setReturns([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await callPaymentApi("generate-tax-report", {
        action: "gst_return",
        branch_ids: branchIds,
        date_from: dateFrom,
        date_to: dateTo,
        basis,
      });
      setReturns(r.returns || []);
      setEdits({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setReturns([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, basis, branchIds.join(",")]);

  const editField = (
    branchId: number,
    field: keyof GstReturnRow,
    value: number | string,
  ) => {
    setEdits((prev) => ({
      ...prev,
      [branchId]: { ...prev[branchId], [field]: value },
    }));
  };

  const val = (row: GstReturnRow, field: keyof GstReturnRow): number | string => {
    const e = edits[row.branch_id];
    if (e && Object.prototype.hasOwnProperty.call(e, field)) {
      const v = e[field];
      return (v as number | string) ?? "";
    }
    return (row[field] as number | string) ?? "";
  };

  const computed = (row: GstReturnRow) => {
    const n = (v: unknown) => {
      const x = typeof v === "number" ? v : Number(v);
      return Number.isFinite(x) ? x : 0;
    };
    const l_104 = n(val(row, "line_104"));
    const l_107 = n(val(row, "line_107"));
    const l_110 = n(val(row, "line_110"));
    const l_111 = n(val(row, "line_111"));
    const l_205 = n(val(row, "line_205"));
    const l_405 = n(val(row, "line_405"));
    const l_106_additional = n(val(row, "line_106_additional"));
    const l_106 = row.line_106_computed + l_106_additional;
    const l_105 = row.line_103 + l_104;
    const l_108 = l_106 + l_107;
    const l_109 = l_105 - l_108;
    const l_112 = l_110 + l_111;
    const l_113A = l_109 - l_112;
    const l_113B = l_205 + l_405;
    const l_113C = l_113A + l_113B;
    return {
      l_104, l_105, l_106, l_106_additional, l_107, l_108, l_109,
      l_110, l_111, l_112, l_113A, l_205, l_405, l_113B, l_113C,
    };
  };

  const save = async (row: GstReturnRow) => {
    setSavingBranchId(row.branch_id);
    try {
      const e = edits[row.branch_id] || {};
      await callPaymentApi("generate-tax-report", {
        action: "save_adjustments",
        branch_id: row.branch_id,
        date_from: dateFrom,
        date_to: dateTo,
        line_104: e.line_104 ?? row.line_104,
        line_104_notes: e.line_104_notes ?? row.line_104_notes,
        line_107: e.line_107 ?? row.line_107,
        line_107_notes: e.line_107_notes ?? row.line_107_notes,
        line_110: e.line_110 ?? row.line_110,
        line_110_notes: e.line_110_notes ?? row.line_110_notes,
        line_111: e.line_111 ?? row.line_111,
        line_111_notes: e.line_111_notes ?? row.line_111_notes,
        line_205: e.line_205 ?? row.line_205,
        line_205_notes: e.line_205_notes ?? row.line_205_notes,
        line_405: e.line_405 ?? row.line_405,
        line_405_notes: e.line_405_notes ?? row.line_405_notes,
        additional_itc_amount: e.line_106_additional ?? row.line_106_additional,
        additional_itc_notes: e.additional_itc_notes ?? row.additional_itc_notes,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingBranchId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-10 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600 mx-auto" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
        {error}
      </div>
    );
  }
  if (branchIds.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg text-sm">
        Select at least one branch from the filter bar above to see the return.
      </div>
    );
  }
  if (returns.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-gray-400 text-sm">
        No data for the selected period.
      </div>
    );
  }

  const moneyInput = (row: GstReturnRow, field: keyof GstReturnRow) => (
    <input
      type="number"
      step="0.01"
      placeholder="0.00"
      value={val(row, field)}
      onChange={(e) =>
        editField(
          row.branch_id,
          field,
          e.target.value === "" ? "" : Number(e.target.value),
        )
      }
      className="w-32 px-2 py-1 text-right text-sm border rounded focus:ring-1 focus:ring-teal-500"
    />
  );

  const textInput = (
    row: GstReturnRow,
    field: keyof GstReturnRow,
    placeholder: string,
  ) => (
    <input
      type="text"
      placeholder={placeholder}
      value={(val(row, field) as string) || ""}
      onChange={(e) => editField(row.branch_id, field, e.target.value)}
      className="w-72 px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-teal-500"
    />
  );

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-CA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const printAll = () => window.print();

  // Distribute the total vendor ITCs across branches in proportion to revenue.
  // For each branch: target_itc = total_itc_pool * (branch_revenue / total_revenue).
  // Pre-fill line_106_additional with the delta (target - line_106_computed) so
  // Line 106 ends up equal to the target. Existing additional_itc values are
  // overwritten — user can fine-tune per branch before saving.
  const distributeByRevenue = () => {
    const totalRevenue = returns.reduce((a, r) => a + r.line_101, 0);
    const totalItcPool = returns.reduce((a, r) => a + r.line_106_computed, 0);
    if (totalRevenue <= 0) {
      setError("Total revenue is zero — cannot distribute by revenue share.");
      return;
    }
    const ok = window.confirm(
      `Distribute total vendor ITCs (\$${totalItcPool.toFixed(2)}) across ${returns.length} branches in proportion to revenue?\n\nThis overwrites the 'Additional ITCs' input on each branch. You can adjust per-branch and then click Save.`,
    );
    if (!ok) return;
    const next: EditState = { ...edits };
    for (const r of returns) {
      const targetItc = totalItcPool * (r.line_101 / totalRevenue);
      const delta = Math.round((targetItc - r.line_106_computed) * 100) / 100;
      const note = `Auto-split by revenue % (target Line 106 = \$${targetItc.toFixed(2)}, revenue share = ${((r.line_101 / totalRevenue) * 100).toFixed(2)}%)`;
      next[r.branch_id] = {
        ...next[r.branch_id],
        line_106_additional: delta,
        additional_itc_notes: note,
      };
    }
    setEdits(next);
  };

  // Save all branches that have unsaved edits in sequence.
  const saveAll = async () => {
    const dirtyBranches = returns.filter((r) => edits[r.branch_id]);
    if (dirtyBranches.length === 0) return;
    for (const r of dirtyBranches) {
      await save(r);
    }
  };

  const dirtyCount = returns.filter((r) => edits[r.branch_id]).length;

  const exportExcel = () => {
    const header = [
      "Branch",
      "Line 101 Sales",
      "Line 103 GST collected",
      "Line 104 Adjustments+",
      "Line 105 Total GST+adj",
      "Line 106a ITC vendor",
      "Line 106b Additional ITC",
      "Line 106 Total ITC",
      "Line 107 Adjustments-",
      "Line 108 Total ITC+adj",
      "Line 109 Net tax",
      "Line 110 Instalments",
      "Line 111 Rebates",
      "Line 112 Other credits",
      "Line 113A Balance",
      "Line 205 Real property",
      "Line 405 Self-assessed",
      "Line 113B Other debits",
      "Line 113C Balance",
      "Line 114 Refund",
      "Line 115 Payment",
      "Additional ITC notes",
    ];
    const rows = returns.map((row) => {
      const c = computed(row);
      return [
        row.branch_name,
        row.line_101,
        row.line_103,
        c.l_104,
        c.l_105,
        row.line_106_computed,
        c.l_106_additional,
        c.l_106,
        c.l_107,
        c.l_108,
        c.l_109,
        c.l_110,
        c.l_111,
        c.l_112,
        c.l_113A,
        c.l_205,
        c.l_405,
        c.l_113B,
        c.l_113C,
        c.l_113C < 0 ? -c.l_113C : 0,
        c.l_113C >= 0 ? c.l_113C : 0,
        row.additional_itc_notes || "",
      ];
    });
    downloadXlsx(`gst-return-${dateFrom}-to-${dateTo}.xlsx`, [
      {
        name: "GST Return",
        rows: [header, ...rows],
        colWidths: [28, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 12, 12, 40],
      },
      {
        name: "Filters",
        rows: [
          ["Filter", "Value"],
          ["Period start", dateFrom],
          ["Period end", dateTo],
          ["Basis", basis],
          ["Branches", branchIds.join(", ")],
        ],
        colWidths: [22, 60],
      },
    ]);
  };

  return (
    <div className="space-y-6">
      <div className="gst-return-no-print flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-gray-500">
          {returns.length} branch{returns.length === 1 ? "" : "es"} · Letter-size PDF output
          {dirtyCount > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-[11px] font-medium rounded bg-amber-100 text-amber-700">
              {dirtyCount} unsaved
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={distributeByRevenue}
            className="px-3 py-1.5 text-sm bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 rounded flex items-center gap-1"
            title="Allocate total vendor ITC across branches proportionally to revenue"
          >
            <Calculator className="w-4 h-4" />
            Distribute ITCs by revenue %
          </button>
          <button
            onClick={saveAll}
            disabled={dirtyCount === 0 || savingBranchId !== null}
            className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded flex items-center gap-1 disabled:opacity-50"
            title="Save all unsaved branches"
          >
            <Save className="w-4 h-4" />
            Save all ({dirtyCount})
          </button>
          <button
            onClick={exportExcel}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
            title="Download all branches as Excel"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
          <button
            onClick={printAll}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
          >
            <Printer className="w-4 h-4" />
            Print / Save as PDF (all branches)
          </button>
        </div>
      </div>

      {/* Revenue + ITC share summary — basis for revenue-% ITC redistribution */}
      <RevenueShareSummary returns={returns} />

      {returns.map((row) => {
        const c = computed(row);
        const dirty = !!edits[row.branch_id];
        return (
          <div
            key={row.branch_id}
            className="gst-return-printable bg-white border border-gray-200 rounded-lg overflow-hidden"
          >
            <div className="gst-return-no-print bg-gray-50 px-5 py-3 border-b flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {row.branch_name}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Reporting period: {row.period_start} to {row.period_end}
                  &nbsp;&middot;&nbsp;{row.customer_invoice_count} customer invoices
                  &nbsp;&middot;&nbsp;{row.vendor_invoice_count} vendor invoices
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => save(row)}
                  disabled={!dirty || savingBranchId === row.branch_id}
                  className="px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded disabled:opacity-50"
                >
                  {savingBranchId === row.branch_id ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 text-xs bg-gray-200 hover:bg-gray-300 rounded flex items-center gap-1"
                  title="Print this branch's return"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
              </div>
            </div>

            {/* Print-only header — minimal, accountant-ready */}
            <div className="hidden print:block mb-3">
              <div className="flex items-end justify-between border-b border-black pb-2 mb-3">
                <div>
                  <h2 className="text-lg font-bold">GST/HST Return Working Copy</h2>
                  <p className="text-sm font-semibold mt-0.5">{row.branch_name}</p>
                </div>
                <div className="text-right text-sm">
                  <div>Reporting period:</div>
                  <div className="font-semibold">
                    {row.period_start} &nbsp;to&nbsp; {row.period_end}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 text-sm">
              <Line
                label="Total sales and other revenue (excl. GST/HST)"
                code="101"
                value={fmt(row.line_101)}
              />

              <SectionHeader title="Net tax calculation" />
              <Line
                label="GST/HST collected or collectible"
                code="103"
                value={fmt(row.line_103)}
                highlight
              />
              <LineEdit
                label="Adjustments added to net tax (bad-debt recovery)"
                code="104"
              >
                {moneyInput(row, "line_104")}
                {textInput(row, "line_104_notes", "notes")}
              </LineEdit>
              <Line
                label="Total GST/HST + adjustments (103 + 104)"
                code="105"
                value={fmt(c.l_105)}
                bold
              />

              <LineEdit label="ITCs from vendor invoices (computed)" code="106-a">
                <span className="text-right tabular-nums text-gray-700 px-2 py-1 w-32 inline-block">
                  {fmt(row.line_106_computed)}
                </span>
                <span className="text-xs text-gray-400 ml-2">
                  auto-computed from Vendor Tax tab
                </span>
              </LineEdit>
              <LineEdit
                label="Additional ITCs to claim (outside vendor pipeline)"
                code="106-b"
                highlight
              >
                {moneyInput(row, "line_106_additional")}
                {textInput(
                  row,
                  "additional_itc_notes",
                  "subscriptions, office expenses, credit card ITCs",
                )}
              </LineEdit>
              <Line
                label="Total ITCs (Line 106 = computed + additional)"
                code="106"
                value={fmt(c.l_106)}
                bold
                highlight
              />

              <LineEdit
                label="Adjustments deducted (bad debts written off)"
                code="107"
              >
                {moneyInput(row, "line_107")}
                {textInput(row, "line_107_notes", "bad debts written off")}
              </LineEdit>
              <Line
                label="Total ITCs + adjustments (106 + 107)"
                code="108"
                value={fmt(c.l_108)}
                bold
              />
              <Line
                label="Net tax (105 - 108)"
                code="109"
                value={fmt(c.l_109)}
                bold
              />

              <SectionHeader title="Other credits" />
              <LineEdit label="Instalments / annual filer payments" code="110">
                {moneyInput(row, "line_110")}
                {textInput(row, "line_110_notes", "notes")}
              </LineEdit>
              <LineEdit label="Rebates" code="111">
                {moneyInput(row, "line_111")}
                {textInput(row, "line_111_notes", "notes")}
              </LineEdit>
              <Line
                label="Total other credits (110 + 111)"
                code="112"
                value={fmt(c.l_112)}
              />
              <Line
                label="Balance (109 - 112)"
                code="113A"
                value={fmt(c.l_113A)}
                bold
              />

              <SectionHeader title="Other debits" />
              <LineEdit label="Real-property GST/HST due" code="205">
                {moneyInput(row, "line_205")}
                {textInput(row, "line_205_notes", "notes")}
              </LineEdit>
              <LineEdit label="Self-assessed GST/HST" code="405">
                {moneyInput(row, "line_405")}
                {textInput(row, "line_405_notes", "notes")}
              </LineEdit>
              <Line
                label="Total other debits (205 + 405)"
                code="113B"
                value={fmt(c.l_113B)}
              />
              <Line
                label="Balance (113A + 113B)"
                code="113C"
                value={fmt(c.l_113C)}
                bold
              />

              <SectionHeader
                title={c.l_113C < 0 ? "Refund claimed" : "Payment enclosed"}
              />
              {c.l_113C < 0 ? (
                <Line
                  label="Refund claimed"
                  code="114"
                  value={fmt(-c.l_113C)}
                  bold
                  highlight
                />
              ) : (
                <Line
                  label="Payment enclosed"
                  code="115"
                  value={fmt(c.l_113C)}
                  bold
                  highlight
                />
              )}

              {row.filed_at && (
                <div className="mt-3 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2">
                  Filed at {row.filed_at}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mt-4 mb-1 border-b border-gray-200 pb-1">
      <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
        {title}
      </span>
    </div>
  );
}

interface LineProps {
  label: string;
  code: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}
function Line({ label, code, value, bold, highlight }: LineProps) {
  return (
    <div
      className={`grid grid-cols-[1fr_60px_140px] gap-2 items-center py-1.5 ${
        bold ? "font-semibold text-gray-900" : "text-gray-700"
      } ${highlight ? "bg-teal-50 -mx-2 px-2 rounded" : ""}`}
    >
      <span className="text-sm">{label}</span>
      <span className="text-xs text-gray-400 text-center font-mono">{code}</span>
      <span className="text-right tabular-nums text-sm">{value}</span>
    </div>
  );
}

function LineEdit({
  label,
  code,
  children,
  highlight,
}: {
  label: string;
  code: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[1fr_60px_auto] gap-2 items-start py-1.5 ${
        highlight ? "bg-amber-50 -mx-2 px-2 rounded" : ""
      }`}
    >
      <span className="text-sm text-gray-700 pt-1.5">{label}</span>
      <span className="text-xs text-gray-400 text-center font-mono pt-2">
        {code}
      </span>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {children}
      </div>
    </div>
  );
}


function RevenueShareSummary({ returns }: { returns: GstReturnRow[] }) {
  const totals = returns.reduce(
    (a, r) => ({
      line_101: a.line_101 + r.line_101,
      line_103: a.line_103 + r.line_103,
      line_106_computed: a.line_106_computed + r.line_106_computed,
    }),
    { line_101: 0, line_103: 0, line_106_computed: 0 },
  );
  const fmt = (n: number) =>
    `$${n.toLocaleString("en-CA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const pct = (a: number, b: number) =>
    b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "—";
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 gst-return-no-print">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">
          Revenue & ITC share by branch
        </h3>
        <span className="text-[11px] text-gray-400">
          revenue % is the basis for proportional ITC redistribution
        </span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs text-gray-500 uppercase">
          <tr>
            <th className="text-left py-1">Branch</th>
            <th className="text-right py-1">Revenue (Line 101)</th>
            <th className="text-right py-1">% revenue</th>
            <th className="text-right py-1">GST collected (103)</th>
            <th className="text-right py-1">ITC vendor (106-a)</th>
            <th className="text-right py-1">% ITC</th>
          </tr>
        </thead>
        <tbody>
          {returns.map((r) => (
            <tr key={r.branch_id} className="border-t">
              <td className="py-1">{r.branch_name}</td>
              <td className="py-1 text-right">{fmt(r.line_101)}</td>
              <td className="py-1 text-right text-gray-500">
                {pct(r.line_101, totals.line_101)}
              </td>
              <td className="py-1 text-right">{fmt(r.line_103)}</td>
              <td className="py-1 text-right text-teal-700 font-medium">
                {fmt(r.line_106_computed)}
              </td>
              <td className="py-1 text-right text-gray-500">
                {pct(r.line_106_computed, totals.line_106_computed)}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
            <td className="py-1.5">Total (all selected branches)</td>
            <td className="py-1.5 text-right">{fmt(totals.line_101)}</td>
            <td className="py-1.5 text-right text-gray-500">100.0%</td>
            <td className="py-1.5 text-right">{fmt(totals.line_103)}</td>
            <td className="py-1.5 text-right text-teal-700">
              {fmt(totals.line_106_computed)}
            </td>
            <td className="py-1.5 text-right text-gray-500">100.0%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
