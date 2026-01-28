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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch messages
  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from("conversation_messages")
        .select(
          `
          id,
          conversation_id,
          quote_id,
          order_id,
          sender_type,
          sender_customer_id,
          sender_staff_id,
          message_type,
          message_text,
          read_by_customer_at,
          read_by_staff_at,
          source,
          created_at,
          staff_users!sender_staff_id(full_name),
          customers!sender_customer_id(full_name)
        `,
        )
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const formattedMessages =
        data?.map((msg: any) => ({
          id: msg.id,
          sender_type: msg.sender_type,
          sender_name:
            msg.sender_type === "staff"
              ? msg.staff_users?.full_name || "Staff"
              : msg.sender_type === "customer"
                ? msg.customers?.full_name || "Customer"
                : "System",
          message_text: msg.message_text,
          created_at: msg.created_at,
          read_by_customer_at: msg.read_by_customer_at,
          read_by_staff_at: msg.read_by_staff_at,
        })) || [];

      setMessages(formattedMessages);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();

    // Set up realtime subscription
    const channel = supabase
      .channel(`messages-${quoteId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: `quote_id=eq.${quoteId}`,
        },
        () => {
          fetchMessages();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [quoteId]);

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
