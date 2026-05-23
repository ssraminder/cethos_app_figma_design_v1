import { useEffect, useState } from "react";
import { Calculator, Download, Loader2, Printer, Save } from "lucide-react";
import { callPaymentApi } from "@/lib/payment-api";
import { downloadXlsx } from "@/lib/xlsx-export";

export interface GstReturnRow {
  branch_id: number | null;
  branch_name: string;
  branch_code?: string | null;
  included_branches?: { id: number; name: string }[];
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

// Consolidated row uses key 0 in the EditState since branch_id IS null on
// the server but a TS Map needs a non-null key.
const CONSOLIDATED_KEY = 0;

export default function GstReturnView({ branchIds, dateFrom, dateTo, basis }: Props) {
  const [returns, setReturns] = useState<GstReturnRow[]>([]);
  const [consolidated, setConsolidated] = useState<GstReturnRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<EditState>({});
  const [savingBranchId, setSavingBranchId] = useState<number | null>(null);

  const load = async () => {
    if (!dateFrom || !dateTo || branchIds.length === 0) {
      setReturns([]);
      setConsolidated(null);
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
      setConsolidated(r.consolidated || null);
      setEdits({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setReturns([]);
      setConsolidated(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, basis, branchIds.join(",")]);

  const editKey = (row: GstReturnRow): number =>
    row.branch_id ?? CONSOLIDATED_KEY;

  const editField = (
    row: GstReturnRow,
    field: keyof GstReturnRow,
    value: number | string,
  ) => {
    const key = editKey(row);
    setEdits((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const val = (row: GstReturnRow, field: keyof GstReturnRow): number | string => {
    const e = edits[editKey(row)];
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
    const key = editKey(row);
    setSavingBranchId(key);
    try {
      const e = edits[key] || {};
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
          row,
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
      onChange={(e) => editField(row, field, e.target.value)}
      className="w-72 px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-teal-500"
    />
  );

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-CA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const printAll = () => window.print();

  const dirty = !!edits[CONSOLIDATED_KEY];

  const exportExcel = () => {
    if (!consolidated) return;
    const c = computed(consolidated);
    const oneReturnSheet: (string | number)[][] = [
      ["Field", "Value"],
      ["Branches", (consolidated.included_branches || []).map((b) => b.name).join(", ")],
      ["Period start", consolidated.period_start],
      ["Period end", consolidated.period_end],
      ["Line 101 Total sales", consolidated.line_101],
      ["Line 103 GST collected", consolidated.line_103],
      ["Line 104 Adjustments+", c.l_104],
      ["Line 105 Total GST+adj", c.l_105],
      ["Line 106-a ITC vendor (computed)", consolidated.line_106_computed],
      ["Line 106-b Additional ITC", c.l_106_additional],
      ["Line 106 Total ITC", c.l_106],
      ["Line 107 Adjustments-", c.l_107],
      ["Line 108 Total ITC+adj", c.l_108],
      ["Line 109 Net tax", c.l_109],
      ["Line 110 Instalments", c.l_110],
      ["Line 111 Rebates", c.l_111],
      ["Line 112 Other credits", c.l_112],
      ["Line 113A Balance", c.l_113A],
      ["Line 205 Real property", c.l_205],
      ["Line 405 Self-assessed", c.l_405],
      ["Line 113B Other debits", c.l_113B],
      ["Line 113C Balance", c.l_113C],
      [
        c.l_113C < 0 ? "Line 114 Refund claimed" : "Line 115 Payment enclosed",
        Math.abs(c.l_113C),
      ],
      ["Additional ITC notes", consolidated.additional_itc_notes || ""],
    ];
    const perBranchHeader = [
      "Branch",
      "Line 101 Sales",
      "% revenue",
      "Line 103 GST collected",
      "Line 106-a ITC vendor",
      "% ITC",
    ];
    const totalRev = returns.reduce((a, r) => a + r.line_101, 0);
    const totalItc = returns.reduce((a, r) => a + r.line_106_computed, 0);
    const perBranchRows: (string | number)[][] = returns.map((r) => [
      r.branch_name,
      r.line_101,
      totalRev > 0 ? Number(((r.line_101 / totalRev) * 100).toFixed(2)) : 0,
      r.line_103,
      r.line_106_computed,
      totalItc > 0 ? Number(((r.line_106_computed / totalItc) * 100).toFixed(2)) : 0,
    ]);
    downloadXlsx(`gst-return-${dateFrom}-to-${dateTo}.xlsx`, [
      { name: "Consolidated Return", rows: oneReturnSheet, colWidths: [38, 30] },
      { name: "By branch", rows: [perBranchHeader, ...perBranchRows], colWidths: [30, 16, 12, 18, 16, 10] },
      {
        name: "Filters",
        rows: [
          ["Filter", "Value"],
          ["Period start", dateFrom],
          ["Period end", dateTo],
          ["Basis", basis],
          ["Branch IDs included", branchIds.join(", ")],
        ],
        colWidths: [22, 60],
      },
    ]);
  };

  if (!consolidated) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg text-sm">
        Pick a period and at least one branch from the filter bar to see the return.
      </div>
    );
  }

  const row = consolidated;
  const c = computed(row);

  return (
    <div className="space-y-6">
      <div className="gst-return-no-print flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-gray-500">
          Consolidated across {returns.length} branch{returns.length === 1 ? "" : "es"} · Letter-size PDF output
          {dirty && (
            <span className="ml-2 px-1.5 py-0.5 text-[11px] font-medium rounded bg-amber-100 text-amber-700">
              unsaved
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => save(row)}
            disabled={!dirty || savingBranchId !== null}
            className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded flex items-center gap-1 disabled:opacity-50"
            title="Save adjustments for this period"
          >
            <Save className="w-4 h-4" />
            {savingBranchId !== null ? "Saving..." : "Save adjustments"}
          </button>
          <button
            onClick={exportExcel}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
            title="Download return as Excel"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
          <button
            onClick={printAll}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
          >
            <Printer className="w-4 h-4" />
            Print / Save as PDF
          </button>
        </div>
      </div>

      {/* Revenue + ITC share summary across the included branches */}
      <RevenueShareSummary returns={returns} />

      <div className="gst-return-printable bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="gst-return-no-print bg-gray-50 px-5 py-3 border-b">
          <h3 className="text-base font-semibold text-gray-900">
            {row.branch_name}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Reporting period: {row.period_start} to {row.period_end}
            &nbsp;&middot;&nbsp;{row.customer_invoice_count} customer invoices
            &nbsp;&middot;&nbsp;{row.vendor_invoice_count} vendor invoices
            {(row.included_branches || []).length > 0 && (
              <>
                <br />
                Includes: {(row.included_branches || []).map((b) => b.name).join(", ")}
              </>
            )}
          </p>
        </div>

        {/* Print-only header */}
        <div className="hidden print:block mb-3">
          <div className="flex items-end justify-between border-b border-black pb-2 mb-3">
            <div>
              <h2 className="text-lg font-bold">GST/HST Return Working Copy</h2>
              <p className="text-sm font-semibold mt-0.5">{row.branch_name}</p>
              {(row.included_branches || []).length > 0 && (
                <p className="text-xs mt-0.5">
                  {(row.included_branches || []).map((b) => b.name).join(", ")}
                </p>
              )}
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
            </div>

        {row.filed_at && (
          <div className="mx-5 mb-3 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2">
            Filed at {row.filed_at}
          </div>
        )}
      </div>
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
