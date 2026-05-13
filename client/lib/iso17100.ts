// ISO 17100:2015 evidence checklist — shared by RecruitmentDetail (admin
// requests evidence from an applicant pre-onboarding) and the vendor
// Documents tab (admin requests evidence from an already-onboarded vendor).
//
// Each item has a `kind`:
//   - "file"          → vendor must upload a PDF (via vendor-upload-cv /
//                       vendor-upload-certification)
//   - "profile_field" → vendor must fill a column on `vendors` (via
//                       vendor-update-profile / vendor-update-language-pairs)

export type IsoRequestKind = "file" | "profile_field";

export interface IsoRequestItem {
  slug: string;
  label: string;
  rationale: string;
  group:
    | "competence_a"
    | "competence_b"
    | "competence_c"
    | "verification"
    | "specialization"
    | "business"
    | "ongoing"
    | "profile";
  kind: IsoRequestKind;
  /** When kind === "profile_field", which column on `vendors` it maps to. */
  profile_column?: string;
}

export const ISO_REQUEST_ITEMS: IsoRequestItem[] = [
  // ── File uploads ────────────────────────────────────────────────────────
  { slug: "degree_translation_studies", label: "Translation / linguistics degree", rationale: "ISO 17100 § 3.1.4 route (a) — recognized higher-ed in translation or linguistics", group: "competence_a", kind: "file" },
  { slug: "degree_transcript", label: "Academic transcript", rationale: "Supports the degree submission", group: "competence_a", kind: "file" },

  { slug: "degree_other_field", label: "Other-field degree (paired with 2y experience)", rationale: "ISO 17100 § 3.1.4 route (b) — recognized higher-ed in any field", group: "competence_b", kind: "file" },
  { slug: "experience_evidence_2y", label: "Evidence of 2 years professional translation experience", rationale: "Required to validate route (b)", group: "competence_b", kind: "file" },

  { slug: "experience_evidence_5y", label: "Evidence of 5 years professional translation experience", rationale: "ISO 17100 § 3.1.4 route (c) — no degree required", group: "competence_c", kind: "file" },

  { slug: "professional_translation_cert", label: "Professional translation certificate (ATA / CTTIC / ITI / NAATI / etc.)", rationale: "Strengthens competence file; required by some clients", group: "verification", kind: "file" },
  { slug: "language_proficiency", label: "Language proficiency proof (C2 / native attestation)", rationale: "Required for the target language(s) — especially non-native work", group: "verification", kind: "file" },

  { slug: "subject_specialization_proof", label: "Subject specialization evidence (per claimed domain)", rationale: "ISO 17100 § 6.1.6 — domain claim must be evidenced (degree, cert, or portfolio)", group: "specialization", kind: "file" },
  { slug: "sworn_translator_accreditation", label: "Sworn / certified translator accreditation", rationale: "Required for certified-translation work in many jurisdictions", group: "specialization", kind: "file" },

  { slug: "business_registration", label: "Business registration / tax certificate", rationale: "For invoicing & jurisdiction-specific tax compliance", group: "business", kind: "file" },
  { slug: "insurance_certificate", label: "Professional indemnity (E&O) insurance certificate", rationale: "Risk mitigation; auditor will ask", group: "business", kind: "file" },

  { slug: "cpd_certificate", label: "Recent CPD record", rationale: "ISO 17100 wants ongoing competence evidence — training, conferences, etc.", group: "ongoing", kind: "file" },

  // ── Profile-field declarations ───────────────────────────────────────────
  // These map to columns on `vendors`. The ISO assessment surfaces them as
  // `null` / `[]` in its evidence output when missing, so we can pre-select.
  { slug: "profile_native_languages", label: "Native language(s) declaration", rationale: "ISO 17100 § 6.1.2 — target-language production at native-speaker level requires a declared native language", group: "profile", kind: "profile_field", profile_column: "native_languages" },
  { slug: "profile_years_experience", label: "Total years of professional translation experience", rationale: "Feeds the §6.1.4 qualifications route assessment and rate band", group: "profile", kind: "profile_field", profile_column: "years_experience" },
  { slug: "profile_specializations", label: "Subject specializations / domains", rationale: "ISO 17100 § 6.1.6 — vendor must declare the domains they work in", group: "profile", kind: "profile_field", profile_column: "specializations" },
];

