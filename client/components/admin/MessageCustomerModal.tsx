import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  X,
  Send,
  Loader2,
  MessageSquare,
  Mail,
  Paperclip,
  FileText,
  Download,
} from "lucide-react";
import { format } from "date-fns";

interface Attachment {
  id: string;
  filename: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  url?: string;
}

interface Message {
  id: string;
  sender_type: "staff" | "customer" | "system";
  sender_name: string;
  message_text: string;
  source: "app" | "email";
  created_at: string;
  attachments?: Attachment[];
}

interface MessageCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  customerEmail: string;
  quoteId?: string;
  staffId: string;
  staffName: string;
}

export default function MessageCustomerModal({
  isOpen,
  onClose,
  customerId,
  customerName,
  customerEmail,
  quoteId,
  staffId,
  staffName,
}: MessageCustomerModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("File size must be less than 10MB");
      return;
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];

    if (!allowedTypes.includes(file.type)) {
      alert(
        "File type not supported. Please upload PDF, images, Word docs, or text files.",
      );
      return;
    }

    setSelectedFile(file);
  };

  // Clear selected file
  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Upload file and get attachment ID
  const uploadFile = async (): Promise<string | null> => {
    if (!selectedFile) return null;

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("conversation_id", conversationId || "");
      formData.append("uploader_type", "staff");
      formData.append("uploader_id", staffId);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-message-attachment`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: formData,
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload failed");
      }

      const data = await response.json();
      setUploadProgress(100);
      console.log("✅ File uploaded successfully");
      return data.data?.temp_path || null;
    } catch (err) {
      console.error("File upload failed:", err);
      alert(
        `Failed to upload file: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      return null;
    } finally {
      setUploading(false);
    }
  };

  // Fetch messages via Edge Function
  const fetchMessages = async () => {
    try {
      console.log(
        "🔍 Fetching messages for customer:",
        customerId,
        "quote:",
        quoteId,
      );

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-quote-messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            customer_id: customerId,
            quote_id: quoteId,
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        console.log("📨 Messages loaded:", data.messages?.length);
        setMessages(data.messages || []);

        // Extract conversation ID from first message if available
        if (data.messages?.[0]?.conversation_id) {
          setConversationId(data.messages[0].conversation_id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    if (isOpen && customerId) {
      setLoading(true);
      fetchMessages();
    }
  }, [isOpen, customerId, quoteId]);

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;

    console.log(
      "🔔 Setting up realtime subscription for conversation:",
      conversationId,
    );

    const channel = supabase
      .channel(`modal-messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log("📩 New message in modal:", payload.new);
          fetchMessages();
        },
      )
      .subscribe((status) => {
        console.log("🔔 Realtime subscription status:", status);
      });

    return () => {
      console.log("🔕 Unsubscribing from modal realtime");
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message
  const handleSend = async () => {
    if (!newMessage.trim() && !selectedFile) return;

    setSending(true);
    try {
      // Upload file first if selected
      let attachmentPath = null;
      if (selectedFile) {
        attachmentPath = await uploadFile();
        if (!attachmentPath) {
          throw new Error("Failed to upload file");
        }
      }

      // Send message with attachment path
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-staff-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            customer_id: customerId,
            quote_id: quoteId || null,
            message_text:
              newMessage.trim() ||
              (selectedFile ? `Sent a file: ${selectedFile.name}` : ""),
            staff_id: staffId,
            attachments: attachmentPath ? [attachmentPath] : [],
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const data = await response.json();
      console.log("✅ Message sent");

      setNewMessage("");
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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

  // File preview component
  const FilePreview = ({
    file,
    onRemove,
  }: {
    file: File;
    onRemove: () => void;
  }) => {
    const isImage = file.type.startsWith("image/");
    const fileSize = (file.size / 1024).toFixed(1) + " KB";

    return (
      <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-2 mt-2">
        {isImage ? (
          <img
            src={URL.createObjectURL(file)}
            alt="Preview"
            className="w-10 h-10 object-cover rounded"
          />
        ) : (
          <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
            <Paperclip className="w-5 h-5 text-gray-500" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700 truncate">
            {file.name}
          </p>
          <p className="text-xs text-gray-500">{fileSize}</p>
        </div>
        <button
          onClick={onRemove}
          className="p-1 hover:bg-gray-200 rounded"
          title="Remove file"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>
    );
  };

  // Attachment display component
  const AttachmentDisplay = ({ attachment }: { attachment: Attachment }) => {
    const isImage = attachment.mime_type?.startsWith("image/") || false;
    const fileSize = (attachment.file_size / 1024).toFixed(1) + " KB";

    const handleDownload = async () => {
      try {
        const { data } = await supabase.storage
          .from("message-attachments")
          .createSignedUrl(attachment.storage_path, 60);

        if (data?.signedUrl) {
          window.open(data.signedUrl, "_blank");
        }
      } catch (err) {
        console.error("Failed to get download URL:", err);
      }
    };

    return (
      <div
        onClick={handleDownload}
        className="mt-2 flex items-center gap-2 bg-white/20 rounded-lg p-2 cursor-pointer hover:bg-white/30 transition-colors"
      >
        {isImage ? (
          <img
            src={attachment.url}
            alt={attachment.filename}
            className="w-16 h-16 object-cover rounded"
          />
        ) : (
          <div className="w-10 h-10 bg-white/30 rounded flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{attachment.filename}</p>
          <p className="text-xs opacity-75">{fileSize}</p>
        </div>
        <Download className="w-4 h-4 opacity-75 flex-shrink-0" />
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">{customerName}</h2>
            <p className="text-sm text-gray-500">{customerEmail}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No messages yet</p>
              <p className="text-xs mt-1">
                Send a message to start the conversation
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`max-w-[80%] rounded-xl px-4 py-3 ${
                  msg.sender_type === "staff"
                    ? "bg-blue-600 text-white ml-auto"
                    : msg.sender_type === "system"
                      ? "bg-gray-100 text-gray-600 text-center text-sm italic mx-auto"
                      : "bg-gray-100 text-gray-800"
                }`}
              >
                {msg.sender_type !== "system" && (
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className={`text-xs font-medium ${
                        msg.sender_type === "staff"
                          ? "text-blue-100"
                          : "text-gray-500"
                      }`}
                    >
                      {msg.sender_name}
                    </span>
                    {msg.source === "email" && (
                      <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">
                        <Mail className="w-3 h-3" />
                        via Email
                      </span>
                    )}
                    <span
                      className={`text-xs ${
                        msg.sender_type === "staff"
                          ? "text-blue-200"
                          : "text-gray-400"
                      }`}
                    >
                      {format(new Date(msg.created_at), "MMM d, h:mm a")}
                    </span>
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap">
                  {msg.message_text}
                </p>

                {/* Attachments */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {msg.attachments.map((attachment) => (
                      <AttachmentDisplay
                        key={attachment.id}
                        attachment={attachment}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Compose Area */}
        <div className="p-3 border-t border-gray-200 bg-gray-50">
          {/* File Preview */}
          {selectedFile && (
            <FilePreview file={selectedFile} onRemove={clearSelectedFile} />
          )}

          {/* Upload Progress */}
          {uploading && (
            <div className="mb-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Uploading... {uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 items-end">
            {/* File Upload Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || sending}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              title="Attach file"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.txt"
            />

            {/* Message Input */}
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={2}
              disabled={uploading}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
            />

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={
                (!newMessage.trim() && !selectedFile) || sending || uploading
              }
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 self-end"
            >
              {sending || uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>

          <p className="text-xs text-gray-400 mt-1">
            Press Enter to send • Max 10MB • PDF, images, Word, text
          </p>
        </div>
      </div>
    </div>
  );
}
