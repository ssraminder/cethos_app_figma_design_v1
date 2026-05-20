import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Loader2,
  Send,
  MessageSquare,
  Mail,
  Smartphone,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useStaffAuth } from "@/context/StaffAuthContext";
import { formatDistanceToNow, format } from "date-fns";

// Composer channels. The data layer still distinguishes between 'email'
// (inbound reply via Brevo) and 'inapp' (staff outbound, also auto-emails the
// customer) — but from the composer's perspective there's just ONE
// non-SMS send path because send-staff-message handles both. So we collapse
// the picker to two options.
type Channel = "message" | "sms" | "both";
type ChannelLabel = "sms" | "email" | "inapp" | "app" | string;

interface UnifiedMessage {
  id: string;
  channel: ChannelLabel;
  direction: "inbound" | "outbound" | "system" | string;
  body: string;
  occurred_at: string;
  read_at: string | null;
  staff_user_id: string | null;
  staff_full_name: string | null;
  thread_id: string | null;
  peer_phone_e164: string | null;
  template_key: string | null;
  status: string | null;
  quote_id: string | null;
  order_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface ChannelState {
  has_email: boolean;
  has_phone: boolean;
  last_used_channel: ChannelLabel | null;
  customer_email: string | null;
  customer_phone: string | null;
}

function channelIcon(ch: string) {
  if (ch === "sms") return <Smartphone className="w-3 h-3" />;
  if (ch === "email") return <Mail className="w-3 h-3" />;
  return <MessageSquare className="w-3 h-3" />;
}

function channelLabel(ch: string) {
  if (ch === "sms") return "SMS";
  if (ch === "email") return "Email";
  if (ch === "message") return "Message";
  if (ch === "both") return "Both";
  if (ch === "inapp" || ch === "app") return "Message";
  return ch;
}

function channelIconLarge(ch: string) {
  if (ch === "sms") return <Smartphone className="w-3.5 h-3.5" />;
  if (ch === "email") return <Mail className="w-3.5 h-3.5" />;
  return <MessageSquare className="w-3.5 h-3.5" />;
}

function channelColor(ch: string, direction: string) {
  if (direction === "outbound") {
    if (ch === "sms") return "bg-blue-600 text-white";
    return "bg-teal-600 text-white";
  }
  if (ch === "email") return "bg-purple-50 border border-purple-200 text-gray-900";
  return "bg-white border border-gray-200 text-gray-900";
}

export default function CustomerConversationTab({
  customerId,
  customerEmail,
}: {
  customerId: string;
  customerEmail?: string | null;
}) {
  const { staffUser } = useStaffAuth();
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [channelState, setChannelState] = useState<ChannelState | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [composeChannel, setComposeChannel] = useState<Channel>("message");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [msgRes, stateRes] = await Promise.all([
      supabase.rpc("comms_list_customer_conversation", {
        p_customer_id: customerId,
        p_limit: 500,
        p_before_ts: null,
      }),
      supabase.rpc("comms_get_customer_channel_state", { p_customer_id: customerId }),
    ]);
    setLoading(false);
    if (msgRes.error) {
      console.error("comms_list_customer_conversation failed", msgRes.error);
      return;
    }
    setMessages((msgRes.data || []) as UnifiedMessage[]);
    const state = Array.isArray(stateRes.data) ? (stateRes.data[0] as ChannelState | undefined) : null;
    if (state) {
      setChannelState(state);
      // Default composer: last-used channel collapsed to {message, sms}.
      // SMS only if the customer was last reached on SMS; otherwise message.
      const initial: Channel = state.last_used_channel === "sms" ? "sms" : "message";
      setComposeChannel(initial);
    }
    // Mark inbound as read
    await supabase.rpc("comms_mark_customer_thread_read", { p_customer_id: customerId });
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  // Combined realtime: subscribe to BOTH conversation_messages and comms.sms_messages
  // for this customer. comms.sms_messages isn't exposed via PostgREST realtime
  // directly — but supabase realtime works on table-level subscriptions and the
  // edge function inserts surface the same INSERT events.
  useEffect(() => {
    const channel = supabase
      .channel(`customer-conversation-${customerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_messages" },
        () => { load(); },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "comms", table: "sms_messages" },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [customerId, load]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const availableChannels: Channel[] = useMemo(() => {
    const out: Channel[] = ["message"]; // always available — auto-emails if customer has email
    if (channelState?.has_phone) out.push("sms");
    if (channelState?.has_phone) out.push("both"); // fan out to both
    return out;
  }, [channelState]);

  const send = async () => {
    if (!reply.trim() || !staffUser?.id) return;
    setSending(true);
    setError(null);
    try {
      const sendSms = composeChannel === "sms" || composeChannel === "both";
      const sendMsg = composeChannel === "message" || composeChannel === "both";

      // Fan-out for "both": fire in parallel so the customer gets the SMS and
      // the in-app/email near-simultaneously.
      const tasks: Array<Promise<{ kind: "sms" | "msg"; ok: boolean; err: string | null }>> = [];
      if (sendSms) {
        tasks.push((async () => {
          const { data, error: e } = await supabase.functions.invoke("rc-send-sms", {
            body: {
              custom_body: reply.trim(),
              to_number: channelState?.customer_phone,
              staff_user_id: staffUser.id,
              customer_id: customerId,
            },
          });
          return { kind: "sms" as const, ok: !e && !!data?.ok, err: e?.message || (data as { error?: string })?.error || null };
        })());
      }
      if (sendMsg) {
        tasks.push((async () => {
          const { data, error: e } = await supabase.functions.invoke("send-staff-message", {
            body: {
              customer_id: customerId,
              staff_id: staffUser.id,
              message_text: reply.trim(),
            },
          });
          const ok = !e && (!data || (data as { success?: boolean }).success !== false);
          return { kind: "msg" as const, ok, err: e?.message || (data as { error?: string })?.error || null };
        })());
      }
      const results = await Promise.all(tasks);
      const failures = results.filter((r) => !r.ok);
      if (failures.length === results.length) {
        // All failed
        setError(failures.map((f) => `${f.kind === "sms" ? "SMS" : "Message"}: ${f.err || "failed"}`).join(" · "));
        setSending(false);
        return;
      }
      if (failures.length > 0) {
        // Partial failure on "both"
        setError(`Partial: ${failures.map((f) => `${f.kind === "sms" ? "SMS" : "Message"} failed (${f.err || "unknown"})`).join(", ")}`);
      }
      setReply("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const counts = useMemo(() => {
    const c = { sms: 0, email: 0, message: 0 };
    for (const m of messages) {
      if (m.channel === "sms") c.sms++;
      else if (m.channel === "email") c.email++;
      else c.message++;
    }
    return c;
  }, [messages]);

  return (
    <div className="flex flex-col h-[640px]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="w-4 h-4" /> {messages.length} message{messages.length === 1 ? "" : "s"}
          </span>
          {counts.email > 0 && (
            <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
              <Mail className="w-3 h-3" /> {counts.email} email reply
            </span>
          )}
          {counts.message > 0 && (
            <span className="inline-flex items-center gap-1 text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded">
              <MessageSquare className="w-3 h-3" /> {counts.message} message
            </span>
          )}
          {counts.sms > 0 && (
            <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
              <Smartphone className="w-3 h-3" /> {counts.sms} SMS
            </span>
          )}
        </div>
        <button
          onClick={load}
          className="p-1.5 rounded hover:bg-gray-100"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* Message feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-50 border rounded p-3 mb-3">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-10 text-gray-500 text-sm">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            No conversation yet. Send a message below.
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => {
              const isSystem = m.direction === "system";
              if (isSystem) {
                return (
                  <div key={m.id} className="text-center text-xs text-gray-400 py-1">
                    {m.body}
                    <span className="ml-1">· {formatDistanceToNow(new Date(m.occurred_at), { addSuffix: true })}</span>
                  </div>
                );
              }
              return (
                <div
                  key={m.id}
                  className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                >
                  <div className="max-w-lg">
                    <div className={`relative rounded-lg px-3 py-2 ${channelColor(m.channel, m.direction)}`}>
                      {/* Prominent channel marker in the bubble itself, so SMS
                          stands apart from email/in-app at a glance. */}
                      <div
                        className={`absolute -top-2 ${m.direction === "outbound" ? "-right-2" : "-left-2"} rounded-full p-1 shadow-sm ${
                          m.channel === "sms"
                            ? "bg-blue-600 text-white"
                            : m.channel === "email"
                            ? "bg-purple-600 text-white"
                            : "bg-teal-600 text-white"
                        }`}
                        title={`Channel: ${channelLabel(m.channel)}`}
                      >
                        {channelIconLarge(m.channel)}
                      </div>
                      <div className="whitespace-pre-wrap text-sm">{m.body}</div>
                    </div>
                    <div className={`flex items-center gap-1 mt-1 text-[10px] ${m.direction === "outbound" ? "justify-end text-gray-500" : "text-gray-500"}`}>
                      <span
                        className={`inline-flex items-center gap-0.5 px-1 rounded font-medium ${
                          m.channel === "sms"
                            ? "bg-blue-100 text-blue-700"
                            : m.channel === "email"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-teal-100 text-teal-700"
                        }`}
                        title={`Channel: ${channelLabel(m.channel)}`}
                      >
                        {channelIcon(m.channel)} {channelLabel(m.channel)}
                      </span>
                      <span title={format(new Date(m.occurred_at), "PPpp")}>
                        {formatDistanceToNow(new Date(m.occurred_at), { addSuffix: true })}
                      </span>
                      {m.direction === "outbound" && m.staff_full_name && (
                        <span>· {m.staff_full_name}</span>
                      )}
                      {m.template_key && (
                        <span className="bg-blue-100 text-blue-700 px-1 rounded">{m.template_key}</span>
                      )}
                      {m.status && m.channel === "sms" && (
                        <span className="capitalize">· {m.status}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border rounded p-3 bg-white">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-gray-500">Channel:</span>
          <div className="flex bg-gray-100 rounded p-0.5">
            {availableChannels.map((ch) => (
              <button
                key={ch}
                onClick={() => setComposeChannel(ch)}
                className={`px-2 py-1 text-xs rounded inline-flex items-center gap-1 transition-colors ${
                  composeChannel === ch
                    ? "bg-white text-gray-900 shadow-sm font-medium"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {channelIcon(ch)} {channelLabel(ch)}
              </button>
            ))}
          </div>
          {composeChannel === "sms" && !channelState?.has_phone && (
            <span className="text-xs text-orange-600 inline-flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Customer has no phone on file
            </span>
          )}
          {composeChannel === "message" && !channelState?.has_email && (
            <span className="text-xs text-orange-600 inline-flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> No email on file — message saved in-app only
            </span>
          )}
          {channelState?.last_used_channel && (
            (composeChannel === "sms" && channelState.last_used_channel === "sms") ||
            (composeChannel === "message" && channelState.last_used_channel !== "sms")
          ) && (
            <span className="text-[10px] text-gray-400">· last used</span>
          )}
        </div>
        {error && (
          <div className="mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
            {error}
          </div>
        )}
        <div className="flex items-end gap-2">
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
            placeholder={`Send via ${channelLabel(composeChannel)}… (Enter to send, Shift+Enter for newline)`}
            disabled={composeChannel === "sms" && !channelState?.has_phone}
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm resize-none disabled:bg-gray-50"
          />
          <button
            onClick={send}
            disabled={
              !reply.trim()
              || sending
              || (composeChannel === "sms" && !channelState?.has_phone)
            }
            className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </button>
        </div>
        <div className="text-[10px] text-gray-400 mt-1">
          {composeChannel === "sms" && channelState?.customer_phone && (
            <>To {channelState.customer_phone} · </>
          )}
          {composeChannel === "message" && (
            <>To {channelState?.customer_email || "in-app only"} (email + in-app) · </>
          )}
          {composeChannel === "both" && (
            <>To {channelState?.customer_phone} (SMS) + {channelState?.customer_email || "in-app only"} (email + in-app) · </>
          )}
          {reply.length} chars
          {(composeChannel === "sms" || composeChannel === "both") && reply.length > 160 && (
            <span className="text-orange-500"> · over 160 chars, may be multiple SMS segments</span>
          )}
        </div>
      </div>
    </div>
  );
}
