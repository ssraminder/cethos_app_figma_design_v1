/**
 * Generate a URL-friendly slug from a vendor's full name.
 * e.g. "Raminder Shah" → "raminder-shah"
 */
export function vendorSlug(fullName: string): string {
  return fullName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
