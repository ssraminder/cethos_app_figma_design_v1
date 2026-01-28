import { useState, useRef } from "react";
import { Send, Paperclip, Loader2, X } from "lucide-react";

interface MessageComposerProps {
  conversationId?: string;
  customerId?: string;
  staffId?: string;
  quoteId?: string;
  onMessageSent: (message: any) => void;
  isSending: boolean;
  placeholder?: string;
}

export default function MessageComposer({
  conversationId,
  customerId,
  staffId,
  quoteId,
  onMessageSent,
  isSending: externalIsSending,
  placeholder = "Type your message...",
}: MessageComposerProps) {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments((prev) => [...prev, ...files]);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!message.trim() && attachments.length === 0) return;
    if (externalIsSending || isUploading) return;

    try {
      setIsUploading(true);

      const formData = new FormData();

      // Add message data
      if (conversationId) formData.append("conversation_id", conversationId);
      if (customerId) formData.append("customer_id", customerId);
      if (staffId) formData.append("staff_id", staffId);
      if (quoteId) formData.append("quote_id", quoteId);
      if (message.trim()) formData.append("message_text", message.trim());

      // Add attachments
      attachments.forEach((file, index) => {
        formData.append(`attachments`, file);
      });

      // Send to Edge Function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-customer-message`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: formData,
        },
      );

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const result = await response.json();

      if (result.success) {
        onMessageSent(result.message);
        setMessage("");
        setAttachments([]);
      } else {
        throw new Error(result.error || "Failed to send message");
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      alert("Failed to send message. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isSending = externalIsSending || isUploading;

  return (
    <div className="space-y-2">
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 text-sm"
            >
              <Paperclip className="w-4 h-4 text-gray-500" />
              <span className="text-gray-700 truncate max-w-[150px]">
                {file.name}
              </span>
              <button
                onClick={() => removeAttachment(index)}
                className="text-gray-400 hover:text-gray-600"
                type="button"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="flex gap-2 items-end">
        {/* Attachment button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          title="Attach file"
          type="button"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          accept="image/*,.pdf,.doc,.docx"
        />

        {/* Message input */}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 min-h-[42px] max-h-[120px]"
          style={{ height: "auto" }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = `${target.scrollHeight}px`;
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={(!message.trim() && attachments.length === 0) || isSending}
          className="flex-shrink-0 px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:bg-gray-400 flex items-center gap-2"
          title="Send message"
        >
          {isSending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <span className="hidden sm:inline">Send</span>
              <Send className="w-5 h-5" />
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-gray-400">
        Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}
