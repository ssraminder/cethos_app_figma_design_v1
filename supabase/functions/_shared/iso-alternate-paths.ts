// Alternate-paths guidance for ISO 17100 evidence items. Surfaces in
// reminder emails to help vendors who don't have a particular document
// figure out a realistic substitute or how to obtain one.
//
// The "I don't have this" button on the /iso-evidence/:token page lets
// the vendor explain explicitly — these strings are the email-side hint
// that often unblocks them before they hit decline.

export interface AlternatePathGuidance {
  /** Slug from client/lib/iso17100.ts ISO_REQUEST_ITEMS */
  slug: string;
  /** Short line surfaced in the reminder email body */
  alternates: string;
}

export const ISO_ALTERNATE_PATHS: Record<string, string> = {
  // Qualifying-route documents
  degree_translation_studies:
    "Don't have the diploma? Most universities email a digital copy free — contact the registrar. A transcript also counts.",
  degree_transcript:
    "If your school is closed or unreachable, a notarised affidavit listing courses + dates is acceptable. WES evaluations also work.",
  degree_other_field:
    "Any accredited bachelor's-or-higher degree counts. Diploma copy, transcript, or even a digital verification letter from the registrar.",
  experience_evidence_2y:
    "Two years of work can be evidenced by client invoices, signed engagement letters, an employer reference, or a portfolio with dated samples.",
  experience_evidence_5y:
    "Five years can be evidenced by tax returns, invoices, an employer reference, or a portfolio listing 50+ dated jobs. We accept any combination.",

  // Verification
  professional_translation_cert:
    "If you're not yet certified by ATA / CTTIC / ITI / NAATI etc., a screenshot of your active membership / candidate status is fine while you finish.",
  language_proficiency:
    "Native attestation can be: a CEFR C2 certificate, a university diploma earned in the language, or a notarised self-declaration of native fluency.",

  // Specialisation
  subject_specialization_proof:
    "Domain proof can be: a relevant degree, a CPD certificate, a published sample, or a current/past role in that domain. One per claimed specialisation.",
  sworn_translator_accreditation:
    "Only required if you'll handle certified translations. If you don't take certified work, reply with 'not applicable' — we'll exclude you from those jobs.",

  // Business / compliance
  business_registration:
    "Sole proprietors: tax-ID printout or business-name registration letter. Companies: incorporation certificate or local equivalent (Companies House, IRS EIN, etc.).",
  insurance_certificate:
    "Freelancer professional-indemnity insurance is inexpensive (Hiscox, Tinubu, ARAG, local equivalents). A current quote pending purchase is acceptable short-term.",

  // Ongoing
  cpd_certificate:
    "Any continuing-development evidence within the last 2 years counts: conference attendance, online courses (Coursera/SDL/MemoQ), webinars, workshops.",

  // Profile fields
  profile_native_languages:
    "Declare the language(s) you grew up speaking at native level. Up to three; most vendors have one.",
  profile_years_experience:
    "Your best estimate of total years doing paid translation work — full-time equivalent. We use this as one input, not the only one.",
  profile_specializations:
    "Comma-separated list of domains you'll accept work in (Legal, Medical, Marketing, Technical, etc.). You can update this later.",
};

/** Returns the guidance line for a slug, or a generic fallback. */
export function alternatePathFor(slug: string): string {
  return (
    ISO_ALTERNATE_PATHS[slug] ??
    "If you don't have this document, reply to this email and we'll figure out an acceptable alternative."
  );
}
