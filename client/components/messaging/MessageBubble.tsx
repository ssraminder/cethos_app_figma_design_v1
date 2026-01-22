import { format } from "date-fns";

interface MessageBubbleProps {
  id: string;
  senderType: "staff" | "customer" | "system";
  senderName: string;
  messageText: string;
  createdAt: string;
  isOwn?: boolean;
}

export default function MessageBubble({
  senderType,
  senderName,
  messageText,
  createdAt,
  isOwn = false,
}: MessageBubbleProps) {
  const getStyles = () => {
    if (senderType === "system") {
      return "bg-gray-100 text-gray-600 text-center text-sm italic mx-auto max-w-md";
    }
    if (isOwn) {
      return "bg-blue-600 text-white ml-auto";
    }
    return "bg-gray-100 text-gray-800";
  };

  return (
    <div className={`max-w-[80%] rounded-xl px-4 py-3 ${getStyles()}`}>
      {senderType !== "system" && (
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium opacity-75">
            {senderName}
          </span>
          <span className="text-xs opacity-50">
            {format(new Date(createdAt), "MMM d, h:mm a")}
          </span>
        </div>
      )}
      <p className="text-sm whitespace-pre-wrap">{messageText}</p>
      {senderType === "system" && (
        <span className="text-xs opacity-50 block mt-1">
          {format(new Date(createdAt), "MMM d, h:mm a")}
        </span>
      )}
    </div>
  );
}
