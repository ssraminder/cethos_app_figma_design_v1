import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  Loader2,
  RefreshCw,
  ShoppingCart,
  FileText,
  Clock,
  CheckCheck,
  User,
  X,
  Send,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Paperclip,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useStaffNotifications } from "@/context/StaffNotificationContext";
import { useStaffAuth } from "@/context/StaffAuthContext";
import { formatDistanceToNow, format } from "date-fns";
import MessageBubble from "@/components/messaging/MessageBubble";

const PAGE_SIZE = 30;

interface ConversationSummary {
  conversation_id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  last_message_text: string;
  last_message_at: string;
  last_sender_type: "staff" | "customer" | "system";
  unread_count: number;
  order_id: string | null;
  order_number: string | null;
  quote_id: string | null;
  quote_number: string | null;
}

export default function AdminMessages() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedConv, setSelectedConv] = useState<ConversationSummary | null>(
    null,
  );
  const { resetUnread } = useStaffNotifications();

  const fetchConversations = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc(
        "get_admin_conversation_summaries",
        { p_limit: PAGE_SIZE + 1, p_offset: page * PAGE_SIZE },
      );

      if (error) {
        console.error("Error fetching conversations:", error);
        return;
      }

      const rows = data || [];
      setHasMore(rows.length > PAGE_SIZE);

      const summaries: ConversationSummary[] = rows
        .slice(0, PAGE_SIZE)
        .map((row: any) => ({
          conversation_id: row.conversation_id,
          customer_id: row.customer_id,
          customer_name: row.customer_name || "Unknown Customer",
          customer_email: row.customer_email || "",
          last_message_text: row.last_message_text || "(attachment)",
          last_message_at: row.last_message_at,
          last_sender_type: row.last_sender_type,
          unread_count: row.unread_count || 0,
          order_id: row.order_id,
          order_number: row.order_number,
          quote_id: row.quote_id,
          quote_number: row.quote_number,
        }));

      setConversations(summaries);
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
    }
  }, [page]);

  useEffect(() => {
    setIsLoading(true);
    fetchConversations().finally(() => setIsLoading(false));
  }, [fetchConversations]);

  // Realtime: refresh on new customer messages
  useEffect(() => {
    const channel = supabase
      .channel("admin-messages-page")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: "sender_type=eq.customer",
        },
        () => {
          fetchConversations();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConversations]);

  useEffect(() => {
    resetUnread();
  }, [resetUnread]);

  const filtered =
    filter === "unread"
      ? conversations.filter((c) => c.unread_count > 0)
      : conversations;

  const totalUnread = conversations.reduce(
    (sum, c) => sum + c.unread_count,
    0,
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Messages</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalUnread > 0
              ? `${totalUnread} unread message${totalUnread !== 1 ? "s" : ""}`
              : "All caught up"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                filter === "all"
                  ? "bg-white text-gray-900 shadow-sm font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                filter === "unread"
                  ? "bg-white text-gray-900 shadow-sm font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Unread
              {totalUnread > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {totalUnread}
                </span>
              )}
            </button>
          </div>
          <button
            onClick={() => fetchConversations()}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Conversation list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <MessageSquare className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg font-medium">
            {filter === "unread" ? "No unread messages" : "No conversations yet"}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
            {filtered.map((conv) => (
              <ConversationRow
                key={conv.conversation_id}
                conversation={conv}
                onSelect={() => setSelectedConv(conv)}
              />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-500">
              Page {page + 1}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Conversation Modal */}
      {selectedConv && (
        <ConversationModal
          conversation={selectedConv}
          onClose={() => {
            setSelectedConv(null);
            fetchConversations();
          }}
        />
      )}
    </div>
  );
}

// ─── Conversation Row ────────────────────────────────────────────────────────

