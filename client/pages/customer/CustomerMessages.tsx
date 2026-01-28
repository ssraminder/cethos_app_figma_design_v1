import { useState, useEffect } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { useAuth } from "../../context/CustomerAuthContext";
import CustomerLayout from "../../components/layouts/CustomerLayout";
import MessageThread from "../../components/messaging/MessageThread";
import MessageComposer from "../../components/messaging/MessageComposer";

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

  // Fetch messages
  useEffect(() => {
    if (!customer?.id) return;

    async function loadMessages() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-quote-messages?customer_id=${customer.id}`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error("Failed to load messages");
        }

        const data = await response.json();

        if (data.success) {
          // Note: get-quote-messages returns conversation_id directly, not in a data object
          setConversation(data.conversation_id ? { id: data.conversation_id } as Conversation : null);
          setMessages(data.messages || []);
        } else {
          setError(data.error || "Failed to load messages");
        }
      } catch (err) {
        console.error("Failed to load messages:", err);
        setError("Failed to load messages. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }

    loadMessages();
  }, [customer?.id]);

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

          {/* Composer */}
          <div className="border-t border-gray-200 p-4 bg-gray-50">
            <MessageComposer
              conversationId={conversation?.id}
              customerId={customer.id}
              onMessageSent={handleMessageSent}
              isSending={isSending}
              placeholder="Type your message to CETHOS staff..."
            />
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
