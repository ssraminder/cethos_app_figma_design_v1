/**
 * VendorActivationDripProgress
 *
 * Collapsible progress card on the admin Vendors list. Shows how the
 * activation-email drip is doing so VM can decide when to move to the
 * next phase. Reads `get_vendor_activation_drip_stats` — single round
 * trip, no client-side fan-out.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ChevronDown,
  Mail,
  CheckCircle2,
  Clock,
  Users,
  RefreshCcw,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface DripStats {
  total_sent: number;
  unique_emailed: number;
  activated: number;
  activation_rate: number | null;
  in_scope_total: number;
  passing_gates_total: number;
  still_needs_gates_total: number;
  backlog_ready_now: number;
  dedup_window_count: number;
  last_run_at: string | null;
  last_run_sent: number | null;
  batch_size: number;
  cron_expression: string;
  enabled: boolean;
}

const STORAGE_KEY = "vendors.drip_progress_open";

function formatTimestamp(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleString();
}

function describeCron(expr: string): string {
  const presets: Record<string, string> = {
    "*/5 * * * *": "every 5 min",
    "*/15 * * * *": "every 15 min",
    "*/30 * * * *": "every 30 min",
    "0 * * * *": "hourly",
    "0 */2 * * *": "every 2 hours",
    "0 */6 * * *": "every 6 hours",
    "0 14 * * *": "daily at 14:00 UTC",
  };
  return presets[expr] ?? expr;
}

export function VendorActivationDripProgress({
  onOpenScheduleModal,
}: {
  onOpenScheduleModal: () => void;
}) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  const [stats, setStats] = useState<DripStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc(
        "get_vendor_activation_drip_stats",
      );
      if (rpcErr) throw rpcErr;
      setStats(data as DripStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 mb-6 overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <Mail className="w-4 h-4 text-indigo-600" />
          <div>
            <div className="text-sm font-semibold text-gray-900">
              Activation drip progress
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {stats
                ? `${stats.unique_emailed} emailed · ${stats.activated} activated${stats.activation_rate !== null ? ` (${stats.activation_rate}%)` : ""}`
                : "Click to load"}
              {stats && !stats.enabled && (
                <span className="ml-2 text-amber-700">· drip paused</span>
              )}
            </div>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-gray-200 px-4 py-4">
          {loading && !stats && (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="break-all">{error}</span>
            </div>
          )}

          {stats && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Stat
                  icon={Mail}
                  label="Emails sent (all time)"
                  value={stats.total_sent.toLocaleString()}
                  hint={`${stats.unique_emailed.toLocaleString()} unique vendors`}
                  color="indigo"
                />
                <Stat
                  icon={CheckCircle2}
                  label="Accounts activated"
                  value={stats.activated.toLocaleString()}
                  hint={
                    stats.activation_rate !== null
                      ? `${stats.activation_rate}% of emailed`
                      : "no emails yet"
                  }
                  color="green"
                />
                <Stat
                  icon={Users}
                  label="Still needs activation"
                  value={stats.still_needs_gates_total.toLocaleString()}
                  hint={`${stats.backlog_ready_now.toLocaleString()} ready now`}
                  color="amber"
                />
                <Stat
                  icon={Clock}
                  label="Last run"
                  value={formatTimestamp(stats.last_run_at)}
                  hint={
                    stats.last_run_sent !== null
                      ? `sent ${stats.last_run_sent} · ${describeCron(stats.cron_expression)}`
                      : describeCron(stats.cron_expression)
                  }
                  color="blue"
                />
              </div>

              <div className="text-xs text-gray-500 mb-3">
                "Activated" = passes onboarding gates (NDA signed + CV
                uploaded, or NDA-only for agencies) — the same filter the
                cron uses to skip a vendor.{" "}
                {stats.dedup_window_count > 0 && (
                  <>
                    {stats.dedup_window_count.toLocaleString()} vendors are
                    in the 7-day dedup window and will roll back into the
                    pool as it expires.
                  </>
                )}
              </div>

              <ProgressBar
                emailed={stats.unique_emailed}
                activated={stats.activated}
                inScope={stats.in_scope_total}
                passing={stats.passing_gates_total}
              />

              <div className="flex items-center gap-2 mt-4">
                <button
                  type="button"
                  onClick={load}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCcw className="w-3.5 h-3.5" />
                  )}
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={onOpenScheduleModal}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-200 bg-indigo-50 rounded-md hover:bg-indigo-100"
                >
                  Manage drip…
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  color: "indigo" | "green" | "amber" | "blue";
}) {
  const colorMap = {
    indigo: "text-indigo-600 bg-indigo-50",
    green: "text-green-600 bg-green-50",
    amber: "text-amber-600 bg-amber-50",
    blue: "text-blue-600 bg-blue-50",
  };
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`p-1.5 rounded ${colorMap[color]}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs font-medium text-gray-500 leading-tight">
          {label}
        </span>
      </div>
      <div className="text-xl font-semibold text-gray-900">{value}</div>
      {hint && (
        <div className="text-xs text-gray-500 mt-0.5 truncate">{hint}</div>
      )}
    </div>
  );
}

function ProgressBar({
  emailed,
  activated,
  inScope,
  passing,
}: {
  emailed: number;
  activated: number;
  inScope: number;
  passing: number;
}) {
  if (inScope === 0) return null;
  const passingPct = Math.min(100, (passing / inScope) * 100);
  const emailedNotActivated = Math.max(0, emailed - activated);
  const emailedNotActivatedPct = Math.min(
    100 - passingPct,
    (emailedNotActivated / inScope) * 100,
  );
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{inScope.toLocaleString()} active vendors</span>
        <span>{passing.toLocaleString()} pass gates</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
        <div
          className="bg-green-500 h-full"
          style={{ width: `${passingPct}%` }}
          title={`${passing.toLocaleString()} pass gates`}
        />
        <div
          className="bg-amber-400 h-full"
          style={{ width: `${emailedNotActivatedPct}%` }}
          title={`${emailedNotActivated.toLocaleString()} emailed, not yet activated`}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />
          activated
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />
          emailed, pending
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-gray-200 mr-1" />
          not yet emailed
        </span>
      </div>
    </div>
  );
}
