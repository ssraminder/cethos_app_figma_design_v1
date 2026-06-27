// AdminVendorCommunication — standalone /admin/vendors/communication page.
// A unified INBOX of every message received at the vm@ mailbox (any sender,
// registered or not) plus the vendor-communication mail staff send from here,
// auto-refreshing every 2 minutes. Rows route by sender type: a vendor opens
// that vendor's full thread (the shared VendorCommunicationTab); an applicant
// jumps to their recruitment record; an unregistered sender opens an inline
// read view. "New message" searches a vendor to start a conversation.

import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Search, Loader2, ArrowLeft, MessageSquare, RefreshCw, ArrowRight, Mail, Plus, X, ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";
import VendorCommunicationTab from "./vendor-detail/VendorCommunicationTab";

type SenderType = "vendor" | "applicant" | "other";

interface VendorLite {
  id: string;
  full_name: string | null;
  business_name: string | null;
  email: string | null;
  status?: string | null;
}
interface InboxItem {
  kind: "outbound" | "inbound";
  id: string;
  at: string;
  subject: string | null;
  snippet: string;
  from: string | null;
  unread: boolean;
  vendorId: string | null;
  applicationId: string | null;
  senderType: SenderType;
  name: string;
  email: string | null;
  intent: string | null;
  action: string | null;
}
interface ReadMessage {
  id: string;
  from: string | null;
  subject: string | null;
  at: string;
  body: string;
  intent: string | null;
  action: string | null;
  vendorId: string | null;
  applicationId: string | null;
}

type FilterKey = "all" | SenderType;

function fmt(at: string): string {
  try {
    return new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return at;
  }
}

const TYPE_BADGE: Record<SenderType, { label: string; cls: string }> = {
  vendor: { label: "Vendor", cls: "bg-cyan-100 text-cyan-700" },
  applicant: { label: "Applicant", cls: "bg-violet-100 text-violet-700" },
  other: { label: "Other", cls: "bg-gray-100 text-gray-600" },
};

