import { useEffect, useState } from "react";
import { X, Mail, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

const _SB_URL = import.meta.env.VITE_SUPABASE_URL as string;
const _SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

interface BrevoEvent {
  email: string;
  date: string;
  subject?: string;
  messageId?: string;
  event: string;
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

interface BrevoEmailLogsModalProps {
  open: boolean;
  onClose: () => void;
  vendorId?: string | null;
  email?: string | null;
  displayName?: string | null;
}

const eventBadgeStyle = (event: string): string => {
  switch (event) {
    case "delivered":
    case "opened":
    case "click":
      return "bg-green-100 text-green-800";
    case "requests":
    case "request":
      return "bg-blue-100 text-blue-800";
    case "softBounces":
    case "deferred":
      return "bg-amber-100 text-amber-800";
    case "hardBounces":
    case "blocked":
    case "spam":
    case "invalid":
    case "error":
      return "bg-red-100 text-red-800";
    case "unsubscribed":
      return "bg-gray-200 text-gray-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

export default function BrevoEmailLogsModal({
  open,
  onClose,
  vendorId,
  email: emailProp,
  displayName,
}: BrevoEmailLogsModalProps) {
  const [resolvedEmail, setResolvedEmail] = useState<string | null>(emailProp ?? null);
  const [resolvedName, setResolvedName] = useState<string | null>(displayName ?? null);
  const [days, setDays] = useState<number>(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<BrevoEvent[]>([]);
  const [emails, setEmails] = useState<BrevoEnvelope[]>([]);

  useEffect(() => {
    if (!open) return;
    setResolvedEmail(emailProp ?? null);
    setResolvedName(displayName ?? null);
  }, [open, emailProp, displayName]);

  // Resolve vendor → email when only vendorId given
  useEffect(() => {
    if (!open || resolvedEmail || !vendorId) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("vendors")
          .select("email, full_name")
          .eq("id", vendorId)
          .maybeSingle();
        if (error) throw error;
        setResolvedEmail(data?.email ?? null);
        if (!resolvedName) setResolvedName(data?.full_name ?? null);
      } catch (err: any) {
        setError(err?.message || "Failed to resolve vendor email");
      }
    })();
  }, [open, vendorId, resolvedEmail, resolvedName]);

  const fetchLogs = async () => {
    if (!resolvedEmail) return;
    setLoading(true);
    setError(null);
    try {
      let token = _SB_KEY;
      try {
        const s = localStorage.getItem("cethos-auth");
        if (s) token = JSON.parse(s)?.access_token || _SB_KEY;
      } catch {}
      const res = await fetch(`${_SB_URL}/functions/v1/get-brevo-email-events`, {
        method: "POST",
        headers: {
          apikey: _SB_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: resolvedEmail, days, limit: 200 }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setEvents(Array.isArray(json.events) ? json.events : []);
      setEmails(Array.isArray(json.emails) ? json.emails : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load Brevo logs");
      setEvents([]);
      setEmails([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && resolvedEmail) {
      fetchLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resolvedEmail, days]);

  if (!open) return null;

  // Index envelopes by messageId so we can show subject lines on event rows.
  const envelopeByMsgId: Record<string, BrevoEnvelope> = {};
  emails.forEach((e) => {
    if (e.messageId) envelopeByMsgId[e.messageId] = e;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-teal-600" />
            <h2 className="text-base font-semibold text-gray-900">Brevo email log</h2>
            {resolvedName && (
              <span className="text-sm text-gray-500">· {resolvedName}</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-3">
          <div className="text-sm text-gray-600">
            Recipient:{" "}
            <span className="font-mono text-gray-900">
              {resolvedEmail || (vendorId ? "(loading…)" : "—")}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-gray-500">Window</label>
            <select
              className="text-sm border border-gray-300 rounded px-2 py-1"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={1}>Last 24h</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button
              onClick={fetchLogs}
              disabled={loading || !resolvedEmail}
              className="text-sm flex items-center gap-1 px-2 py-1 border border-gray-300 rounded hover:bg-white disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading Brevo events…
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>{error}</div>
            </div>
          ) : events.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded p-4 text-sm text-amber-900">
              <div className="font-medium mb-1">No events found</div>
              <div className="text-amber-800">
                Brevo has no record of sending any email to{" "}
                <span className="font-mono">{resolvedEmail}</span> in the last {days}{" "}
                day{days === 1 ? "" : "s"}. Either no email was triggered for this
                recipient, or the BREVO_API_KEY does not have access to those events.
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 border-b">
                <tr>
                  <th className="text-left py-2">When</th>
                  <th className="text-left py-2">Event</th>
                  <th className="text-left py-2">Subject</th>
                  <th className="text-left py-2">Reason / tag</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev, idx) => {
                  const env = ev.messageId ? envelopeByMsgId[ev.messageId] : undefined;
                  const subject = ev.subject || env?.subject || "—";
                  return (
                    <tr key={idx} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-700">
                        {new Date(ev.date).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${eventBadgeStyle(
                            ev.event,
                          )}`}
                        >
                          {ev.event}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-gray-800 break-all">{subject}</td>
                      <td className="py-2 text-xs text-gray-500 break-all">
                        {[ev.reason, ev.tag].filter(Boolean).join(" · ") || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t px-5 py-2 bg-gray-50 text-xs text-gray-500">
          Source: Brevo /v3/smtp/statistics/events &middot; live read, no caching.
        </div>
      </div>
    </div>
  );
}
