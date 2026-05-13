// Shared "re-sync request items against live vendor state" logic. Called
// by vendor-doc-request-status-sweep (every 15 min) and vendor-doc-
// request-reminder (before sending the reminder email) so the list the
// vendor sees is always current — they get credit for uploads / profile
// edits done outside the /iso-evidence/:token flow.

export interface RequestedItem {
  slug: string;
  label: string;
  kind: "file" | "profile_field";
  profile_column?: string | null;
  rationale?: string | null;
  completed_at?: string | null;
  declined_at?: string | null;
  decline_reason?: string | null;
}

interface VendorSnapshot {
  native_languages?: unknown;
  years_experience?: unknown;
  specializations?: unknown;
  certifications?: unknown;
}

/**
 * Returns a new items array with completed_at filled in for any item
 * the vendor has satisfied outside the flow. Idempotent: items already
 * completed or declined are left alone.
 */
export function recomputeItems(
  items: RequestedItem[],
  vendor: VendorSnapshot,
  cvCount: number,
): RequestedItem[] {
  const nowIso = new Date().toISOString();
  const arr = (v: unknown) => (Array.isArray(v) ? v as unknown[] : []);

  // Build a normalised lookup of cert labels the vendor has on file.
  // vendors.certifications is jsonb — historically items can be either
  // strings or objects with cert_name.
  const certLabels = new Set<string>();
  for (const c of arr(vendor.certifications)) {
    if (typeof c === "string") certLabels.add(c.toLowerCase().trim());
    else if (c && typeof c === "object") {
      const obj = c as Record<string, unknown>;
      const name = (obj.cert_name ?? obj.name ?? obj.label) as string | undefined;
      if (name) certLabels.add(String(name).toLowerCase().trim());
    }
  }

  return items.map((it) => {
    if (it.completed_at || it.declined_at) return it;

    let satisfied = false;
    if (it.kind === "profile_field") {
      if (it.profile_column === "native_languages") satisfied = arr(vendor.native_languages).length > 0;
      else if (it.profile_column === "years_experience") satisfied = vendor.years_experience != null;
      else if (it.profile_column === "specializations") satisfied = arr(vendor.specializations).length > 0;
    } else {
      // File item — match by label against vendors.certifications; CV-class
      // slugs additionally count any vendor_cvs row.
      const labelKey = (it.label || "").toLowerCase().trim();
      if (labelKey && certLabels.has(labelKey)) satisfied = true;
      else if (it.slug.startsWith("degree_") || it.slug.startsWith("experience_evidence")) {
        // The umbrella CV upload often carries qualifying-route evidence.
        // Any CV on file unlocks these as "evidence supplied" — admin
        // still has to validate, but it's no longer a blocker on the ask.
        if (cvCount > 0) satisfied = true;
      }
    }

    return satisfied ? { ...it, completed_at: nowIso } : it;
  });
}

/** Status math: a request is done when every item has completed_at OR declined_at. */
export function nextStatusFromItems(
  items: RequestedItem[],
): { status: "sent" | "partial" | "completed"; resolved: number; total: number; allDone: boolean } {
  const resolved = items.filter((it) => !!it.completed_at || !!it.declined_at).length;
  const total = items.length;
  const allDone = total > 0 && resolved === total;
  const status: "sent" | "partial" | "completed" = allDone
    ? "completed"
    : resolved > 0
    ? "partial"
    : "sent";
  return { status, resolved, total, allDone };
}
