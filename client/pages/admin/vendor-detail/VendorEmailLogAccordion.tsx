/**
 * VendorEmailLogAccordion
 *
 * Surfaces every email Cethos has tried to send this vendor (via Brevo)
 * from the `notification_log` table. Each row is a send attempt — staff
 * see when, what event, subject, success/failure, and any Brevo error.
 *
 * Live Brevo delivery events (delivered/opened/bounced) aren't here
 * yet — that needs a Brevo webhook ingest. This accordion shows the
 * "we tried to send X" trail which already covers most debugging
 * questions ("did this vendor get the activation email?").
 *
 * Date filter: Today / Yesterday / Last 7 days / Last 30 days /
 * All time / Custom (from..to).
 */

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  ChevronDown,
  ChevronRight,
  Mail,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

interface NotificationRow {
  id: string;
  event_type: string;
  recipient_email: string | null;
  recipient_name: string | null;
  recipient_id: string | null;
  subject: string | null;
  status: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface Props {
  vendorId: string;
  vendorEmail: string | null;
}

type DatePreset = "today" | "yesterday" | "last7" | "last30" | "all" | "custom";

const PRESET_LABEL: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  all: "All time",
  custom: "Custom range",
};

function presetWindow(preset: DatePreset): { from: Date | null; to: Date | null } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":
      return { from: startOfToday, to: now };
    case "yesterday": {
      const startOfYesterday = new Date(startOfToday);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);
      return { from: startOfYesterday, to: startOfToday };
    }
    case "last7": {
      const from = new Date(startOfToday);
      from.setDate(from.getDate() - 6);
      return { from, to: now };
    }
    case "last30": {
      const from = new Date(startOfToday);
      from.setDate(from.getDate() - 29);
      return { from, to: now };
    }
    case "all":
    case "custom":
      return { from: null, to: null };
  }
}

function fmtDateTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function statusBadge(status: string | null): { label: string; cls: string } {
  switch ((status ?? "").toLowerCase()) {
    case "sent":
      return { label: "Sent", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "failed":
      return { label: "Failed", cls: "bg-red-50 text-red-700 border-red-200" };
    case "queued":
      return { label: "Queued", cls: "bg-amber-50 text-amber-700 border-amber-200" };
    default:
      return { label: status || "—", cls: "bg-gray-50 text-gray-700 border-gray-200" };
  }
}

export default function VendorEmailLogAccordion({ vendorId, vendorEmail }: Props) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<DatePreset>("last30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const dateWindow = useMemo(() => {
    if (preset === "custom") {
      const from = customFrom ? new Date(customFrom + "T00:00:00") : null;
      const to = customTo ? new Date(customTo + "T23:59:59.999") : null;
      return { from, to };
    }
    return presetWindow(preset);
  }, [preset, customFrom, customTo]);

  const fetchRows = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      // recipient_id matches new rows; recipient_email catches any rows
      // that pre-date vendor_id wiring (or one-off broadcast sends).
      let q = supabase
        .from("notification_log")
        .select("id, event_type, recipient_email, recipient_name, recipient_id, subject, status, error_message, metadata, created_at")
        .or(`recipient_id.eq.${vendorId}${vendorEmail ? `,recipient_email.eq.${vendorEmail}` : ""}`)
        .order("created_at", { ascending: false })
        .limit(500);

      if (dateWindow.from) q = q.gte("created_at", dateWindow.from.toISOString());
      if (dateWindow.to) q = q.lte("created_at", dateWindow.to.toISOString());

      const { data, error: qErr } = await q;
      if (qErr) throw qErr;
      setRows((data ?? []) as NotificationRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load email log");
    } finally {
      setLoading(false);
    }
  }, [open, vendorId, vendorEmail, dateWindow.from, dateWindow.to]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  return (
    <div className="mt-6 bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Mail className="w-4 h-4 text-teal-600" />
          <span className="text-sm font-semibold text-gray-900">Email log</span>
          {open && rows.length > 0 && (
            <span className="text-xs text-gray-500">({rows.length} {rows.length === 1 ? "entry" : "entries"})</span>
          )}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 p-5 space-y-4">
          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(PRESET_LABEL) as DatePreset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  preset === p
                    ? "bg-teal-600 text-white border-teal-600"
                    : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                }`}
              >
                {PRESET_LABEL[p]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void fetchRows()}
              disabled={loading}
              className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border border-gray-200 hover:border-gray-300 text-gray-700"
              title="Reload"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {preset === "custom" && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              {(!customFrom || !customTo) && (
                <span className="text-xs text-gray-500">Pick a date range to filter.</span>
              )}
            </div>
          )}

          {/* Table */}
          {error ? (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading email log…
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              No emails recorded for this vendor in the selected window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-200">
                    <th className="py-2 pr-3 font-medium text-gray-600">When</th>
                    <th className="py-2 pr-3 font-medium text-gray-600">Event</th>
                    <th className="py-2 pr-3 font-medium text-gray-600">Subject</th>
                    <th className="py-2 pr-3 font-medium text-gray-600">Status</th>
                    <th className="py-2 font-medium text-gray-600">To</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const badge = statusBadge(r.status);
                    const isExpanded = expandedRowId === r.id;
                    return (
                      <React.Fragment key={r.id}>
                        <tr
                          className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                          onClick={() => setExpandedRowId(isExpanded ? null : r.id)}
                        >
                          <td className="py-2 pr-3 text-gray-700 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                          <td className="py-2 pr-3 text-gray-700 font-mono text-xs">{r.event_type}</td>
                          <td className="py-2 pr-3 text-gray-900 max-w-md truncate" title={r.subject ?? ""}>
                            {r.subject || <span className="text-gray-400">—</span>}
                          </td>
                          <td className="py-2 pr-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${badge.cls}`}>
                              {r.status === "sent" && <CheckCircle2 className="w-3 h-3" />}
                              {r.status === "failed" && <AlertCircle className="w-3 h-3" />}
                              {badge.label}
                            </span>
                          </td>
                          <td className="py-2 text-gray-600 text-xs">{r.recipient_email || "—"}</td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <td colSpan={5} className="py-3 px-3 text-xs text-gray-700">
                              {r.error_message && (
                                <div className="mb-2">
                                  <span className="font-semibold text-red-700">Error: </span>
                                  <span className="text-red-700 font-mono">{r.error_message}</span>
                                </div>
                              )}
                              {r.metadata && Object.keys(r.metadata).length > 0 && (
                                <details>
                                  <summary className="cursor-pointer text-gray-600">Metadata</summary>
                                  <pre className="mt-1 p-2 bg-white border border-gray-200 rounded overflow-x-auto text-[11px] font-mono text-gray-800">
                                    {JSON.stringify(r.metadata, null, 2)}
                                  </pre>
                                </details>
                              )}
                              {!r.error_message && (!r.metadata || Object.keys(r.metadata).length === 0) && (
                                <span className="text-gray-500">No additional detail recorded.</span>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] text-gray-500">
            Showing send attempts logged in <code>notification_log</code> (Cethos → Brevo). Live Brevo delivery events
            (delivered, opened, bounced) are not yet ingested.
          </p>
        </div>
      )}
    </div>
  );
}
