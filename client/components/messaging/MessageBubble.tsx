import { format } from "date-fns";
import { Check, CheckCheck } from "lucide-react";
import SystemMessageCard from "./SystemMessageCard";
import FileAttachment from "./FileAttachment";

interface Message {
  id: string;
  sender_type: "staff" | "customer" | "system";
  sender_name?: string;
  message_text?: string;
  message_type?: string;
  metadata?: any;
  attachments?: any[];
  created_at: string;
  read_by_customer_at?: string | null;
  read_by_staff_at?: string | null;
}

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  isStaffView?: boolean;
}

export default function MessageBubble({
  message,
  isOwn,
  isStaffView = false,
}: MessageBubbleProps) {
  // System messages render as cards
  if (message.sender_type === "system") {
    return <SystemMessageCard message={message} />;
  }

  const bubbleStyles = isOwn
    ? "ml-auto bg-teal-600 text-white rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl"
    : "mr-auto bg-gray-100 text-gray-800 rounded-tl-2xl rounded-tr-2xl rounded-br-2xl";

  return (
    <div className={`max-w-[80%] ${isOwn ? "ml-auto" : "mr-auto"}`}>
      <div className={`px-4 py-3 ${bubbleStyles} shadow-sm`}>
        {/* Sender name and timestamp header */}
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span
            className={`text-xs font-medium ${
              isOwn ? "text-teal-100" : "text-gray-500"
            }`}
          >
            {message.sender_name || (isOwn ? "You" : "Staff")}
          </span>
          <span
            className={`text-xs flex items-center gap-1 ${
              isOwn ? "text-teal-200" : "text-gray-400"
            }`}
          >
            {format(new Date(message.created_at), "MMM d, h:mm a")}

            {/* Read receipts - show for sender's own messages */}
            {isOwn && (
              <>
                {/* Customer view: show if staff read it */}
                {!isStaffView && message.read_by_staff_at ? (
                  <CheckCheck className="w-3 h-3" title="Read by staff" />
                ) : !isStaffView ? (
                  <Check className="w-3 h-3" title="Delivered" />
                ) : null}

                {/* Staff view: show if customer read it */}
                {isStaffView && message.read_by_customer_at ? (
                  <CheckCheck className="w-3 h-3" title="Read by customer" />
                ) : isStaffView ? (
                  <Check className="w-3 h-3" title="Delivered" />
                ) : null}
              </>
            )}
          </span>
        </div>

        {/* Quote/Order badges */}
        {(message.metadata?.quote_number || message.metadata?.order_number) && (
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {message.metadata?.quote_number && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  isOwn
                    ? "bg-teal-500 text-white"
                    : "bg-blue-100 text-blue-800"
                }`}
                title="Quote Number"
              >
                Quote #{message.metadata.quote_number}
              </span>
            )}
            {message.metadata?.order_number && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  isOwn
                    ? "bg-teal-500 text-white"
                    : "bg-green-100 text-green-800"
                }`}
                title="Order Number"
              >
                Order #{message.metadata.order_number}
              </span>
            )}
          </div>
        )}

        {/* Message text */}
        {message.message_text && (
          <p className="text-sm whitespace-pre-wrap">{message.message_text}</p>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className={`${message.message_text ? "mt-2" : ""} space-y-2`}>
            {message.attachments.map((att) => (
              <FileAttachment key={att.id} attachment={att} isOwn={isOwn} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
