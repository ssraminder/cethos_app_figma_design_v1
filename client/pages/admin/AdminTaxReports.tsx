import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  Calendar,
  Download,
  Filter,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { callPaymentApi, formatCurrency } from "@/lib/payment-api";

type View = "customer" | "vendor" | "gst-return";

interface BranchOpt {
  id: number;
  legal_name: string;
  code: string | null;
  is_default?: boolean;
}

interface SummaryRow {
  branch_id: number | null;
  branch_name: string | null;
  customer_id: string;
  customer_name: string;
  is_tax_exempt: boolean;
  currency: string;
  invoices: number;
  subtotal_native: number;
  tax_native: number;
  gross_native: number;
  subtotal_cad: number;
  tax_cad: number;
  gross_cad: number;
}

interface BranchTotal {
  branch_name: string | null;
  invoices: number;
  subtotal_cad: number;
  tax_cad: number;
  gross_cad: number;
}

interface VendorRow {
  branch_id: number | null;
  branch_name: string;
  vendor_name: string;
  invoices: number;
  subtotal_cad: number;
  itc_cad: number;
  gross_cad: number;
}

interface VendorBranchTotal {
  branch_name: string;
  invoices: number;
  subtotal_cad: number;
  itc_cad: number;
  gross_cad: number;
}

interface VendorGrand {
  invoices: number;
  subtotal_cad: number;
  itc_cad: number;
  gross_cad: number;
}

interface GrandTotal {
  invoices: number;
  subtotal_cad: number;
  tax_cad: number;
  gross_cad: number;
}

type Preset =
  | "this_q"
  | "last_q"
  | "this_year"
  | "last_year"
  | "all_2025"
  | "custom";

function quarterStart(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}
function quarterEnd(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 + 3, 0);
}
function iso(d: Date): string {
  return d.toISOString().split("T")[0];
}

function applyPreset(preset: Preset): { from: string; to: string } | null {
  const today = new Date();
  if (preset === "this_q") {
    return { from: iso(quarterStart(today)), to: iso(quarterEnd(today)) };
  }
  if (preset === "last_q") {
    const prev = new Date(today.getFullYear(), today.getMonth() - 3, 1);
    return { from: iso(quarterStart(prev)), to: iso(quarterEnd(prev)) };
  }
  if (preset === "this_year") {
    return {
      from: `${today.getFullYear()}-01-01`,
      to: `${today.getFullYear()}-12-31`,
    };
  }
  if (preset === "last_year") {
    const y = today.getFullYear() - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  if (preset === "all_2025") {
    return { from: "2025-01-01", to: "2025-12-31" };
  }
  return null;
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: "this_q", label: "This Quarter" },
  { value: "last_q", label: "Last Quarter" },
  { value: "this_year", label: "This Year" },
  { value: "last_year", label: "Last Year" },
  { value: "all_2025", label: "All 2025" },
  { value: "custom", label: "Custom" },
];

const STATUS_OPTIONS = ["issued", "sent", "paid", "overdue"];

