import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Loader2,
  Pencil,
  Check,
  X,
  Trash2,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

interface ExchangeRate {
  id: string;
  rate_date: string;
  mid_market_rate: number | null;
  mid_market_low: number | null;
  mid_market_avg: number | null;
  boc_rate: number | null;
  approx_bank_rate: number | null;
  actual_rbc_rate: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const PAGE_SIZE = 30;

function fmt(val: number | null, decimals = 4): string {
  if (val == null) return "—";
  return Number(val).toFixed(decimals);
}

function pctFmt(val: number | null): string {
  if (val == null) return "—";
  return `${val >= 0 ? "+" : ""}${Number(val).toFixed(2)}%`;
}

function DiffBadge({ value, label }: { value: number | null; label: string }) {
  if (value == null) return <span className="text-xs text-gray-400">—</span>;
  const isPositive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? "text-red-600" : "text-green-600"}`}
      title={label}
    >
      {isPositive ? (
        <TrendingUp className="w-3 h-3" />
      ) : (
        <TrendingDown className="w-3 h-3" />
      )}
      {pctFmt(value)}
    </span>
  );
}

export default function ExchangeRates() {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [obsCounts, setObsCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRates = useCallback(async () => {
    setLoading(true);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await supabase
        .from("exchange_rates")
        .select("*", { count: "exact" })
        .order("rate_date", { ascending: false })
        .range(from, to);

      if (error) throw error;
      setRates(data || []);
      setTotalCount(count || 0);

      // Fetch observation counts for visible dates
      if (data && data.length > 0) {
        const dates = data.map((r: ExchangeRate) => r.rate_date);
        const { data: obs } = await supabase
          .from("exchange_rate_observations")
          .select("rate_date")
          .in("rate_date", dates);
        if (obs) {
          const counts: Record<string, number> = {};
          obs.forEach((o: { rate_date: string }) => {
            counts[o.rate_date] = (counts[o.rate_date] || 0) + 1;
          });
          setObsCounts(counts);
        }
      }
    } catch (err: any) {
      toast.error("Failed to load exchange rates: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  // Fetch rates: insert observation, then refresh daily summary via DB function
  const fetchTodayRates = async () => {
    setFetching(true);
    try {
      // Fetch both APIs in parallel
      const [midMarketRes, bocRes] = await Promise.allSettled([
        fetch("https://open.er-api.com/v6/latest/USD"),
        fetch(
          "https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1"
        ),
      ]);

      let midRate: number | null = null;
      if (midMarketRes.status === "fulfilled" && midMarketRes.value.ok) {
        const midData = await midMarketRes.value.json();
        midRate = midData?.rates?.CAD ?? null;
      }

      let bocRate: number | null = null;
      if (bocRes.status === "fulfilled" && bocRes.value.ok) {
        const bocData = await bocRes.value.json();
        const bocObs = bocData?.observations?.[0];
        bocRate = bocObs ? parseFloat(bocObs.FXUSDCAD?.v) : null;
      }

      if (!midRate && !bocRate) throw new Error("Both rate APIs failed");
      if (!midRate) midRate = bocRate;
      if (!bocRate) bocRate = midRate;

      const today = new Date().toISOString().split("T")[0];

      // 1. Insert raw observation
      const { error: obsError } = await supabase
        .from("exchange_rate_observations")
        .insert({
          rate_date: today,
          source: "manual",
          mid_market_rate: midRate,
          boc_rate: bocRate,
        });

      if (obsError) throw obsError;

      // 2. Refresh daily summary (DB picks lowest mid-market, latest BoC)
      const { error: rpcError } = await supabase.rpc(
        "refresh_daily_exchange_rate",
        { target_date: today }
      );

      if (rpcError) throw rpcError;

      toast.success(
        `Observation recorded: Mid = ${midRate!.toFixed(4)}, BoC = ${bocRate!.toFixed(4)} — daily summary refreshed (lowest kept)`
      );
      fetchRates();
    } catch (err: any) {
      toast.error("Failed to fetch rates: " + err.message);
    } finally {
      setFetching(false);
    }
  };

  const startEdit = (rate: ExchangeRate) => {
    setEditingId(rate.id);
    setEditValue(rate.actual_rbc_rate != null ? String(rate.actual_rbc_rate) : "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const saveRbcRate = async (id: string) => {
    setSaving(true);
    try {
      const numVal = editValue.trim() === "" ? null : parseFloat(editValue);
      if (editValue.trim() !== "" && (isNaN(numVal!) || numVal! <= 0)) {
        toast.error("Please enter a valid positive number");
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from("exchange_rates")
        .update({ actual_rbc_rate: numVal })
        .eq("id", id);

      if (error) throw error;
      toast.success("RBC rate updated");
      setEditingId(null);
      setEditValue("");
      fetchRates();
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteRate = async (id: string, date: string) => {
    if (!confirm(`Delete rate for ${date}?`)) return;
    try {
      const { error } = await supabase
        .from("exchange_rates")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Rate deleted");
      fetchRates();
    } catch (err: any) {
      toast.error("Failed to delete: " + err.message);
    }
  };

  // Computed analysis values
  const computeDiff = (rate: ExchangeRate) => {
    const approx = rate.approx_bank_rate;
    const actual = rate.actual_rbc_rate;
    const mid = rate.mid_market_rate;

    const rateDiff =
      approx != null && actual != null ? Number(actual) - Number(approx) : null;

    const pctDiffFromMid =
      mid != null && actual != null && Number(mid) !== 0
        ? ((Number(actual) - Number(mid)) / Number(mid)) * 100
        : null;

    const approxPctFromMid =
      mid != null && approx != null && Number(mid) !== 0
        ? ((Number(approx) - Number(mid)) / Number(mid)) * 100
        : null;

    return { rateDiff, pctDiffFromMid, approxPctFromMid };
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            USD → CAD Exchange Rates
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track mid-market, BoC, and bank rates daily. Column E is editable
            for actual RBC rates.
          </p>
        </div>
        <button
          onClick={fetchTodayRates}
          disabled={fetching}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {fetching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Fetch Today's Rates
        </button>
      </div>

      {/* Legend */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 space-y-1">
        <p>
          <strong>B (Mid-Market):</strong> Latest real-time rate &nbsp;|&nbsp;
          <strong>Daily Low:</strong> Lowest mid-market observed today &nbsp;|&nbsp;
          <strong>Daily Avg:</strong> Average of all observations
        </p>
        <p>
          <strong>C (BoC):</strong> Bank of Canada official rate &nbsp;|&nbsp;
          <strong>D (Approx Bank):</strong> BoC − 3.1% markup &nbsp;|&nbsp;
          <strong>E (Actual RBC):</strong> Enter manually
        </p>
        <p className="text-blue-600 font-medium">
          Auto-fetched every 4 hours (8am–8pm ET). Each run is stored as an observation — low/avg computed from all runs.
        </p>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  <span className="flex items-center gap-1">
                    <ArrowUpDown className="w-3 h-3" /> Date (A)
                  </span>
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  Mid-Market (B)
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  Daily Low
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  Daily Avg
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  BoC Rate (C)
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  Approx Bank (D)
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  Actual RBC (E)
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  Diff (D vs E)
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  % from Mid
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                    <p className="text-sm text-gray-500 mt-2">
                      Loading rates...
                    </p>
                  </td>
                </tr>
              ) : rates.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-500">
                    No exchange rates recorded yet. Click "Fetch Today's Rates"
                    to get started.
                  </td>
                </tr>
              ) : (
                rates.map((rate) => {
                  const { rateDiff, pctDiffFromMid, approxPctFromMid } =
                    computeDiff(rate);
                  const isEditing = editingId === rate.id;

                  return (
                    <tr
                      key={rate.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                        {rate.rate_date}
                        {obsCounts[rate.rate_date] > 0 && (
                          <span
                            className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full"
                            title={`${obsCounts[rate.rate_date]} observation(s) recorded`}
                          >
                            {obsCounts[rate.rate_date]} obs
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">
                        {fmt(rate.mid_market_rate)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-green-700">
                        {fmt(rate.mid_market_low)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-500">
                        {fmt(rate.mid_market_avg)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">
                        {fmt(rate.boc_rate)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">
                        {fmt(rate.approx_bank_rate)}
                        {approxPctFromMid != null && (
                          <span className="block text-xs text-gray-400">
                            {pctFmt(approxPctFromMid)} markup
                          </span>
                        )}
                      </td>

                      {/* Editable Column E */}
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              step="0.0001"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-24 px-2 py-1 text-right text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveRbcRate(rate.id);
                                if (e.key === "Escape") cancelEdit();
                              }}
                            />
                            <button
                              onClick={() => saveRbcRate(rate.id)}
                              disabled={saving}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`font-mono cursor-pointer hover:text-blue-600 ${rate.actual_rbc_rate != null ? "text-gray-900" : "text-gray-300 italic"}`}
                            onClick={() => startEdit(rate)}
                            title="Click to edit actual RBC rate"
                          >
                            {rate.actual_rbc_rate != null
                              ? fmt(rate.actual_rbc_rate)
                              : "Click to enter"}
                          </span>
                        )}
                      </td>

                      {/* Diff (D vs E) */}
                      <td className="px-4 py-3 text-right">
                        {rateDiff != null ? (
                          <span
                            className={`font-mono text-xs ${rateDiff > 0 ? "text-red-600" : rateDiff < 0 ? "text-green-600" : "text-gray-500"}`}
                          >
                            {rateDiff > 0 ? "+" : ""}
                            {rateDiff.toFixed(4)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>

                      {/* % from Mid */}
                      <td className="px-4 py-3 text-right">
                        <DiffBadge
                          value={pctDiffFromMid}
                          label="% difference of actual RBC from mid-market"
                        />
                      </td>

                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {!isEditing && (
                            <button
                              onClick={() => startEdit(rate)}
                              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title="Edit RBC rate"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteRate(rate.id, rate.rate_date)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
