// ============================================================================
// _shared/nda-gate.ts  (2026-06-22)
//
// NDA-before-assessment gate, moved from SEND time to ACCESS time. The applicant
// can be invited without an NDA; the confidentiality agreement is then required
// (and signed via clickwrap) before cvp-get-quiz / cvp-get-test will reveal any
// assessment content. These helpers are the single source of truth for "does
// this applicant have a current NDA?" and "what is the NDA they must accept?".
//
// A signature counts if it is is_current=true, agreement_type='nda', and keyed
// to either the application directly (application_id) or the applicant's vendor
// row (matched by email — applicants get a vendor row early in the pipeline).
// ============================================================================

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface NdaTemplate {
  id: string;
  title: string;
  version_label: string | null;
  body_html: string;
}

/** True when the applicant already has a current NDA on file. */
export async function hasCurrentNda(
  supabase: SupabaseClient,
  applicationId: string,
  email: string | null,
): Promise<boolean> {
  const { count: byApp } = await supabase
    .from("vendor_nda_signatures")
    .select("id", { count: "exact", head: true })
    .eq("application_id", applicationId)
    .eq("agreement_type", "nda")
    .eq("is_current", true);
  if ((byApp ?? 0) > 0) return true;

  const emailLc = (email ?? "").trim().toLowerCase();
  if (emailLc) {
    const { data: v } = await supabase
      .from("vendors")
      .select("id")
      .ilike("email", emailLc)
      .maybeSingle();
    const vendorId = (v as { id?: string } | null)?.id;
    if (vendorId) {
      const { count: byVendor } = await supabase
        .from("vendor_nda_signatures")
        .select("id", { count: "exact", head: true })
        .eq("vendor_id", vendorId)
        .eq("agreement_type", "nda")
        .eq("is_current", true);
      if ((byVendor ?? 0) > 0) return true;
    }
  }
  return false;
}

/** The active NDA template the applicant must accept (latest effective). */
export async function getActiveNdaTemplate(
  supabase: SupabaseClient,
): Promise<NdaTemplate | null> {
  const { data } = await supabase
    .from("nda_templates")
    .select("id, title, version_label, body_html")
    .eq("agreement_type", "nda")
    .eq("is_active", true)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as NdaTemplate | null) ?? null;
}

/** Whether the access-time NDA gate is active (mirrors the send-side flag). */
export function ndaGateEnabled(): boolean {
  return Deno.env.get("APPLICANT_LOGIN_ENABLED") === "true";
}
