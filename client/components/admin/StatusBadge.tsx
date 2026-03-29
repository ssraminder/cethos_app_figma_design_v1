const STATUS_STYLES: Record<string, string> = {
  // Green - Paid, Completed, Active, Delivered
  paid: "bg-green-100 text-green-800",
  completed: "bg-green-100 text-green-800",
  active: "bg-green-100 text-green-800",
  delivered: "bg-green-100 text-green-800",

  // Blue - Sent, In Progress, Processing, In Production
  sent: "bg-blue-100 text-blue-800",
  in_progress: "bg-blue-100 text-blue-800",
  processing: "bg-blue-100 text-blue-800",
  in_production: "bg-blue-100 text-blue-800",
  invoiced: "bg-blue-100 text-blue-800",

  // Amber - Pending, Awaiting, Draft Review, Queued
  pending: "bg-amber-100 text-amber-800",
  awaiting_payment: "bg-amber-100 text-amber-800",
  draft_review: "bg-amber-100 text-amber-800",
  queued: "bg-amber-100 text-amber-800",

  // Purple - Converted, Quote Ready
  converted: "bg-purple-100 text-purple-800",
  quote_ready: "bg-purple-100 text-purple-800",

  // Red - Overdue, Cancelled, Refunded
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-red-100 text-red-800",
  refunded: "bg-red-100 text-red-800",

  // Gray - Draft, Void, Unknown
  draft: "bg-gray-100 text-gray-700",
  void: "bg-gray-100 text-gray-700",
};

function formatLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface StatusBadgeProps {
  status?: string | null;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className = "" }: StatusBadgeProps) {
  if (!status) return null;

  const style = STATUS_STYLES[status] || "bg-gray-100 text-gray-700";

  return (
    <span
      className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${style} ${className}`}
    >
      {label || formatLabel(status)}
    </span>
  );
}
