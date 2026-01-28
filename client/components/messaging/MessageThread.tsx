import { useEffect, useRef, useMemo } from "react";
import { format } from "date-fns";
import MessageBubble from "./MessageBubble";
import DateSeparator from "./DateSeparator";

interface Message {
  id: string;
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

interface MessageThreadProps {
  messages: Message[];
  currentUserId: string;
  isStaffView?: boolean;
}

export default function MessageThread({
  messages,
  currentUserId,
  isStaffView = false,
}: MessageThreadProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = "";

    messages.forEach((msg) => {
      const msgDate = format(new Date(msg.created_at), "yyyy-MM-dd");
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [] });
      }
      groups[groups.length - 1].messages.push(msg);
    });

    return groups;
  }, [messages]);

  // Scroll to bottom on mount and new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="space-y-4">
      {groupedMessages.map((group) => (
        <div key={group.date}>
          <DateSeparator date={group.date} />
          <div className="space-y-3 mt-3">
            {group.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isOwn={
                  isStaffView
                    ? message.sender_staff_id === currentUserId
                    : message.sender_customer_id === currentUserId
                }
                isStaffView={isStaffView}
              />
            ))}
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
