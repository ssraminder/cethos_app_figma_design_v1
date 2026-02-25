export function formatEntryPoint(entryPoint: string | null | undefined): string {
  const labels: Record<string, string> = {
    customer_web:   "Website Form",
    website_embed:  "Website Embed",
    upload_form:    "Upload Form",
    staff_manual:   "Staff Manual",
    order_form:     "Order Form",
    walk_in:        "Walk-In",
  };
  return labels[entryPoint ?? ""] ?? entryPoint ?? "Unknown";
}

export function entryPointBadgeColor(entryPoint: string | null | undefined): string {
  const colors: Record<string, string> = {
    customer_web:   "bg-blue-100 text-blue-700",
    website_embed:  "bg-purple-100 text-purple-700",
    upload_form:    "bg-cyan-100 text-cyan-700",
    staff_manual:   "bg-amber-100 text-amber-700",
    order_form:     "bg-gray-100 text-gray-700",
    walk_in:        "bg-green-100 text-green-700",
  };
  return colors[entryPoint ?? ""] ?? "bg-gray-100 text-gray-700";
}
