import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  Loader2,
  RefreshCw,
  Search,
  X,
  Send,
  ExternalLink,
  Phone,
  ArrowLeft,
  CheckCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useStaffAuth } from "@/context/StaffAuthContext";
import { formatDistanceToNow, format } from "date-fns";

interface Thread {
  peer_phone_e164: string;
  peer_name: string | null;
  customer_id: string | null;
  customer_company_name: string | null;
  customer_email: string | null;
  last_message_at: string;
  last_direction: "inbound" | "outbound";
  last_body: string;
  unread_count: number;
  total_messages: number;
  total_count: number;
}

interface ThreadMessage {
  id: string;
  direction: "inbound" | "outbound";
  from_number: string;
  to_number: string;
  from_name: string | null;
  to_name: string | null;
  body: string;
  status: string;
  sent_at: string | null;
  received_at: string | null;
  read_at: string | null;
  template_key: string | null;
  staff_user_id: string | null;
  staff_full_name: string | null;
  customer_id: string | null;
  created_at: string;
}

interface SmsTemplate {
  id: string;
  key: string;
  label: string;
  body: string;
  variables: string[];
  generates_upload_token: boolean;
}

export default function AdminSmsInbox() {
  const { staff } = useStaffAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("comms_list_sms_threads", {
      p_limit: 200,
      p_offset: 0,
      p_search: search || null,
      p_unread_only: unreadOnly,
    });
    setLoading(false);
    if (error) {
      console.error("comms_list_sms_threads failed", error);
      return;
    }
    setThreads((data || []) as Thread[]);
  }, [search, unreadOnly]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // Realtime: refresh on new inbound
  useEffect(() => {
    const channel = supabase
      .channel("admin-sms-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "comms", table: "sms_messages" }, () => {
        fetchThreads();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchThreads]);

  const handleSync = async () => {
    setSyncing(true);
    const { error } = await supabase.functions.invoke("rc-sync-sms", { body: {} });
    setSyncing(false);
    if (error) {
      alert("Sync failed: " + error.message);
      return;
    }
    await fetchThreads();
  };

  const selectedThread = useMemo(() => threads.find((t) => t.peer_phone_e164 === selectedPeer), [threads, selectedPeer]);

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Left: thread list */}
      <div className="w-96 border-r bg-white flex flex-col">
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-gray-700" />
          <h1 className="text-lg font-semibold text-gray-900">SMS Inbox</h1>
          <div className="flex-1" />
          <button
            onClick={handleSync}
            disabled={syncing}
            title="Sync now"
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
        <div className="border-b px-4 py-2 space-y-2">
          <form
            onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }}
            className="relative"
          >
            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search phone or name…"
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded"
            />
          </form>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="rounded"
            />
            Unread only
          </label>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : threads.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">No threads</div>
          ) : (
            threads.map((t) => (
              <button
                key={t.peer_phone_e164}
                onClick={() => setSelectedPeer(t.peer_phone_e164)}
                className={`w-full text-left px-4 py-3 border-b hover:bg-blue-50 ${
                  selectedPeer === t.peer_phone_e164 ? "bg-blue-50" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div className="font-medium text-sm text-gray-900 truncate flex-1">
                    {t.customer_company_name || t.peer_name || t.peer_phone_e164}
                  </div>
                  <div className="text-xs text-gray-500 flex-shrink-0 ml-2">
                    {formatDistanceToNow(new Date(t.last_message_at), { addSuffix: false })}
                  </div>
                </div>
                <div className="text-xs text-gray-500 font-mono mb-1">{t.peer_phone_e164}</div>
                <div className="flex items-center gap-1">
                  <div className="text-xs text-gray-600 truncate flex-1">
                    {t.last_direction === "outbound" && <span className="text-gray-400">You: </span>}
                    {t.last_body || "(empty)"}
                  </div>
                  {t.unread_count > 0 && (
                    <span className="flex-shrink-0 bg-blue-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                      {t.unread_count}
                    </span>
                  )}
                </div>
                {t.customer_id ? (
                  <Link
                    to={`/admin/customers/${t.customer_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-0.5 mt-0.5"
                  >
                    {t.customer_email} <ExternalLink className="w-2.5 h-2.5" />
                  </Link>
                ) : (
                  <div className="text-[10px] text-gray-400 mt-0.5">Lead / unlinked</div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: thread view */}
      <div className="flex-1 bg-gray-50 flex flex-col">
        {selectedPeer && selectedThread ? (
          <ThreadView
            thread={selectedThread}
            staffUserId={staff?.id ?? null}
            onBack={() => setSelectedPeer(null)}
            onRefresh={fetchThreads}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
              Pick a conversation to view
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadView({
  thread,
  staffUserId,
  onBack,
  onRefresh,
}: {
  thread: Thread;
  staffUserId: string | null;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [msgRes, tplRes] = await Promise.all([
      supabase.rpc("comms_get_sms_thread", { p_peer_phone: thread.peer_phone_e164 }),
      supabase.rpc("comms_list_sms_templates"),
    ]);
    setLoading(false);
    if (!msgRes.error) setMessages((msgRes.data || []) as ThreadMessage[]);
    if (!tplRes.error) setTemplates((tplRes.data || []) as SmsTemplate[]);
    // Mark as read
    if (thread.unread_count > 0) {
      await supabase.rpc("comms_mark_sms_thread_read", { p_peer_phone: thread.peer_phone_e164 });
      onRefresh();
    }
  }, [thread.peer_phone_e164, thread.unread_count, onRefresh]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    setSmsError(null);
    const { data, error } = await supabase.functions.invoke("rc-send-sms", {
      body: {
        custom_body: reply.trim(),
        to_number: thread.peer_phone_e164,
        staff_user_id: staffUserId,
        customer_id: thread.customer_id,
      },
    });
    setSending(false);
    if (error || !data?.ok) {
      setSmsError(data?.error || error?.message || "Failed");
      return;
    }
    setReply("");
    await load();
  };

  const applyTemplate = (t: SmsTemplate) => {
    setReply(t.body);
    setShowTemplates(false);
  };

  return (
    <>
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-700 lg:hidden">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="font-semibold text-gray-900">
            {thread.customer_company_name || thread.peer_name || thread.peer_phone_e164}
          </div>
          <div className="text-xs text-gray-500 font-mono flex items-center gap-2">
            <Phone className="w-3 h-3" />
            {thread.peer_phone_e164}
            {thread.customer_id && (
              <Link
                to={`/admin/customers/${thread.customer_id}`}
                className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
              >
                <span>·</span> {thread.customer_email} <ExternalLink className="w-3 h-3" />
              </Link>
            )}
            {!thread.customer_id && <span className="text-orange-500">· Lead (not linked)</span>}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-md rounded-lg px-3 py-2 ${
                  m.direction === "outbound"
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-gray-200 text-gray-900"
                }`}
              >
                <div className="whitespace-pre-wrap text-sm">{m.body}</div>
                <div
                  className={`text-[10px] mt-1 flex items-center gap-1 ${
                    m.direction === "outbound" ? "text-blue-100" : "text-gray-400"
                  }`}
                  title={format(new Date(m.received_at || m.sent_at || m.created_at), "PPpp")}
                >
                  {formatDistanceToNow(new Date(m.received_at || m.sent_at || m.created_at), { addSuffix: true })}
                  {m.direction === "outbound" && (
                    <>
                      <span>·</span>
                      <span className="capitalize">{m.status}</span>
                      {m.staff_full_name && (
                        <>
                          <span>·</span>
                          <span>{m.staff_full_name}</span>
                        </>
                      )}
                      {m.template_key && (
                        <>
                          <span>·</span>
                          <span className="bg-blue-700 text-white px-1 rounded text-[9px]">
                            {m.template_key}
                          </span>
                        </>
                      )}
                      <CheckCheck className="w-3 h-3 ml-0.5" />
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        {!loading && messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-10">No messages</div>
        )}
      </div>

      {/* Reply composer */}
      <div className="bg-white border-t p-3">
        {showTemplates && templates.length > 0 && (
          <div className="mb-2 max-h-40 overflow-y-auto border rounded">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b last:border-0"
              >
                <div className="font-medium text-gray-900">{t.label}</div>
                <div className="text-gray-500 truncate">{t.body}</div>
              </button>
            ))}
          </div>
        )}
        {smsError && (
          <div className="mb-2 text-xs text-red-600">{smsError}</div>
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="px-2 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
            title="Insert from preset"
          >
            Preset
          </button>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Type a reply… (Enter to send, Shift+Enter for newline)"
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm resize-none"
          />
          <button
            onClick={send}
            disabled={!reply.trim() || sending}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </button>
        </div>
        <div className="text-[10px] text-gray-400 mt-1">
          From your business RingCentral number · char count: {reply.length}
          {reply.length > 160 && <span className="text-orange-500"> · over 160 chars, may be multiple segments</span>}
        </div>
      </div>
    </>
  );
}
