// Exact reference-questionnaire wording — mirrors the referee-facing form
// (vendor repo apps/recruitment/src/data/referenceMcqs.ts). Used to render the
// verbatim "we asked X → reference answered Y" block on the recruitment profile.
// Keep in sync with the referee form if questions change.

export type McqAnswer = "a" | "b" | "c" | "d" | "e";

export const REFERENCE_MCQS: { slug: string; prompt: string; options: { value: McqAnswer; label: string }[] }[] = [
  {
    slug: "translation_competence",
    prompt: "How would you describe {{name}}'s translation quality?",
    options: [
      { value: "a", label: "Consistently publishable — needed no rework" },
      { value: "b", label: "Reliable — occasional minor edits" },
      { value: "c", label: "Acceptable but needed reviewer pass" },
      { value: "d", label: "Frequently needed substantial revision" },
      { value: "e", label: "Can't speak to this" },
    ],
  },
  {
    slug: "linguistic_textual_competence",
    prompt: "{{name}}'s mastery of the target language — does the output read like a native speaker wrote it from scratch?",
    options: [
      { value: "a", label: "Always — indistinguishable from native-written text" },
      { value: "b", label: "Usually — minor unnatural phrasing here and there" },
      { value: "c", label: "Mixed — readable but clearly translated" },
      { value: "d", label: "Often unnatural or grammatically off" },
      { value: "e", label: "Can't speak to this" },
    ],
  },
  {
    slug: "research_competence",
    prompt: "When {{name}} hit unfamiliar terminology or subject matter, how did they handle it?",
    options: [
      { value: "a", label: "Resourceful — found authoritative sources, flagged ambiguities, justified choices" },
      { value: "b", label: "Competent — generally got it right with reasonable research" },
      { value: "c", label: "Sometimes guessed instead of researching" },
      { value: "d", label: "Frequent terminology errors or unsupported guesses" },
      { value: "e", label: "Can't speak to this" },
    ],
  },
  {
    slug: "cultural_competence",
    prompt: "Did {{name}} adapt content for the target audience, or translate literally?",
    options: [
      { value: "a", label: "Strong localiser — caught cultural pitfalls without being asked" },
      { value: "b", label: "Adapted when prompted, but didn't always volunteer it" },
      { value: "c", label: "Mostly literal translations" },
      { value: "d", label: "Cultural misses required client corrections" },
      { value: "e", label: "Can't speak to this" },
    ],
  },
  {
    slug: "technical_competence",
    prompt: "How did {{name}} handle CAT tools, file formats, and project workflow?",
    options: [
      { value: "a", label: "Proactive — clean tag handling, flagged file issues early, hit deadlines" },
      { value: "b", label: "Competent — followed instructions, output was clean" },
      { value: "c", label: "Needed reminders on tool usage or workflow steps" },
      { value: "d", label: "Struggled with CAT tools, files, or deadlines" },
      { value: "e", label: "Can't speak to this — we didn't use CAT tools" },
    ],
  },
  {
    slug: "domain_competence",
    prompt: "How strong was {{name}}'s subject-matter knowledge in the area you worked in?",
    options: [
      { value: "a", label: "Expert — terminology, conventions, and context were all on-point" },
      { value: "b", label: "Solid working knowledge" },
      { value: "c", label: "Surface-level — needed help on domain specifics" },
      { value: "d", label: "Out of depth in the domain" },
      { value: "e", label: "Can't speak to this" },
    ],
  },
];

export const WOULD_WORK_AGAIN_LABEL: Record<string, string> = {
  yes: "Yes",
  probably: "Probably",
  probably_not: "Probably not",
  no: "No",
};

export const REFERENCE_DOMAIN_LABEL: Record<string, string> = {
  // Legacy 8-bucket codes (reference rows before 2026-06-23).
  legal: "Legal",
  medical_pharma: "Medical / Pharmaceutical",
  marketing_transcreation: "Marketing / Transcreation",
  technical_it: "Technical / IT",
  financial_banking: "Financial / Banking",
  literary_publishing: "Literary / Publishing",
  government_ngo: "Government / NGO",
  other: "Other",
  // Applicant claimed-approval domain codes (cvp_applications.domains_offered) —
  // referees confirm against these since 2026-06-23.
  certified_official: "Certified / Official Documents",
  immigration: "Immigration",
  medical: "Medical",
  life_sciences: "Life Sciences / Clinical Trials",
  coa_linguistic_validation: "COA / Linguistic Validation",
  pharmaceutical: "Pharmaceutical",
  financial: "Financial",
  insurance: "Insurance",
  technical: "Technical",
  it_software: "IT / Software",
  automotive_engineering: "Automotive / Engineering",
  energy: "Energy",
  marketing_advertising: "Marketing & Advertising",
  academic_scientific: "Academic & Scientific",
  government_public: "Government & Public Sector",
  business_corporate: "Business & Corporate",
  gaming_entertainment: "Gaming & Entertainment",
  media_journalism: "Media & Journalism",
  tourism_hospitality: "Tourism & Hospitality",
  general: "General",
};

// Engagement-detail labels (2026-06-23 referee-form enhancement).
export const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  full_time: "Full-time translator",
  part_time: "Part-time / occasional",
  unsure: "Not sure",
};
export const ANNUAL_VOLUME_LABEL: Record<string, string> = {
  lt_50k: "Under 50k words/yr",
  "50k_150k": "50k–150k words/yr",
  "150k_500k": "150k–500k words/yr",
  gt_500k: "Over 500k words/yr",
  unsure: "Volume unsure",
};
export const RELATIONSHIP_TYPE_LABEL: Record<string, string> = {
  client: "Client",
  employer: "Employer / manager",
  project_manager: "Project manager",
  reviser_editor: "Reviser / editor",
  peer_translator: "Peer translator",
  other: "Other",
};

/** Resolve an answer letter to its full option label for a given question. */
export function referenceAnswerLabel(slug: string, answer: string | null | undefined): string | null {
  if (!answer) return null;
  const q = REFERENCE_MCQS.find((m) => m.slug === slug);
  return q?.options.find((o) => o.value === answer)?.label ?? answer;
}

export function referenceDomainLabel(code: string): string {
  return REFERENCE_DOMAIN_LABEL[code] ?? code;
}