export default function AdminVendorCommunication() {
  const navigate = useNavigate();
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [counts, setCounts] = useState<Record<FilterKey, number>>({ all: 0, vendor: 0, applicant: 0, other: 0 });
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<VendorLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [composing, setComposing] = useState(false);
  const [selected, setSelected] = useState<VendorLite | null>(null);
  const [reading, setReading] = useState<ReadMessage | null>(null);
  const [readingLoading, setReadingLoading] = useState(false);
  // Reply composer for record-less ("other") senders — a prospective
  // applicant who emailed vm@ but never created an application/vendor.
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);

  const loadInbox = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-vendor-communication", { body: { action: "inbox", filter } });
      if (error) throw new Error(error.message);
      const payload = (data as { data?: { inbox?: InboxItem[]; counts?: Record<FilterKey, number> } })?.data;
      setInbox((payload?.inbox ?? []) as InboxItem[]);
      if (payload?.counts) setCounts(payload.counts);
      setLastRefreshed(new Date());
      setRefreshFailed(false);
    } catch {
      // Keep the existing list visible, but surface that the refresh failed.
      setRefreshFailed(true);
    } finally {
      setLoadingInbox(false);
    }
  }, [filter]);

  // Load on mount, on filter change, + auto-refresh every 2 minutes.
  useEffect(() => {
    loadInbox();
    const t = setInterval(loadInbox, 120000);
    return () => clearInterval(t);
  }, [loadInbox]);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const term = q.replace(/[%,]/g, " ").trim();
    const { data } = await supabase
      .from("vendors")
      .select("id, full_name, business_name, email, status")
      .or(`full_name.ilike.%${term}%,business_name.ilike.%${term}%,email.ilike.%${term}%`)
      .order("full_name")
      .limit(25);
    setResults((data as VendorLite[]) ?? []);
    setSearching(false);
  }, []);

  const openVendorThread = (v: VendorLite) => {
    setSelected(v);
    setComposing(false);
  };

  const openMessage = useCallback(async (inboundId: string) => {
    setReadingLoading(true);
    setReading(null);
    try {
      const { data, error } = await supabase.functions.invoke("manage-vendor-communication", { body: { action: "message", inboundId } });
      if (error) throw new Error(error.message);
      const msg = (data as { data?: { message?: ReadMessage } })?.data?.message ?? null;
      setReading(msg);
    } catch {
      setReading(null);
    } finally {
      setReadingLoading(false);
    }
  }, []);

  const closeReading = useCallback(() => {
    setReading(null);
    setReadingLoading(false);
    setReplySubject("");
    setReplyBody("");
  }, []);

  const sendColdReply = useCallback(async () => {
    if (!reading || !replyBody.trim()) return;
    setReplySending(true);
    try {
      const { data, error } = await supabase.functions.invoke("cvp-staff-reply", {
        body: { inboundEmailId: reading.id, subject: replySubject.trim() || undefined, body: replyBody.trim() },
      });
      if (error) throw new Error(error.message);
      if (data && (data as { success?: boolean }).success === false) {
        throw new Error((data as { error?: string }).error || "Send failed");
      }
      toast.success("Reply sent from vm@cethos.com.");
      setReading(null);
      setReplySubject("");
      setReplyBody("");
      loadInbox();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setReplySending(false);
    }
  }, [reading, replyBody, replySubject, loadInbox]);

  const openRow = (it: InboxItem) => {
    if (it.senderType === "vendor" && it.vendorId) {
      openVendorThread({ id: it.vendorId, full_name: it.name, business_name: null, email: it.email });
    } else if (it.senderType === "applicant" && it.applicationId) {
      navigate(`/admin/recruitment/${it.applicationId}`);
    } else {
      openMessage(it.id);
    }
  };

  if (selected) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <button
          onClick={() => { setSelected(null); loadInbox(); }}
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> Back to inbox
        </button>
        <div className="border border-gray-200 rounded-lg p-5 bg-white">
          <VendorCommunicationTab
            vendorId={selected.id}
            vendorName={selected.business_name || selected.full_name}
            vendorEmail={selected.email}
          />
        </div>
      </div>
    );
  }

  // Server-side filtering: `inbox` already holds the active filter's rows.
  const visible = inbox;
  const chips: { key: FilterKey; label: string }[] = [
    { key: "all", label: `All (${counts.all})` },
    { key: "vendor", label: `Vendors (${counts.vendor})` },
    { key: "applicant", label: `Applicants (${counts.applicant})` },
    { key: "other", label: `Other (${counts.other})` },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-cyan-600" />
          <h1 className="text-xl font-semibold text-gray-900">Inbox</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {refreshFailed ? (
              <span className="text-amber-600">couldn’t refresh — showing last load</span>
            ) : (
              <>{lastRefreshed ? `Updated ${lastRefreshed.toLocaleTimeString()}` : ""} · auto every 2 min</>
            )}
          </span>
          <button
            onClick={loadInbox}
            className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 border border-gray-200 rounded-md px-2.5 py-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            onClick={() => setComposing((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-white bg-cyan-600 hover:bg-cyan-700 rounded-md px-3 py-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> New message
          </button>
        </div>
      </div>

      {composing && (
        <div className="border border-cyan-200 bg-cyan-50/40 rounded-lg p-4 mb-4 space-y-3">
          <p className="text-xs text-gray-600">Search a vendor by name or email to start a conversation:</p>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); doSearch(e.target.value); }}
              placeholder="Search vendors…"
              className="w-full text-sm border border-gray-300 rounded-md pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          {searching ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-2 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          ) : results.length > 0 ? (
            <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
              {results.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => openVendorThread(v)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">{v.business_name || v.full_name || "(no name)"}</div>
                      <div className="text-xs text-gray-500">{v.email || "(no email)"}</div>
                    </div>
                    {v.status && <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{v.status}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-3">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`text-xs rounded-full px-3 py-1 border ${filter === c.key ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loadingInbox && inbox.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading inbox…
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">
          {inbox.length === 0 ? "No messages yet. Use “New message” to start one." : "No messages in this view."}
        </p>
      ) : (
        <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
          {visible.map((it) => {
            const outbound = it.kind === "outbound";
            const badge = TYPE_BADGE[it.senderType];
            return (
              <li key={`${it.kind}-${it.id}`}>
                <button
                  onClick={() => openRow(it)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3 ${it.unread ? "bg-amber-50/60" : ""}`}
                >
                  <span className={`mt-0.5 inline-flex items-center justify-center h-6 w-6 rounded-full ${outbound ? "bg-cyan-100 text-cyan-700" : "bg-amber-100 text-amber-700"}`}>
                    {outbound ? <ArrowRight className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{it.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                      {it.unread && <span className="h-2 w-2 rounded-full bg-amber-500" />}
                      <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">{fmt(it.at)}</span>
                    </div>
                    <div className="text-xs text-gray-700 truncate">{outbound ? "→ " : "← "}{it.subject || "(no subject)"}</div>
                    {it.from && !outbound && <div className="text-[11px] text-gray-400 truncate">{it.from}</div>}
                    {it.snippet && <div className="text-xs text-gray-400 truncate">{it.snippet}</div>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Read-only viewer for messages from unregistered senders */}
      {(reading || readingLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeReading}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{reading?.subject || "(no subject)"}</div>
                {reading?.from && <div className="text-xs text-gray-500 truncate">{reading.from}</div>}
                {reading?.at && <div className="text-[11px] text-gray-400">{fmt(reading.at)}</div>}
              </div>
              <button onClick={closeReading} className="text-gray-400 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto">
              {readingLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading message…
                </div>
              ) : reading ? (
                <>
                  {(reading.intent || reading.action) && (
                    <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
                      {reading.intent && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">intent: {reading.intent}</span>}
                      {reading.action && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">action: {reading.action}</span>}
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-800 leading-relaxed">{reading.body || "(no body)"}</pre>
                  {reading.applicationId && (
                    <button
                      onClick={() => { const id = reading.applicationId; setReading(null); if (id) navigate(`/admin/recruitment/${id}`); }}
                      className="mt-4 inline-flex items-center gap-1.5 text-xs text-cyan-700 hover:text-cyan-900"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open recruitment record
                    </button>
                  )}

                  {/* Reply composer — only for record-less senders (no
                      application/vendor thread to open). Sends from vm@ via
                      cvp-staff-reply with the inbound id; the sender's reply
                      threads back automatically. */}
                  {!reading.applicationId && !reading.vendorId && (
                    <div className="mt-5 border-t border-gray-100 pt-4">
                      <p className="text-xs font-medium text-gray-500 mb-2">
                        Reply to {reading.from || "this sender"} — sent from <span className="font-mono">vm@cethos.com</span>
                      </p>
                      <input
                        type="text"
                        value={replySubject}
                        onChange={(e) => setReplySubject(e.target.value)}
                        placeholder={reading.subject ? `Re: ${reading.subject.replace(/^Re:\s*/i, "")}` : "Subject (optional)"}
                        className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        rows={6}
                        placeholder="Write your reply…"
                        className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={sendColdReply}
                          disabled={replySending || !replyBody.trim()}
                          className="inline-flex items-center gap-1.5 text-sm bg-cyan-600 hover:bg-cyan-700 text-white rounded-md px-4 py-2 disabled:opacity-50"
                        >
                          {replySending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          Send reply
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400 py-8 text-center">Couldn’t load this message.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
