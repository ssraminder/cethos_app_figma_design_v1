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
      return "bg-gray-100 text-gray-600 text-center text-xs italic w-full";
    }
    if (isOwn) {
      return "bg-blue-600 text-white ml-auto max-w-[90%]";
    }
    return "bg-gray-100 text-gray-800 max-w-[90%]";
  };

  return (
    <div className={`rounded-lg px-3 py-2 ${getStyles()}`}>
      {senderType !== "system" && (
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-xs font-medium opacity-75 truncate">
            {senderName}
          </span>
          <span className="text-xs opacity-50 flex-shrink-0">
            {format(new Date(createdAt), "h:mm a")}
          </span>
        </div>
      )}
      <p className="text-xs whitespace-pre-wrap break-words">{messageText}</p>
      {senderType === "system" && (
        <span className="text-xs opacity-50 block mt-1">
          {format(new Date(createdAt), "MMM d, h:mm a")}
        </span>
      )}
    </div>
  );
}
