import { format } from "date-fns";

interface DateSeparatorProps {
  date: string; // YYYY-MM-DD
}

export default function DateSeparator({ date }: DateSeparatorProps) {
  const displayDate = format(new Date(date), "MMMM d, yyyy");

  return (
    <div className="flex items-center justify-center my-4">
      <div className="flex-1 border-t border-gray-200" />
      <span className="px-4 text-sm text-gray-500 bg-gray-50 rounded-full">
        {displayDate}
      </span>
      <div className="flex-1 border-t border-gray-200" />
    </div>
  );
}
