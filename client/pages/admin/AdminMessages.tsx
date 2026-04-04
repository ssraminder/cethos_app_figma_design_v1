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
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useStaffNotifications } from "@/context/StaffNotificationContext";
import { formatDistanceToNow } from "date-fns";

interface ConversationSummary {
  conversation_id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  last_message_text: string;
  last_message_at: string;
  last_sender_type: "staff" | "customer" | "system";
  unread_count: number;
  // Linked order/quote from most recent message
  order_id: string | null;
  order_number: string | null;
  quote_id: string | null;
  quote_number: string | null;
}

export default function AdminMessages() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const { resetUnread } = useStaffNotifications();
  const pollingRef = useRef<AbortController | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      // Fetch all customer conversations with customer info
      const { data: convs, error: convError } = await supabase
        .from("customer_conversations")
        .select(
          "id, customer_id, last_message_at, customers(full_name, email)",
        )
        .order("last_message_at", { ascending: false });

      if (convError || !convs) {
        console.error("Error fetching conversations:", convError);
        return;
      }

      // For each conversation, get the latest message and unread count
      const summaries: ConversationSummary[] = [];

      for (const conv of convs) {
        // Get latest message
        const { data: latestMsg } = await supabase
          .from("conversation_messages")
          .select(
            "id, message_text, sender_type, created_at, read_by_staff_at, order_id, quote_id",
          )
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!latestMsg) continue; // skip empty conversations

        // Get unread count (customer messages not read by staff)
        const { count } = await supabase
          .from("conversation_messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .eq("sender_type", "customer")
          .is("read_by_staff_at", null);

        // Resolve order/quote numbers if IDs present
        let orderNumber: string | null = null;
        let quoteNumber: string | null = null;

        if (latestMsg.order_id) {
          const { data: ord } = await supabase
            .from("orders")
            .select("order_number")
            .eq("id", latestMsg.order_id)
            .maybeSingle();
          orderNumber = ord?.order_number || null;
        }

        if (latestMsg.quote_id) {
          const { data: qt } = await supabase
            .from("quotes")
            .select("quote_number")
            .eq("id", latestMsg.quote_id)
            .maybeSingle();
          quoteNumber = qt?.quote_number || null;
        }

        summaries.push({
          conversation_id: conv.id,
          customer_id: conv.customer_id,
          customer_name:
            (conv.customers as any)?.full_name || "Unknown Customer",
          customer_email: (conv.customers as any)?.email || "",
          last_message_text: latestMsg.message_text || "(attachment)",
          last_message_at: latestMsg.created_at,
          last_sender_type: latestMsg.sender_type,
          unread_count: count || 0,
          order_id: latestMsg.order_id,
          order_number: orderNumber,
          quote_id: latestMsg.quote_id,
          quote_number: quoteNumber,
        });
      }

      setConversations(summaries);
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
    }
  }, []);

  // Initial load
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

  // Reset sidebar badge when viewing this page
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
          {/* Filter tabs */}
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
          {filtered.map((conv) => (
            <ConversationRow key={conv.conversation_id} conversation={conv} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConversationRow({
  conversation: conv,
}: {
  conversation: ConversationSummary;
}) {
  // Determine the best link — prefer order, fall back to quote, then customer
  const linkTo = conv.order_id
    ? `/admin/orders/${conv.order_id}`
    : conv.quote_id
      ? `/admin/quotes/${conv.quote_id}`
      : `/admin/customers/${conv.customer_id}`;

  const hasUnread = conv.unread_count > 0;

  return (
    <Link
      to={linkTo}
      className={`block px-5 py-4 hover:bg-gray-50 transition-colors ${
        hasUnread ? "bg-blue-50/40" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
            hasUnread ? "bg-teal-100" : "bg-gray-100"
          }`}
        >
          <User
            className={`w-5 h-5 ${hasUnread ? "text-teal-600" : "text-gray-400"}`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-sm truncate ${
                hasUnread ? "font-semibold text-gray-900" : "font-medium text-gray-700"
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

          {/* Tags: order/quote + unread badge */}
          <div className="flex items-center gap-2 mt-1.5">
            {conv.order_number && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded font-medium">
                <ShoppingCart className="w-3 h-3" />
                Order #{conv.order_number}
              </span>
            )}
            {conv.quote_number && !conv.order_number && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">
                <FileText className="w-3 h-3" />
                Quote #{conv.quote_number}
              </span>
            )}
            {hasUnread && (
              <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                {conv.unread_count} new
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
