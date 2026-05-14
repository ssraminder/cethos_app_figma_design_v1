/**
 * VendorEmailLogAccordion
 *
 * Inline Brevo email log on each vendor's profile. Same data source as the
 * existing "Brevo Email Log" modal (on the Auth/Invitation tab): it calls
 * the `get-brevo-email-events` edge function, which proxies Brevo's
 * /v3/smtp/statistics/events + /v3/smtp/emails APIs in real time.
 *
 * Live read, no caching. Works for past sends because Brevo retains its
 * own event history. No webhook setup needed.
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

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SB_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

interface BrevoEvent {
  email: string;
  date: string;
  subject?: string;
  messageId?: string;
  event: string;          // delivered | opened | click | hardBounces | softBounces | blocked | spam | invalid | deferred | unsubscribed | requests | error
  reason?: string;
  tag?: string;
  templateId?: number;
}

interface BrevoEnvelope {
  email: string;
  subject: string;
  date: string;
  messageId: string;
  templateId?: number | null;
}

interface Props {
  vendorId: string;
  vendorEmail: string | null;
}

type DatePreset = "today" | "yesterday" | "last7" | "last30" | "last90" | "custom";

// Brevo's /events endpoint pages by `days` (1..90). We always fetch the
// widest reasonable window and filter client-side to the chosen preset.
const PRESET_LABEL: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  last90: "Last 90 days",
  custom: "Custom range",
};

function presetWindow(preset: DatePreset): { from: Date | null; to: Date | null } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":
      return { from: startOfToday, to: now };
    case "yesterday": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 1);
      return { from: start, to: startOfToday };
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
    case "last90": {
      const from = new Date(startOfToday);
      from.setDate(from.getDate() - 89);
      return { from, to: now };
    }
    case "custom":
      return { from: null, to: null };
  }
}

function daysForPreset(preset: DatePreset, customFrom: string): number {
  if (preset === "today") return 1;
  if (preset === "yesterday") return 2;
  if (preset === "last7") return 7;
  if (preset === "last30") return 30;
  if (preset === "last90") return 90;
  // custom — compute distance from `customFrom` to now, clamp to 1..90
  if (customFrom) {
    const start = new Date(customFrom + "T00:00:00");
    const diff = Math.ceil((Date.now() - start.getTime()) / 86400000);
    return Math.min(90, Math.max(1, diff + 1));
  }
  return 90;
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

// Lifecycle priority — higher = more terminal/recent. Used to pick the
// summary badge per messageId.
const EVENT_PRIORITY: Record<string, number> = {
  requests: 1,
  request: 1,
  deferred: 2,
  softBounces: 3,
  soft_bounce: 3,
  delivered: 4,
  opened: 5,
  unique_opened: 5,
  click: 6,
  unsubscribed: 7,
  spam: 8,
  blocked: 9,
  invalid: 9,
  hardBounces: 10,
  hard_bounce: 10,
  error: 10,
};

const EVENT_META: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  requests:      { label: "Requested",   cls: "bg-sky-50 text-sky-700 border-sky-200",         Icon: Send },
  request:       { label: "Requested",   cls: "bg-sky-50 text-sky-700 border-sky-200",         Icon: Send },
  deferred:      { label: "Deferred",    cls: "bg-amber-50 text-amber-700 border-amber-200",   Icon: Clock },
  delivered:     { label: "Delivered",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  opened:        { label: "Opened",      cls: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: Eye },
  unique_opened: { label: "Opened",      cls: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: Eye },
  click:         { label: "Clicked",     cls: "bg-violet-50 text-violet-700 border-violet-200", Icon: MousePointerClick },
  unsubscribed:  { label: "Unsubscribed",cls: "bg-gray-100 text-gray-700 border-gray-300",     Icon: MailX },
  spam:          { label: "Spam",        cls: "bg-orange-50 text-orange-700 border-orange-200", Icon: ShieldAlert },
  softBounces:   { label: "Soft bounce", cls: "bg-amber-50 text-amber-700 border-amber-200",   Icon: AlertCircle },
  soft_bounce:   { label: "Soft bounce", cls: "bg-amber-50 text-amber-700 border-amber-200",   Icon: AlertCircle },
  hardBounces:   { label: "Hard bounce", cls: "bg-red-50 text-red-700 border-red-200",         Icon: Ban },
  hard_bounce:   { label: "Hard bounce", cls: "bg-red-50 text-red-700 border-red-200",         Icon: Ban },
  blocked:       { label: "Blocked",     cls: "bg-red-50 text-red-700 border-red-200",         Icon: Ban },
  invalid:       { label: "Invalid",     cls: "bg-red-50 text-red-700 border-red-200",         Icon: Ban },
  error:         { label: "Error",       cls: "bg-red-50 text-red-700 border-red-200",         Icon: AlertCircle },
};

function eventMeta(event: string): { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> } {
  return EVENT_META[event] ?? { label: event, cls: "bg-gray-50 text-gray-700 border-gray-200", Icon: Mail };
}

export default function VendorEmailLogAccordion({ vendorId: _vendorId, vendorEmail }: Props) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<DatePreset>("last30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [events, setEvents] = useState<BrevoEvent[]>([]);
  const [envelopes, setEnvelopes] = useState<BrevoEnvelope[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null);

  const dateWindow = useMemo(() => {
    if (preset === "custom") {
      const from = customFrom ? new Date(customFrom + "T00:00:00") : null;
      const to = customTo ? new Date(customTo + "T23:59:59.999") : null;
      return { from, to };
    }
    return presetWindow(preset);
  }, [preset, customFrom, customTo]);

  const fetchEvents = useCallback(async () => {
    if (!open || !vendorEmail) return;
    setLoading(true);
    setError(null);
    try {
      // Pull the user's Supabase access_token if present so the function
      // can attribute the call. Falls back to anon JWT.
      let token = SB_ANON;
      try {
        const s = localStorage.getItem("cethos-auth");
        if (s) token = JSON.parse(s)?.access_token || SB_ANON;
      } catch {
        /* ignore */
      }
      const days = daysForPreset(preset, customFrom);
      const res = await fetch(`${SB_URL}/functions/v1/get-brevo-email-events`, {
        method: "POST",
        headers: {
          apikey: SB_ANON,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: vendorEmail, days, limit: 200 }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setEvents(Array.isArray(json.events) ? json.events : []);
      setEnvelopes(Array.isArray(json.emails) ? json.emails : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Brevo log");
      setEvents([]);
      setEnvelopes([]);
    } finally {
      setLoading(false);
    }
  }, [open, vendorEmail, preset, customFrom]);

  // Silence unused-var lint on vendorId — kept in the prop shape because the
  // parent always knows the vendor id; we may use it later for an admin-side
  // resolver that doesn't depend on email.
  void _vendorId;

  useEffect(() => { void fetchEvents(); }, [fetchEvents]);

  // Filter to the chosen window client-side (Brevo returns up to `days`).
  const inWindow = useCallback((ts: string): boolean => {
    const t = new Date(ts);
    if (dateWindow.from && t < dateWindow.from) return false;
    if (dateWindow.to && t > dateWindow.to) return false;
    return true;
  }, [dateWindow.from, dateWindow.to]);

  const filteredEvents = useMemo(() => events.filter((e) => inWindow(e.date)), [events, inWindow]);

  // Group events by messageId so each send shows as one row with a lifecycle.
  const sendsByMsg = useMemo(() => {
    const map = new Map<string, { messageId: string; subject: string; firstTs: string; events: BrevoEvent[] }>();
    const envSubj = new Map<string, string>();
    for (const env of envelopes) {
      if (env.messageId) envSubj.set(env.messageId, env.subject);
    }
    for (const ev of filteredEvents) {
      const mid = ev.messageId ?? `__nomid__${ev.date}`;
      const slot = map.get(mid);
      const subject = ev.subject || envSubj.get(mid) || "—";
      if (!slot) {
        map.set(mid, { messageId: mid, subject, firstTs: ev.date, events: [ev] });
      } else {
        slot.events.push(ev);
        if (new Date(ev.date) < new Date(slot.firstTs)) slot.firstTs = ev.date;
      }
    }
    // Sort each lifecycle by event time ascending; sort sends by firstTs desc.
    const out = Array.from(map.values()).map((s) => ({
      ...s,
      events: [...s.events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    }));
    out.sort((a, b) => new Date(b.firstTs).getTime() - new Date(a.firstTs).getTime());
    return out;
  }, [filteredEvents, envelopes]);

  function summaryForSend(eventsForMsg: BrevoEvent[]): string {
    let best = "delivered";
    let bestPri = -1;
    for (const e of eventsForMsg) {
      const pri = EVENT_PRIORITY[e.event] ?? 0;
      if (pri > bestPri) { bestPri = pri; best = e.event; }
    }
    return best;
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
          <span className="text-sm font-semibold text-gray-900">Email log (Brevo)</span>
          {open && sendsByMsg.length > 0 && (
            <span className="text-xs text-gray-500">({sendsByMsg.length} {sendsByMsg.length === 1 ? "send" : "sends"})</span>
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
              onClick={() => void fetchEvents()}
              disabled={loading || !vendorEmail}
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
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <p className="text-xs text-gray-500">Brevo retains 90 days of events.</p>
            </div>
          )}

          {!vendorEmail ? (
            <div className="text-center py-8 text-sm text-gray-500">
              Vendor has no email on file — nothing to fetch from Brevo.
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading Brevo events…
            </div>
          ) : sendsByMsg.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              Brevo has no events for <span className="font-mono">{vendorEmail}</span> in the selected window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-200">
                    <th className="py-2 pr-3 font-medium text-gray-600">First seen</th>
                    <th className="py-2 pr-3 font-medium text-gray-600">Subject</th>
                    <th className="py-2 pr-3 font-medium text-gray-600">Latest status</th>
                    <th className="py-2 font-medium text-gray-600">Events</th>
                  </tr>
                </thead>
                <tbody>
                  {sendsByMsg.map((send) => {
                    const summary = summaryForSend(send.events);
                    const meta = eventMeta(summary);
                    const Icon = meta.Icon;
                    const isExpanded = expandedMsgId === send.messageId;
                    return (
                      <React.Fragment key={send.messageId}>
                        <tr
                          className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                          onClick={() => setExpandedMsgId(isExpanded ? null : send.messageId)}
                        >
                          <td className="py-2 pr-3 text-gray-700 whitespace-nowrap">{fmtDateTime(send.firstTs)}</td>
                          <td className="py-2 pr-3 text-gray-900 max-w-md truncate" title={send.subject}>
                            {send.subject}
                          </td>
                          <td className="py-2 pr-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${meta.cls}`}>
                              <Icon className="w-3 h-3" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="py-2 text-gray-600 text-xs">{send.events.length}</td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <td colSpan={4} className="py-3 px-3 text-xs text-gray-700">
                              <div className="font-semibold text-gray-700 mb-1.5">Lifecycle</div>
                              <ol className="space-y-1.5">
                                {send.events.map((ev, idx) => {
                                  const em = eventMeta(ev.event);
                                  const EvIcon = em.Icon;
                                  return (
                                    <li key={idx} className="flex flex-wrap items-center gap-2">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${em.cls}`}>
                                        <EvIcon className="w-3 h-3" />
                                        {em.label}
                                      </span>
                                      <span className="text-gray-500">{fmtDateTime(ev.date)}</span>
                                      {ev.reason && <span className="text-red-700">{ev.reason}</span>}
                                      {ev.tag && <span className="text-gray-500 font-mono">tag: {ev.tag}</span>}
                                    </li>
                                  );
                                })}
                              </ol>
                              {send.messageId && !send.messageId.startsWith("__nomid__") && (
                                <p className="mt-2 text-[10px] text-gray-400 font-mono break-all">{send.messageId}</p>
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
            Source: Brevo <code>/v3/smtp/statistics/events</code> via <code>get-brevo-email-events</code>. Live read, no caching. Brevo retains the last 90 days.
          </p>
        </div>
      )}
    </div>
  );
}
