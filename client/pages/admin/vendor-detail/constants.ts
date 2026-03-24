// Shared constants for Vendor Detail

export const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-600",
  pending_review: "bg-yellow-100 text-yellow-800",
  suspended: "bg-red-100 text-red-800",
  applicant: "bg-blue-100 text-blue-800",
};

export const AVAILABILITY_COLORS: Record<string, string> = {
  available: "bg-green-500",
  busy: "bg-yellow-500",
  on_leave: "bg-blue-500",
  unavailable: "bg-gray-400",
  vacation: "bg-blue-500",
};

export const VENDOR_TYPE_OPTIONS = [
  { value: "freelancer", label: "Freelancer" },
  { value: "agency", label: "Agency" },
  { value: "in-house", label: "In-House" },
];

export const AVAILABILITY_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "busy", label: "Busy" },
  { value: "vacation", label: "Vacation" },
];

export const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "pending_review", label: "Pending Review" },
  { value: "suspended", label: "Suspended" },
  { value: "applicant", label: "Applicant" },
];

export const SOURCE_TYPE_COLORS: Record<string, string> = {
  xtrf_competencies: "bg-blue-100 text-blue-700",
  self_reported: "bg-yellow-100 text-yellow-700",
  admin: "bg-gray-100 text-gray-600",
};

export const PAYMENT_METHODS = [
  { value: "interac", label: "Interac e-Transfer" },
  { value: "wire", label: "Wire Transfer" },
  { value: "paypal", label: "PayPal" },
  { value: "direct_deposit", label: "Direct Deposit" },
  { value: "wise", label: "Wise (TransferWise)" },
  { value: "cheque", label: "Cheque" },
];

export const JOB_STATUS_COLORS: Record<string, string> = {
  offered: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

export const POPULAR_CURRENCIES = ["CAD", "USD", "EUR", "GBP"];

// Helper functions

export function formatDate(
  dateStr: string | null,
  style: "short" | "long" = "short"
): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (style === "long") {
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
