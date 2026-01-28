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

      // Step 1: Upload attachments first (if any) to get temp paths
      const tempPaths: string[] = [];

      if (attachments.length > 0) {
        // Need conversation ID to upload - if we don't have one, we'll create it in the message send
        // For now, upload each file one by one
        for (const file of attachments) {
          const uploadFormData = new FormData();
          uploadFormData.append("file", file);

          // Use temp conversation ID if we don't have a real one yet
          const tempConversationId = conversationId || `temp_${customerId}`;
          uploadFormData.append("conversation_id", tempConversationId);
          uploadFormData.append("uploader_type", customerId ? "customer" : "staff");
          uploadFormData.append("uploader_id", customerId || staffId || "");

          const uploadResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-message-attachment`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: uploadFormData,
            },
          );

          if (uploadResponse.ok) {
            const uploadResult = await uploadResponse.json();
            if (uploadResult.success && uploadResult.data.temp_path) {
              tempPaths.push(uploadResult.data.temp_path);
            }
          } else {
            console.error("Failed to upload file:", file.name);
            // Continue with other files
          }
        }
      }

      // Step 2: Send message with JSON payload including temp paths
      const payload: any = {};

      if (customerId) payload.customer_id = customerId;
      if (staffId) payload.staff_id = staffId;
      if (quoteId) payload.quote_id = quoteId;
      if (message.trim()) payload.message_text = message.trim();
      if (tempPaths.length > 0) payload.attachments = tempPaths;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-customer-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const result = await response.json();

      if (result.success) {
        onMessageSent(result.data.message);
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