export const ISO_REQUEST_GROUPS: { key: IsoRequestItem["group"]; label: string }[] = [
  { key: "competence_a", label: "Route (a) — Translation degree" },
  { key: "competence_b", label: "Route (b) — Other-field degree + 2y experience" },
  { key: "competence_c", label: "Route (c) — 5y experience only" },
  { key: "verification", label: "Verification & quality" },
  { key: "specialization", label: "Subject specialization" },
  { key: "business", label: "Business & compliance" },
  { key: "ongoing", label: "Ongoing competence" },
  { key: "profile", label: "Profile declarations (no file needed)" },
];

/**
 * Smart pre-select: derive a list of slugs from a vendor_iso17100_assessments
 * result. The ISO assessment edge function flags missing fields in each
 * criterion's `evidence` array as e.g. `"native_languages: []"`,
 * `"years_experience: null"`, `"certifications: []"`. We map those markers
 * to the matching request items.
 */
export function suggestRequestSlugsFromAssessment(
  result: { criteria?: Record<string, { evidence?: string[] | unknown }> } | null | undefined,
): string[] {
  if (!result?.criteria) return [];
  const evidenceBlob = JSON.stringify(result.criteria).toLowerCase();
  const slugs = new Set<string>();

  const missing = (needle: string) =>
    evidenceBlob.includes(`${needle}: null`) ||
    evidenceBlob.includes(`${needle}: []`) ||
    evidenceBlob.includes(`"${needle}":null`) ||
    evidenceBlob.includes(`"${needle}":[]`);

  if (missing("native_languages")) slugs.add("profile_native_languages");
  if (missing("years_experience")) slugs.add("profile_years_experience");
  if (missing("specializations")) slugs.add("profile_specializations");

  // Certifications empty → ask for translation cert + sworn accreditation.
  if (missing("certifications")) {
    slugs.add("professional_translation_cert");
    slugs.add("sworn_translator_accreditation");
  }

  // No application on file → the recruitment-side data is gone, so the
  // safest baseline is to ask for the qualifying-route documents.
  if (missing("application")) {
    slugs.add("degree_translation_studies");
    slugs.add("degree_other_field");
    slugs.add("experience_evidence_2y");
    slugs.add("experience_evidence_5y");
    slugs.add("language_proficiency");
  }

  return Array.from(slugs);
}

export function buildDocsEmailBody(args: {
  vendorFirstName: string;
  selectedSlugs: string[];
  uploadLinkUrl: string;
  expiryDays: number;
  staffMessage?: string | null;
}): string {
  const seen = new Set<string>();
  const itemsHtml = args.selectedSlugs
    .map((slug) => {
      if (seen.has(slug)) return "";
      seen.add(slug);
      const it = ISO_REQUEST_ITEMS.find((d) => d.slug === slug);
      if (!it) return "";
      const tag = it.kind === "profile_field" ? "[fill in your profile]" : "[upload PDF]";
      return `<li><strong>${it.label}</strong> <span style="color:#888;font-size:11px;">${tag}</span><br/><span style="color:#666">${it.rationale}</span></li>`;
    })
    .filter(Boolean)
    .join("\n");

  const intro = args.staffMessage
    ? `<p>${args.staffMessage.replace(/\n/g, "<br/>")}</p>`
    : `<p>Hi ${args.vendorFirstName || "there"},</p><p>To keep your Cethos vendor profile aligned with ISO 17100:2015 (the translator-services standard our clients audit us against), we need a few items on file. Some are document uploads, some are short profile fields you can fill in directly.</p>`;

  return [
    intro,
    `<p><strong>Please complete the following:</strong></p>`,
    `<ul>`,
    itemsHtml,
    `</ul>`,
    `<p><a href="${args.uploadLinkUrl}" style="display:inline-block;background:#0891B2;color:#fff;text-decoration:none;padding:11px 22px;border-radius:6px;font-weight:600;font-size:14px;">Open my evidence checklist</a></p>`,
    `<p style="color:#6B7280;font-size:13px;">This link expires in ${args.expiryDays} days. If you're missing any specific document, just reply and let us know — we can usually find an alternative.</p>`,
    `<p>Best regards,<br/>Cethos Vendor Management</p>`,
  ].join("\n");
}
