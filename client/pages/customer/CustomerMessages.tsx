import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Loader2, ChevronDown } from "lucide-react";
import { useAuth } from "../../context/CustomerAuthContext";
import { supabase } from "../../lib/supabase";
import CustomerLayout from "../../components/layouts/CustomerLayout";
import MessageThread from "../../components/messaging/MessageThread";
import MessageComposer from "../../components/messaging/MessageComposer";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const ACTIVE_STATUSES = ["pending", "paid", "in_production", "draft_review"];

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Review",
  paid: "In Progress",
  in_production: "In Production",
  draft_review: "Under Review",
};

interface ActiveOrder {
  id: string;
  order_number: string;
  status: string;
  quote_id: string | null;
  quote_number: string | null;
}

interface Conversation {
  id: string;
  customer_id: string;
  unread_count_customer: number;
  unread_count_staff: number;
  last_message_at: string;
  created_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_type: "staff" | "customer" | "system";
  sender_name?: string;
  sender_customer_id?: string;
  sender_staff_id?: string;
  message_text?: string;
  message_type?: string;
  metadata?: any;
  attachments?: any[];
  created_at: string;
  read_by_customer_at?: string | null;
  read_by_staff_at?: string | null;
}

export default function CustomerMessages() {
  const { session, customer } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Order context state
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ActiveOrder | null>(null);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  // AbortController ref for polling
  const pollingAbortRef = useRef<AbortController | null>(null);

  // Fetch messages with AbortController support
  const fetchMessages = useCallback(async () => {
    if (!customer?.id) return;

    // Cancel any in-flight fetch before starting a new one
    if (pollingAbortRef.current) pollingAbortRef.current.abort();
    const controller = new AbortController();
    pollingAbortRef.current = controller;

    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/get-quote-messages?customer_id=${customer.id}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          signal: controller.signal,
        },
      );

      if (!res.ok) return;
      const data = await res.json();

      if (data.success) {
        const conversationId = data.conversation_id;
        setConversation(
          conversationId ? ({ id: conversationId } as Conversation) : null,
        );
        setMessages(data.messages || []);

        // Mark messages as read
        if (conversationId && document.visibilityState === "visible") {
          fetch(
            `${SUPABASE_URL}/functions/v1/mark-messages-read`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                conversation_id: conversationId,
                reader_type: "customer",
                reader_id: customer.id,
              }),
            },
          ).catch((err) =>
            console.error("Failed to mark messages as read:", err),
          );
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return; // expected on rapid re-fetch
      console.error("fetchMessages error:", err);
    }
  }, [customer?.id]);

  // Initial load
  useEffect(() => {
    if (!customer?.id) return;

    async function initialLoad() {
      setIsLoading(true);
      setError(null);
      try {
        await fetchMessages();
      } catch (err) {
        console.error("Failed to load messages:", err);
        setError("Failed to load messages. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }

    initialLoad();

    return () => {
      pollingAbortRef.current?.abort();
    };
  }, [customer?.id, fetchMessages]);

  // Fetch active orders on mount
  useEffect(() => {
    if (!customer?.id) return;

    async function loadOrders() {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/get-customer-dashboard?customer_id=${customer!.id}`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
          },
        );

        if (!res.ok) return;
        const data = await res.json();

        const orders: ActiveOrder[] = (data.orders || [])
          .filter((o: any) => ACTIVE_STATUSES.includes(o.status))
          .map((o: any) => ({
            id: o.id,
            order_number: o.order_number,
            status: o.status,
            quote_id: o.quote_id || null,
            quote_number: o.quote_number || null,
          }));

        setActiveOrders(orders);

        // Auto-select if exactly 1 active order
        if (orders.length === 1) {
          setSelectedOrder(orders[0]);
        }
      } catch (err) {
        console.error("Failed to load active orders:", err);
      } finally {
        setOrdersLoaded(true);
      }
    }

    loadOrders();
  }, [customer?.id]);

  // Realtime subscription + polling
  useEffect(() => {
    if (!conversation?.id || !customer?.id) return;

    console.log(
      "🔔 Setting up realtime subscription for conversation:",
      conversation.id,
    );

    // Realtime subscription
    const channel = supabase
      .channel(`customer-messages:${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          console.log("📩 New message received via realtime:", payload.new);
          fetchMessages();
        },
      )
      .subscribe((status) => {
        console.log("🔔 Realtime subscription status:", status);
      });

    // Polling fallback (every 10 seconds)
    const pollingInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        console.log("🔄 Polling for new messages");
        fetchMessages();
      }
    }, 10000);

    return () => {
      console.log(
        "🔕 Unsubscribing from customer realtime and stopping polling",
      );
      supabase.removeChannel(channel);
      clearInterval(pollingInterval);
      pollingAbortRef.current?.abort();
    };
  }, [conversation?.id, customer?.id, fetchMessages]);

  // Handle message sent
  const handleMessageSent = (message: Message) => {
    setMessages((prev) => [...prev, message]);
  };

  if (!session || !customer) {
    return (
      <CustomerLayout>
        <div className="max-w-4xl mx-auto py-12 px-4 text-center">
          <p className="text-gray-600">Please log in to view messages.</p>
        </div>
      </CustomerLayout>
    );
  }

  // Determine composer state
  const needsOrderSelection =
    activeOrders.length > 1 && selectedOrder === null;

  return (
    <CustomerLayout>
      <div className="max-w-4xl mx-auto py-6 px-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Messages</h1>
          {conversation && conversation.unread_count_customer > 0 && (
            <span className="bg-red-500 text-white text-sm px-3 py-1 rounded-full font-medium">
              {conversation.unread_count_customer} unread
            </span>
          )}
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Message Thread */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="h-[500px] overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <MessageSquare className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">No messages yet</p>
                <p className="text-sm text-center mt-2">
                  Send us a message below to get started!
                </p>
              </div>
            ) : (
              <MessageThread
                messages={messages}
                currentUserId={customer.id}
                isStaffView={false}
              />
            )}
          </div>

          {/* Context chip + Composer area */}
          <div className="border-t border-gray-200 bg-gray-50">
            {/* Context chip */}
            {ordersLoaded && (
              <div className="px-4 pt-3">
                {selectedOrder ? (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-600 text-white text-sm rounded-full">
                    <span>
                      Messaging about: Order #{selectedOrder.order_number}
                    </span>
                    {activeOrders.length > 1 && (
                      <button
                        onClick={() => setSelectedOrder(null)}
                        className="inline-flex items-center gap-0.5 text-teal-100 hover:text-white transition-colors underline underline-offset-2"
                      >
                        Change
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ) : activeOrders.length === 0 ? (
                  <div className="inline-flex items-center px-3 py-1.5 bg-gray-400 text-white text-sm rounded-full">
                    General Inquiry
                  </div>
                ) : null}
              </div>
            )}

            {/* Order picker (2+ orders, none selected) */}
            {needsOrderSelection ? (
              <div className="p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Which order are you contacting us about?
                </p>
                <select
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
                  value=""
                  onChange={(e) => {
                    const order = activeOrders.find(
                      (o) => o.id === e.target.value,
                    );
                    if (order) setSelectedOrder(order);
                  }}
                >
                  <option value="" disabled>
                    Select an order...
                  </option>
                  {activeOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      Order #{order.order_number} —{" "}
                      {STATUS_LABELS[order.status] || order.status}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                {/* No active orders banner */}
                {ordersLoaded && activeOrders.length === 0 && (
                  <div className="px-4 pt-2">
                    <p className="text-xs text-gray-400">
                      No active orders found. Our team will respond to your
                      inquiry.
                    </p>
                  </div>
                )}

                {/* Composer */}
                <div className="p-4">
                  <MessageComposer
                    conversationId={conversation?.id}
                    customerId={customer.id}
                    orderId={selectedOrder?.id ?? undefined}
                    quoteId={selectedOrder?.quote_id ?? undefined}
                    onMessageSent={handleMessageSent}
                    isSending={isSending}
                    placeholder="Type your message to CETHOS staff..."
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Help text */}
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-500">
            Our team typically responds within 24 hours during business days.
          </p>
        </div>
      </div>
    </CustomerLayout>
  );
}