function ConversationRow({
  conversation: conv,
  onSelect,
}: {
  conversation: ConversationSummary;
  onSelect: () => void;
}) {
  const projectLink = conv.order_id
    ? `/admin/orders/${conv.order_id}`
    : conv.quote_id
      ? `/admin/quotes/${conv.quote_id}`
      : null;

  const hasUnread = conv.unread_count > 0;

  return (
    <div
      onClick={onSelect}
      className={`block px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer ${
        hasUnread ? "bg-blue-50/40" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
            hasUnread ? "bg-teal-100" : "bg-gray-100"
          }`}
        >
          <User
            className={`w-5 h-5 ${hasUnread ? "text-teal-600" : "text-gray-400"}`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-sm truncate ${
                hasUnread
                  ? "font-semibold text-gray-900"
                  : "font-medium text-gray-700"
              }`}
            >
              {conv.customer_name}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
              {conv.last_sender_type === "staff" && (
                <CheckCheck className="w-3 h-3" />
              )}
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(conv.last_message_at), {
                addSuffix: true,
              })}
            </span>
          </div>

          <p
            className={`text-sm mt-0.5 truncate ${
              hasUnread ? "text-gray-800" : "text-gray-500"
            }`}
          >
            {conv.last_sender_type === "staff" && (
              <span className="text-gray-400">You: </span>
            )}
            {conv.last_message_text}
          </p>

          {/* Tags: project link + unread badge */}
          <div className="flex items-center gap-2 mt-1.5">
            {conv.order_number && (
              <Link
                to={projectLink!}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded font-medium hover:bg-green-100 transition-colors"
              >
                <ShoppingCart className="w-3 h-3" />
                Order #{conv.order_number}
                <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
              </Link>
            )}
            {conv.quote_number && !conv.order_number && (
              <Link
                to={`/admin/quotes/${conv.quote_id}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-medium hover:bg-blue-100 transition-colors"
              >
                <FileText className="w-3 h-3" />
                Quote #{conv.quote_number}
                <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
              </Link>
            )}
            {hasUnread && (
              <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                {conv.unread_count} new
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Conversation Modal ──────────────────────────────────────────────────────

interface ConvMessage {
  id: string;
  sender_type: "staff" | "customer" | "system";
  sender_name: string;
  message_text: string;
  message_type?: string;
  metadata?: any;
  attachments?: any[];
  created_at: string;
  read_by_staff_at?: string | null;
  read_by_customer_at?: string | null;
}

function ConversationModal({
  conversation: conv,
  onClose,
}: {
  conversation: ConversationSummary;
  onClose: () => void;
}) {
  const { staffUser } = useStaffAuth();
  const [messages, setMessages] = useState<ConvMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const projectLink = conv.order_id
    ? `/admin/orders/${conv.order_id}`
    : conv.quote_id
      ? `/admin/quotes/${conv.quote_id}`
      : null;

  const projectLabel = conv.order_number
    ? `Order #${conv.order_number}`
    : conv.quote_number
      ? `Quote #${conv.quote_number}`
      : null;

  const fetchMessages = useCallback(async () => {
    try {
      // Fetch messages
      const { data: msgs, error: msgErr } = await supabase
        .from("conversation_messages")
        .select(
          "id, sender_type, sender_staff_id, sender_customer_id, message_text, message_type, metadata, created_at, read_by_staff_at, read_by_customer_at",
        )
        .eq("conversation_id", conv.conversation_id)
        .order("created_at", { ascending: true });

      if (msgErr || !msgs) {
        console.error("Error fetching messages:", msgErr);
        return;
      }

      // Fetch attachments for these messages
      const msgIds = msgs.map((m) => m.id);
      let attachmentsByMsg: Record<string, any[]> = {};
      if (msgIds.length > 0) {
        const { data: atts } = await supabase
          .from("message_attachments")
          .select("*")
          .in("message_id", msgIds);
        if (atts && atts.length > 0) {
          // Generate signed download URLs for each attachment
          const withUrls = await Promise.all(
            atts.map(async (a) => {
              if (a.storage_path) {
                const { data: urlData } = await supabase.storage
                  .from("message-attachments")
                  .createSignedUrl(a.storage_path, 3600); // 1 hour expiry
                return { ...a, download_url: urlData?.signedUrl || null };
              }
              return { ...a, download_url: null };
            }),
          );
          for (const a of withUrls) {
            if (!attachmentsByMsg[a.message_id])
              attachmentsByMsg[a.message_id] = [];
            attachmentsByMsg[a.message_id].push(a);
          }
        }
      }

      // Resolve staff sender names
      const staffIds = [
        ...new Set(
          msgs
            .filter((m) => m.sender_type === "staff" && m.sender_staff_id)
            .map((m) => m.sender_staff_id),
        ),
      ];
      let staffNames: Record<string, string> = {};
      if (staffIds.length > 0) {
        const { data: staffData } = await supabase
          .from("staff_users")
          .select("id, full_name")
          .in("id", staffIds);
        if (staffData) {
          for (const s of staffData) staffNames[s.id] = s.full_name;
        }
      }

      const enriched: ConvMessage[] = msgs.map((msg) => ({
        id: msg.id,
        sender_type: msg.sender_type,
        sender_name:
          msg.sender_type === "customer"
            ? conv.customer_name
            : msg.sender_type === "staff"
              ? staffNames[msg.sender_staff_id] || "Staff"
              : "System",
        message_text: msg.message_text || "",
        message_type: msg.message_type,
        metadata: msg.metadata,
        attachments: attachmentsByMsg[msg.id] || [],
        created_at: msg.created_at,
        read_by_staff_at: msg.read_by_staff_at,
        read_by_customer_at: msg.read_by_customer_at,
      }));

      setMessages(enriched);

      // Mark unread customer messages as read
      const hasUnread = msgs.some(
        (m) => m.sender_type === "customer" && !m.read_by_staff_at,
      );
      if (hasUnread && staffUser) {
        fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mark-messages-read`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              conversation_id: conv.conversation_id,
              reader_type: "staff",
              reader_id: staffUser.id,
            }),
          },
        ).catch(() => {});
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      setLoading(false);
    }
  }, [conv.conversation_id, conv.customer_name, staffUser]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel(`conv-modal-${conv.conversation_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: `conversation_id=eq.${conv.conversation_id}`,
        },
        () => fetchMessages(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conv.conversation_id, fetchMessages]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSend = async () => {
    if (!newMessage.trim() || !staffUser) return;
    setSending(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-staff-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            customer_id: conv.customer_id,
            quote_id: conv.quote_id,
            order_id: conv.order_id,
            staff_id: staffUser.id,
            message_text: newMessage.trim(),
          }),
        },
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to send");
      }

      setNewMessage("");
      if (textareaRef.current) textareaRef.current.style.height = "40px";
      await fetchMessages();
    } catch (err) {
      console.error("Send failed:", err);
      alert("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {conv.customer_name}
            </h2>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-gray-500">{conv.customer_email}</span>
              {projectLink && projectLabel && (
                <Link
                  to={projectLink}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-teal-50 text-teal-700 rounded font-medium hover:bg-teal-100 transition-colors"
                >
                  {conv.order_number ? (
                    <ShoppingCart className="w-3 h-3" />
                  ) : (
                    <FileText className="w-3 h-3" />
                  )}
                  {projectLabel}
                  <ExternalLink className="w-2.5 h-2.5" />
                </Link>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <MessageSquare className="w-10 h-10 mb-2 opacity-50" />
              <p className="text-sm">No messages</p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={msg.sender_type === "staff"}
                isStaffView={true}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Compose */}
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0 rounded-b-xl">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height =
                  Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type a reply..."
              rows={1}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
              style={{ minHeight: "40px", maxHeight: "120px" }}
            />
            <button
              onClick={handleSend}
              disabled={!newMessage.trim() || sending}
              className="flex-shrink-0 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:bg-gray-400"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1 text-right">
            {typeof navigator !== "undefined" &&
            (navigator.platform?.includes("Mac") ||
              navigator.userAgent?.includes("Mac"))
              ? "\u2318"
              : "Ctrl"}
            +Enter to send
          </p>
        </div>
      </div>
    </div>
  );
}
