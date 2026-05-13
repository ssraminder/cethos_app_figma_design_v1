/**
 * VendorEmailLogAccordion
 *
 * Per-vendor email log. Each row is one send (notification_log) with an
 * expanded timeline of Brevo delivery events (brevo_email_events) joined
 * by brevo_message_id. Surfaces the full lifecycle:
 *
 *   sent → delivered → opened → clicked → ...
 *   sent → soft_bounce → hard_bounce
 *   sent → spam / unsubscribed
 *
 * Brevo webhook events flow into brevo_email_events via the brevo-webhook
 * edge function — set BREVO_WEBHOOK_SECRET in edge secrets and point
 * Brevo at .../functions/v1/brevo-webhook?secret=<value>.
 *
 * Date filter: Today / Yesterday / Last 7 days / Last 30 days / All time /
 * Custom range.
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
  Send,
  Eye,
  MousePointerClick,
  Ban,
  ShieldAlert,
  MailX,
  Clock,
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

interface BrevoEventRow {
  id: string;
  brevo_message_id: string;
  event: string;
  recipient_email: string;
  subject: string | null;
  reason: string | null;
  link: string | null;
  event_ts: string;
  raw_payload: Record<string, unknown>;
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

// Lifecycle status priority — higher number = "more recent / more terminal".
// We use this to pick the lifecycle "summary" badge per email.
const EVENT_PRIORITY: Record<string, number> = {
  request: 1,
  sent: 1,
  deferred: 2,
  queued: 2,
  soft_bounce: 3,
  delivered: 4,
  opened: 5,
  unique_opened: 5,
  click: 6,
  unsubscribed: 7,
  spam: 8,
  blocked: 9,
  invalid_email: 9,
  hard_bounce: 10,
  failed: 10,
};

const EVENT_META: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  sent:           { label: "Sent",          cls: "bg-sky-50 text-sky-700 border-sky-200",         Icon: Send },
  request:        { label: "Queued",        cls: "bg-sky-50 text-sky-700 border-sky-200",         Icon: Send },
  queued:         { label: "Queued",        cls: "bg-amber-50 text-amber-700 border-amber-200",   Icon: Clock },
  deferred:       { label: "Deferred",      cls: "bg-amber-50 text-amber-700 border-amber-200",   Icon: Clock },
  delivered:      { label: "Delivered",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  opened:         { label: "Opened",        cls: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: Eye },
  unique_opened:  { label: "Opened",        cls: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: Eye },
  click:          { label: "Clicked",       cls: "bg-violet-50 text-violet-700 border-violet-200", Icon: MousePointerClick },
  unsubscribed:   { label: "Unsubscribed",  cls: "bg-gray-100 text-gray-700 border-gray-300",     Icon: MailX },
  spam:           { label: "Spam",          cls: "bg-orange-50 text-orange-700 border-orange-200", Icon: ShieldAlert },
  soft_bounce:    { label: "Soft bounce",   cls: "bg-amber-50 text-amber-700 border-amber-200",   Icon: AlertCircle },
  hard_bounce:    { label: "Hard bounce",   cls: "bg-red-50 text-red-700 border-red-200",         Icon: Ban },
  blocked:        { label: "Blocked",       cls: "bg-red-50 text-red-700 border-red-200",         Icon: Ban },
  invalid_email:  { label: "Invalid email", cls: "bg-red-50 text-red-700 border-red-200",         Icon: Ban },
  failed:         { label: "Failed",        cls: "bg-red-50 text-red-700 border-red-200",         Icon: AlertCircle },
};

function eventMeta(event: string): { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> } {
  return EVENT_META[event] ?? { label: event, cls: "bg-gray-50 text-gray-700 border-gray-200", Icon: Mail };
}

export default function VendorEmailLogAccordion({ vendorId, vendorEmail }: Props) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<DatePreset>("last30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sends, setSends] = useState<NotificationRow[]>([]);
  const [events, setEvents] = useState<BrevoEventRow[]>([]);
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

  const fetchAll = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      // ── Sends from notification_log ───────────────────────────────
      let sendQ = supabase
        .from("notification_log")
        .select("id, event_type, recipient_email, recipient_name, recipient_id, subject, status, error_message, metadata, created_at")
        .or(`recipient_id.eq.${vendorId}${vendorEmail ? `,recipient_email.eq.${vendorEmail}` : ""}`)
        .order("created_at", { ascending: false })
        .limit(500);
      if (dateWindow.from) sendQ = sendQ.gte("created_at", dateWindow.from.toISOString());
      if (dateWindow.to) sendQ = sendQ.lte("created_at", dateWindow.to.toISOString());
      const sendsResp = await sendQ;
      if (sendsResp.error) throw sendsResp.error;
      const sendRows = (sendsResp.data ?? []) as NotificationRow[];
      setSends(sendRows);

      // ── Delivery events from brevo_email_events ───────────────────
      // Match by recipient_email since brevo_email_events doesn't carry
      // vendor_id. Pull a wider window so late events still join — we'll
      // filter in the UI to only those whose parent send is in window.
      if (vendorEmail) {
        let evQ = supabase
          .from("brevo_email_events")
          .select("id, brevo_message_id, event, recipient_email, subject, reason, link, event_ts, raw_payload")
          .eq("recipient_email", vendorEmail)
          .order("event_ts", { ascending: true })
          .limit(2000);
        if (dateWindow.from) evQ = evQ.gte("event_ts", dateWindow.from.toISOString());
        const evResp = await evQ;
        if (evResp.error) throw evResp.error;
        setEvents((evResp.data ?? []) as BrevoEventRow[]);
      } else {
        setEvents([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load email log");
    } finally {
      setLoading(false);
    }
  }, [open, vendorId, vendorEmail, dateWindow.from, dateWindow.to]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // Group brevo events by brevo_message_id for fast lookup per send row.
  const eventsByMsgId = useMemo(() => {
    const m = new Map<string, BrevoEventRow[]>();
    for (const ev of events) {
      const arr = m.get(ev.brevo_message_id) ?? [];
      arr.push(ev);
      m.set(ev.brevo_message_id, arr);
    }
    return m;
  }, [events]);

  // Decide what status badge to show for a given send.
  function summaryEventForSend(send: NotificationRow): string {
    const mid = (send.metadata?.brevo_message_id as string | undefined) ?? "";
    const evs = mid ? (eventsByMsgId.get(mid) ?? []) : [];
    if (evs.length === 0) {
      // No webhook data yet — fall back to our local status.
      if ((send.status ?? "").toLowerCase() === "failed") return "failed";
      return "sent";
    }
    // Pick the highest-priority event seen.
    let best: BrevoEventRow | null = null;
    let bestPri = -1;
    for (const e of evs) {
      const pri = EVENT_PRIORITY[e.event] ?? 0;
      if (pri > bestPri) { bestPri = pri; best = e; }
    }
    return best ? best.event : "sent";
  }

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
          {open && sends.length > 0 && (
            <span className="text-xs text-gray-500">({sends.length} {sends.length === 1 ? "send" : "sends"})</span>
          )}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 p-5 space-y-4">
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
              onClick={() => void fetchAll()}
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
            </div>
          )}

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
          ) : sends.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              No emails sent to this vendor in the selected window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-200">
                    <th className="py-2 pr-3 font-medium text-gray-600">When</th>
                    <th className="py-2 pr-3 font-medium text-gray-600">Event</th>
                    <th className="py-2 pr-3 font-medium text-gray-600">Subject</th>
                    <th className="py-2 pr-3 font-medium text-gray-600">Latest status</th>
                    <th className="py-2 font-medium text-gray-600">To</th>
                  </tr>
                </thead>
                <tbody>
                  {sends.map((r) => {
                    const summary = summaryEventForSend(r);
                    const meta = eventMeta(summary);
                    const Icon = meta.Icon;
                    const isExpanded = expandedRowId === r.id;
                    const mid = (r.metadata?.brevo_message_id as string | undefined) ?? "";
                    const lifecycle = mid ? (eventsByMsgId.get(mid) ?? []) : [];
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
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${meta.cls}`}>
                              <Icon className="w-3 h-3" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="py-2 text-gray-600 text-xs">{r.recipient_email || "—"}</td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <td colSpan={5} className="py-3 px-3 text-xs text-gray-700">
                              {/* Lifecycle timeline */}
                              <div className="mb-3">
                                <div className="font-semibold text-gray-700 mb-1.5">Lifecycle</div>
                                <ol className="space-y-1.5">
                                  {/* Always show the local "sent" row first */}
                                  <li className="flex items-center gap-2">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${eventMeta((r.status ?? "").toLowerCase() === "failed" ? "failed" : "sent").cls}`}>
                                      {(() => {
                                        const m = eventMeta((r.status ?? "").toLowerCase() === "failed" ? "failed" : "sent");
                                        const I = m.Icon;
                                        return <I className="w-3 h-3" />;
                                      })()}
                                      {(r.status ?? "").toLowerCase() === "failed" ? "Failed to send" : "Sent"}
                                    </span>
                                    <span className="text-gray-500">{fmtDateTime(r.created_at)}</span>
                                    {r.error_message && (
                                      <span className="text-red-700 font-mono">{r.error_message}</span>
                                    )}
                                  </li>
                                  {lifecycle.length === 0 && !r.error_message && (
                                    <li className="text-gray-500 italic">
                                      No delivery events from Brevo yet. (Configure the webhook in Brevo dashboard to receive delivered/opened/clicked/bounce events.)
                                    </li>
                                  )}
                                  {lifecycle.map((ev) => {
                                    const em = eventMeta(ev.event);
                                    const EvIcon = em.Icon;
                                    return (
                                      <li key={ev.id} className="flex items-center gap-2">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${em.cls}`}>
                                          <EvIcon className="w-3 h-3" />
                                          {em.label}
                                        </span>
                                        <span className="text-gray-500">{fmtDateTime(ev.event_ts)}</span>
                                        {ev.reason && <span className="text-red-700">{ev.reason}</span>}
                                        {ev.link && (
                                          <a href={ev.link} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline truncate max-w-md">
                                            {ev.link}
                                          </a>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ol>
                              </div>

                              {r.metadata && Object.keys(r.metadata).length > 0 && (
                                <details>
                                  <summary className="cursor-pointer text-gray-600">Send metadata</summary>
                                  <pre className="mt-1 p-2 bg-white border border-gray-200 rounded overflow-x-auto text-[11px] font-mono text-gray-800">
                                    {JSON.stringify(r.metadata, null, 2)}
                                  </pre>
                                </details>
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
            Sends from <code>notification_log</code>. Delivery events (delivered / opened / clicked / bounce / spam) from <code>brevo_email_events</code>, populated by Brevo's webhook. Click any row to see the full lifecycle.
          </p>
        </div>
      )}
    </div>
  );
}