function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const esc = (s: unknown) => {
    const str = String(s ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AdminTaxReports() {
  const [view, setView] = useState<View>("customer");

  // Filters
  const [branches, setBranches] = useState<BranchOpt[]>([]);
  const [selectedBranchIds, setSelectedBranchIds] = useState<number[]>([]);
  const [preset, setPreset] = useState<Preset>("this_q");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [basis, setBasis] = useState<"accrual" | "cash">("accrual");
  const [statuses, setStatuses] = useState<string[]>(STATUS_OPTIONS);
  const [search, setSearch] = useState<string>("");

  // Data
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [totalsByBranch, setTotalsByBranch] = useState<BranchTotal[]>([]);
  const [grand, setGrand] = useState<GrandTotal>({
    invoices: 0,
    subtotal_cad: 0,
    tax_cad: 0,
    gross_cad: 0,
  });
  const [vendorRows, setVendorRows] = useState<VendorRow[]>([]);
  const [vendorTotalsByBranch, setVendorTotalsByBranch] = useState<VendorBranchTotal[]>([]);
  const [vendorGrand, setVendorGrand] = useState<VendorGrand>({
    invoices: 0,
    subtotal_cad: 0,
    itc_cad: 0,
    gross_cad: 0,
  });
  const [error, setError] = useState<string | null>(null);

  // Init dates from default preset + load branches
  useEffect(() => {
    const range = applyPreset(preset);
    if (range) {
      setDateFrom(range.from);
      setDateTo(range.to);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const range = applyPreset(preset);
    if (range) {
      setDateFrom(range.from);
      setDateTo(range.to);
    }
  }, [preset]);

  useEffect(() => {
    (async () => {
      try {
        const r = await callPaymentApi("generate-tax-report", {
          action: "list_branches",
        });
        const list: BranchOpt[] = r.branches || [];
        setBranches(list);
        setSelectedBranchIds(list.map((b) => b.id)); // default: all
      } catch (e) {
        console.error("branches load failed", e);
      }
    })();
  }, []);

  const filteredRows = useMemo(() => {
    if (!search) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => r.customer_name.toLowerCase().includes(q));
  }, [rows, search]);

  const run = async () => {
    if (view === "gst-return") return; // Tab 3 in upcoming PR
    if (!dateFrom || !dateTo) {
      setError("Pick a date range");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (view === "customer") {
        const r = await callPaymentApi("generate-tax-report", {
          action: "customer_summary",
          branch_ids: selectedBranchIds,
          date_from: dateFrom,
          date_to: dateTo,
          basis,
          statuses,
        });
        setRows(r.rows || []);
        setTotalsByBranch(r.totals_by_branch || []);
        setGrand(
          r.grand_total || {
            invoices: 0,
            subtotal_cad: 0,
            tax_cad: 0,
            gross_cad: 0,
          },
        );
      } else if (view === "vendor") {
        const r = await callPaymentApi("generate-tax-report", {
          action: "vendor_summary",
          branch_ids: selectedBranchIds,
          date_from: dateFrom,
          date_to: dateTo,
          basis,
        });
        setVendorRows(r.rows || []);
        setVendorTotalsByBranch(r.totals_by_branch || []);
        setVendorGrand(
          r.grand_total || {
            invoices: 0,
            subtotal_cad: 0,
            itc_cad: 0,
            gross_cad: 0,
          },
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setRows([]);
      setTotalsByBranch([]);
      setGrand({ invoices: 0, subtotal_cad: 0, tax_cad: 0, gross_cad: 0 });
      setVendorRows([]);
      setVendorTotalsByBranch([]);
      setVendorGrand({ invoices: 0, subtotal_cad: 0, itc_cad: 0, gross_cad: 0 });
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch when filter inputs settle
  useEffect(() => {
    if (
      view === "customer" &&
      dateFrom &&
      dateTo &&
      selectedBranchIds.length >= 0 // even 0 = explicit none
    ) {
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, dateFrom, dateTo, selectedBranchIds.join(","), basis, statuses.join(",")]);

  const toggleBranch = (id: number) => {
    setSelectedBranchIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const exportSummaryCsv = () => {
    const header = [
      "Branch",
      "Customer",
      "Tax Exempt",
      "Currency",
      "Invoices",
      "Subtotal Native",
      "Tax Native",
      "Gross Native",
      "Subtotal CAD",
      "Tax CAD",
      "Gross CAD",
    ];
    const data = filteredRows.map((r) => [
      r.branch_name || "(unassigned)",
      r.customer_name,
      r.is_tax_exempt ? "Yes" : "No",
      r.currency,
      r.invoices,
      r.subtotal_native.toFixed(2),
      r.tax_native.toFixed(2),
      r.gross_native.toFixed(2),
      r.subtotal_cad.toFixed(2),
      r.tax_cad.toFixed(2),
      r.gross_cad.toFixed(2),
    ]);
    downloadCsv(
      `customer-tax-${dateFrom}-to-${dateTo}.csv`,
      [header, ...data],
    );
  };

  const exportVendorSummaryCsv = () => {
    const header = [
      "Branch",
      "Vendor",
      "Invoices",
      "Subtotal CAD",
      "ITC CAD",
      "Gross CAD",
    ];
    const data = vendorRows
      .filter((r) =>
        !search ? true : r.vendor_name.toLowerCase().includes(search.toLowerCase()),
      )
      .map((r) => [
        r.branch_name,
        r.vendor_name,
        r.invoices,
        r.subtotal_cad.toFixed(2),
        r.itc_cad.toFixed(2),
        r.gross_cad.toFixed(2),
      ]);
    downloadCsv(`vendor-tax-${dateFrom}-to-${dateTo}.csv`, [header, ...data]);
  };

  const exportVendorDetailCsv = async () => {
    setLoading(true);
    try {
      const r = await callPaymentApi("generate-tax-report", {
        action: "vendor_detail",
        branch_ids: selectedBranchIds,
        date_from: dateFrom,
        date_to: dateTo,
        basis,
        search,
      });
      const header = [
        "Branch",
        "Vendor",
        "Source",
        "Invoice #",
        "Invoice Date",
        "Status",
        "Payment Status",
        "Subtotal CAD",
        "ITC CAD",
        "Gross CAD",
      ];
      const data = (r.rows || []).map((x: Record<string, unknown>) => [
        x.branch_name,
        x.vendor_name,
        x.source,
        x.invoice_number,
        x.invoice_date,
        x.status,
        x.payment_status,
        Number(x.subtotal_cad ?? 0).toFixed(2),
        Number(x.tax_cad ?? 0).toFixed(2),
        Number(x.gross_cad ?? 0).toFixed(2),
      ]);
      downloadCsv(
        `vendor-tax-detail-${dateFrom}-to-${dateTo}.csv`,
        [header, ...data],
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const exportDetailCsv = async () => {
    setLoading(true);
    try {
      const r = await callPaymentApi("generate-tax-report", {
        action: "customer_detail",
        branch_ids: selectedBranchIds,
        date_from: dateFrom,
        date_to: dateTo,
        basis,
        statuses,
        search,
      });
      const header = [
        "Branch",
        "Invoice #",
        "Invoice Date",
        "Status",
        "Customer",
        "Tax Exempt",
        "Currency",
        "Subtotal Native",
        "Tax Native",
        "Gross Native",
        "Subtotal CAD",
        "Tax CAD",
        "Gross CAD",
        "Paid CAD",
        "Balance Due Native",
        "Exchange Rate to CAD",
      ];
      const data = (r.rows || []).map((x: Record<string, unknown>) => [
        (x.branch_name as string) || "(unassigned)",
        x.invoice_number,
        x.invoice_date,
        x.status,
        x.customer_name,
        x.is_tax_exempt ? "Yes" : "No",
        x.currency,
        Number(x.subtotal_native ?? 0).toFixed(2),
        Number(x.tax_native ?? 0).toFixed(2),
        Number(x.gross_native ?? 0).toFixed(2),
        Number(x.subtotal_cad ?? 0).toFixed(2),
        Number(x.tax_cad ?? 0).toFixed(2),
        Number(x.gross_cad ?? 0).toFixed(2),
        Number(x.paid_cad ?? 0).toFixed(2),
        Number(x.balance_due_native ?? 0).toFixed(2),
        x.exchange_rate_to_cad ?? "",
      ]);
      downloadCsv(
        `customer-tax-detail-${dateFrom}-to-${dateTo}.csv`,
        [header, ...data],
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-teal-600" />
          Tax Reports
        </h1>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-4 border-b">
        {[
          { v: "customer", label: "Customer Tax (Output GST)" },
          { v: "vendor", label: "Vendor Tax (ITCs)" },
          { v: "gst-return", label: "GST/HST Return" },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => setView(t.v as View)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              view === (t.v as View)
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as Preset)}
              className="px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-teal-500"
            >
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setPreset("custom");
                setDateFrom(e.target.value);
              }}
              className="px-2 py-1.5 text-sm border rounded-lg"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setPreset("custom");
                setDateTo(e.target.value);
              }}
              className="px-2 py-1.5 text-sm border rounded-lg"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-500">Basis:</span>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                checked={basis === "accrual"}
                onChange={() => setBasis("accrual")}
              />
              Accrual
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                checked={basis === "cash"}
                onChange={() => setBasis("cash")}
              />
              Cash
            </label>
          </div>
        </div>

        {/* Branch multi-select */}
        <div className="flex flex-wrap items-center gap-2">
          <Building2 className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-500 mr-1">Branches:</span>
          {branches.map((b) => {
            const active = selectedBranchIds.includes(b.id);
            return (
              <button
                key={b.id}
                onClick={() => toggleBranch(b.id)}
                className={`px-3 py-1 text-xs rounded-full border ${
                  active
                    ? "bg-teal-50 border-teal-300 text-teal-800"
                    : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                }`}
              >
                {b.legal_name}
              </button>
            );
          })}
          <button
            onClick={() => setSelectedBranchIds(branches.map((b) => b.id))}
            className="ml-2 text-xs text-teal-700 hover:underline"
          >
            All
          </button>
          <button
            onClick={() => setSelectedBranchIds([])}
            className="text-xs text-gray-500 hover:underline"
          >
            None
          </button>
        </div>

        {/* Status + search */}
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-500 mr-1">Status:</span>
          {STATUS_OPTIONS.map((s) => {
            const active = statuses.includes(s);
            return (
              <button
                key={s}
                onClick={() =>
                  setStatuses((prev) =>
                    prev.includes(s)
                      ? prev.filter((x) => x !== s)
                      : [...prev, s],
                  )
                }
                className={`px-2 py-0.5 text-xs rounded border ${
                  active
                    ? "bg-teal-50 border-teal-300 text-teal-800"
                    : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                }`}
              >
                {s}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Customer name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-2 py-1 text-sm border rounded-lg w-48"
            />
            <button
              onClick={() => run()}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      {view === "gst-return" ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-gray-500">
          <p className="mb-1 font-medium">GST/HST Return tab coming in the next PR.</p>
          <p className="text-xs text-gray-400">
            Will combine Customer tax (Line 103) + Vendor ITCs (Line 106) + manual adjustments
            into a CRA working-copy layout per branch.
          </p>
        </div>
      ) : view === "vendor" ? (
        <VendorView
          loading={loading}
          error={error}
          rows={vendorRows}
          totalsByBranch={vendorTotalsByBranch}
          grand={vendorGrand}
          search={search}
          onExportSummary={() => exportVendorSummaryCsv()}
          onExportDetail={() => exportVendorDetailCsv()}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide">
                Invoices
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {grand.invoices.toLocaleString()}
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide">
                Subtotal (Line 101)
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(grand.subtotal_cad, "CAD")}
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4 border-teal-200">
              <div className="text-xs text-teal-700 uppercase tracking-wide">
                GST Collected (Line 103)
              </div>
              <div className="text-2xl font-bold text-teal-700">
                {formatCurrency(grand.tax_cad, "CAD")}
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide">
                Gross
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(grand.gross_cad, "CAD")}
              </div>
            </div>
          </div>

          {/* Branch totals */}
          {totalsByBranch.length > 1 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                By branch
              </h3>
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="text-left py-1">Branch</th>
                    <th className="text-right py-1">Invoices</th>
                    <th className="text-right py-1">Subtotal CAD</th>
                    <th className="text-right py-1">Tax CAD</th>
                    <th className="text-right py-1">Gross CAD</th>
                  </tr>
                </thead>
                <tbody>
                  {totalsByBranch.map((t, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1">
                        {t.branch_name || "(unassigned)"}
                      </td>
                      <td className="py-1 text-right">{t.invoices}</td>
                      <td className="py-1 text-right">
                        {formatCurrency(t.subtotal_cad, "CAD")}
                      </td>
                      <td className="py-1 text-right text-teal-700 font-medium">
                        {formatCurrency(t.tax_cad, "CAD")}
                      </td>
                      <td className="py-1 text-right">
                        {formatCurrency(t.gross_cad, "CAD")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Export buttons */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Customer detail
            </h3>
            <div className="flex gap-2">
              <button
                onClick={exportSummaryCsv}
                disabled={loading || filteredRows.length === 0}
                className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                Summary CSV
              </button>
              <button
                onClick={exportDetailCsv}
                disabled={loading}
                className="px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded-lg flex items-center gap-1 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                Detail CSV (per-invoice)
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-teal-600 mx-auto" />
              </div>
            ) : error ? (
              <div className="p-6 text-sm text-red-600">{error}</div>
            ) : filteredRows.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                No invoices for selected filters
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="text-left px-3 py-2">Branch</th>
                      <th className="text-left px-3 py-2">Customer</th>
                      <th className="text-left px-3 py-2">Ccy</th>
                      <th className="text-right px-3 py-2">Invoices</th>
                      <th className="text-right px-3 py-2">Subtotal Native</th>
                      <th className="text-right px-3 py-2">Tax Native</th>
                      <th className="text-right px-3 py-2">Gross Native</th>
                      <th className="text-right px-3 py-2">Subtotal CAD</th>
                      <th className="text-right px-3 py-2">Tax CAD</th>
                      <th className="text-right px-3 py-2">Gross CAD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredRows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-xs text-gray-500">
                          {r.branch_name || "(unassigned)"}
                        </td>
                        <td className="px-3 py-1.5">
                          {r.customer_name}
                          {r.is_tax_exempt && (
                            <span className="ml-1 inline-block px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px]">
                              exempt
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-xs">{r.currency}</td>
                        <td className="px-3 py-1.5 text-right">{r.invoices}</td>
                        <td className="px-3 py-1.5 text-right">
                          {r.subtotal_native.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {r.tax_native.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {r.gross_native.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {r.subtotal_cad.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-right text-teal-700 font-medium">
                          {r.tax_cad.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium">
                          {r.gross_cad.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Vendor view sub-component
// ============================================================================

interface VendorViewProps {
  loading: boolean;
  error: string | null;
  rows: VendorRow[];
  totalsByBranch: VendorBranchTotal[];
  grand: VendorGrand;
  search: string;
  onExportSummary: () => void;
  onExportDetail: () => void;
  dateFrom: string;
  dateTo: string;
}

function VendorView({
  loading,
  error,
  rows,
  totalsByBranch,
  grand,
  search,
  onExportSummary,
  onExportDetail,
}: VendorViewProps) {
  const filteredRows = !search
    ? rows
    : rows.filter((r) =>
        r.vendor_name.toLowerCase().includes(search.toLowerCase()),
      );

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">
            Invoices
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {grand.invoices.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">
            Vendor Subtotal
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(grand.subtotal_cad, "CAD")}
          </div>
        </div>
        <div className="bg-white border border-teal-200 rounded-lg p-4">
          <div className="text-xs text-teal-700 uppercase tracking-wide">
            ITCs (Line 106)
          </div>
          <div className="text-2xl font-bold text-teal-700">
            {formatCurrency(grand.itc_cad, "CAD")}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">
            Gross Paid
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(grand.gross_cad, "CAD")}
          </div>
        </div>
      </div>

      {/* Branch totals */}
      {totalsByBranch.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            By branch
          </h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left py-1">Branch</th>
                <th className="text-right py-1">Invoices</th>
                <th className="text-right py-1">Subtotal CAD</th>
                <th className="text-right py-1">ITC CAD</th>
                <th className="text-right py-1">Gross CAD</th>
              </tr>
            </thead>
            <tbody>
              {totalsByBranch.map((t, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1">{t.branch_name}</td>
                  <td className="py-1 text-right">{t.invoices}</td>
                  <td className="py-1 text-right">
                    {formatCurrency(t.subtotal_cad, "CAD")}
                  </td>
                  <td className="py-1 text-right text-teal-700 font-medium">
                    {formatCurrency(t.itc_cad, "CAD")}
                  </td>
                  <td className="py-1 text-right">
                    {formatCurrency(t.gross_cad, "CAD")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Export */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">Vendor detail</h3>
        <div className="flex gap-2">
          <button
            onClick={onExportSummary}
            disabled={loading || filteredRows.length === 0}
            className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Summary CSV
          </button>
          <button
            onClick={onExportDetail}
            disabled={loading}
            className="px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded-lg flex items-center gap-1 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Detail CSV (per-invoice)
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600 mx-auto" />
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            No vendor invoices for selected filters
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Branch</th>
                  <th className="text-left px-3 py-2">Vendor</th>
                  <th className="text-right px-3 py-2">Invoices</th>
                  <th className="text-right px-3 py-2">Subtotal CAD</th>
                  <th className="text-right px-3 py-2">ITC CAD</th>
                  <th className="text-right px-3 py-2">Gross CAD</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRows.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-xs text-gray-500">
                      {r.branch_name}
                    </td>
                    <td className="px-3 py-1.5">{r.vendor_name}</td>
                    <td className="px-3 py-1.5 text-right">{r.invoices}</td>
                    <td className="px-3 py-1.5 text-right">
                      {r.subtotal_cad.toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-teal-700 font-medium">
                      {r.itc_cad.toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium">
                      {r.gross_cad.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
