import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Send, Loader2, MessageSquare, Paperclip } from "lucide-react";
import MessageBubble from "./MessageBubble";

interface Message {
  id: string;
  sender_type: "staff" | "customer" | "system";
  sender_name: string;
  message_text: string;
  created_at: string;
  read_by_customer_at?: string | null;
  read_by_staff_at?: string | null;
}

interface MessagePanelProps {
  quoteId: string;
  staffId: string;
  staffName: string;
}

export default function MessagePanel({
  quoteId,
  staffId,
  staffName,
}: MessagePanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch messages using Edge Function (bypasses RLS)
  const fetchMessages = async () => {
    try {
      console.log("🔍 Fetching messages for quote:", quoteId);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-quote-messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            quote_id: quoteId,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch messages");
      }

      const result = await response.json();
      console.log("📨 API result:", result);

      if (result.success && result.messages) {
        console.log("✅ Found messages:", result.messages.length);
        setMessages(result.messages);
      } else {
        console.log("⚠️ No messages found");
        setMessages([]);
      }
    } catch (err) {
      console.error("❌ Failed to fetch messages:", err);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  // Get conversation ID from quote
  useEffect(() => {
    const getConversationId = async () => {
      if (!quoteId) return;

      try {
        // Get customer_id from quote
        const { data: quote, error: quoteError } = await supabase
          .from("quotes")
          .select("customer_id")
          .eq("id", quoteId)
          .single();

        if (quoteError) {
          console.error("Error fetching quote:", quoteError);
          return;
        }

        if (quote?.customer_id) {
          // Get conversation for this customer
          const { data: conversation, error: convError } = await supabase
            .from("customer_conversations")
            .select("id")
            .eq("customer_id", quote.customer_id)
            .maybeSingle();

          if (convError) {
            console.error("Error fetching conversation:", convError);
            return;
          }

          if (conversation) {
            console.log("💬 Found conversation ID:", conversation.id);
            setConversationId(conversation.id);
          } else {
            console.log("⚠️ No conversation found for customer");
          }
        }
      } catch (err) {
        console.error("Error getting conversation ID:", err);
      }
    };

    getConversationId();
  }, [quoteId]);

  // Fetch messages on mount
  useEffect(() => {
    fetchMessages();
  }, [quoteId]);

  // Set up realtime subscription using conversationId
  useEffect(() => {
    if (!conversationId) return;

    console.log(
      "🔔 Setting up realtime subscription for conversation:",
      conversationId,
    );

    // Set up realtime subscription
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log("📩 New message received:", payload.new);
          fetchMessages();
        },
      )
      .subscribe((status) => {
        console.log("🔔 Realtime subscription status:", status);
      });

    return () => {
      console.log("🔕 Unsubscribing from realtime");
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message
  const handleSend = async () => {
    if (!newMessage.trim()) return;

    setSending(true);
    try {
      // Call Edge Function with correct parameter names
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-staff-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            quote_id: quoteId,
            staff_id: staffId,
            message_text: newMessage.trim(),
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to send message");
      }

      // Parse successful response
      try {
        const payload = await response.json();
        if (payload?.success && payload?.message) {
          setMessages((prev) => [
            ...prev,
            {
              id: payload.message.id,
              sender_type: payload.message.sender_type,
              sender_name: payload.message.sender_name || staffName,
              message_text: payload.message.message_text,
              created_at: payload.message.created_at,
            },
          ]);
        }
      } catch (parseError) {
        console.warn("Failed to parse message response:", parseError);
      }

      setNewMessage("");
      await fetchMessages();
    } catch (err) {
      console.error("Failed to send message:", err);
      alert("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // Handle enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col h-[500px]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-medium text-gray-700 truncate">
            Messages
          </h3>
          {messages.length > 0 && (
            <span className="ml-auto text-xs text-gray-500 flex-shrink-0">
              {messages.length}
            </span>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-xs text-center">No messages yet</p>
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

      {/* Compose Area */}
      <div className="p-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex gap-2 items-start">
          <button
            type="button"
            className="flex-shrink-0 p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Attach file (coming soon)"
            onClick={() => alert("File attachments coming soon!")}
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message..."
            rows={1}
            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs resize-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="flex-shrink-0 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:bg-gray-400"
            title="Send message"
          >
            {sending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
