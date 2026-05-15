/**
 * VendorActivationDripProgress
 *
 * Collapsible pipeline panel on the admin Vendors list. Two sections:
 *  1) Activation-email drip stats (sent / activated / backlog).
 *  2) Recruitment queue (new applications + tests pending review).
 *
 * Reads `get_vendor_activation_drip_stats` — single round trip, no
 * client-side fan-out.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  FileText,
  ClipboardCheck,
  UserPlus,
  AlertTriangle,
  ArrowRight,
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
  apps_pending_review: number;
  apps_staff_review: number;
  apps_info_requested: number;
  apps_new_7d: number;
  tests_pending_review: number;
  tests_stale_sent: number;
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
              Vendor pipeline overview
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {stats ? (
                <>
                  {stats.unique_emailed} emailed · {stats.activated} activated
                  {stats.activation_rate !== null
                    ? ` (${stats.activation_rate}%)`
                    : ""}
                  {stats.apps_pending_review > 0 && (
                    <span className="ml-2 text-orange-700">
                      · {stats.apps_pending_review} app
                      {stats.apps_pending_review === 1 ? "" : "s"} to review
                    </span>
                  )}
                  {stats.tests_pending_review > 0 && (
                    <span className="ml-2 text-indigo-700">
                      · {stats.tests_pending_review} test
                      {stats.tests_pending_review === 1 ? "" : "s"} to review
                    </span>
                  )}
                  {!stats.enabled && (
                    <span className="ml-2 text-amber-700">· drip paused</span>
                  )}
                </>
              ) : (
                "Click to load"
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

              <div className="border-t border-gray-200 mt-5 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Recruitment queue
                  </h3>
                  <Link
                    to="/admin/recruitment"
                    className="text-xs font-medium text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1"
                  >
                    View all
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <LinkStat
                    icon={FileText}
                    label="Apps awaiting review"
                    value={stats.apps_pending_review.toLocaleString()}
                    hint={
                      stats.apps_info_requested > 0
                        ? `${stats.apps_staff_review} staff review · ${stats.apps_info_requested} info requested`
                        : `${stats.apps_staff_review} in staff review`
                    }
                    color="orange"
                    to="/admin/recruitment?tab=attention"
                  />
                  <LinkStat
                    icon={ClipboardCheck}
                    label="Tests pending review"
                    value={stats.tests_pending_review.toLocaleString()}
                    hint="submitted or AI-assessed"
                    color="indigo"
                    to="/admin/recruitment?tab=tests"
                  />
                  <LinkStat
                    icon={UserPlus}
                    label="New apps (7d)"
                    value={stats.apps_new_7d.toLocaleString()}
                    hint="created in last 7 days"
                    color="green"
                    to="/admin/recruitment?tab=all"
                  />
                  <LinkStat
                    icon={AlertTriangle}
                    label="Stale test invites"
                    value={stats.tests_stale_sent.toLocaleString()}
                    hint="sent > 14 days ago, no submission"
                    color="amber"
                    to="/admin/recruitment?tab=tests"
                  />
                </div>
              </div>

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

type StatColor = "indigo" | "green" | "amber" | "blue" | "orange";

const STAT_COLOR_MAP: Record<StatColor, string> = {
  indigo: "text-indigo-600 bg-indigo-50",
  green: "text-green-600 bg-green-50",
  amber: "text-amber-600 bg-amber-50",
  blue: "text-blue-600 bg-blue-50",
  orange: "text-orange-600 bg-orange-50",
};

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
  color: StatColor;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`p-1.5 rounded ${STAT_COLOR_MAP[color]}`}>
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

function LinkStat({
  icon: Icon,
  label,
  value,
  hint,
  color,
  to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  color: StatColor;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="block border border-gray-200 rounded-lg p-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors group"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`p-1.5 rounded ${STAT_COLOR_MAP[color]}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs font-medium text-gray-500 leading-tight">
          {label}
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <div className="text-xl font-semibold text-gray-900">{value}</div>
        <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-indigo-500 transition-colors" />
      </div>
      {hint && (
        <div className="text-xs text-gray-500 mt-0.5 truncate">{hint}</div>
      )}
    </Link>
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
