import { format } from "date-fns";
import SystemMessageCard from './SystemMessageCard';
import FileAttachment from './FileAttachment';

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
  if (message.sender_type === 'system') {
    return <SystemMessageCard message={message} />;
  }

  const bubbleStyles = isOwn
    ? 'ml-auto bg-teal-600 text-white rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl'
    : 'mr-auto bg-white border border-gray-200 text-gray-800 rounded-tl-2xl rounded-tr-2xl rounded-br-2xl';

  return (
    <div className={`max-w-[75%] ${isOwn ? 'ml-auto' : 'mr-auto'}`}>
      <div className={`px-4 py-3 ${bubbleStyles} shadow-sm`}>
        {/* Message text */}
        {message.message_text && (
          <p className="text-sm whitespace-pre-wrap">{message.message_text}</p>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className={`${message.message_text ? 'mt-2' : ''} space-y-2`}>
            {message.attachments.map(att => (
              <FileAttachment key={att.id} attachment={att} isOwn={isOwn} />
            ))}
          </div>
        )}
      </div>

      {/* Timestamp and read receipt */}
      <div className={`flex items-center gap-1 mt-1 text-xs text-gray-500 ${isOwn ? 'justify-end' : ''}`}>
        <span>{message.sender_name || (isOwn ? 'You' : 'Staff')}</span>
        <span>•</span>
        <span>{format(new Date(message.created_at), 'h:mm a')}</span>

        {/* Read receipt for customer's own messages (staff read it) */}
        {isOwn && !isStaffView && message.read_by_staff_at && (
          <span className="text-teal-600 ml-1" title="Read by staff">✓✓</span>
        )}

        {/* Read receipt for staff view (customer read it) */}
        {isStaffView && message.sender_type === 'staff' && message.read_by_customer_at && (
          <span className="text-teal-600 ml-1" title="Read by customer">✓✓</span>
        )}

        {/* Show when customer's message was read by staff (in staff view) */}
        {isStaffView && message.sender_type === 'customer' && message.read_by_staff_at && (
          <span className="text-gray-400 ml-1">
            Read {format(new Date(message.read_by_staff_at), 'h:mm a')}
          </span>
        )}
      </div>
    </div>
  );
}
