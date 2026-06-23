import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { REFERENCE_MCQS, referenceAnswerLabel, referenceDomainLabel, WOULD_WORK_AGAIN_LABEL } from "@/lib/referenceQuestions";
import { useAdminAuthContext } from "../../context/AdminAuthContext";
import { toast } from "sonner";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Linkedin,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  Loader2,
  Save,
  ExternalLink,
  FileText,
  Ban,
  RefreshCw,
  Sparkles,
  FileSearch,
  Bell,
  Copy,
  Check,
  X as XIcon,
} from "lucide-react";
import { format, formatDistanceToNow, differenceInHours, addMonths } from "date-fns";

// ---------- Constants ----------

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted", prescreening: "Pre-screening", prescreened: "Pre-screened",
  test_pending: "Test Pending", test_sent: "Test Sent", test_in_progress: "Test In Progress",
  test_submitted: "Test Submitted", test_assessed: "Test Assessed", negotiation: "Negotiation",
  staff_review: "Staff Review", approved: "Approved", rejected: "Rejected",
  waitlisted: "Waitlisted", archived: "Archived", info_requested: "Info Requested",
};

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-gray-100 text-gray-700", prescreening: "bg-blue-100 text-blue-700",
  prescreened: "bg-blue-100 text-blue-700", test_pending: "bg-yellow-100 text-yellow-700",
  test_sent: "bg-yellow-100 text-yellow-700", test_in_progress: "bg-yellow-100 text-yellow-700",
  test_submitted: "bg-indigo-100 text-indigo-700", test_assessed: "bg-indigo-100 text-indigo-700",
  negotiation: "bg-purple-100 text-purple-700", staff_review: "bg-orange-100 text-orange-700",
  approved: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700",
  waitlisted: "bg-cyan-100 text-cyan-700", archived: "bg-gray-100 text-gray-500",
  info_requested: "bg-amber-100 text-amber-700",
};

const TIER_LABELS: Record<string, string> = { standard: "Standard", senior: "Senior", expert: "Expert" };
const TIER_COLORS: Record<string, string> = { standard: "bg-gray-100 text-gray-600", senior: "bg-blue-100 text-blue-700", expert: "bg-purple-100 text-purple-700" };

const EXPERIENCE_LABELS: Record<number, string> = { 0: "Less than 1 year", 1: "1–3 years", 3: "3–5 years", 5: "5–10 years", 10: "10+ years" };
const EXPERIENCE_BRACKET_LABELS: Record<string, string> = { "0": "Less than 1 year", "1": "1–3 years", "3": "3–5 years", "5": "5–10 years", "10": "10+ years" };
const INTERVIEWS_CONDUCTED_LABELS: Record<string, string> = { "0": "None yet", "1-10": "1–10 interviews", "11-50": "11–50 interviews", "51-200": "51–200 interviews", "200+": "200+ interviews" };
const INTERVIEW_MODE_LABELS: Record<string, string> = { in_person: "In-person", telephone: "Telephone", video: "Video" };
const ECOA_PLATFORM_LABELS: Record<string, string> = { signant: "Signant Health", clario_ert: "Clario / ERT", medidata: "Medidata", calyx: "Calyx", yprime: "YPrime", iqvia: "IQVIA", cognigen: "Cognigen", none: "None / paper-only", other: "Other" };
const SPECIAL_POPULATIONS_LABELS: Record<string, string> = { pediatric: "Pediatric", elderly: "Elderly", cognitively_impaired: "Cognitively impaired", rare_disease: "Rare disease", immigrant_refugee: "Immigrant / refugee", lgbtq: "LGBTQ+", none: "None / general adult only" };
const EDUCATION_LABELS: Record<string, string> = { bachelor: "Bachelor's", master: "Master's", phd: "PhD", diploma_certificate: "Diploma / Certificate", other: "Other" };
const CERT_LABELS: Record<string, string> = { ATA: "ATA", CTTIC: "CTTIC", ITI: "ITI", CIOL: "CIOL", ISO_17100: "ISO 17100" };
const DOMAIN_LABELS: Record<string, string> = {
  legal: "Legal", certified_official: "Certified / Official", immigration: "Immigration",
  medical: "Medical", life_sciences: "Life Sciences", pharmaceutical: "Pharmaceutical",
  coa_linguistic_validation: "COA Linguistic Validation", financial: "Financial",
  insurance: "Insurance", technical: "Technical", it_software: "IT & Software",
  academic_scientific: "Academic & Scientific", business_corporate: "Business & Corporate",
  marketing_advertising: "Marketing & Advertising", government_public: "Government & Public",
  general: "General", other: "Other",
};
const SERVICE_LABELS: Record<string, string> = { translation: "Translation", translation_review: "Translation + Review", lqa_review: "LQA Review" };
const COA_LABELS: Record<string, string> = { pro: "PROs", clinro: "ClinROs", obro: "ObsROs", interview_guide: "Interview guides", survey: "Surveys & questionnaires" };
const FAMILIARITY_LABELS: Record<string, string> = { yes: "Yes", no: "No", partially: "Partially" };
const AVAILABILITY_LABELS: Record<string, string> = { full_time: "Full-time", part_time: "Part-time", project_based: "Project-based" };

const COMBO_STATUS_LABELS: Record<string, string> = {
  pending: "Pending", no_test_available: "No Test Available", test_assigned: "Test Assigned",
  test_sent: "Test Sent", test_submitted: "Test Submitted", assessed: "Assessed",
  approved: "Approved", rejected: "Rejected", skipped: "Skipped",
  skip_manual_review: "Skip Manual Review",
  approved_excluded: "Approved — Excluded",
};

const COMBO_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700", no_test_available: "bg-yellow-100 text-yellow-700",
  test_assigned: "bg-blue-100 text-blue-700", test_sent: "bg-blue-100 text-blue-700",
  test_submitted: "bg-indigo-100 text-indigo-700", assessed: "bg-purple-100 text-purple-700",
  approved: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700",
  skipped: "bg-gray-100 text-gray-500",
  skip_manual_review: "bg-green-50 text-green-600",
  approved_excluded: "bg-orange-100 text-orange-700",
};

// ---------- Types ----------

interface Certification { name: string; customName?: string; expiryDate?: string }
interface WorkSample { storage_path: string; description: string }
interface NegotiationEvent { event: string; amount?: number; final_amount?: number; timestamp: string; notes?: string }

interface Application {
  id: string;
  application_number: string;
  role_type: string;
  email: string;
  full_name: string;
  phone: string | null;
  city: string | null;
  country: string;
  linkedin_url: string | null;
  years_experience: number | null;
  education_level: string | null;
  certifications: Certification[];
  cat_tools: string[];
  services_offered: string[];
  work_samples: WorkSample[];
  rate_expectation: number | null;
  referral_source: string | null;
  notes: string | null;
  cog_years_experience: number | null;
  cog_degree_field: string | null;
  cog_credentials: string | null;
  cog_instrument_types: string[];
  cog_therapy_areas: string[];
  cog_pharma_clients: string | null;
  cog_ispor_familiarity: string | null;
  cog_fda_familiarity: string | null;
  cog_prior_debrief_reports: boolean;
  cog_sample_report_path: string | null;
  cog_availability: string | null;
  cog_rate_expectation: number | null;
  cog_rate_currency: string | null;
  cog_interviews_conducted: string | null;
  cog_conducts_direct_patient_interviews: boolean | null;
  cog_interview_modes: string[] | null;
  cog_ecoa_platforms: string[] | null;
  cog_ema_familiarity: string | null;
  cog_concept_elicitation_years: string | null;
  cog_special_populations: string[] | null;
  cog_gcp_trained: boolean | null;
  cog_gcp_year: number | null;
  cog_license_type: string | null;
  cog_license_jurisdiction: string | null;
  cog_license_number: string | null;
  cog_license_active: boolean | null;
  cog_timezone: string | null;
  status: string;
  ai_prescreening_score: number | null;
  ai_prescreening_result: Record<string, unknown> | null;
  ai_prescreening_at: string | null;
  assigned_tier: string | null;
  tier_override_by: string | null;
  tier_override_at: string | null;
  negotiation_status: string | null;
  negotiation_log: NegotiationEvent[];
  final_agreed_rate: number | null;
  staff_review_notes: string | null;
  staff_reviewed_by: string | null;
  staff_reviewed_at: string | null;
  rejection_reason: string | null;
  rejection_email_draft: string | null;
  rejection_email_status: string | null;
  rejection_email_queued_at: string | null;
  can_reapply_after: string | null;
  waitlist_language_pair: string | null;
  waitlist_notes: string | null;
  cv_storage_path: string | null;
  // Applicant-choice routing (2026-05-15 — docs/qms/02-test-or-quiz-routing.md)
  instrument_choice: 'test' | 'quiz' | null;
  instrument_choice_at: string | null;
  instrument_choice_by: string | null;
  instrument_choice_token: string | null;
  instrument_choice_token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TestCombination {
  id: string;
  application_id: string;
  source_language_id: string;
  target_language_id: string;
  domain: string | null;
  service_type: string | null;
  status: string;
  ai_score: number | null;
  ai_assessment_result: Record<string, unknown> | null;
  approved_at: string | null;
  approved_rate: number | null;
  instrument_kind: 'test' | 'quiz' | 'skip' | null;
  created_at: string;
}

interface RateSuggestion {
  recommended_rate: number;
  alternative_higher: number;
  alternative_lower: number;
  currency: string;
  reasoning: string;
  client_rate_used: number;
  ceiling: number;
  floor: number;
  test_score_used: number | null;
  test_bucket: string;
}

// ISO 17100 document checklist mapped to file_categories.slug values.
// Grouped by purpose so the modal renders sections.
const ISO_DOC_TYPES: Array<{
  slug: string;
  label: string;
  rationale: string;
  group: "competence_a" | "competence_b" | "competence_c" | "verification" | "specialization" | "business" | "ongoing";
  default_selected?: boolean;
}> = [
  // Route (a) — translation degree
  { slug: "degree_translation_studies", label: "Translation / linguistics degree", rationale: "ISO 17100 § 3.1.4 route (a) — recognized higher-ed in translation or linguistics", group: "competence_a" },
  { slug: "degree_transcript", label: "Academic transcript", rationale: "Supports the degree submission", group: "competence_a" },

  // Route (b) — other degree + 2y experience
  { slug: "degree_other_field", label: "Other-field degree (paired with 2y experience)", rationale: "ISO 17100 § 3.1.4 route (b) — recognized higher-ed in any field", group: "competence_b" },
  { slug: "experience_evidence", label: "Evidence of 2 years professional translation experience", rationale: "Required to validate route (b)", group: "competence_b" },

  // Route (c) — 5y experience only
  { slug: "experience_evidence", label: "Evidence of 5 years professional translation experience", rationale: "ISO 17100 § 3.1.4 route (c) — no degree required", group: "competence_c" },

  // Verification / quality
  { slug: "professional_translation_cert", label: "Professional translation certificate (ATA / CTTIC / ITI / NAATI / etc.)", rationale: "Strengthens competence file; required by some clients", group: "verification" },
  { slug: "language_proficiency", label: "Language proficiency proof (C2 / native attestation)", rationale: "Required for the target language(s) — especially non-native work", group: "verification" },
  // NOTE: reference letters are NOT in this list — references are collected
  // via the dedicated Request References flow (cvp-request-references →
  // structured rubric submission by each reference), which is meaningfully
  // better than collecting potentially-fakeable PDF letters.

  // Specialization
  { slug: "subject_specialization_proof", label: "Subject specialization evidence (per claimed domain)", rationale: "ISO 17100 § 6.1.6 — domain claim must be evidenced (degree, cert, or portfolio)", group: "specialization" },
  { slug: "sworn_translator_accreditation", label: "Sworn / certified translator accreditation", rationale: "Required for certified-translation work in many jurisdictions", group: "specialization" },

  // Business / compliance
  { slug: "business_registration", label: "Business registration / tax certificate", rationale: "For invoicing & jurisdiction-specific tax compliance", group: "business" },
  { slug: "insurance_certificate", label: "Professional indemnity (E&O) insurance certificate", rationale: "Risk mitigation; auditor will ask", group: "business" },

  // Ongoing competence
  { slug: "cpd_certificate", label: "Recent CPD record", rationale: "ISO 17100 wants ongoing competence evidence — training, conferences, etc.", group: "ongoing" },
];

const ISO_DOC_GROUPS: Array<{ key: string; label: string }> = [
  { key: "competence_a", label: "Route (a) — Translation degree" },
  { key: "competence_b", label: "Route (b) — Other-field degree + 2y experience" },
  { key: "competence_c", label: "Route (c) — 5y experience only" },
  { key: "verification", label: "Verification & quality" },
  { key: "specialization", label: "Subject specialization" },
  { key: "business", label: "Business & compliance" },
  { key: "ongoing", label: "Ongoing competence" },
];

interface TestSubmission {
  id: string;
  combination_id: string;
  test_id: string | null;
  token: string;
  token_expires_at: string;
  status: string;
  submitted_at: string | null;
  ai_assessment_score: number | null;
  draft_content: string | null;
  submitted_notes: string | null;
  first_viewed_at: string | null;
  view_count: number;
  created_at: string;
  reminder_1_sent_at: string | null;
  reminder_2_sent_at: string | null;
  reminder_3_sent_at: string | null;
}

interface TestLibraryRow {
  id: string;
  title: string;
  domain: string | null;
  service_type: string | null;
  difficulty: string | null;
  source_text: string | null;
  reference_translation: string | null;
}

interface ErrorFeedbackRow {
  id: string;
  submission_id: string;
  combination_id: string;
  error_index: number;
  applicant_response: "accept" | "reject";
  applicant_reason: string | null;
  applicant_submitted_at: string;
  auto_triage_verdict: string | null;
  auto_triage_confidence: number | null;
  auto_triage_reasoning: string | null;
  auto_triage_at: string | null;
  hitl_status: string | null;
}

interface FeedbackRoundRow {
  submission_id: string;
  combination_id: string;
  token: string;
  status: string;
  staff_skip: boolean;
  v12_sent_at: string | null;
  applicant_first_view_at: string | null;
  applicant_submitted_at: string | null;
  expires_at: string;
  auto_send_at: string | null;
  auto_sent_at: string | null;
  manual_send_requested_at: string | null;
}

interface Language { id: string; name: string; code?: string | null }

const RTL_LANGUAGE_CODES = new Set<string>([
  "ar", "ar-EG", "ar-SA", "ar-LB", "ar-MA",
  "he", "fa", "prs", "ps", "ur", "ckb", "yi",
]);

function isRtlLanguageCode(code: string | null | undefined): boolean {
  if (!code) return false;
  if (RTL_LANGUAGE_CODES.has(code)) return true;
  return code.startsWith("ar-");
}

interface QuizResponse {
  question_id: string;
  selected_option: string;
}

interface QuizCompetenceBucket {
  total: number;
  correct: number;
}

interface QuizSubmission {
  id: string;
  application_id: string;
  target_language_id: string;
  token: string;
  token_expires_at: string;
  status: string;
  responses: QuizResponse[] | null;
  score_pct: number | string | null;
  correct_count: number | null;
  total_count: number | null;
  competence_breakdown: Record<string, QuizCompetenceBucket> | null;
  submitted_at: string | null;
  created_at: string;
  assessment_summary: string | null;
  assessment_recommendation: string | null;
  assessment_at: string | null;
  is_coa?: boolean | null;
  reminder_1_sent_at?: string | null;
  reminder_2_sent_at?: string | null;
  reminder_3_sent_at?: string | null;
}

interface CoaTranslationResponse {
  id: string;
  application_id: string;
  target_language_name: string | null;
  applicant_translation: string | null;
  mqm_score: number | null;
  verdict: string | null;
  conceptual_equivalence: string | null;
  ai_rationale: string | null;
  needs_human_review: boolean | null;
}

interface QuizQuestionOption {
  label: string;
  value: string;
}

interface QuizQuestion {
  id: string;
  competence_slug: string;
  question: string;
  options: QuizQuestionOption[];
  correct_option: string;
  explanation: string | null;
  target_language_id: string | null;
}

const COMPETENCE_LABELS: Record<string, string> = {
  linguistic_textual_competence: "Linguistic & textual",
  cultural_competence: "Cultural",
  domain_competence: "Domain",
  research_competence: "Research",
  technical_competence: "Technical",
};

// ---------- Helpers ----------

function ScoreBadge({ label, value, type = "quality" }: { label: string; value: string; type?: "quality" | "recommendation" | "rate" }) {
  let color = "bg-gray-100 text-gray-600";
  if (type === "quality") {
    if (value === "high" || value === "strong") color = "bg-green-100 text-green-700";
    else if (value === "medium" || value === "partial") color = "bg-yellow-100 text-yellow-700";
    else if (value === "low" || value === "weak" || value === "none") color = "bg-red-100 text-red-700";
    else if (value === "not_provided") color = "bg-gray-100 text-gray-500";
  } else if (type === "recommendation") {
    if (value === "proceed") color = "bg-green-100 text-green-700";
    else if (value === "staff_review") color = "bg-orange-100 text-orange-700";
    else if (value === "reject") color = "bg-red-100 text-red-700";
  } else if (type === "rate") {
    if (value === "within_band") color = "bg-green-100 text-green-700";
    else if (value === "above_band") color = "bg-yellow-100 text-yellow-700";
    else if (value === "below_band") color = "bg-blue-100 text-blue-700";
    else if (value === "not_provided") color = "bg-gray-100 text-gray-500";
  }
  const display = value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${color}`}>{display}</span>
    </div>
  );
}

interface AssessmentDimensionScores {
  accuracy?: number;
  fluency?: number;
  terminology?: number;
  formatting?: number;
  certification_readiness?: number;
}

interface AssessmentError {
  category?: string;
  severity?: string;
  location?: string;
  note?: string;
}

interface ParsedAssessment {
  isFallback: boolean;
  fallbackReason?: string;
  overallScore?: number;
  pass?: boolean;
  suggestedTier?: string;
  confidence?: string;
  dimensionScores?: AssessmentDimensionScores;
  errors: AssessmentError[];
  strengths: string[];
  feedbackDraft?: string;
  modelUsed?: string;
  promptVersion?: string;
  assessedAt?: string;
}

function parseAssessment(raw: Record<string, unknown> | null): ParsedAssessment {
  if (!raw) return { isFallback: false, errors: [], strengths: [] };
  const r = raw as Record<string, unknown>;
  if (r.error === "ai_fallback") {
    return {
      isFallback: true,
      fallbackReason: typeof r.reason === "string" ? r.reason : undefined,
      errors: [],
      strengths: [],
    };
  }
  return {
    isFallback: false,
    overallScore: typeof r.overall_score === "number" ? r.overall_score : undefined,
    pass: typeof r.pass === "boolean" ? r.pass : undefined,
    suggestedTier: typeof r.suggested_tier === "string" ? r.suggested_tier : undefined,
    confidence: typeof r.confidence === "string" ? r.confidence : undefined,
    dimensionScores: (r.dimension_scores as AssessmentDimensionScores | undefined) ?? undefined,
    errors: Array.isArray(r.errors) ? (r.errors as AssessmentError[]) : [],
    strengths: Array.isArray(r.strengths) ? (r.strengths as string[]) : [],
    feedbackDraft: typeof r.feedback_draft === "string" ? r.feedback_draft : undefined,
    modelUsed: typeof r.model_used === "string" ? r.model_used : undefined,
    promptVersion: typeof r.prompt_version === "string" ? r.prompt_version : undefined,
    assessedAt: typeof r.assessed_at === "string" ? r.assessed_at : undefined,
  };
}

function dimensionColor(score: number | undefined): string {
  if (score === undefined) return "bg-gray-200";
  if (score >= 80) return "bg-green-500";
  if (score >= 65) return "bg-yellow-500";
  return "bg-red-500";
}

function severityClasses(sev: string | undefined): string {
  switch ((sev ?? "").toLowerCase()) {
    case "critical": return "bg-red-100 text-red-700 border-red-200";
    case "major":    return "bg-orange-100 text-orange-700 border-orange-200";
    case "minor":    return "bg-yellow-50 text-yellow-700 border-yellow-200";
    default:         return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function DimensionBar({ label, score }: { label: string; score: number | undefined }) {
  const pct = Math.max(0, Math.min(100, score ?? 0));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-600">{label}</span>
        <span className="text-[11px] font-semibold tabular-nums text-gray-700">{score ?? "—"}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded overflow-hidden">
        <div className={`h-full ${dimensionColor(score)}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TestAssessmentPanel({
  assessment,
  combo,
  submission,
  test,
  sourceLanguageCode,
  targetLanguageCode,
  staffId,
  onAfterAction,
  callEdgeFunction,
  errorFeedback,
  feedbackRound,
}: {
  assessment: Record<string, unknown>;
  combo: TestCombination;
  submission: TestSubmission | null;
  test: TestLibraryRow | null;
  sourceLanguageCode?: string | null;
  targetLanguageCode?: string | null;
  staffId?: string;
  onAfterAction: () => Promise<void> | void;
  callEdgeFunction: (fnSlug: string, body: Record<string, unknown>) => Promise<unknown>;
  errorFeedback: ErrorFeedbackRow[];
  feedbackRound: FeedbackRoundRow | null;
}) {
  const sourceRtl = isRtlLanguageCode(sourceLanguageCode);
  const targetRtl = isRtlLanguageCode(targetLanguageCode);
  const a = parseAssessment(assessment);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showErrors, setShowErrors] = useState(true);
  const [action, setAction] = useState<"none" | "approve" | "reject">("none");
  const [rate, setRate] = useState<string>(combo.approved_rate ? String(combo.approved_rate) : "");
  const [rejectionFeedback, setRejectionFeedback] = useState<string>("");
  const [sendNowBusy, setSendNowBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [skipBusy, setSkipBusy] = useState(false);
  const [retriageBusy, setRetriageBusy] = useState(false);

  const feedbackByIndex = new Map<number, ErrorFeedbackRow>();
  for (const r of errorFeedback) feedbackByIndex.set(r.error_index, r);

  const handleToggleSkip = async () => {
    if (!submission?.id) return;
    setSkipBusy(true);
    try {
      const nextSkip = !(feedbackRound?.staff_skip ?? false);
      const now = new Date().toISOString();
      if (feedbackRound) {
        const { error } = await supabase
          .from("cvp_test_feedback_rounds")
          .update({
            staff_skip: nextSkip,
            status: nextSkip ? "skipped" : "sent",
            updated_at: now,
          })
          .eq("submission_id", submission.id);
        if (error) throw error;
      } else {
        // Pre-emptive skip: create the round with staff_skip=true so the
        // grader's auto-fire becomes a no-op. Token isn't usable since
        // staff_skip=true rejects all callers.
        const placeholderToken =
          (typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2)) + "-staff-skip";
        const { error } = await supabase.from("cvp_test_feedback_rounds").insert({
          submission_id: submission.id,
          combination_id: combo.id,
          token: placeholderToken,
          staff_skip: nextSkip,
          status: nextSkip ? "skipped" : "sent",
        });
        if (error) throw error;
      }
      toast.success(nextSkip ? "Vendor feedback round skipped." : "Vendor feedback round re-enabled.");
      await onAfterAction();
    } catch (err) {
      toast.error("Skip toggle failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSkipBusy(false);
    }
  };

  const handleRetriage = async () => {
    if (!submission?.id) return;
    setRetriageBusy(true);
    try {
      await callEdgeFunction("cvp-triage-test-feedback", { submissionId: submission.id, force: true });
      toast.success("Auto-triage re-running — refresh in a moment.");
      setTimeout(() => { void onAfterAction(); }, 5000);
    } catch (err) {
      toast.error("Re-triage failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setRetriageBusy(false);
    }
  };

  const handleSendNow = async () => {
    if (!submission?.id) return;
    if (!confirm("Send V22 to the applicant now? This bypasses the 24-hour auto-send delay.")) return;
    setSendNowBusy(true);
    try {
      // Pull auto_send_at forward and stamp manual_send_requested_at so the
      // override is auditable. cvp-send-test-feedback-request below will
      // also flip status to 'sent' via its existing forceResend path.
      if (feedbackRound) {
        const nowIso = new Date().toISOString();
        await supabase
          .from("cvp_test_feedback_rounds")
          .update({
            manual_send_requested_at: nowIso,
            auto_send_at: nowIso,
            staff_skip: false,
            updated_at: nowIso,
          })
          .eq("submission_id", submission.id);
      }
      const res = (await callEdgeFunction("cvp-send-test-feedback-request", {
        submissionId: submission.id,
        forceResend: true,
      })) as { success?: boolean; error?: string; data?: { sentTo?: string } };
      if (!res.success) {
        toast.error(res.error ?? "Send failed.");
        return;
      }
      toast.success(`V22 sent to ${res.data?.sentTo ?? "applicant"}.`);
      await onAfterAction();
    } catch (err) {
      toast.error("Send failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSendNowBusy(false);
    }
  };

  const handlePreviewEmail = async () => {
    if (!submission?.id) return;
    setPreviewBusy(true);
    try {
      const res = (await callEdgeFunction("cvp-render-feedback-email-preview", {
        submissionId: submission.id,
      })) as { success?: boolean; error?: string; data?: { html?: string; subject?: string } };
      if (!res.success || !res.data?.html) {
        toast.error(res.error ?? "Preview failed.");
        return;
      }
      setPreviewSubject(res.data.subject ?? "V22");
      setPreviewHtml(res.data.html);
    } catch (err) {
      toast.error("Preview failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPreviewBusy(false);
    }
  };

  const reviewBaseUrl =
    (import.meta.env.VITE_RECRUITMENT_APP_URL as string | undefined) ??
    "https://join.cethos.com";
  const applicantViewUrl = feedbackRound?.token
    ? `${reviewBaseUrl.replace(/\/$/, "")}/test-feedback/${feedbackRound.token}`
    : null;
  const [busy, setBusy] = useState<"none" | "approve" | "reject" | "regrade">("none");

  const isFinal = combo.status === "approved" || combo.status === "rejected";
  const canRegrade = !!submission?.id && (combo.status === "assessed" || combo.status === "approved" || combo.status === "rejected" || a.isFallback);

  const handleApprove = async () => {
    setBusy("approve");
    try {
      const parsedRate = rate.trim() === "" ? null : Number(rate);
      if (parsedRate !== null && (!Number.isFinite(parsedRate) || parsedRate <= 0)) {
        toast.error("Enter a valid per-word rate, or leave blank.");
        setBusy("none");
        return;
      }
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("cvp_test_combinations")
        .update({
          status: "approved",
          approved_at: now,
          approved_by: staffId ?? null,
          approved_rate: parsedRate,
          updated_at: now,
        })
        .eq("id", combo.id);
      if (error) throw error;
      toast.success("Test approved.");
      setAction("none");
      await onAfterAction();
    } catch (err) {
      toast.error("Approve failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy("none");
    }
  };

  const handleReject = async () => {
    setBusy("reject");
    try {
      const trimmed = rejectionFeedback.trim();
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("cvp_test_combinations")
        .update({
          status: "rejected",
          failure_reason: trimmed.length > 0 ? trimmed.slice(0, 1000) : null,
          updated_at: now,
        })
        .eq("id", combo.id);
      if (error) throw error;
      toast.success("Test rejected.");
      setAction("none");
      setRejectionFeedback("");
      await onAfterAction();
    } catch (err) {
      toast.error("Reject failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy("none");
    }
  };

  const handleRegrade = async () => {
    if (!submission?.id) return;
    if (!confirm("Re-run AI grading on this submission? Current score and assessment will be overwritten.")) return;
    setBusy("regrade");
    try {
      await callEdgeFunction("cvp-assess-test", {
        submissionId: submission.id,
        combinationId: combo.id,
      });
      toast.success("Re-grade triggered — assessment will refresh in a moment.");
      // cvp-assess-test takes 30–90s. Refetch after a beat.
      setTimeout(() => { void onAfterAction(); }, 8000);
    } catch (err) {
      toast.error("Re-grade failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy("none");
    }
  };

  if (a.isFallback) {
    return (
      <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
        <div className="font-semibold">AI grading failed — staff review required</div>
        {a.fallbackReason && <div className="font-mono text-[11px] break-all">{a.fallbackReason}</div>}
        {canRegrade && (
          <button
            type="button"
            onClick={handleRegrade}
            disabled={busy === "regrade"}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded border border-amber-400 bg-white text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {busy === "regrade" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Re-grade
          </button>
        )}
      </div>
    );
  }

  const hasDimensions =
    a.dimensionScores &&
    (a.dimensionScores.accuracy !== undefined ||
      a.dimensionScores.fluency !== undefined ||
      a.dimensionScores.terminology !== undefined ||
      a.dimensionScores.formatting !== undefined ||
      a.dimensionScores.certification_readiness !== undefined);

  return (
    <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {a.suggestedTier && (
          <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-medium capitalize">
            Suggested tier: {a.suggestedTier}
          </span>
        )}
        {a.confidence && (
          <span className={`px-2 py-0.5 rounded font-medium capitalize ${
            a.confidence === "high" ? "bg-green-100 text-green-700" :
            a.confidence === "medium" ? "bg-yellow-100 text-yellow-700" :
            "bg-gray-100 text-gray-600"
          }`}>
            Confidence: {a.confidence}
          </span>
        )}
        {a.pass !== undefined && (
          <span className={`px-2 py-0.5 rounded font-medium ${a.pass ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            {a.pass ? "Pass" : "Did not pass"}
          </span>
        )}
      </div>

      {hasDimensions && (
        <div
          className={`grid grid-cols-1 gap-3 ${
            a.dimensionScores!.certification_readiness !== undefined
              ? "sm:grid-cols-5"
              : "sm:grid-cols-4"
          }`}
        >
          <DimensionBar label="Accuracy"  score={a.dimensionScores!.accuracy} />
          <DimensionBar label="Fluency"   score={a.dimensionScores!.fluency} />
          <DimensionBar label="Terminology" score={a.dimensionScores!.terminology} />
          <DimensionBar label="Formatting"  score={a.dimensionScores!.formatting} />
          {a.dimensionScores!.certification_readiness !== undefined && (
            <DimensionBar label="Cert-ready"  score={a.dimensionScores!.certification_readiness} />
          )}
        </div>
      )}

      {a.strengths.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-gray-700 mb-1">Strengths</div>
          <ul className="list-disc pl-4 text-xs text-gray-700 space-y-0.5">
            {a.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {a.errors.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowErrors((v) => !v)}
            className="text-[11px] font-semibold text-gray-700 mb-1 hover:text-gray-900"
          >
            {showErrors ? "▾" : "▸"} Errors ({a.errors.length})
            {feedbackByIndex.size > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-semibold">
                🗣 {feedbackByIndex.size} of {a.errors.length} answered
              </span>
            )}
          </button>
          {showErrors && (
            <ul className="space-y-1.5">
              {a.errors.map((e, i) => (
                <li
                  key={i}
                  className={`border rounded px-2 py-1.5 text-xs ${severityClasses(e.severity)}`}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    {e.severity && (
                      <span className="text-[10px] font-bold uppercase tracking-wide">
                        {e.severity}
                      </span>
                    )}
                    {e.category && (
                      <span className="text-[10px] capitalize opacity-80">
                        {e.category.replace(/_/g, " ")}
                      </span>
                    )}
                    {e.location && (
                      <span className="text-[10px] font-mono opacity-70">{e.location}</span>
                    )}
                  </div>
                  {e.note && <div className="leading-snug">{e.note}</div>}
                  {feedbackByIndex.has(i) && (
                    <VendorFeedbackInline row={feedbackByIndex.get(i)!} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {a.feedbackDraft && (
        <div>
          <div className="text-[11px] font-semibold text-gray-700 mb-1">Feedback draft</div>
          <div className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed bg-white border border-gray-200 rounded px-2 py-1.5">
            {a.feedbackDraft}
          </div>
        </div>
      )}

      {(submission?.draft_content || test?.source_text || test?.reference_translation) && (
        <div>
          <button
            type="button"
            onClick={() => setShowTranslation((v) => !v)}
            className="text-[11px] font-semibold text-teal-700 hover:text-teal-800"
          >
            {showTranslation ? "▾ Hide translation comparison" : "▸ View translation comparison"}
          </button>
          {showTranslation && (
            <div className="mt-2 grid grid-cols-1 lg:grid-cols-3 gap-2">
              <TextPanel title="Source" body={test?.source_text} rtl={sourceRtl} lang={sourceLanguageCode ?? undefined} />
              <TextPanel title="Applicant translation" body={submission?.draft_content} highlight rtl={targetRtl} lang={targetLanguageCode ?? undefined} />
              <TextPanel title="Reference translation" body={test?.reference_translation} rtl={targetRtl} lang={targetLanguageCode ?? undefined} />
            </div>
          )}
        </div>
      )}

      {submission?.submitted_notes && (
        <div>
          <div className="text-[11px] font-semibold text-gray-700 mb-1">Applicant notes</div>
          <div className="text-xs text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded px-2 py-1.5">
            {submission.submitted_notes}
          </div>
        </div>
      )}

      {(a.modelUsed || a.promptVersion || a.assessedAt) && (
        <div className="text-[10px] text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5">
          {a.modelUsed && <span>Graded by <span className="font-mono text-gray-500">{a.modelUsed}</span></span>}
          {a.promptVersion && <span>Prompt <span className="font-mono text-gray-500">{a.promptVersion}</span></span>}
          {a.assessedAt && <span>{format(new Date(a.assessedAt), "MMM d, yyyy h:mm a")}</span>}
        </div>
      )}

      {previewHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
              <div className="text-sm font-semibold text-gray-800">
                Email preview · <span className="font-mono">{previewSubject}</span>
              </div>
              <button
                type="button"
                onClick={() => { setPreviewHtml(null); setPreviewSubject(null); }}
                className="px-2 py-0.5 text-xs rounded border border-gray-300 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
            <iframe
              title="V22 email preview"
              srcDoc={previewHtml}
              sandbox=""
              className="flex-1 w-full border-0 rounded-b-lg"
            />
          </div>
        </div>
      )}

      {feedbackRound && (
        <div className="rounded border border-gray-200 bg-white p-2 text-[11px] flex flex-wrap items-center gap-2">
          <span className="font-semibold text-gray-700">Vendor feedback round:</span>
          <span
            className={`px-1.5 py-0.5 rounded font-medium capitalize ${
              feedbackRound.staff_skip
                ? "bg-gray-100 text-gray-500"
                : feedbackRound.status === "submitted"
                ? "bg-emerald-100 text-emerald-700"
                : feedbackRound.status === "opened"
                ? "bg-yellow-100 text-yellow-700"
                : feedbackRound.status === "expired"
                ? "bg-red-100 text-red-700"
                : feedbackRound.status === "pending"
                ? "bg-amber-100 text-amber-700"
                : "bg-blue-100 text-blue-700"
            }`}
          >
            {feedbackRound.staff_skip ? "skipped" : feedbackRound.status}
          </span>
          {feedbackRound.status === "pending" && feedbackRound.auto_send_at && !feedbackRound.staff_skip && (
            <span className="text-gray-500">
              auto-sends {format(new Date(feedbackRound.auto_send_at), "MMM d h:mm a")}
            </span>
          )}
          {feedbackRound.auto_sent_at && (
            <span className="text-gray-500">
              sent {format(new Date(feedbackRound.auto_sent_at), "MMM d h:mm a")}
            </span>
          )}
          {feedbackRound.applicant_submitted_at && (
            <span className="text-gray-500">
              answered {format(new Date(feedbackRound.applicant_submitted_at), "MMM d h:mm a")}
            </span>
          )}
          {feedbackRound.expires_at && !feedbackRound.staff_skip && (
            <span className="text-gray-500">
              expires {format(new Date(feedbackRound.expires_at), "MMM d")}
            </span>
          )}
          {errorFeedback.length > 0 && (
            <button
              type="button"
              onClick={handleRetriage}
              disabled={retriageBusy}
              className="ml-auto px-1.5 py-0.5 text-[10px] rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              title="Re-run Tier 1 LLM auto-triage over all rejected findings"
            >
              {retriageBusy ? "Retriaging…" : "Re-triage"}
            </button>
          )}
        </div>
      )}

      <div className="pt-2 border-t border-gray-200 space-y-2">
        {isFinal ? (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
            <span>
              {combo.status === "approved" ? "✅ Approved" : "❌ Rejected"}
              {combo.approved_at && combo.status === "approved"
                ? ` ${format(new Date(combo.approved_at), "MMM d, yyyy")}`
                : ""}
              {combo.status === "approved" && combo.approved_rate
                ? ` at $${Number(combo.approved_rate).toFixed(3)}/word`
                : ""}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {!!submission?.id && a.errors.length > 0 && (
                <>
                  {applicantViewUrl && (
                    <a
                      href={applicantViewUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Open the applicant-facing review URL in a new tab"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    >
                      View applicant view
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handlePreviewEmail}
                    disabled={previewBusy}
                    title="Render the V22 email body inline"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {previewBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Preview email
                  </button>
                  {!feedbackRound?.auto_sent_at && !feedbackRound?.staff_skip && (
                    <button
                      type="button"
                      onClick={handleSendNow}
                      disabled={sendNowBusy}
                      title="Send V22 to the applicant now (bypass 24h auto-send delay)"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      {sendNowBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      Send V22 now
                    </button>
                  )}
                </>
              )}
              {!!submission?.id && a.errors.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleSkip}
                  disabled={skipBusy}
                  title="Toggle whether V22 auto-sends to the applicant for this combo"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border disabled:opacity-50 ${
                    feedbackRound?.staff_skip
                      ? "border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {skipBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  {feedbackRound?.staff_skip ? "Re-enable V22" : "Skip V22"}
                </button>
              )}
              {canRegrade && (
                <button
                  type="button"
                  onClick={handleRegrade}
                  disabled={busy === "regrade"}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {busy === "regrade" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Re-grade
                </button>
              )}
            </div>
          </div>
        ) : action === "none" ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAction("approve")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-green-600 text-white hover:bg-green-700"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => {
                setAction("reject");
                setRejectionFeedback(a.feedbackDraft ?? "");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border border-red-300 bg-white text-red-700 hover:bg-red-50"
            >
              Reject
            </button>
            <div className="ml-auto flex items-center gap-2">
              {!!submission?.id && a.errors.length > 0 && (
                <>
                  {applicantViewUrl && (
                    <a
                      href={applicantViewUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Open the applicant-facing review URL in a new tab"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    >
                      View applicant view
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handlePreviewEmail}
                    disabled={previewBusy}
                    title="Render the V22 email body inline"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {previewBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Preview email
                  </button>
                  {!feedbackRound?.auto_sent_at && !feedbackRound?.staff_skip && (
                    <button
                      type="button"
                      onClick={handleSendNow}
                      disabled={sendNowBusy}
                      title="Send V22 to the applicant now (bypass 24h auto-send delay)"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      {sendNowBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      Send V22 now
                    </button>
                  )}
                </>
              )}
              {!!submission?.id && a.errors.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleSkip}
                  disabled={skipBusy}
                  title="Toggle whether V22 auto-sends to the applicant for this combo"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border disabled:opacity-50 ${
                    feedbackRound?.staff_skip
                      ? "border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {skipBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  {feedbackRound?.staff_skip ? "Re-enable V22" : "Skip V22"}
                </button>
              )}
              {canRegrade && (
                <button
                  type="button"
                  onClick={handleRegrade}
                  disabled={busy === "regrade"}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {busy === "regrade" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Re-grade
                </button>
              )}
            </div>
          </div>
        ) : action === "approve" ? (
          <div className="space-y-2 rounded border border-green-200 bg-green-50 p-2.5">
            <div className="text-[11px] font-semibold text-green-800">Approve this test</div>
            <label className="block text-[11px] text-gray-700">
              Per-word rate (optional)
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-gray-500">$</span>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="e.g. 0.18"
                  className="w-28 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <span className="text-[11px] text-gray-500">/ word</span>
              </div>
            </label>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleApprove}
                disabled={busy === "approve"}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {busy === "approve" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Confirm approve
              </button>
              <button
                type="button"
                onClick={() => setAction("none")}
                disabled={busy === "approve"}
                className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 rounded border border-red-200 bg-red-50 p-2.5">
            <div className="text-[11px] font-semibold text-red-800">Reject this test</div>
            <label className="block text-[11px] text-gray-700">
              Reason / feedback (saved on the combo, max 1000 chars)
              <textarea
                value={rejectionFeedback}
                onChange={(e) => setRejectionFeedback(e.target.value.slice(0, 1000))}
                rows={4}
                className="mt-1 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500 resize-y"
                placeholder="e.g. accuracy errors in opening paragraph; tone too informal for HR memo register"
              />
              <div className="text-[10px] text-gray-500 text-right">{rejectionFeedback.length}/1000</div>
            </label>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleReject}
                disabled={busy === "reject"}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy === "reject" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Confirm reject
              </button>
              <button
                type="button"
                onClick={() => setAction("none")}
                disabled={busy === "reject"}
                className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TextPanel({
  title,
  body,
  highlight = false,
  rtl = false,
  lang,
}: {
  title: string;
  body: string | null | undefined;
  highlight?: boolean;
  rtl?: boolean;
  lang?: string;
}) {
  return (
    <div className={`flex flex-col rounded border ${highlight ? "border-teal-200 bg-teal-50/50" : "border-gray-200 bg-white"}`}>
      <div className="text-[11px] font-semibold text-gray-700 px-2 py-1 border-b border-gray-200">{title}</div>
      <div
        dir={rtl ? "rtl" : "ltr"}
        lang={lang}
        className={`text-xs text-gray-800 whitespace-pre-wrap leading-relaxed px-2 py-2 max-h-72 overflow-y-auto ${rtl ? "text-right" : ""}`}
      >
        {body && body.trim().length > 0 ? body : <span className="text-gray-400 italic">Not available</span>}
      </div>
    </div>
  );
}

const TRIAGE_LABELS: Record<string, string> = {
  applicant_correct: "Applicant correct",
  grader_correct: "Grader correct",
  partial: "Partial",
  unclear: "Unclear",
  needs_clarification: "Needs clarification",
  clear: "Clear",
};

const TRIAGE_COLORS: Record<string, string> = {
  applicant_correct: "bg-emerald-100 text-emerald-800 border-emerald-200",
  grader_correct: "bg-blue-100 text-blue-800 border-blue-200",
  partial: "bg-amber-100 text-amber-800 border-amber-200",
  unclear: "bg-gray-100 text-gray-700 border-gray-200",
  needs_clarification: "bg-orange-100 text-orange-800 border-orange-200",
  clear: "bg-gray-100 text-gray-700 border-gray-200",
};

function VendorFeedbackInline({ row }: { row: ErrorFeedbackRow }) {
  const isAccept = row.applicant_response === "accept";
  return (
    <div className="mt-2 pt-2 border-t border-gray-300/70 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="opacity-70">🗣 Vendor:</span>
        <span
          className={`px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${
            isAccept ? "bg-emerald-200 text-emerald-900" : "bg-red-200 text-red-900"
          }`}
        >
          {isAccept ? "agreed" : "disagreed"}
        </span>
        {row.auto_triage_verdict && (
          <span
            className={`px-1.5 py-0.5 rounded border font-medium ${
              TRIAGE_COLORS[row.auto_triage_verdict] ?? "bg-gray-100 text-gray-700 border-gray-200"
            }`}
            title={row.auto_triage_reasoning ?? undefined}
          >
            Triage: {TRIAGE_LABELS[row.auto_triage_verdict] ?? row.auto_triage_verdict}
            {typeof row.auto_triage_confidence === "number"
              ? ` · ${Math.round(row.auto_triage_confidence)}%`
              : ""}
          </span>
        )}
        {row.hitl_status && row.hitl_status !== "not_needed" && (
          <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200 font-medium capitalize">
            HITL: {row.hitl_status.replace(/_/g, " ")}
          </span>
        )}
      </div>
      {!isAccept && row.applicant_reason && (
        <div className="text-xs text-gray-800 leading-snug bg-white border border-gray-200 rounded px-2 py-1">
          {row.applicant_reason}
        </div>
      )}
      {row.auto_triage_reasoning && (
        <div className="text-[11px] text-gray-600 italic leading-snug">
          ↳ {row.auto_triage_reasoning}
        </div>
      )}
    </div>
  );
}

function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-4 pb-4 border-t border-gray-100">{children}</div>}
    </div>
  );
}

// ----------------------------------------------------------------------------
// AssessmentPathPanel — admin UI for the applicant-choice test-or-quiz routing.
// See docs/qms/02-test-or-quiz-routing.md §6.
//   - Displays cvp_applications.instrument_choice (or "Awaiting choice" /
//     "Not invited yet").
//   - Lets staff pre-select test|quiz on the applicant's behalf
//     (bypasses the chooser email).
//   - Lets staff switch path after a choice has been made (resets
//     instrument_choice + re-issues the invitation).
//   - Lets staff fire a per-target-language quiz-preview email to themselves
//     via cvp-preview-quiz (staff JWT auth).
// ----------------------------------------------------------------------------
interface AssessmentPathPanelProps {
  app: Application;
  combinations: TestCombination[];
  languages: Record<string, string>;
  callEdgeFunction: (fnSlug: string, body: Record<string, unknown>) => Promise<unknown>;
  staffId?: string;
  staffEmail?: string;
  onAfterAction: () => void;
}

function AssessmentPathPanel({
  app,
  combinations,
  languages,
  callEdgeFunction,
  staffId,
  staffEmail,
  onAfterAction,
}: AssessmentPathPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [preselectChoice, setPreselectChoice] = useState<"test" | "quiz" | "">("");

  const choice = app.instrument_choice;
  const chosenAt = app.instrument_choice_at;
  const chosenByStaff = !!app.instrument_choice_by;
  const tokenActive =
    !!app.instrument_choice_token &&
    !!app.instrument_choice_token_expires_at &&
    new Date(app.instrument_choice_token_expires_at).getTime() > Date.now();

  // Distinct EN→Target target_languages across active combos — used for
  // per-language quiz preview buttons.
  const distinctTargets = Array.from(
    new Set(
      combinations
        .filter((c) =>
          ["pending", "test_sent", "test_submitted", "assessed", "approved", "skip_manual_review"].includes(c.status),
        )
        .map((c) => c.target_language_id),
    ),
  );

  const handlePreselect = async () => {
    if (!preselectChoice || !staffId) return;
    setBusy("preselect");
    try {
      await callEdgeFunction("cvp-record-instrument-choice", {
        applicationId: app.id,
        choice: preselectChoice,
        staffId,
      });
      toast.success(`Pre-selected ${preselectChoice} path; instrument dispatched.`);
      onAfterAction();
    } catch (err) {
      toast.error(`Pre-select failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleSendInvitation = async () => {
    setBusy("invite");
    try {
      await callEdgeFunction("cvp-send-instrument-choice-invitation", {
        applicationId: app.id,
        staffId,
      });
      toast.success("Choose-your-assessment invitation sent.");
      onAfterAction();
    } catch (err) {
      toast.error(`Invitation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleSwitchPath = async () => {
    if (!confirm(
      `Reset the applicant's choice and re-issue the chooser invitation? They'll see "${choice === "test" ? "quiz" : "test"}" as an option this time. Existing test/quiz tokens are NOT invalidated automatically — clean those up if needed.`,
    )) return;
    setBusy("switch");
    try {
      // Null the choice + re-issue invitation (cvp-send-instrument-choice-invitation
      // already overwrites any existing token).
      const { error } = await supabase
        .from("cvp_applications")
        .update({
          instrument_choice: null,
          instrument_choice_at: null,
          instrument_choice_by: null,
        })
        .eq("id", app.id);
      if (error) throw new Error(error.message);
      await callEdgeFunction("cvp-send-instrument-choice-invitation", {
        applicationId: app.id,
        staffId,
      });
      toast.success("Choice reset; new chooser invitation sent.");
      onAfterAction();
    } catch (err) {
      toast.error(`Switch path failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const handlePreviewQuiz = async (targetLanguageId: string, languageLabel: string) => {
    if (!staffEmail) {
      toast.error("Staff email missing from session — cannot send preview to you.");
      return;
    }
    setBusy(`preview-${targetLanguageId}`);
    try {
      await callEdgeFunction("cvp-preview-quiz", {
        targetLanguageId,
        recipientEmail: staffEmail,
        languageLabel,
      });
      toast.success(`Quiz preview for ${languageLabel} sent to ${staffEmail}.`);
    } catch (err) {
      toast.error(`Preview failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Assessment Path (test or quiz)" defaultOpen={!choice}>
      {/* Current state */}
      <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        {choice ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="font-medium text-gray-900">
                {choice === "test" ? "Translation test path" : "ISO competence quiz path"}
              </span>
              <span className="text-xs text-gray-500">
                · chosen by {chosenByStaff ? "staff pre-selection" : "applicant"}
                {chosenAt ? ` on ${format(new Date(chosenAt), "yyyy-MM-dd HH:mm")}` : ""}
              </span>
            </div>
          </div>
        ) : tokenActive ? (
          <div className="flex items-center gap-2 text-sm text-amber-700">
            <Clock className="w-4 h-4" />
            <span>Awaiting applicant choice. Invitation valid until {format(new Date(app.instrument_choice_token_expires_at!), "yyyy-MM-dd HH:mm")}.</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <AlertTriangle className="w-4 h-4 text-gray-400" />
            <span>No chooser invitation sent yet (prescreen may not have fired auto-send).</span>
          </div>
        )}
      </div>

      {/* Actions row */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!choice && (
          <>
            <button
              type="button"
              onClick={handleSendInvitation}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-md disabled:opacity-50"
            >
              {busy === "invite" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              {tokenActive ? "Re-send invitation" : "Send chooser invitation"}
            </button>
            <div className="inline-flex items-center gap-1.5 ml-2">
              <span className="text-xs text-gray-600">or pre-select:</span>
              <select
                value={preselectChoice}
                onChange={(e) => setPreselectChoice(e.target.value as "test" | "quiz" | "")}
                disabled={busy !== null}
                className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">— pick —</option>
                <option value="test">Translation test</option>
                <option value="quiz">ISO quiz</option>
              </select>
              <button
                type="button"
                onClick={handlePreselect}
                disabled={busy !== null || !preselectChoice}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-800 text-white text-xs font-medium rounded-md disabled:opacity-50"
              >
                {busy === "preselect" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Pre-select &amp; dispatch
              </button>
            </div>
          </>
        )}
        {choice && (
          <button
            type="button"
            onClick={handleSwitchPath}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-md disabled:opacity-50"
          >
            {busy === "switch" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Switch to {choice === "test" ? "quiz" : "test"} path
          </button>
        )}
      </div>

      {/* Quiz preview per target language */}
      {distinctTargets.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-700 mb-2">Quiz content preview (staff only)</p>
          <p className="text-xs text-gray-500 mb-2">
            Emails the rendered 40-question quiz + answer key for the target
            language to <span className="font-mono">{staffEmail ?? "your staff address"}</span>. Useful for reviewing content before applicants see it.
          </p>
          <div className="flex flex-wrap gap-2">
            {distinctTargets.map((langId) => {
              const label = languages[langId] ?? langId;
              return (
                <button
                  key={langId}
                  type="button"
                  onClick={() => handlePreviewQuiz(langId, label)}
                  disabled={busy !== null || !staffEmail}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-xs font-medium text-gray-700 rounded-md disabled:opacity-50"
                >
                  {busy === `preview-${langId}` ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileSearch className="w-3.5 h-3.5" />
                  )}
                  Preview {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Section>
  );
}

interface CvSectionProps {
  applicationId: string;
  cvStoragePath: string | null;
  callEdgeFunction: (
    fnSlug: string,
    body: Record<string, unknown>,
  ) => Promise<{ data?: { signedUrl?: string; previewUrl?: string; filename?: string; expiresInSeconds?: number } } & Record<string, unknown>>;
}

function CvSection({ applicationId, cvStoragePath, callEdgeFunction }: CvSectionProps) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("cv.pdf");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!cvStoragePath) {
      setError("No CV was uploaded with this application.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    callEdgeFunction("cvp-get-cv-url", { applicationId })
      .then((res) => {
        if (cancelled) return;
        const d = (res as { data?: { signedUrl?: string; previewUrl?: string; filename?: string } }).data;
        if (d?.signedUrl) {
          setDownloadUrl(d.signedUrl);
          setPreviewUrl(d.previewUrl ?? d.signedUrl);
          if (d.filename) setFilename(d.filename);
        } else {
          setError("Could not generate signed URL.");
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId, cvStoragePath, callEdgeFunction]);

  if (!cvStoragePath) {
    return (
      <p className="text-sm text-gray-500 mt-2">
        No CV was uploaded with this application.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <FileText className="w-4 h-4 text-gray-400" />
        <span className="font-mono text-xs text-gray-600 truncate flex-1">{filename}</span>
      </div>

      {loading && <p className="text-xs text-gray-500">Loading CV…</p>}
      {error && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          {error}
        </p>
      )}

      {downloadUrl && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-md"
          >
            {showPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showPreview ? "Hide preview" : "Preview inline"}
          </button>
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 text-xs font-medium rounded-md"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Download
          </a>
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 text-xs font-medium rounded-md"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in new tab
            </a>
          )}
        </div>
      )}

      {showPreview && previewUrl && (
        <div className="mt-2 border border-gray-200 rounded overflow-hidden">
          <iframe
            src={previewUrl}
            title="Applicant CV"
            className="w-full"
            style={{ height: "600px" }}
          />
        </div>
      )}
      <p className="text-[11px] text-gray-400">
        Signed URL expires in ~10 minutes. Reload to refresh.
      </p>
    </div>
  );
}

// ---------- Send Tests controls (Phase D) ----------

// Send ONE specific test for a chosen (domain × language pair) from the
// applicant's declared combinations — vs the bulk "send all pending" flow.
// Calls cvp-send-targeted-test (find-or-create the combo, then cvp-send-tests).
function SendSpecificTest({
  app, combinations, languages, callEdgeFunction, staffId, onAfterAction,
}: {
  app: Application;
  combinations: TestCombination[];
  languages: Record<string, string>;
  callEdgeFunction: (fn: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  staffId?: string;
  onAfterAction: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [pairKey, setPairKey] = useState(""); // "srcId|tgtId"
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [busy, setBusy] = useState(false);

  // Domains + language pairs the applicant actually has combos for (their
  // declared scope). certified_official is staff-only (no test is ever sent).
  const domains = Array.from(new Set(
    combinations.map((c) => c.domain).filter((d): d is string => !!d && d !== "certified_official"),
  )).sort((a, b) => (DOMAIN_LABELS[a] ?? a).localeCompare(DOMAIN_LABELS[b] ?? b));
  const pairs = Array.from(new Map(
    combinations.map((c) => [`${c.source_language_id}|${c.target_language_id}`,
      { src: c.source_language_id, tgt: c.target_language_id }]),
  ).values());

  if (domains.length === 0 || pairs.length === 0) return null;

  const handleSend = async () => {
    if (!domain || !pairKey) { toast.error("Pick a domain and a language pair"); return; }
    const [sourceLanguageId, targetLanguageId] = pairKey.split("|");
    setBusy(true);
    try {
      await callEdgeFunction("cvp-send-targeted-test", {
        applicationId: app.id, domain, sourceLanguageId, targetLanguageId, difficulty, staffId,
      });
      toast.success(`${DOMAIN_LABELS[domain] ?? domain} test sent — ${languages[sourceLanguageId] ?? "?"} → ${languages[targetLanguageId] ?? "?"}`);
      setOpen(false); setDomain(""); setPairKey("");
      await onAfterAction();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-teal-300 text-teal-700 hover:bg-teal-50 text-xs font-medium rounded-md"
      >
        <Mail className="w-3.5 h-3.5" /> Send a specific test…
      </button>
    );
  }

  return (
    <div className="mt-2 p-3 border-2 border-teal-200 rounded-lg bg-teal-50/30 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">Send a specific test</span>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-xs text-gray-400 hover:text-gray-700">Close</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select value={domain} onChange={(e) => setDomain(e.target.value)} className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-md text-xs text-gray-700">
          <option value="">Domain…</option>
          {domains.map((d) => <option key={d} value={d}>{DOMAIN_LABELS[d] ?? d}</option>)}
        </select>
        <select value={pairKey} onChange={(e) => setPairKey(e.target.value)} className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-md text-xs text-gray-700">
          <option value="">Language pair…</option>
          {pairs.map((p) => (
            <option key={`${p.src}|${p.tgt}`} value={`${p.src}|${p.tgt}`}>
              {languages[p.src] ?? "?"} → {languages[p.tgt] ?? "?"}
            </option>
          ))}
        </select>
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as "beginner" | "intermediate" | "advanced")} className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-md text-xs text-gray-700">
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>
      <button
        type="button"
        onClick={handleSend}
        disabled={busy || !domain || !pairKey}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-medium rounded-md"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
        Send test
      </button>
    </div>
  );
}

interface SendTestsControlsProps {
  app: Application;
  combinations: TestCombination[];
  languages: Record<string, string>;
  callEdgeFunction: (
    fnSlug: string,
    body: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  staffId?: string;
  onAfterAction: () => Promise<void>;
}

function SendTestsControls({
  app,
  combinations,
  languages,
  callEdgeFunction,
  staffId,
  onAfterAction,
}: SendTestsControlsProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"send" | "skip">("send");
  const [step, setStep] = useState<"compose" | "preview">("compose");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">(
    (app.ai_prescreening_result as Record<string, unknown> | null)?.suggested_test_difficulty as
      | "beginner"
      | "intermediate"
      | "advanced"
      | undefined ?? "intermediate",
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [skipNotes, setSkipNotes] = useState("");
  // ISO 17100 §3.1.4 basis for skip-test onboarding (required — keeps the
  // §3.1.1 evidence record non-empty even when no test is taken).
  const [qualBasis, setQualBasis] = useState<"" | "degree_translation" | "degree_other_plus_2y" | "experience_5y">("");
  const [requestRefs, setRequestRefs] = useState(true);
  const [busy, setBusy] = useState(false);

  // Phase — preview state. `picks` is the dryRun response; each entry
  // represents one combination + the test we'd send + alternatives from the
  // library if staff wants to swap.
  interface PickAlternative {
    id: string;
    title: string;
    difficulty: string;
    timesUsed: number;
    lastUsedAt: string | null;
  }
  interface PreviewPick {
    combinationId: string;
    sourceLanguage: string;
    targetLanguage: string;
    domain: string;
    serviceType: string;
    test: {
      id: string;
      title: string;
      difficulty: string;
      instructions: string | null;
      sourceText: string | null;
      sourceFilePath: string | null;
      timesUsed: number;
      lastUsedAt: string | null;
    };
    selectionReason:
      | "override"
      | "difficulty-match"
      | "fallback"
      | "wildcard-fallback";
    alternatives: PickAlternative[];
  }
  interface PreviewNoTest {
    combinationId: string;
    sourceLanguage: string;
    targetLanguage: string;
    domain: string;
    serviceType: string;
  }
  const [picks, setPicks] = useState<PreviewPick[]>([]);
  const [noTests, setNoTests] = useState<PreviewNoTest[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [expandedCombo, setExpandedCombo] = useState<string | null>(null);

  // Pending combinations are the only ones eligible for a test send.
  const pending = combinations.filter((c) => c.status === "pending");
  // Certified combos never run a test — staff approves them manually from
  // the preview step. Cards show per-pair so staff can see exactly what
  // they're granting.
  const skipManualCombos = combinations.filter(
    (c) => c.status === "skip_manual_review",
  );

  useEffect(() => {
    // Pre-select all pending combinations by default when the panel opens;
    // reset preview state so reopening always lands on the compose step.
    setSelectedIds(new Set(pending.map((c) => c.id)));
    setStep("compose");
    setPicks([]);
    setNoTests([]);
    setOverrides({});
    setExpandedCombo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Only render the controls when the app is in a state where sending tests
  // makes sense. "prescreened" is the canonical ready-to-test state; also
  // allow staff_review for flexibility.
  const eligibleStatuses = ["prescreened", "staff_review"];
  if (!eligibleStatuses.includes(app.status)) return null;
  // Hide only if there's nothing actionable — pending tests OR certified
  // combos waiting to be manually approved.
  if (pending.length === 0 && skipManualCombos.length === 0) return null;

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handlePreview = async () => {
    if (selectedIds.size === 0) {
      toast.error("Pick at least one combination to test");
      return;
    }
    setBusy(true);
    try {
      const res = (await callEdgeFunction("cvp-send-tests", {
        applicationId: app.id,
        combinationIds: Array.from(selectedIds),
        difficulty,
        dryRun: true,
        staffId,
      })) as { data?: { picks?: PreviewPick[]; noTestAvailable?: PreviewNoTest[] } };
      setPicks(res.data?.picks ?? []);
      setNoTests(res.data?.noTestAvailable ?? []);
      setOverrides({});
      setExpandedCombo(null);
      setStep("preview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    setBusy(true);
    try {
      await callEdgeFunction("cvp-send-tests", {
        applicationId: app.id,
        combinationIds: picks.map((p) => p.combinationId),
        difficulty,
        overrides,
        staffId,
      });
      toast.success(
        `V3 test invitation sent — ${picks.length} combination${picks.length === 1 ? "" : "s"} at ${difficulty} difficulty`,
      );
      setOpen(false);
      setStep("compose");
      await onAfterAction();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  const changeOverride = (combinationId: string, testId: string | null) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (testId) next[combinationId] = testId;
      else delete next[combinationId];
      return next;
    });
  };

  // The effective test shown for a combo = override pick from alternatives,
  // else the server-chosen pick.
  const effectiveTestForCombo = (p: PreviewPick) => {
    const overrideId = overrides[p.combinationId];
    if (!overrideId || overrideId === p.test.id) return p.test;
    const alt = p.alternatives.find((a) => a.id === overrideId);
    return alt
      ? {
          id: alt.id,
          title: alt.title,
          difficulty: alt.difficulty,
          instructions: null,
          sourceText: null,
          sourceFilePath: null,
          timesUsed: alt.timesUsed,
          lastUsedAt: alt.lastUsedAt,
        }
      : p.test;
  };

  const handleSkipToApprove = async () => {
    if (!qualBasis) {
      toast.error("Select the ISO 17100 §3.1.4 qualification basis");
      return;
    }
    if (skipNotes.trim().length < 10) {
      toast.error("Explain the basis / why you're skipping testing (min 10 chars)");
      return;
    }
    const isExperience = qualBasis === "degree_other_plus_2y" || qualBasis === "experience_5y";
    setBusy(true);
    try {
      await callEdgeFunction("cvp-approve-application", {
        applicationId: app.id,
        staffId,
        skipTesting: true,
        qualificationBasis: qualBasis,
        staffNotes: `[TESTING SKIPPED — §3.1.4 ${qualBasis}] ${skipNotes.trim()}`,
      });
      // Offer to document experience via the existing references flow.
      if (isExperience && requestRefs) {
        try {
          await callEdgeFunction("cvp-request-references", {
            applicationId: app.id,
            staffId,
            staffMessage:
              "As part of finalising your qualification with Cethos, we'd like to confirm your professional translation experience. Please provide a couple of professional references who can verify your translation work and the dates you worked with them.",
          });
          toast.success("Approved without testing — welcome sent + reference request sent");
        } catch {
          toast.success("Approved without testing — welcome sent (reference request failed; send it manually)");
        }
      } else {
        toast.success("Application approved without testing — V11 welcome sent");
      }
      setOpen(false);
      await onAfterAction();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="mt-2 flex items-center justify-between p-3 bg-teal-50 border border-teal-200 rounded-md">
        <div className="text-sm">
          <strong className="text-teal-800">{pending.length} combination{pending.length === 1 ? "" : "s"} ready to test.</strong>{" "}
          <span className="text-teal-700">
            AI suggests <em>{difficulty}</em> difficulty.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-md flex-shrink-0"
        >
          Send tests / skip →
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 p-4 bg-white border-2 border-teal-300 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Test assignment</h3>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-gray-400 hover:text-gray-700 text-xs">
          Close
        </button>
      </div>

      {/* Mode selector */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setMode("send")}
          className={`px-3 py-2 text-xs font-medium rounded-md border ${
            mode === "send"
              ? "bg-teal-600 border-teal-600 text-white"
              : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          Send V3 test invitation
        </button>
        <button
          type="button"
          onClick={() => setMode("skip")}
          className={`px-3 py-2 text-xs font-medium rounded-md border ${
            mode === "skip"
              ? "bg-emerald-600 border-emerald-600 text-white"
              : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          Skip testing — approve based on experience
        </button>
      </div>

      {mode === "send" && step === "compose" && skipManualCombos.length > 0 && (
        <div className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded text-xs">
          <strong className="text-sky-900">
            {skipManualCombos.length} certified combination{skipManualCombos.length === 1 ? "" : "s"} — no test
          </strong>
          <p className="text-sky-800 mt-1">
            Certified translation isn't tested in CETHOS (direction + formatting aren't in scope yet). These combinations are auto-approved when you approve the application via the decision modal — no test needed.
          </p>
          <ul className="mt-2 list-disc list-inside text-sky-800">
            {skipManualCombos.map((c) => (
              <li key={c.id}>
                {languages[c.source_language_id] || "?"} → {languages[c.target_language_id] || "?"}
                {c.domain ? ` · ${c.domain}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode === "send" && step === "compose" && pending.length === 0 && skipManualCombos.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700">
          No testable combinations remain — only certified translation, which is handled via the main Approve action on the application.
        </div>
      )}

      {mode === "send" && step === "compose" && pending.length > 0 && (
        <>
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Difficulty</label>
            <div className="flex gap-2">
              {(["beginner", "intermediate", "advanced"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border capitalize ${
                    difficulty === d
                      ? "bg-teal-100 border-teal-500 text-teal-800"
                      : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {d}
                  {(app.ai_prescreening_result as Record<string, unknown> | null)?.suggested_test_difficulty === d &&
                    " (AI)"}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-700">
                Combinations to test ({selectedIds.size}/{pending.length})
              </label>
              <div className="flex gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set(pending.map((c) => c.id)))}
                  disabled={busy || selectedIds.size === pending.length}
                  className="text-teal-700 hover:text-teal-900 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={busy || selectedIds.size === 0}
                  className="text-gray-600 hover:text-gray-900 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
                >
                  Unselect all
                </button>
              </div>
            </div>
            <div className="space-y-1 border border-gray-200 rounded-md p-2 max-h-60 overflow-y-auto">
              {pending.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-xs p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggle(c.id)}
                    disabled={busy}
                    className="rounded"
                  />
                  <span className="font-medium">
                    {languages[c.source_language_id] || "?"} → {languages[c.target_language_id] || "?"}
                  </span>
                  {c.domain && <span className="px-1.5 py-0.5 bg-gray-100 rounded">{c.domain}</span>}
                  {c.service_type && <span className="px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded">{c.service_type}</span>}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePreview}
              disabled={busy || selectedIds.size === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Preview tests ({selectedIds.size} combo{selectedIds.size === 1 ? "" : "s"}, {difficulty}) →
            </button>
          </div>
        </>
      )}

      {mode === "send" && step === "preview" && (
        <>
          <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900">
            Review the exact test that will be sent for each combination. Click a card to expand the source text + instructions. You can swap to a different test from the library where alternatives exist. Nothing has been sent yet.
          </div>

          {picks.length === 0 && noTests.length === 0 && (
            <p className="text-xs text-gray-600">No combinations returned from preview.</p>
          )}

          {noTests.length > 0 && (
            <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded text-xs">
              <strong className="text-red-800">{noTests.length} combination{noTests.length === 1 ? "" : "s"} have no matching test in the library:</strong>
              <ul className="mt-1 list-disc list-inside text-red-700">
                {noTests.map((n) => (
                  <li key={n.combinationId}>
                    {n.sourceLanguage} → {n.targetLanguage} · {n.domain} · {n.serviceType}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-red-700">Add a test to `cvp_test_library` for these, or uncheck them and come back.</p>
            </div>
          )}

          {skipManualCombos.length > 0 && (
            <div className="mb-3 p-2.5 bg-sky-50 border border-sky-200 rounded text-xs">
              <strong className="text-sky-900">
                {skipManualCombos.length} certified combination{skipManualCombos.length === 1 ? "" : "s"} — auto-approved
              </strong>
              <p className="text-sky-800 mt-1">
                These aren't tested; they auto-approve with the application's main Approve action.
              </p>
            </div>
          )}

          <div className="space-y-2 max-h-[480px] overflow-y-auto">
            {picks.map((p) => {
              const eff = effectiveTestForCombo(p);
              const isExpanded = expandedCombo === p.combinationId;
              const overridden = overrides[p.combinationId] && overrides[p.combinationId] !== p.test.id;
              return (
                <div
                  key={p.combinationId}
                  className={`border rounded-md ${
                    overridden ? "border-amber-400 bg-amber-50/40" : "border-gray-200 bg-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedCombo(isExpanded ? null : p.combinationId)}
                    className="w-full text-left p-3 flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-gray-600 mb-0.5">
                        <span className="font-medium text-gray-900">
                          {p.sourceLanguage} → {p.targetLanguage}
                        </span>
                        <span className="px-1.5 py-0.5 bg-gray-100 rounded">{p.domain}</span>
                        <span className="px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded">{p.serviceType}</span>
                        <span className={`px-1.5 py-0.5 rounded capitalize ${
                          p.selectionReason === "difficulty-match"
                            ? "bg-emerald-100 text-emerald-800"
                            : p.selectionReason === "override"
                            ? "bg-amber-100 text-amber-800"
                            : p.selectionReason === "wildcard-fallback"
                            ? "bg-sky-100 text-sky-800"
                            : "bg-gray-200 text-gray-700"
                        }`}>
                          {p.selectionReason === "difficulty-match"
                            ? `${eff.difficulty} match`
                            : p.selectionReason === "override"
                            ? "manual pick"
                            : p.selectionReason === "wildcard-fallback"
                            ? `${eff.difficulty} (any-target)`
                            : `${eff.difficulty} (fallback)`}
                        </span>
                        {overridden && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-semibold">
                            SWAPPED
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-gray-900 truncate">{eff.title}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Used {eff.timesUsed}× · {eff.lastUsedAt ? `last ${format(new Date(eff.lastUsedAt), "MMM d yyyy")}` : "never used"}
                      </div>
                    </div>
                    <span className="text-gray-400 text-xs flex-shrink-0 pt-1">
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-200 p-3 space-y-3 bg-gray-50/60">
                      {p.alternatives.length > 0 && (
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 mb-1">
                            Swap to different test ({p.alternatives.length} alternative{p.alternatives.length === 1 ? "" : "s"})
                          </label>
                          <select
                            value={overrides[p.combinationId] ?? p.test.id}
                            onChange={(e) => {
                              const v = e.target.value;
                              changeOverride(p.combinationId, v === p.test.id ? null : v);
                            }}
                            disabled={busy}
                            className="w-full text-xs p-1.5 border border-gray-300 rounded bg-white"
                          >
                            <option value={p.test.id}>
                              {p.test.title} — {p.test.difficulty} (server pick)
                            </option>
                            {p.alternatives.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.title} — {a.difficulty} · used {a.timesUsed}×
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {eff.instructions && (
                        <div>
                          <div className="text-[11px] font-medium text-gray-700 mb-1">Instructions to applicant</div>
                          <div className="text-xs text-gray-800 whitespace-pre-wrap bg-white border border-gray-200 rounded p-2">
                            {eff.instructions}
                          </div>
                        </div>
                      )}

                      {eff.sourceText && (
                        <div>
                          <div className="text-[11px] font-medium text-gray-700 mb-1">Source text (what the applicant will see)</div>
                          <pre className="text-xs text-gray-800 whitespace-pre-wrap bg-white border border-gray-200 rounded p-2 max-h-60 overflow-y-auto font-mono">
                            {eff.sourceText}
                          </pre>
                        </div>
                      )}

                      {!eff.sourceText && eff.sourceFilePath && (
                        <div className="text-[11px] text-gray-600 italic">
                          Test source is a file (<code>{eff.sourceFilePath}</code>) — applicant downloads it from the test page.
                        </div>
                      )}

                      {/* Alt was picked but we don't have the full text client-side;
                          show a hint. Backend always sends the full text; we just
                          can't preview swapped text without an extra fetch. */}
                      {overridden && (
                        <p className="text-[11px] text-amber-800 italic">
                          Note: the preview above shows the server-picked test's content. Your swap will be honoured at send time — the actual source + instructions of "{picks.find(pp => pp.combinationId === p.combinationId)?.alternatives.find(a => a.id === overrides[p.combinationId])?.title}" will be used in the applicant's test.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex justify-between gap-2">
            <button
              type="button"
              onClick={() => setStep("compose")}
              disabled={busy}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
            >
              ← Edit selection
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={busy || picks.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Send V3 to applicant ({picks.length} test{picks.length === 1 ? "" : "s"})
              </button>
            </div>
          </div>
        </>
      )}

      {mode === "skip" && (
        <>
          <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-900">
            <strong>No test will be sent.</strong> Application goes straight to approved, V11 welcome email fires with the password-setup link, and all declared combinations are approved at their default rates. ISO 17100 doesn't require a test — but §3.1.4 needs a documented qualification basis, so record it below.
          </div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            ISO 17100 §3.1.4 qualification basis <span className="text-red-500">*</span>
          </label>
          <div className="mb-3 space-y-1.5">
            {[
              { v: "degree_translation", l: "(a) Recognised degree in translation / linguistics / language studies" },
              { v: "degree_other_plus_2y", l: "(b) Degree in another field + 2 years' translation experience" },
              { v: "experience_5y", l: "(c) 5 years' professional translation experience" },
            ].map((o) => (
              <label key={o.v} className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="qualBasis"
                  checked={qualBasis === o.v}
                  onChange={() => setQualBasis(o.v as typeof qualBasis)}
                  disabled={busy}
                  className="mt-0.5"
                />
                <span>{o.l}</span>
              </label>
            ))}
          </div>
          {(qualBasis === "degree_other_plus_2y" || qualBasis === "experience_5y") && (
            <label className="mb-3 flex items-start gap-2 text-xs text-gray-700 cursor-pointer p-2 bg-blue-50 border border-blue-200 rounded">
              <input
                type="checkbox"
                checked={requestRefs}
                onChange={(e) => setRequestRefs(e.target.checked)}
                disabled={busy}
                className="mt-0.5"
              />
              <span>
                Send a reference request to document this experience (references confirm start-year + domains — the §3.1.4 evidence). Recommended.
              </span>
            </label>
          )}
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Basis notes / why you're skipping testing (captured in cvp_application_decisions + the §3.1.4 record; AI may use the first line in the welcome email)
          </label>
          <textarea
            value={skipNotes}
            onChange={(e) => setSkipNotes(e.target.value)}
            placeholder="e.g. '20+ years verified experience with Kaiser Permanente + HealthLink BC; Canadian references confirmed; no test needed'"
            rows={3}
            disabled={busy}
            className="w-full p-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSkipToApprove}
              disabled={busy || !qualBasis || skipNotes.trim().length < 10}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Skip test &amp; approve
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ConversationTimeline({
  items,
  onAcknowledge,
  onReply,
}: {
  items: ConversationItem[];
  onAcknowledge: (inboundId: string) => Promise<void>;
  onReply: (inboundId: string) => void;
}) {
  return (
    <ol className="mt-3 space-y-3">
      {items.map((it) => (
        <ConversationRow
          key={`${it.kind}-${it.id}`}
          item={it}
          onAcknowledge={onAcknowledge}
          onReply={onReply}
        />
      ))}
    </ol>
  );
}

function ConversationRow({
  item,
  onAcknowledge,
  onReply,
}: {
  item: ConversationItem;
  onAcknowledge: (inboundId: string) => Promise<void>;
  onReply: (inboundId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ackBusy, setAckBusy] = useState(false);
  const isOutbound = item.kind === "outbound";
  const when = format(new Date(item.at), "MMM d, yyyy h:mm a");

  return (
    <li
      className={`border rounded-lg p-3 ${
        isOutbound
          ? "bg-teal-50/40 border-teal-200"
          : item.kind === "inbound" && !item.acknowledged_at
          ? "bg-amber-50 border-amber-300"
          : "bg-gray-50 border-gray-200"
      }`}
    >
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`font-semibold uppercase tracking-wide ${
            isOutbound ? "text-teal-700" : "text-amber-700"
          }`}
        >
          {isOutbound ? "→ Sent" : "← Received"}
        </span>
        {isOutbound && item.template_tag && (
          <span className="font-mono text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded">
            {item.template_tag}
          </span>
        )}
        {!isOutbound && item.classified_intent && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              item.classified_intent === "reply_to_outbound"
                ? "bg-amber-200 text-amber-900"
                : item.classified_intent === "unsubscribe"
                ? "bg-red-200 text-red-900"
                : "bg-gray-200 text-gray-800"
            }`}
          >
            {item.classified_intent.replace(/_/g, " ")}
          </span>
        )}
        {!isOutbound && !item.acknowledged_at && (
          <span className="text-[10px] bg-amber-600 text-white px-1.5 py-0.5 rounded font-semibold">
            NEEDS REVIEW
          </span>
        )}
        <span className="ml-auto text-gray-500">{when}</span>
      </div>

      <div className="mt-1 text-sm font-medium text-gray-900 truncate">
        {item.subject || "(no subject)"}
      </div>

      {!isOutbound && (
        <div className="text-xs text-gray-500 mt-0.5">
          From: {item.from_name ? `${item.from_name} ` : ""}
          {"<"}
          {item.from_email}
          {">"}
        </div>
      )}

      {/* AI reply analysis summary (inbound threaded only) */}
      {!isOutbound && item.ai_reply_analysis && (
        <div className="mt-2 p-2 bg-white border border-gray-200 rounded text-xs">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-gray-700">AI analysis</span>
            {item.ai_reply_analysis.sentiment && (
              <span className="px-1.5 py-0.5 bg-gray-100 rounded capitalize">
                sentiment: {String(item.ai_reply_analysis.sentiment)}
              </span>
            )}
            {item.ai_reply_analysis.addresses_question && (
              <span className="px-1.5 py-0.5 bg-gray-100 rounded">
                addresses q: {String(item.ai_reply_analysis.addresses_question)}
              </span>
            )}
            {item.ai_reply_analysis.recommended_next_action && (
              <span className="px-1.5 py-0.5 bg-teal-100 text-teal-800 rounded font-medium">
                → {String(item.ai_reply_analysis.recommended_next_action).replace(/_/g, " ")}
              </span>
            )}
          </div>
          {item.ai_reply_analysis.summary && (
            <p className="text-gray-700">{String(item.ai_reply_analysis.summary)}</p>
          )}
          {Array.isArray(item.ai_reply_analysis.notes_for_staff) ? null : item.ai_reply_analysis.notes_for_staff && (
            <p className="text-gray-600 italic mt-1">
              {String(item.ai_reply_analysis.notes_for_staff)}
            </p>
          )}
          {Array.isArray(item.ai_reply_analysis.open_questions) &&
            (item.ai_reply_analysis.open_questions as string[]).length > 0 && (
              <div className="mt-1">
                <span className="text-gray-500">Open questions:</span>
                <ul className="list-disc list-inside text-gray-700">
                  {(item.ai_reply_analysis.open_questions as string[]).map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] text-gray-600 hover:text-gray-900 underline"
        >
          {open ? "Hide body" : "Show body"}
        </button>
        {!isOutbound && (
          <button
            type="button"
            onClick={() => onReply(item.id)}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded"
          >
            <Mail className="w-3 h-3" />
            Reply
          </button>
        )}
        {!isOutbound && !item.acknowledged_at && (
          <button
            type="button"
            disabled={ackBusy}
            onClick={async () => {
              setAckBusy(true);
              try {
                await onAcknowledge(item.id);
              } finally {
                setAckBusy(false);
              }
            }}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded"
          >
            {ackBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
            Mark reviewed
          </button>
        )}
        {!isOutbound && item.acknowledged_at && (
          <span className="text-[11px] text-gray-500">
            Reviewed {format(new Date(item.acknowledged_at), "MMM d h:mm a")}
          </span>
        )}
      </div>

      {open && (
        <div className="mt-2 border border-gray-200 bg-white rounded overflow-hidden">
          {isOutbound && item.body_html ? (
            <iframe
              title="Email body"
              srcDoc={item.body_html}
              className="w-full"
              style={{ height: "400px" }}
            />
          ) : (
            <pre className="text-xs text-gray-700 whitespace-pre-wrap p-3 max-h-96 overflow-auto">
              {isOutbound
                ? item.body_text ?? "(no plain-text version)"
                : item.stripped_text ?? item.body_plain ?? "(empty body)"}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}

// ---------- Staff reply compose modal (Phase C.2) ----------

interface StaffReplyModalProps {
  applicationId: string;
  // When set, we reply to that inbound (threaded). When null/undefined, we
  // compose a fresh message to the applicant (new thread).
  inboundEmailId?: string | null;
  onClose: () => void;
  onSent: () => Promise<void>;
  callEdgeFunction: (
    fnSlug: string,
    body: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  staffId?: string;
}

function StaffReplyModal({
  applicationId,
  inboundEmailId,
  onClose,
  onSent,
  callEdgeFunction,
  staffId,
}: StaffReplyModalProps) {
  const isReply = Boolean(inboundEmailId);
  // Spread into edge-function payloads so inboundEmailId is only sent in reply mode.
  const threadRef = inboundEmailId ? { inboundEmailId } : {};
  const [instructions, setInstructions] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"none" | "draft" | "preview" | "send">("none");
  const [mode, setMode] = useState<"compose" | "preview">("compose");

  const handleDraftWithAI = async () => {
    setBusy("draft");
    setAiError(null);
    try {
      const res = await callEdgeFunction("cvp-staff-reply", {
        applicationId,
        ...threadRef,
        useAIDraft: true,
        aiInstructions: instructions,
        dryRun: true,
      });
      const d = (res as { data?: Record<string, unknown> }).data ?? {};
      if (d.aiDraftPlain) {
        setBodyDraft(String(d.aiDraftPlain));
        if (!subject && d.subject) setSubject(String(d.subject));
      } else if (d.aiError) {
        setAiError(String(d.aiError));
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("none");
    }
  };

  const handlePreview = async () => {
    if (bodyDraft.trim().length < 10) {
      toast.error("Body too short");
      return;
    }
    setBusy("preview");
    try {
      const res = await callEdgeFunction("cvp-staff-reply", {
        applicationId,
        ...threadRef,
        body: bodyDraft,
        editedSubject: subject,
        dryRun: true,
      });
      const d = (res as { data?: Record<string, unknown> }).data ?? {};
      if (d.html) {
        setPreviewHtml(String(d.html));
        setMode("preview");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy("none");
    }
  };

  const handleSend = async () => {
    setBusy("send");
    try {
      await callEdgeFunction("cvp-staff-reply", {
        applicationId,
        ...threadRef,
        body: bodyDraft,
        editedSubject: subject,
        staffId,
      });
      toast.success(isReply ? "Reply sent" : "Message sent");
      onClose();
      await onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy("none");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {isReply ? "Reply to applicant" : "Message applicant"}
            {mode === "preview" && (
              <span className="ml-2 text-xs font-normal text-gray-500">· Preview</span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy !== "none"}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {mode === "compose" && (
          <>
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Optional: guide the AI draft (internal — not sent to applicant)
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. 'Confirm we received their clarification on the years discrepancy; ask them to send 2 references'"
                rows={2}
                disabled={busy !== "none"}
                className="w-full p-2 border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleDraftWithAI}
                  disabled={busy !== "none"}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-md disabled:opacity-50"
                >
                  {busy === "draft" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {busy === "draft" ? "Drafting…" : "Draft with AI (Opus)"}
                </button>
              </div>
              {aiError && (
                <p className="mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  AI draft failed: {aiError}. You can still type the body manually below.
                </p>
              )}
            </div>

            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Leave blank for default 'Re: …'"
                disabled={busy !== "none"}
                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
              />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Body (plain text — goes inside our standard email template)
              </label>
              <textarea
                value={bodyDraft}
                onChange={(e) => setBodyDraft(e.target.value)}
                placeholder={
                  isReply
                    ? "Type your reply, or click 'Draft with AI' above to generate one."
                    : "Type your message, or click 'Draft with AI' above to generate one."
                }
                rows={10}
                disabled={busy !== "none"}
                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50 font-mono"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy !== "none"}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePreview}
                disabled={busy !== "none" || bodyDraft.trim().length < 10}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md disabled:opacity-50"
              >
                {busy === "preview" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Preview →
              </button>
            </div>
          </>
        )}

        {mode === "preview" && previewHtml && (
          <>
            <p className="text-xs text-gray-600 mb-2">
              <strong>Subject:</strong>{" "}
              {subject || (isReply ? "Re: Your message" : "A message regarding your Cethos application")}
            </p>
            <div className="mb-3 border border-gray-200 rounded overflow-hidden">
              <iframe
                title="Reply preview"
                srcDoc={previewHtml}
                className="w-full"
                style={{ height: "420px" }}
              />
            </div>
            <div className="flex justify-between gap-2">
              <button
                type="button"
                onClick={() => setMode("compose")}
                disabled={busy !== "none"}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
              >
                ← Edit
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy !== "none"}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={busy !== "none"}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md disabled:opacity-50"
                >
                  {busy === "send" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {busy === "send" ? "Sending…" : isReply ? "Send reply" : "Send message"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Small copy-to-clipboard button — used for the shareable referee form links.
function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — select and copy manually.");
    }
  };
  return (
    <button
      type="button"
      onClick={handle}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
      title={text}
    >
      {copied ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

// Per-submission log + manual "Send reminder" for an open test/quiz. Re-emails
// the EXISTING link to the applicant (cvp-send-instrument-reminder) — no new
// token/job. Reminder button only shows while the link is still live.
function InstrumentReminderControls({
  kind,
  submissionId,
  status,
  createdAt,
  tokenExpiresAt,
  submittedAt,
  firstViewedAt,
  viewCount,
  reminders,
  callEdgeFunction,
  onAfterAction,
}: {
  kind: "test" | "quiz";
  submissionId: string;
  status: string;
  createdAt: string | null;
  tokenExpiresAt: string | null;
  submittedAt: string | null;
  firstViewedAt?: string | null;
  viewCount?: number | null;
  reminders: (string | null | undefined)[];
  callEdgeFunction: (fn: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onAfterAction: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  const expMs = tokenExpiresAt ? new Date(tokenExpiresAt).getTime() : NaN;
  const expired = Number.isFinite(expMs) && expMs <= now;
  const openStatuses = kind === "quiz" ? ["sent", "viewed"] : ["sent", "viewed", "draft_saved"];
  const canRemind = openStatuses.includes(status) && !expired;
  const sentReminders = reminders.filter(Boolean) as string[];

  const handleRemind = async () => {
    setBusy(true);
    try {
      await callEdgeFunction("cvp-send-instrument-reminder", { submissionId, kind });
      toast.success("Reminder sent to the applicant.");
      await onAfterAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reminder failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 pt-2 border-t border-gray-100 flex items-start justify-between gap-2">
      <div className="text-xs text-gray-500 space-y-0.5">
        <div>Token status: <span className="font-medium text-gray-700">{status}</span></div>
        {createdAt && <div>Issued {format(new Date(createdAt), "MMM d, yyyy h:mm a")}</div>}
        {firstViewedAt
          ? <div>First viewed {format(new Date(firstViewedAt), "MMM d, yyyy h:mm a")}{typeof viewCount === "number" ? ` · ${viewCount} view${viewCount === 1 ? "" : "s"}` : ""}</div>
          : (typeof viewCount === "number" && viewCount > 0 ? <div>{viewCount} view{viewCount === 1 ? "" : "s"}</div> : null)}
        <div>{expired ? "Expired" : (Number.isFinite(expMs) ? `Expires in ${Math.max(0, Math.floor((expMs - now) / 3600000))}h` : "—")}</div>
        {sentReminders.length > 0
          ? <div>Reminders sent: {sentReminders.map((d) => format(new Date(d), "MMM d")).join(" · ")} <span className="text-gray-400">({sentReminders.length}/3)</span></div>
          : <div>No reminders sent yet</div>}
        {submittedAt && <div className="text-emerald-600">Submitted {format(new Date(submittedAt), "MMM d, yyyy h:mm a")}</div>}
      </div>
      {canRemind && (
        <button
          type="button"
          onClick={handleRemind}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50 rounded disabled:opacity-40 whitespace-nowrap"
          title="Re-send the existing link to the applicant (no new link is generated)."
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />}
          Send reminder
        </button>
      )}
    </div>
  );
}

// ---------- References section (Phase E) ----------

interface ReferenceRequestRow {
  id: string;
  request_token: string;
  request_token_expires_at: string;
  status: "sent" | "contacts_received" | "expired" | "cancelled";
  staff_message: string | null;
  contacts_submitted_at: string | null;
  created_at: string;
}

interface ReferenceRow {
  id: string;
  request_id: string;
  reference_name: string;
  reference_email: string;
  reference_company: string | null;
  reference_relationship: string | null;
  feedback_token: string | null;
  feedback_token_expires_at: string | null;
  status: "requested" | "received" | "declined" | "expired" | "invalid";
  feedback_text: string | null;
  feedback_rating: number | null;
  feedback_received_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  ai_analysis: {
    sentiment?: string;
    strength_score?: number;
    themes?: string[];
    red_flags?: string[];
    summary?: string;
    verifies_relationship?: boolean;
  } | null;
  ai_analysis_error: string | null;
  created_at: string;
  // Exact referee answers (verbatim Q&A display).
  competence_responses: Record<string, string | null> | null;
  applicant_stated_start_year: number | null;
  reference_confirmed_start_year: number | null;
  year_verification: string | null;
  applicant_stated_domains: string[] | null;
  reference_confirmed_domains: string[] | null;
  domain_verification: string | null;
}

interface ReassessmentOutput {
  verdict?: "approve" | "waitlist" | "reject" | string;
  verdict_confidence?: "high" | "medium" | "low" | string;
  suggested_combination_ids?: string[];
  domain_evidence?: Record<string, string>;
  rationale?: string;
  concerns?: string[];
  follow_ups?: string[];
}

interface ReassessmentRow {
  id: string;
  model: string;
  output_json: ReassessmentOutput | null;
  ai_error: string | null;
  created_at: string;
  triggered_by: string | null;
}

function ReferencesSection({
  applicationId,
  callEdgeFunction,
  staffId,
}: {
  applicationId: string;
  callEdgeFunction: (
    fnSlug: string,
    body: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  staffId?: string;
}) {
  const [requests, setRequests] = useState<ReferenceRequestRow[]>([]);
  const [refs, setRefs] = useState<ReferenceRow[]>([]);
  const [reassessment, setReassessment] = useState<ReassessmentRow | null>(null);
  const [combos, setCombos] = useState<Pick<TestCombination, "id" | "domain" | "source_language_id" | "target_language_id">[]>([]);
  const [languages, setLanguagesState] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [reassessing, setReassessing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [lastVendorReminderAt, setLastVendorReminderAt] = useState<string | null>(null);
  const [remindingApplicant, setRemindingApplicant] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [{ data: reqs }, { data: rs }, { data: reass }, { data: comboRows }] = await Promise.all([
          supabase
            .from("cvp_application_reference_requests")
            .select("id, request_token, request_token_expires_at, status, staff_message, contacts_submitted_at, created_at")
            .eq("application_id", applicationId)
            .order("created_at", { ascending: false }),
          supabase
            .from("cvp_application_references")
            .select("id, request_id, reference_name, reference_email, reference_company, reference_relationship, feedback_token, feedback_token_expires_at, status, feedback_text, feedback_rating, feedback_received_at, declined_at, decline_reason, ai_analysis, ai_analysis_error, created_at, competence_responses, applicant_stated_start_year, reference_confirmed_start_year, year_verification, applicant_stated_domains, reference_confirmed_domains, domain_verification")
            .eq("application_id", applicationId)
            .order("created_at", { ascending: false }),
          supabase
            .from("cvp_application_ai_reassessments")
            .select("id, model, output_json, ai_error, created_at, triggered_by")
            .eq("application_id", applicationId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("cvp_test_combinations")
            .select("id, domain, source_language_id, target_language_id")
            .eq("application_id", applicationId),
        ]);
        if (cancelled) return;
        setRequests((reqs ?? []) as ReferenceRequestRow[]);
        setRefs((rs ?? []) as ReferenceRow[]);
        setReassessment((reass as ReassessmentRow | null) ?? null);
        // Last vendor-chase reminder for this applicant (marker: refrem-chase:<appId>:<ts>)
        const { data: lastRem } = await supabase
          .from("cvp_outbound_messages")
          .select("sent_at")
          .like("message_id", `refrem-chase:${applicationId}:%`)
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled) setLastVendorReminderAt((lastRem as { sent_at: string } | null)?.sent_at ?? null);
        const combosArr = (comboRows ?? []) as Pick<TestCombination, "id" | "domain" | "source_language_id" | "target_language_id">[];
        setCombos(combosArr);
        // Resolve language names for the pretty labels in the reassessment
        // card. Cheap second query — N is tiny here (one applicant's combos).
        const langIds = Array.from(new Set(combosArr.flatMap((c) => [c.source_language_id, c.target_language_id])));
        if (langIds.length > 0) {
          const { data: langs } = await supabase
            .from("languages")
            .select("id, code, name")
            .in("id", langIds);
          if (!cancelled) {
            const m: Record<string, string> = {};
            for (const l of (langs ?? []) as { id: string; code: string; name: string }[]) {
              m[l.id] = l.name || l.code;
            }
            setLanguagesState(m);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [applicationId, reloadKey]);

  const refresh = () => setReloadKey((n) => n + 1);

  const reviewBaseUrl =
    (import.meta.env.VITE_RECRUITMENT_APP_URL as string | undefined) ??
    "https://join.cethos.com";
  const refLink = (token: string | null) =>
    token ? `${reviewBaseUrl.replace(/\/$/, "")}/reference-feedback/${token}` : null;
  const pendingRefs = refs.filter((r) => r.status === "requested");

  // Manual vendor-only reminder: emails the APPLICANT (not the referees) with
  // each pending referee's form link + the date it was sent, so they can chase
  // their own referees. Calls the shared reminder fn scoped to this application.
  const handleRemindApplicant = async () => {
    setRemindingApplicant(true);
    try {
      const res = await callEdgeFunction("cvp-reference-reminders", {
        application_id: applicationId,
        confirm: true,
        force: true,
        only_type: "chase",
      });
      const sent = Number((res as { sent?: number })?.sent ?? 0);
      if (sent > 0) {
        toast.success("Reminder sent to the applicant with their referees' links.");
      } else {
        toast.info("No reminder sent — applicant may have no email on file or no pending referees.");
      }
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reminder failed");
    } finally {
      setRemindingApplicant(false);
    }
  };

  const handleReassess = async () => {
    setReassessing(true);
    try {
      const res = await callEdgeFunction("cvp-reassess-application", { applicationId });
      const d = (res as { data?: Record<string, unknown> }).data ?? {};
      if (d.aiError) {
        toast.error(`Reassessment ran but AI returned an error: ${d.aiError}`);
      } else {
        toast.success("Reassessment complete");
      }
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reassessment failed");
    } finally {
      setReassessing(false);
    }
  };

  const allRefsDone =
    refs.length > 0 && refs.every((r) => r.status === "received" || r.status === "declined");
  const combosById = new Map(combos.map((c) => [c.id, c] as const));
  const formatComboLabel = (id: string) => {
    const c = combosById.get(id);
    if (!c) return id;
    const domain = c.domain ? DOMAIN_LABELS[c.domain] ?? c.domain : "—";
    const src = languages[c.source_language_id] || "?";
    const tgt = languages[c.target_language_id] || "?";
    return `${domain} — ${src} → ${tgt}`;
  };

  return (
    <Section title={`References (${refs.length})`}>
      <div className="mt-2 flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div>
          <p className="text-xs text-gray-600">
            {requests.length === 0
              ? "No reference requests sent yet."
              : `${requests.length} request${requests.length === 1 ? "" : "s"} sent · ${refs.length} reference${refs.length === 1 ? "" : "s"} captured`}
          </p>
          {lastVendorReminderAt && (
            <p className="text-[11px] text-amber-700 mt-0.5">
              Applicant last reminded {format(new Date(lastVendorReminderAt), "MMM d, yyyy h:mm a")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pendingRefs.length > 0 && (
            <button
              type="button"
              onClick={handleRemindApplicant}
              disabled={remindingApplicant}
              title="Email the APPLICANT (not the referees) a reminder with each pending referee's form link and the date it was sent, so they can chase their own referees."
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-medium rounded-md"
            >
              {remindingApplicant ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
              Remind applicant
            </button>
          )}
          {allRefsDone && (
            <button
              type="button"
              onClick={handleReassess}
              disabled={reassessing}
              title="Ask Claude to weigh the test results and reference feedback together and suggest which domains to approve."
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-medium rounded-md"
            >
              {reassessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {reassessment ? "Re-run AI reassessment" : "Reassess with Claude"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-md"
          >
            <Mail className="w-3.5 h-3.5" />
            Request references
          </button>
        </div>
      </div>

      {/* Latest AI reassessment card */}
      {reassessment && (
        <div className={`mb-4 border rounded p-3 ${
          reassessment.output_json?.verdict === "approve"
            ? "border-emerald-200 bg-emerald-50/40"
            : reassessment.output_json?.verdict === "reject"
            ? "border-red-200 bg-red-50/40"
            : reassessment.output_json?.verdict === "waitlist"
            ? "border-amber-200 bg-amber-50/40"
            : "border-gray-200 bg-gray-50"
        }`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-700">AI reassessment</span>
              {reassessment.output_json?.verdict && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                  reassessment.output_json.verdict === "approve"
                    ? "bg-emerald-100 text-emerald-800"
                    : reassessment.output_json.verdict === "reject"
                    ? "bg-red-100 text-red-800"
                    : "bg-amber-100 text-amber-800"
                }`}>
                  {reassessment.output_json.verdict}
                </span>
              )}
              {reassessment.output_json?.verdict_confidence && (
                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-[10px]">
                  {reassessment.output_json.verdict_confidence} confidence
                </span>
              )}
              <span className="text-[10px] text-gray-500">
                {reassessment.model} · {format(new Date(reassessment.created_at), "MMM d, yyyy h:mm a")}
              </span>
            </div>
          </div>
          {reassessment.ai_error ? (
            <p className="text-xs text-red-700">AI error: {reassessment.ai_error}</p>
          ) : (
            <>
              {reassessment.output_json?.rationale && (
                <p className="text-xs text-gray-800 mb-2">{reassessment.output_json.rationale}</p>
              )}
              {Array.isArray(reassessment.output_json?.suggested_combination_ids) &&
                reassessment.output_json!.suggested_combination_ids!.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[11px] font-semibold text-gray-700 mb-1">Suggested approvals</div>
                    <ul className="space-y-1">
                      {reassessment.output_json!.suggested_combination_ids!.map((cid) => (
                        <li key={cid} className="text-xs text-gray-800">
                          <span className="font-medium">{formatComboLabel(cid)}</span>
                          {reassessment.output_json?.domain_evidence?.[cid] && (
                            <span className="text-gray-600"> — {reassessment.output_json.domain_evidence[cid]}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
              )}
              {Array.isArray(reassessment.output_json?.concerns) &&
                reassessment.output_json!.concerns!.length > 0 && (
                  <div className="mb-2 text-xs text-red-800">
                    <strong>Concerns:</strong>
                    <ul className="list-disc list-inside">
                      {reassessment.output_json!.concerns!.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
              )}
              {Array.isArray(reassessment.output_json?.follow_ups) &&
                reassessment.output_json!.follow_ups!.length > 0 && (
                  <div className="text-xs text-gray-700">
                    <strong>Follow-ups:</strong>
                    <ul className="list-disc list-inside">
                      {reassessment.output_json!.follow_ups!.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
              )}
            </>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => (
            <div
              key={req.id}
              className="border border-gray-200 rounded p-3 bg-white"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-gray-900">
                  Request sent {format(new Date(req.created_at), "MMM d, yyyy")}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                    req.status === "contacts_received"
                      ? "bg-emerald-100 text-emerald-800"
                      : req.status === "sent"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {req.status.replace(/_/g, " ")}
                </span>
              </div>
              {req.contacts_submitted_at && (
                <div className="mt-1 text-[11px] text-gray-500">
                  Applicant submitted contacts {format(new Date(req.contacts_submitted_at), "MMM d, yyyy h:mm a")}
                </div>
              )}
            </div>
          ))}

          {refs.map((r) => (
            <div
              key={r.id}
              className={`border rounded p-3 ${
                r.status === "received"
                  ? "border-emerald-200 bg-emerald-50/40"
                  : r.status === "declined"
                  ? "border-gray-300 bg-gray-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {r.reference_name}
                    <span className="ml-2 text-xs text-gray-500 font-normal">
                      &lt;{r.reference_email}&gt;
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-600">
                    {r.reference_company || "—"}
                    {r.reference_relationship ? ` · ${r.reference_relationship}` : ""}
                  </div>
                </div>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                    r.status === "received"
                      ? "bg-emerald-100 text-emerald-800"
                      : r.status === "declined"
                      ? "bg-gray-200 text-gray-700"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {r.status}
                </span>
              </div>

              {r.status === "requested" && (
                <div className="mt-2 text-[11px] text-gray-600 space-y-1">
                  <div>
                    Form sent {format(new Date(r.created_at), "MMM d, yyyy")}
                    {r.feedback_token_expires_at && (
                      <>
                        {" · "}
                        {new Date(r.feedback_token_expires_at).getTime() > Date.now()
                          ? `link valid until ${format(new Date(r.feedback_token_expires_at), "MMM d, yyyy")}`
                          : "link expired"}
                      </>
                    )}
                  </div>
                  {refLink(r.feedback_token) && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={refLink(r.feedback_token)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-600 hover:underline break-all"
                      >
                        {refLink(r.feedback_token)}
                      </a>
                      <CopyButton text={refLink(r.feedback_token)!} />
                    </div>
                  )}
                </div>
              )}

              {r.status === "received" && (
                <div className="mt-2 text-xs">
                  {r.ai_analysis && (
                    <div className="mb-2 p-2 bg-white border border-gray-200 rounded">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="font-semibold text-gray-700">AI analysis</span>
                        {r.ai_analysis.sentiment && (
                          <span className="px-1.5 py-0.5 bg-gray-100 rounded capitalize">
                            {r.ai_analysis.sentiment}
                          </span>
                        )}
                        {typeof r.ai_analysis.strength_score === "number" && (
                          <span className="px-1.5 py-0.5 bg-teal-100 text-teal-800 rounded">
                            score {r.ai_analysis.strength_score}/5
                          </span>
                        )}
                        {r.feedback_rating !== null && (
                          <span className="px-1.5 py-0.5 bg-gray-100 rounded">
                            ref rated {r.feedback_rating}/5
                          </span>
                        )}
                      </div>
                      {r.ai_analysis.summary && (
                        <p className="text-gray-800">{r.ai_analysis.summary}</p>
                      )}
                      {Array.isArray(r.ai_analysis.themes) && r.ai_analysis.themes.length > 0 && (
                        <div className="mt-1">
                          <span className="text-gray-500">Themes:</span>{" "}
                          {r.ai_analysis.themes.join(" · ")}
                        </div>
                      )}
                      {Array.isArray(r.ai_analysis.red_flags) && r.ai_analysis.red_flags.length > 0 && (
                        <div className="mt-1 text-red-700">
                          <strong>Red flags:</strong>
                          <ul className="list-disc list-inside">
                            {r.ai_analysis.red_flags.map((f, i) => (
                              <li key={i}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  {r.ai_analysis_error && !r.ai_analysis && (
                    <div className="mb-2 text-amber-700">
                      AI analysis failed: {r.ai_analysis_error}
                    </div>
                  )}
                  {r.competence_responses && (
                    <div className="mb-2 p-2 bg-white border border-gray-200 rounded">
                      <div className="font-semibold text-gray-700 mb-1.5">Reference responses (verbatim)</div>
                      {r.applicant_stated_start_year != null && (
                        <div className="mb-1.5">
                          <span className="text-gray-500">Worked together since:</span>{" "}
                          applicant said <strong>{r.applicant_stated_start_year}</strong>
                          {r.year_verification === "cant_recall" ? (
                            <> · reference couldn't recall</>
                          ) : r.reference_confirmed_start_year != null ? (
                            <> · reference confirmed <strong>{r.reference_confirmed_start_year}</strong>{r.year_verification ? ` (${r.year_verification})` : ""}</>
                          ) : null}
                        </div>
                      )}
                      {Array.isArray(r.reference_confirmed_domains) && r.reference_confirmed_domains.length > 0 && (
                        <div className="mb-1.5">
                          <span className="text-gray-500">Domains confirmed:</span>{" "}
                          {r.reference_confirmed_domains.map(referenceDomainLabel).join(", ")}
                          {r.domain_verification ? ` (${r.domain_verification})` : ""}
                        </div>
                      )}
                      <div className="space-y-1.5">
                        {REFERENCE_MCQS.map((q) => {
                          const ans = referenceAnswerLabel(q.slug, (r.competence_responses?.[q.slug] as string | null) ?? null);
                          if (!ans) return null;
                          return (
                            <div key={q.slug}>
                              <div className="text-gray-600">{q.prompt.replace(/\{\{name\}\}/g, "the applicant")}</div>
                              <div className="text-gray-900 font-medium">↳ {ans}</div>
                            </div>
                          );
                        })}
                      </div>
                      {r.competence_responses?.would_work_again && (
                        <div className="mt-1.5">
                          <span className="text-gray-500">Would work with them again:</span>{" "}
                          <strong>{WOULD_WORK_AGAIN_LABEL[r.competence_responses.would_work_again as string] ?? r.competence_responses.would_work_again}</strong>
                        </div>
                      )}
                    </div>
                  )}
                  {r.feedback_text && (
                    <details className="mt-1" open>
                      <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                        Show full reference text
                      </summary>
                      <pre className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded whitespace-pre-wrap text-gray-800">
                        {r.feedback_text}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {r.status === "declined" && r.decline_reason && (
                <p className="mt-2 text-xs italic text-gray-600">
                  Declined: {r.decline_reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <RequestReferencesModal
          applicationId={applicationId}
          staffId={staffId}
          callEdgeFunction={callEdgeFunction}
          onClose={() => setShowModal(false)}
          onSent={async () => {
            setShowModal(false);
            refresh();
          }}
        />
      )}
    </Section>
  );
}

function RequestReferencesModal({
  applicationId,
  staffId,
  callEdgeFunction,
  onClose,
  onSent,
}: {
  applicationId: string;
  staffId?: string;
  callEdgeFunction: (
    fnSlug: string,
    body: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  onClose: () => void;
  onSent: () => Promise<void>;
}) {
  const [instructions, setInstructions] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState<"none" | "draft" | "preview" | "send">("none");
  const [aiError, setAiError] = useState<string | null>(null);
  const [step, setStep] = useState<"compose" | "preview">("compose");

  const handleDraftWithAI = async () => {
    setBusy("draft");
    setAiError(null);
    try {
      const res = await callEdgeFunction("cvp-request-references", {
        applicationId,
        useAIDraft: true,
        aiInstructions: instructions,
        dryRun: true,
      });
      const d = (res as { data?: Record<string, unknown> }).data ?? {};
      if (d.aiDraftMessage) setBodyDraft(String(d.aiDraftMessage));
      if (d.subject && !subject) setSubject(String(d.subject));
      if (d.aiError) setAiError(String(d.aiError));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("none");
    }
  };

  const handlePreview = async () => {
    setBusy("preview");
    try {
      const res = await callEdgeFunction("cvp-request-references", {
        applicationId,
        staffMessage: bodyDraft,
        editedSubject: subject,
        dryRun: true,
      });
      const d = (res as { data?: Record<string, unknown> }).data ?? {};
      if (d.html) {
        setPreviewHtml(String(d.html));
        setStep("preview");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy("none");
    }
  };

  const handleSend = async () => {
    setBusy("send");
    try {
      await callEdgeFunction("cvp-request-references", {
        applicationId,
        staffMessage: bodyDraft,
        editedSubject: subject,
        staffId,
      });
      toast.success("V18 sent — applicant will fill in their references");
      await onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy("none");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Request references
            {step === "preview" && (
              <span className="ml-2 text-xs font-normal text-gray-500">· Preview</span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy !== "none"}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {step === "compose" && (
          <>
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Optional: guide the AI draft (internal — not sent to applicant)
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. 'Ask specifically about Spanish→English medical work; mention we're targeting clinical-trial localisation'"
                rows={2}
                disabled={busy !== "none"}
                className="w-full p-2 border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleDraftWithAI}
                  disabled={busy !== "none"}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-md disabled:opacity-50"
                >
                  {busy === "draft" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {busy === "draft" ? "Drafting…" : "Draft with AI (Opus)"}
                </button>
              </div>
              {aiError && (
                <p className="mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  AI draft failed: {aiError}. Type the body manually below.
                </p>
              )}
            </div>

            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Leave blank for default 'Please share your references'"
                disabled={busy !== "none"}
                className="w-full p-2 border border-gray-300 rounded-md text-sm disabled:opacity-50"
              />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Body (plain text — wraps inside our standard email)
              </label>
              <textarea
                value={bodyDraft}
                onChange={(e) => setBodyDraft(e.target.value)}
                placeholder="Type the body, or click Draft with AI above."
                rows={8}
                disabled={busy !== "none"}
                className="w-full p-2 border border-gray-300 rounded-md text-sm disabled:opacity-50 font-mono"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy !== "none"}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePreview}
                disabled={busy !== "none"}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md disabled:opacity-50"
              >
                {busy === "preview" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Preview →
              </button>
            </div>
          </>
        )}

        {step === "preview" && previewHtml && (
          <>
            <p className="text-xs text-gray-600 mb-2">
              <strong>Subject:</strong> {subject || "Please share your references"}
            </p>
            <div className="mb-3 border border-gray-200 rounded overflow-hidden">
              <iframe
                title="V18 preview"
                srcDoc={previewHtml}
                className="w-full"
                style={{ height: "440px" }}
              />
            </div>
            <div className="flex justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep("compose")}
                disabled={busy !== "none"}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
              >
                ← Edit
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={busy !== "none"}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md disabled:opacity-50"
              >
                {busy === "send" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {busy === "send" ? "Sending…" : "Send V18 to applicant"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="py-1.5">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
    </div>
  );
}

// ---------- Conversation items (outbound + inbound interleaved) ----------

type ConversationItem =
  | {
      kind: "outbound";
      id: string;
      at: string;
      subject: string | null;
      body_html: string | null;
      body_text: string | null;
      template_tag: string | null;
    }
  | {
      kind: "inbound";
      id: string;
      at: string;
      from_email: string | null;
      from_name: string | null;
      subject: string | null;
      body_plain: string | null;
      stripped_text: string | null;
      classified_intent: string | null;
      ai_reply_analysis: Record<string, unknown> | null;
      acknowledged_at: string | null;
    };

// ---------- Flag feedback ----------

type FlagKind = "red_flag" | "green_flag";
type FlagVerdict = "valid" | "invalid" | "low_weight" | "context_dependent";

interface FlagFeedback {
  flag_kind: FlagKind;
  flag_text: string;
  verdict: FlagVerdict;
  staff_notes: string | null;
  updated_at: string;
  /** When the verdict was matched via similarity rather than exact flag_text
   *  (e.g. AI reworded the flag on a reassess) the UI flags it so staff can
   *  see provenance. */
  _matchedViaFuzzy?: boolean;
  _matchedFromText?: string;
}

// Tokenise a flag string for similarity matching: lowercase, drop punctuation,
// drop short stopwords. Phrases like "Canadian clients" and "clients in Canada"
// still overlap meaningfully.
function tokensOf(s: string): Set<string> {
  const stop = new Set([
    "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "at", "by",
    "is", "was", "has", "have", "had", "be", "been", "with", "from", "as",
    "this", "that", "these", "those", "their", "its", "it", "but", "not",
  ]);
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !stop.has(t)),
  );
}

function jaccard(a: string, b: string): number {
  const ta = tokensOf(a);
  const tb = tokensOf(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersect = 0;
  for (const t of ta) if (tb.has(t)) intersect += 1;
  const union = ta.size + tb.size - intersect;
  return intersect / union;
}

const VERDICT_LABELS: Record<FlagVerdict, string> = {
  valid: "Valid",
  low_weight: "Low weight",
  context_dependent: "Context",
  invalid: "Invalid",
};

const VERDICT_STYLES: Record<FlagVerdict, { active: string; idle: string }> = {
  valid: {
    active: "bg-red-600 text-white border-red-600",
    idle: "bg-white text-gray-600 hover:bg-red-50 hover:text-red-700 border-gray-200",
  },
  low_weight: {
    active: "bg-amber-500 text-white border-amber-500",
    idle: "bg-white text-gray-600 hover:bg-amber-50 hover:text-amber-700 border-gray-200",
  },
  context_dependent: {
    active: "bg-blue-500 text-white border-blue-500",
    idle: "bg-white text-gray-600 hover:bg-blue-50 hover:text-blue-700 border-gray-200",
  },
  invalid: {
    active: "bg-emerald-600 text-white border-emerald-600",
    idle: "bg-white text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 border-gray-200",
  },
};

// ---------- Decision modal ----------

type DecisionType = "approved" | "rejected" | "waitlisted" | "info_requested";

interface DecisionModalConfig {
  title: string;
  intro: string;
  placeholder: string;
  aiBehaviour: string;
  submitLabel: string;
  submitClassName: string;
  minLength: number;
}

const DECISION_CONFIGS: Record<DecisionType, DecisionModalConfig> = {
  approved: {
    title: "Approve application",
    intro:
      "The applicant will get the V11 welcome email with their password-setup link.",
    placeholder:
      "Optional. Anything to highlight (e.g. \"strong MQM scores on legal test — proceed to mid-tier rate\"). Notes are stored privately and may be AI-summarised into a warm welcome line in the email.",
    aiBehaviour:
      "Notes are stored for the learning loop. If substantive, AI may add a short personal line to the welcome email — never copy your raw notes into the email.",
    submitLabel: "Approve & send welcome",
    submitClassName: "bg-emerald-600 hover:bg-emerald-700",
    minLength: 0,
  },
  rejected: {
    title: "Reject application",
    intro:
      "AI will rephrase your notes into one polite applicant-facing sentence. The V12 email is queued and only sends after a 48-hour intercept window.",
    placeholder:
      "Required. Internal reason in plain language (e.g. \"CV contradicts form on years of experience; sample translation has accuracy errors\"). AI will not copy your raw notes — it produces a polished neutral summary.",
    aiBehaviour:
      "AI generates the applicant-facing reason (no internal jargon, no scores). Your raw notes are stored for learning. You have 48h to intercept the email from this page.",
    submitLabel: "Queue rejection (48h intercept)",
    submitClassName: "bg-red-600 hover:bg-red-700",
    minLength: 5,
  },
  waitlisted: {
    title: "Waitlist application",
    intro:
      "The applicant gets V13 immediately, including a short AI-rephrased line explaining the wait.",
    placeholder:
      "Required. Why are they being waitlisted (e.g. \"Strong CV but no demand on this pair this quarter — revisit Q3\"). AI will produce a soft applicant-facing sentence; your raw notes stay internal.",
    aiBehaviour:
      "AI rewrites your notes into a polite waitlist explanation. Raw notes stored for learning.",
    submitLabel: "Waitlist & send",
    submitClassName: "bg-amber-600 hover:bg-amber-700",
    minLength: 5,
  },
  info_requested: {
    title: "Request more info",
    intro:
      "AI will rephrase your notes into the V17 email body so the applicant sees a polished message instead of your raw working notes.",
    placeholder:
      "Required. What do you need (e.g. \"Need updated CV showing 2023–present employment dates; clarify whether ATA cert is current\"). AI rephrases this for the applicant.",
    aiBehaviour:
      "AI rewrites your notes into a polite request. Your raw notes are stored for learning. The applicant sees the AI-rephrased version.",
    submitLabel: "Send request",
    submitClassName: "bg-teal-600 hover:bg-teal-700",
    minLength: 5,
  },
};

interface DecisionPreview {
  subject: string;
  html: string;
  aiOutput: string | null;
  aiError: string | null;
}

/**
 * Domain-pick options. Only used for decision='approved'; the other
 * decisions don't operate on specific combinations.
 */
interface ApprovalDomainContext {
  combinations: TestCombination[];
  languages: Record<string, string>;
}

interface DecisionModalProps {
  decision: DecisionType;
  onClose: () => void;
  /** Preview: runs AI + renders email without sending. */
  onPreview: (
    notes: string,
    approvalOpts?: { combinationIds: string[]; combinationRationales: Record<string, string> },
  ) => Promise<DecisionPreview>;
  /** Send: uses edited subject/body if provided, else AI output. */
  onSend: (args: {
    notes: string;
    editedSubject: string;
    editedContent: string;
    combinationIds?: string[];
    combinationRationales?: Record<string, string>;
  }) => Promise<void>;
  busy: boolean;
  initialNotes?: string;
  /** Required when decision='approved'. The modal opens at the domain-pick
   *  step and only proceeds to notes/preview after the staff has selected
   *  at least one combination and provided a per-domain rationale. */
  approvalContext?: ApprovalDomainContext;
  /** True when the application is an agency (role_type='agency'). Agency
   *  approvals skip the per-domain selection step — there are no test
   *  combinations to approve at the agency level; per-linguist
   *  qualifications live on the blinded roster. The modal jumps
   *  straight to notes → preview. */
  isAgency?: boolean;
}

function DecisionModal({
  decision,
  onClose,
  onPreview,
  onSend,
  busy,
  initialNotes,
  approvalContext,
  isAgency,
}: DecisionModalProps) {
  const cfg = DECISION_CONFIGS[decision];
  // For 'approved' the flow is domains → notes → preview. For everything
  // else it stays at the original notes → preview. Agency approvals
  // skip the domains step entirely (no test combinations to approve).
  const isApprove = decision === "approved";
  const [step, setStep] = useState<"domains" | "notes" | "preview">(
    isApprove && !isAgency ? "domains" : "notes",
  );
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [preview, setPreview] = useState<DecisionPreview | null>(null);
  const [editedSubject, setEditedSubject] = useState("");
  const [editedContent, setEditedContent] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const tooShort = notes.trim().length < cfg.minLength;

  // Combo selection (decision='approved' only). Pre-checked = combos
  // already in a validated state (approved or skip_manual_review). Staff
  // can override by selecting any other combo, but the rationale textarea
  // becomes the audit trail for that override.
  const VALIDATED_STATUSES = new Set(["approved", "skip_manual_review"]);
  const initialSelected = useMemo<Set<string>>(() => {
    if (!approvalContext) return new Set();
    return new Set(
      approvalContext.combinations
        .filter((c) => VALIDATED_STATUSES.has(c.status))
        .map((c) => c.id),
    );
  }, [approvalContext]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(initialSelected);
  const [rationales, setRationales] = useState<Record<string, string>>({});

  const RATIONALE_MIN_CHARS = 10;
  const selectedArr = Array.from(selectedIds);
  const allRationalesOk = selectedArr.every(
    (id) => (rationales[id] ?? "").trim().length >= RATIONALE_MIN_CHARS,
  );
  const domainsStepValid = selectedArr.length > 0 && allRationalesOk;

  // Helpers for the preview/send wiring — only meaningful when isApprove.
  const approvalPayload = isApprove
    ? {
        combinationIds: selectedArr,
        combinationRationales: Object.fromEntries(
          selectedArr.map((id) => [id, (rationales[id] ?? "").trim()]),
        ),
      }
    : undefined;

  const handleGoToPreview = async () => {
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const p = await onPreview(notes.trim(), approvalPayload);
      setPreview(p);
      setEditedSubject(p.subject);
      setEditedContent(p.aiOutput ?? "");
      setStep("preview");
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewBusy(false);
    }
  };

  const handleRefreshPreview = async () => {
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      // Re-run dry-run so the iframe reflects current edits.
      const p = await onPreview(notes.trim(), approvalPayload);
      // Keep staff's edits for subject + body; only update the rendered html.
      setPreview({ ...p, subject: editedSubject, aiOutput: editedContent || p.aiOutput });
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewBusy(false);
    }
  };

  // When iframe needs to reflect edited body, pass a "preview with edits"
  // variant. For now, the iframe shows the AI-rendered version; staff sees a
  // warning if they've edited the body.
  const bodyWasEdited = preview?.aiOutput !== editedContent && editedContent.length > 0;
  const subjectWasEdited = preview ? editedSubject !== preview.subject : false;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-lg shadow-xl w-full p-6 ${
          step === "preview" ? "max-w-3xl" : "max-w-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {cfg.title}
            {step === "preview" && (
              <span className="ml-2 text-xs font-normal text-gray-500">
                · Preview &amp; edit email
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {step === "domains" && approvalContext && (
          <>
            <p className="text-sm text-gray-600 mb-3">
              Select the domains to approve this vendor for. Pre-checked rows passed a test or are a certified-only domain. You can override by selecting any other row, but every checked row needs a one-line reason (≥{RATIONALE_MIN_CHARS} chars) — it's stored on the decision audit log and never shown to the applicant.
            </p>
            <div className="max-h-[55vh] overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
              {approvalContext.combinations.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">No combinations on this application.</p>
              ) : (
                approvalContext.combinations.map((c) => {
                  const checked = selectedIds.has(c.id);
                  const validated = VALIDATED_STATUSES.has(c.status);
                  const rationale = rationales[c.id] ?? "";
                  const rationaleShort = checked && rationale.trim().length < RATIONALE_MIN_CHARS;
                  const badge = validated
                    ? { text: "Validated", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" }
                    : c.status === "assessed"
                    ? { text: "Test assessed", cls: "bg-sky-100 text-sky-800 border-sky-200" }
                    : { text: "Not validated", cls: "bg-amber-100 text-amber-800 border-amber-200" };
                  return (
                    <div key={c.id} className="p-3">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(c.id);
                              else next.delete(c.id);
                              return next;
                            });
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900">
                              {DOMAIN_LABELS[c.domain ?? ""] || c.domain || "—"}
                            </span>
                            <span className="text-xs text-gray-500">
                              {approvalContext.languages[c.source_language_id] || "?"} → {approvalContext.languages[c.target_language_id] || "?"}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.text}</span>
                            {!validated && checked && (
                              <span className="text-[10px] text-amber-700 font-medium">overriding gate</span>
                            )}
                          </div>
                        </div>
                      </label>
                      {checked && (
                        <div className="mt-2 ml-6">
                          <textarea
                            value={rationale}
                            onChange={(e) =>
                              setRationales((prev) => ({ ...prev, [c.id]: e.target.value }))
                            }
                            placeholder={validated
                              ? "Reason / source (e.g. 'Test passed score 84')"
                              : "Why approve without validation? (e.g. 'Reference confirmed games expertise — Pedro at Acme')"}
                            rows={2}
                            className={`w-full p-2 text-xs border rounded-md focus:outline-none focus:ring-1 ${
                              rationaleShort
                                ? "border-amber-400 focus:ring-amber-500"
                                : "border-gray-300 focus:ring-teal-500"
                            }`}
                          />
                          {rationaleShort && (
                            <p className="text-[10px] text-amber-700 mt-0.5">
                              Add at least {RATIONALE_MIN_CHARS} characters.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={previewBusy}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep("notes")}
                disabled={!domainsStepValid}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 ${cfg.submitClassName}`}
              >
                Continue to notes →
              </button>
            </div>
            {!domainsStepValid && selectedArr.length === 0 && (
              <p className="mt-2 text-xs text-amber-700">Select at least one domain.</p>
            )}
          </>
        )}

        {step === "notes" && (
          <>
            <p className="text-sm text-gray-600 mb-3">{cfg.intro}</p>
            {isApprove && !isAgency && (
              <div className="mb-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded text-xs">
                <strong className="text-emerald-900">Approving {selectedArr.length} domain{selectedArr.length === 1 ? "" : "s"}.</strong>{" "}
                <button
                  type="button"
                  className="text-emerald-700 underline hover:text-emerald-900"
                  onClick={() => setStep("domains")}
                >
                  ← change selection
                </button>
              </div>
            )}
            {isApprove && isAgency && (
              <div className="mb-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded text-xs">
                <strong className="text-emerald-900">Approving as an agency.</strong>{" "}
                The agency vendor will be provisioned with roster_required=true and cannot accept jobs
                until at least one roster linguist is added for the language pair + service.
              </div>
            )}
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {cfg.minLength > 0 ? "Staff notes (required)" : "Staff notes (optional)"}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={cfg.placeholder}
              rows={6}
              disabled={previewBusy}
              className="w-full p-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
            />
            <div className="mt-3 p-2.5 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600">
              <strong className="text-gray-700">How AI uses this:</strong> {cfg.aiBehaviour}
            </div>
            {previewError && (
              <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                Preview failed: {previewError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={previewBusy}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGoToPreview}
                disabled={previewBusy || tooShort}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 ${cfg.submitClassName}`}
              >
                {previewBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {previewBusy ? "Generating preview…" : "Preview email →"}
              </button>
            </div>
            {tooShort && cfg.minLength > 0 && notes.length > 0 && (
              <p className="mt-2 text-xs text-amber-700">
                Add at least {cfg.minLength} characters of context.
              </p>
            )}
          </>
        )}

        {step === "preview" && preview && (
          <>
            <p className="text-sm text-gray-600 mb-3">
              AI drafted the applicant-facing copy below. Edit the subject or body
              before sending — your raw staff notes stay internal.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Subject {subjectWasEdited && <span className="text-teal-600">(edited)</span>}
                </label>
                <input
                  type="text"
                  value={editedSubject}
                  onChange={(e) => setEditedSubject(e.target.value)}
                  disabled={busy}
                  className="w-full p-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Applicant-facing message {bodyWasEdited && <span className="text-teal-600">(edited)</span>}
                  <span className="text-gray-400 font-normal"> — goes into the email body</span>
                </label>
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  rows={4}
                  disabled={busy}
                  className="w-full p-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
                />
                {preview.aiError && (
                  <p className="text-[11px] text-amber-600 mt-0.5">
                    AI rewrite failed ({preview.aiError}); using fallback copy. Edit above if needed.
                  </p>
                )}
              </div>

              <details className="group">
                <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1">
                  <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
                  Rendered preview (click to expand)
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); handleRefreshPreview(); }}
                    disabled={previewBusy}
                    className="ml-auto text-[11px] text-teal-600 hover:text-teal-800 underline disabled:opacity-50"
                  >
                    {previewBusy ? "Refreshing…" : "Refresh with my edits"}
                  </button>
                </summary>
                <div className="mt-2 border border-gray-200 rounded overflow-hidden">
                  <iframe
                    title="Email preview"
                    srcDoc={preview.html}
                    className="w-full"
                    style={{ height: "400px" }}
                  />
                </div>
                {(bodyWasEdited || subjectWasEdited) && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    Your edits are NOT yet reflected in this preview. Click "Refresh with my edits" to regenerate, or Send to apply them.
                  </p>
                )}
              </details>
            </div>

            <div className="mt-4 flex justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep("notes")}
                disabled={busy}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
              >
                ← Back to notes
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => onSend({
                    notes: notes.trim(),
                    editedSubject: editedSubject.trim(),
                    editedContent: editedContent.trim(),
                    combinationIds: approvalPayload?.combinationIds,
                    combinationRationales: approvalPayload?.combinationRationales,
                  })}
                  disabled={busy}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 ${cfg.submitClassName}`}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {busy ? "Sending…" : cfg.submitLabel}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface FlagWithFeedbackProps {
  flagKind: FlagKind;
  flagText: string;
  existing: FlagFeedback | undefined;
  onSave: (verdict: FlagVerdict, notes: string | null) => Promise<void>;
  onClear: () => Promise<void>;
}

function FlagWithFeedback({
  flagKind,
  flagText,
  existing,
  onSave,
  onClear,
}: FlagWithFeedbackProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState(existing?.staff_notes ?? "");
  const [saving, setSaving] = useState<FlagVerdict | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  // Transient "Saved ✓" indicator. Cleared by a setTimeout after each save.
  const [justSaved, setJustSaved] = useState<null | "verdict" | "notes" | "cleared" | "error">(null);
  const isRed = flagKind === "red_flag";

  useEffect(() => {
    setNotesDraft(existing?.staff_notes ?? "");
  }, [existing?.staff_notes]);

  const flashSaved = (kind: "verdict" | "notes" | "cleared" | "error") => {
    setJustSaved(kind);
    window.setTimeout(() => setJustSaved((s) => (s === kind ? null : s)), 2000);
  };

  const handleVerdictClick = async (verdict: FlagVerdict) => {
    if (saving) return;
    setSaving(verdict);
    try {
      // Toggle off if clicking the same verdict (and no notes) — acts as clear
      if (existing?.verdict === verdict && !notesDraft) {
        await onClear();
        flashSaved("cleared");
      } else {
        await onSave(verdict, notesDraft || null);
        flashSaved("verdict");
      }
    } catch {
      flashSaved("error");
    } finally {
      setSaving(null);
    }
  };

  const handleNotesSave = async () => {
    if (!existing?.verdict) return;
    setSavingNotes(true);
    try {
      await onSave(existing.verdict, notesDraft || null);
      flashSaved("notes");
    } catch {
      flashSaved("error");
    } finally {
      setSavingNotes(false);
    }
  };

  // Any non-empty existing means something has been saved by staff.
  const hasAnyFeedback = Boolean(existing?.verdict);

  return (
    <li
      className={`px-3 py-2 rounded-md border transition-colors ${
        hasAnyFeedback
          ? "bg-white border-teal-300 ring-1 ring-teal-200"
          : isRed
          ? "bg-red-50/50 border-red-100"
          : "bg-emerald-50/50 border-emerald-100"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className={`flex-1 text-sm ${isRed ? "text-red-800" : "text-emerald-900"}`}>
          {flagText}
        </div>
        {hasAnyFeedback && (
          <span
            className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5"
            title={
              existing?._matchedViaFuzzy
                ? `Verdict migrated from an earlier (reworded) version of this flag: "${existing._matchedFromText}"`
                : undefined
            }
          >
            <CheckCircle className="w-3 h-3" />
            {existing?._matchedViaFuzzy ? "Verdicted (migrated)" : "Verdicted"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {(Object.keys(VERDICT_LABELS) as FlagVerdict[]).map((v) => {
          const active = existing?.verdict === v;
          const styles = VERDICT_STYLES[v];
          return (
            <button
              key={v}
              type="button"
              onClick={() => handleVerdictClick(v)}
              disabled={saving !== null}
              className={`px-2 py-0.5 text-[11px] font-medium rounded-full border transition disabled:opacity-50 ${
                active ? styles.active : styles.idle
              }`}
            >
              {saving === v ? "…" : VERDICT_LABELS[v]}
            </button>
          );
        })}
        {/* Transient save confirmation */}
        {justSaved === "verdict" && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 animate-in fade-in slide-in-from-right-1">
            <CheckCircle className="w-3.5 h-3.5" /> Saved
          </span>
        )}
        {justSaved === "cleared" && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600">
            <XCircle className="w-3.5 h-3.5" /> Cleared
          </span>
        )}
        {justSaved === "error" && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
            <AlertTriangle className="w-3.5 h-3.5" /> Save failed
          </span>
        )}
        <button
          type="button"
          onClick={() => setNotesOpen((o) => !o)}
          className="ml-auto text-[11px] text-gray-500 hover:text-gray-700 underline"
        >
          {notesOpen ? "Hide notes" : existing?.staff_notes ? "Edit notes" : "+ notes"}
        </button>
      </div>
      {notesOpen && (
        <div className="mt-2 space-y-1.5">
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Why? e.g. 'Cost of certification too high vs avg income — not a real signal'"
            rows={2}
            className="w-full text-xs p-2 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          <div className="flex justify-end items-center gap-2">
            {!existing?.verdict && (
              <span className="text-[11px] text-gray-500 self-center">
                Pick a verdict above first to save notes.
              </span>
            )}
            {justSaved === "notes" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                <CheckCircle className="w-3.5 h-3.5" /> Notes saved
              </span>
            )}
            <button
              type="button"
              disabled={savingNotes || !existing?.verdict}
              onClick={handleNotesSave}
              className="px-2 py-1 text-[11px] bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-md"
            >
              {savingNotes ? "Saving…" : "Save notes"}
            </button>
          </div>
        </div>
      )}
      {existing?.staff_notes && !notesOpen && (
        <div className="mt-1.5 text-[11px] text-gray-600 italic">
          “{existing.staff_notes}”
        </div>
      )}
    </li>
  );
}

// ----------------------------------------------------------------------------
// QuizSubmissionPanel — read-only review of a single applicant's ISO competence
// quiz attempt. Visible regardless of pass/fail so staff can audit any
// rejected, in-progress, or approved quiz. See docs/qms/02-test-or-quiz-routing.md.
// ----------------------------------------------------------------------------
function QuizSubmissionPanel({
  submission,
  questions,
  languageLabel,
  coaResponses = [],
  callEdgeFunction,
  onAfterAction,
}: {
  submission: QuizSubmission;
  questions: Record<string, QuizQuestion>;
  languageLabel: string;
  coaResponses?: CoaTranslationResponse[];
  callEdgeFunction?: (fn: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onAfterAction?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const recColor = !submission.assessment_recommendation
    ? "bg-gray-100 text-gray-600"
    : /not recommended|fail/i.test(submission.assessment_recommendation)
      ? "bg-red-100 text-red-700"
      : /needs human review|flagged/i.test(submission.assessment_recommendation)
        ? "bg-amber-100 text-amber-700"
        : "bg-green-100 text-green-700";

  const responses = submission.responses ?? [];
  const responseByQuestionId = new Map(
    responses.map((r) => [r.question_id, r.selected_option] as const),
  );

  const scorePct = submission.score_pct === null || submission.score_pct === undefined
    ? null
    : Number(submission.score_pct);
  const scoreColor =
    scorePct === null
      ? "bg-gray-100 text-gray-600"
      : scorePct >= 70
        ? "bg-green-100 text-green-700"
        : scorePct >= 60
          ? "bg-yellow-100 text-yellow-700"
          : "bg-red-100 text-red-700";

  const breakdown = submission.competence_breakdown ?? {};
  const breakdownEntries = Object.entries(breakdown);

  // Group responses by competence using the looked-up question metadata so
  // staff can scan errors per competence band.
  type ResponseRow = {
    question: QuizQuestion | null;
    selected: string | null;
    questionId: string;
    competence: string;
  };
  const rows: ResponseRow[] = responses.map((r) => {
    const q = questions[r.question_id] ?? null;
    return {
      question: q,
      selected: r.selected_option,
      questionId: r.question_id,
      competence: q?.competence_slug ?? "unknown",
    };
  });
  // Stable competence ordering matches the email/UI elsewhere.
  const competenceOrder = [
    "linguistic_textual_competence",
    "cultural_competence",
    "domain_competence",
    "research_competence",
    "technical_competence",
  ];
  rows.sort((a, b) => {
    const ai = competenceOrder.indexOf(a.competence);
    const bi = competenceOrder.indexOf(b.competence);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            ISO competence quiz · {languageLabel}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${scoreColor}`}>
            {scorePct === null ? "Not submitted" : `${scorePct.toFixed(0)}%`}
            {submission.correct_count !== null && submission.total_count !== null && (
              <span className="ml-1 font-normal opacity-80">
                ({submission.correct_count}/{submission.total_count})
              </span>
            )}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
            Status: {submission.status}
          </span>
        </div>
        <div className="text-xs text-gray-500">
          {submission.submitted_at
            ? `Submitted ${format(new Date(submission.submitted_at), "MMM d, yyyy h:mm a")}`
            : `Issued ${format(new Date(submission.created_at), "MMM d, yyyy h:mm a")}`}
        </div>
      </div>

      {submission.assessment_summary && (
        <div className="mt-2 p-2 rounded bg-white border border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Assessment</span>
            {submission.assessment_recommendation && (
              <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${recColor}`}>{submission.assessment_recommendation}</span>
            )}
          </div>
          <p className="text-xs text-gray-800">{submission.assessment_summary}</p>
        </div>
      )}

      {breakdownEntries.length > 0 && (
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {competenceOrder
            .map((slug) => [slug, breakdown[slug]] as const)
            .filter(([, b]) => !!b)
            .map(([slug, b]) => {
              const pct = b!.total > 0 ? (b!.correct / b!.total) * 100 : 0;
              const cellColor =
                pct >= 70 ? "text-green-700" : pct >= 60 ? "text-yellow-700" : "text-red-700";
              return (
                <div key={slug} className="rounded border border-gray-200 px-2 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">
                    {COMPETENCE_LABELS[slug] ?? slug}
                  </div>
                  <div className={`text-sm font-semibold ${cellColor}`}>
                    {b!.correct}/{b!.total}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {submission.is_coa && coaResponses.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 mb-1">
            Part-2 translations (verbatim) — {coaResponses.length}
          </div>
          <div className="space-y-2">
            {coaResponses.map((cr) => {
              const vColor = cr.verdict === "pass" ? "bg-green-100 text-green-700" : cr.verdict === "fail" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
              return (
                <div key={cr.id} className="rounded border border-gray-200 p-2 bg-white">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${vColor}`}>{cr.verdict ?? (cr.needs_human_review ? "needs review" : "—")}</span>
                    {cr.mqm_score != null && <span className="text-[10px] text-gray-500">MQM {cr.mqm_score}</span>}
                    {cr.conceptual_equivalence && <span className="text-[10px] text-gray-500">conceptual: {cr.conceptual_equivalence}</span>}
                    {cr.target_language_name && <span className="text-[10px] text-gray-500">{cr.target_language_name}</span>}
                  </div>
                  {cr.applicant_translation && <p className="text-xs text-gray-900 whitespace-pre-wrap">{cr.applicant_translation}</p>}
                  {cr.ai_rationale && <p className="mt-1 text-[11px] text-gray-500 italic">{cr.ai_rationale}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {responses.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-xs font-medium text-cyan-700 hover:text-cyan-900"
          >
            {open ? "Hide" : "Show"} all {responses.length} responses
          </button>
          {open && (
            <ol className="mt-2 space-y-2 list-decimal list-inside">
              {rows.map((row, idx) => {
                const q = row.question;
                if (!q) {
                  return (
                    <li key={row.questionId} className="text-xs text-gray-500">
                      <span className="font-mono">{row.questionId}</span> — applicant chose{" "}
                      <span className="font-mono">{row.selected ?? "—"}</span> (question content
                      not available)
                    </li>
                  );
                }
                const correct = q.correct_option === row.selected;
                return (
                  <li
                    key={row.questionId}
                    className={`rounded border px-3 py-2 text-xs ${
                      correct ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] uppercase tracking-wide text-gray-500">
                        {COMPETENCE_LABELS[q.competence_slug] ?? q.competence_slug}
                      </span>
                      <span
                        className={`text-[10px] font-semibold ${
                          correct ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        {correct ? "Correct" : "Incorrect"}
                      </span>
                    </div>
                    <div className="text-gray-900 mb-1.5">{q.question}</div>
                    <ul className="space-y-0.5">
                      {q.options.map((opt) => {
                        const isSelected = opt.value === row.selected;
                        const isCorrect = opt.value === q.correct_option;
                        return (
                          <li
                            key={opt.value}
                            className={`flex items-center gap-2 ${
                              isCorrect
                                ? "text-green-800 font-semibold"
                                : isSelected
                                  ? "text-red-800"
                                  : "text-gray-700"
                            }`}
                          >
                            <span className="font-mono w-4">{opt.value}.</span>
                            <span>{opt.label}</span>
                            {isSelected && (
                              <span className="text-[10px] uppercase tracking-wide">
                                · chose
                              </span>
                            )}
                            {isCorrect && !isSelected && (
                              <span className="text-[10px] uppercase tracking-wide">
                                · correct
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {!correct && q.explanation && (
                      <div className="mt-1.5 text-gray-700 italic">
                        Why: {q.explanation}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {callEdgeFunction && onAfterAction && (
        <InstrumentReminderControls
          kind="quiz"
          submissionId={submission.id}
          status={submission.status}
          createdAt={submission.created_at}
          tokenExpiresAt={submission.token_expires_at ?? null}
          submittedAt={submission.submitted_at}
          reminders={[submission.reminder_1_sent_at, submission.reminder_2_sent_at, submission.reminder_3_sent_at]}
          callEdgeFunction={callEdgeFunction}
          onAfterAction={onAfterAction}
        />
      )}
    </div>
  );
}

// ---------- Component ----------

interface IsoEvidence {
  application_id: string;
  role_type: string;
  ai_prescreening_score: number | null;
  education_level: string | null;
  years_experience: number | null;
  has_cv: boolean;
  refs_received: number;
  approved_combos: number;
  real_passed_combos: number;
  skip_review_combos: number;
  declared_domain_list: string | null;
  has_verified_degree_doc: boolean;
  passed_domains: string | null;
  tested_domains: string | null;
  declared_domains: number;
  quiz_score: number | null;
  flag_no_cv: boolean;
  flag_low_prescreen: boolean;
  flag_thin_experience: boolean;
  flag_broad_domains: boolean;
  iso_badge: "ready" | "check" | "hold";
  uploaded_docs_count: number;
  uploaded_doc_names: string[] | null;
  has_degree_doc: boolean;
  screened_count: number;
  screened_any_verified: boolean;
  screened_items: { title: string; type: string | null; verified: boolean; confidence: string | null; storage_path?: string | null }[] | null;
  applicant_vendor_id: string | null;
  ref_min_confirmed_year: number | null;
  ref_documented_years: number | null;
  ref_positive_count: number;
}

// Domains where a general translation test is NOT sufficient — domain-specific
// evidence (degree in the field, certification, or documented experience) is required.
const HIGH_RISK_DOMAINS = new Set(["medical", "life_sciences", "pharmaceutical", "legal", "financial", "insurance", "coa_linguistic_validation", "certified_official", "immigration"]);

const DOMAIN_DISPLAY: Record<string, string> = {
  legal: "Legal", medical: "Medical", life_sciences: "Life Sciences",
  pharmaceutical: "Pharmaceutical", financial: "Financial", insurance: "Insurance",
  technical: "Technical", it_software: "IT & Software", energy: "Energy",
  general: "General", academic_scientific: "Academic / Scientific",
  business_corporate: "Business / Corporate", marketing_advertising: "Marketing",
  immigration: "Immigration", certified_official: "Certified / Official",
  literary_publishing: "Literary", tourism_hospitality: "Tourism",
  government_public: "Government", gaming_entertainment: "Gaming",
  media_journalism: "Media", automotive_engineering: "Automotive",
};

// Deterministic, candidate-specific "how to approve this person" checklist for
// the reviewer — reasons over the same evidence the panel shows. Ordered steps
// with done / check / todo status, ending in a bottom-line recommendation.
function IsoReviewerGuide({ ev, ndaSignedAt, coaQuiz }: { ev: IsoEvidence; ndaSignedAt: string | null; coaQuiz?: QuizSubmission | null }) {
  type Step = { state: "done" | "check" | "todo"; text: string };
  const steps: Step[] = [];

  const items = ev.screened_items ?? [];
  const degreeItems = items.filter((it) => it.type === "degree_translation" || it.type === "degree_other");
  const certItems = items.filter((it) => it.type === "domain_specific_certification");
  const expItems = items.filter((it) => it.type === "documented_translation_experience");
  const hasDegreeTranslation = items.some((it) => it.type === "degree_translation");

  // Risk-classify ALL declared domains (domains_offered), not just those that
  // happen to have a combo — otherwise high-risk domains with no test slip through.
  const declaredList = (ev.declared_domain_list ?? ev.tested_domains ?? "")
    .split(",").map((d) => d.trim()).filter(Boolean);
  const highRiskDeclared = declaredList.filter((d) => HIGH_RISK_DOMAINS.has(d));
  const safeDeclared = declaredList.filter((d) => !HIGH_RISK_DOMAINS.has(d));

  // Domain competence (§6.1.6) is established FIRST by a passed domain test —
  // that is the primary, IQVIA-weighted evidence. A domain-specific certificate
  // or experience doc is a fallback. So a high-risk domain is "evidenced" if the
  // applicant PASSED the test in it, OR has a cert/doc naming it.
  // Only GENUINELY-graded domains count (passed_domains = real submission + score).
  // A passed COA quiz (>=90%) is the only real CLINICAL assessment, so it qualifies
  // the clinical domains. Cascaded/backfilled 'approved' combos are NOT evidence.
  const passedDomains = (ev.passed_domains ?? "")
    .split(",").map((d) => d.trim()).filter(Boolean);
  const coaQuizPassed = !!coaQuiz && coaQuiz.status === "submitted" &&
    coaQuiz.score_pct != null && Number(coaQuiz.score_pct) >= 90;
  const CLINICAL_DOMAINS = new Set(["medical", "life_sciences", "pharmaceutical", "coa_linguistic_validation"]);
  const domainEvidencedByTest = (d: string) => passedDomains.includes(d) || (coaQuizPassed && CLINICAL_DOMAINS.has(d));
  const highRiskTested = highRiskDeclared.filter(domainEvidencedByTest);
  const highRiskWithEvidence = highRiskDeclared.filter((d) =>
    domainEvidencedByTest(d) ||
    certItems.some((it) => it.title.toLowerCase().includes(d.replace("_", " "))) ||
    expItems.some((it) => it.title.toLowerCase().includes(d.replace("_", " ")))
  );
  const highRiskNoEvidence = highRiskDeclared.filter((d) => !highRiskWithEvidence.includes(d));

  // 1. Competence — a genuinely PASSED test (status 'approved') or a passed quiz.
  // skip_manual_review combos are NOT a test pass: the test was BYPASSED and the
  // combo routed to credential review. They do not, on their own, demonstrate
  // competence — that must rest on a VERIFIED §3.1.4 basis.
  if (ev.real_passed_combos > 0) {
    steps.push({ state: "done", text: `Competence: translation test passed (${ev.real_passed_combos} combo${ev.real_passed_combos > 1 ? "s" : ""}). See Test Combinations below.` });
  } else if (ev.quiz_score != null) {
    steps.push({ state: "done", text: `Competence: quiz passed (${ev.quiz_score}%). See Quiz Results below.` });
  } else if (ev.skip_review_combos > 0) {
    steps.push({ state: "check", text: `Competence: ${ev.skip_review_combos} combo${ev.skip_review_combos > 1 ? "s" : ""} routed to manual credential review — the test was BYPASSED, not passed. This is not a completed competence assessment; competence must rest on a verified §3.1.4 basis (below) or a passed test/quiz.` });
  } else {
    steps.push({ state: "todo", text: "Competence: no test/quiz on file — do not approve until competence is demonstrated." });
  }

  // 1b. COA quiz — competence bar is 90% MCQ. At/above the bar = competence
  // demonstrated (proceed). The Part-2 translation AI verdict is ADVISORY:
  // corroborate the overall score with the COA Quiz Results, references + §3.1.4
  // at final approval — it is NOT an auto-block. Below the bar = corroborate.
  const COA_BAR = 90;
  const hasCOADomain = declaredList.includes("coa_linguistic_validation");
  if (hasCOADomain || coaQuiz) {
    if (!coaQuiz || coaQuiz.status !== "submitted") {
      steps.push({
        state: "todo",
        text: `COA quiz: not yet submitted${coaQuiz ? ` (status: ${coaQuiz.status})` : " — send via Assessment Path panel below"}. Required before approving COA Linguistic Validation.`,
      });
    } else {
      const scoreNum = coaQuiz.score_pct !== null && coaQuiz.score_pct !== undefined ? Number(coaQuiz.score_pct) : null;
      const score = scoreNum !== null ? `${scoreNum.toFixed(0)}%` : "?%";
      const rec = coaQuiz.assessment_recommendation ?? null;
      const flagged = !!rec && /not recommended|fail|needs human review|flagged/i.test(rec);
      const advisory = flagged
        ? ` AI flagged Part-2 translation(s) ("${rec}") — advisory; corroborate with the COA Quiz Results, references + §3.1.4 before final approval.`
        : "";
      if (scoreNum !== null && scoreNum >= COA_BAR) {
        steps.push({
          state: "done",
          text: `COA quiz: ${score} — at/above the ${COA_BAR}% bar, competence demonstrated.${advisory}`,
        });
      } else {
        steps.push({
          state: "check",
          text: `COA quiz: ${score} — below the ${COA_BAR}% bar. Corroborate the score with the COA Quiz Results, references + §3.1.4 before approving COA Linguistic Validation.${advisory}`,
        });
      }
    }
  }

  // 2. §3.1.4 qualification basis — name the actual documents
  if (degreeItems.length > 0) {
    const docList = degreeItems.map((it) => {
      const conf = it.confidence != null ? ` · AI ${it.confidence}%` : "";
      const ver = it.verified ? " · verified" : " · unverified";
      return `"${it.title}"${conf}${ver}`;
    }).join("; ");
    if (hasDegreeTranslation) {
      steps.push({ state: "check", text: `§3.1.4 basis: translation degree on file — ${docList}. Open it and confirm the field is translation/interpreting → record basis = route (a).` });
    } else {
      const expNote = expItems.length > 0
        ? ` Experience docs also on file: ${expItems.map((it) => `"${it.title}"`).join(", ")}.`
        : " No experience docs on file — check CV for ≥2 yrs.";
      steps.push({ state: "check", text: `§3.1.4 basis: non-translation degree on file — ${docList}.${expNote} Confirm field + ≥2 yrs → record basis = route (b).` });
    }
  } else if ((ev.ref_documented_years ?? 0) >= 5) {
    steps.push({ state: "done", text: `§3.1.4 basis: route (c) — references confirm ~${ev.ref_documented_years} yrs professional experience (since ${ev.ref_min_confirmed_year}). Record basis = §3.1.4(c). No degree needed.` });
  } else if (expItems.length > 0) {
    const expList = expItems.map((it) => `"${it.title}"`).join(", ");
    steps.push({ state: "check", text: `§3.1.4 basis: experience docs on file (${expList}) but no degree and references don't yet confirm 5 yrs. Verify the years from docs + reference before recording basis = route (c).` });
  } else if ((ev.years_experience ?? 0) >= 5) {
    steps.push({ state: "check", text: `§3.1.4 basis: ${ev.years_experience} yrs self-declared only — no degree or experience docs on file. Needs a reference/letter confirming 5+ yrs (route c) or a degree (route a/b).` });
  } else {
    steps.push({ state: "todo", text: "§3.1.4 basis: not established — no degree, no experience docs, no reference confirmation. Needs route (a), (b), or (c) evidence before approving." });
  }

  // 3. References — positive isn't enough; flag when the corroborated experience
  // falls materially short of the self-declared figure (the reference, not the
  // form, is the evidence for route (c)).
  if (ev.refs_received > 0) {
    const allPositive = ev.ref_positive_count > 0 && ev.ref_positive_count === ev.refs_received;
    const claimed = ev.years_experience ?? null;
    const corrob = ev.ref_documented_years ?? null;
    const yearsShortfall = claimed != null && corrob != null && corrob + 2 < claimed;
    const refState: Step["state"] = (allPositive && !yearsShortfall) ? "done" : "check";
    const positiveNote = ev.ref_positive_count < ev.refs_received
      ? ` (${ev.refs_received - ev.ref_positive_count} non-positive — read those carefully)`
      : "";
    const shortfallNote = yearsShortfall
      ? ` ⚠ references corroborate only ~${corrob} yr${corrob === 1 ? "" : "s"} vs ${claimed} self-declared — do NOT rely on the form figure for route (c).`
      : "";
    steps.push({ state: refState, text: `References: ${ev.refs_received} received, ${ev.ref_positive_count} positive${positiveNote}${corrob ? `, documenting ~${corrob} yrs experience` : ""}.${shortfallNote} Read the verbatim responses below — confirm they corroborate the claimed experience and language pairs.` });
  } else {
    steps.push({ state: "todo", text: "References: none received yet — request/await at least one good reference before approving." });
  }

  // 4. Domains (§6.1.6) — explicit approve/hold split
  if (declaredList.length === 0) {
    steps.push({ state: "todo", text: "Domains (§6.1.6): no declared domains found — cannot approve without at least one domain." });
  } else if (highRiskDeclared.length === 0) {
    const domainStr = safeDeclared.map((d) => DOMAIN_DISPLAY[d] ?? d).join(", ");
    const hasRealCompetence = ev.real_passed_combos > 0 || ev.quiz_score != null;
    const compNote = hasRealCompetence
      ? "A passed general test/quiz covers these non-specialist domains."
      : "⚠ No passed test/quiz yet — confirm general competence (a passed test/quiz or a verified §3.1.4 basis) before approving these.";
    steps.push({ state: hasRealCompetence ? "done" : "check", text: `Domains (§6.1.6): ${ev.declared_domains} declared, none flagged high-risk. ${compNote} Domains: ${domainStr}.` });
  } else {
    const safeStr = safeDeclared.map((d) => DOMAIN_DISPLAY[d] ?? d).join(", ") || "none";
    const testedStr = highRiskTested.map((d) => DOMAIN_DISPLAY[d] ?? d).join(", ");
    const certOnly = highRiskWithEvidence.filter((d) => !highRiskTested.includes(d));
    const certStr = certOnly.map((d) => DOMAIN_DISPLAY[d] ?? d).join(", ");
    const unevidencedStr = highRiskNoEvidence.map((d) => DOMAIN_DISPLAY[d] ?? d).join(", ");
    let text = `Domains (§6.1.6): ${ev.declared_domains} declared.`;
    if (highRiskTested.length > 0) {
      text += ` Qualified by a passed domain test / COA quiz: ${testedStr}.`;
    }
    if (certOnly.length > 0) {
      text += ` Cert/doc evidence (confirm it covers the domain): ${certStr}.`;
    }
    if (highRiskNoEvidence.length > 0) {
      text += ` NO test pass or cert for: ${unevidencedStr} — remove these (or send the domain test) before approving.`;
    }
    if (safeStr !== "none") {
      text += ` Safe (general competence covers these): ${safeStr}.`;
    }
    steps.push({ state: highRiskNoEvidence.length > 0 ? "check" : "done", text });
  }

  // 5. NDA
  if (ndaSignedAt) {
    steps.push({ state: "done", text: `NDA: signed on ${format(new Date(ndaSignedAt), "d MMM yyyy")} — on file.` });
  } else {
    steps.push({ state: "check", text: "NDA: not yet signed. Presented as in-portal clickwrap when the vendor logs in after approval — no action needed now, but confirm before marking active." });
  }

  // Bottom line — ordered hard gates. Competence = a passed test/quiz (NOT
  // skip_manual_review). Basis = VERIFIED degree or references confirming ≥5 yrs
  // (route c) — an unverified doc on file is not enough. NDA must be on file.
  const competenceOk = ev.real_passed_combos > 0 || ev.quiz_score != null;
  const basisOk = ev.has_verified_degree_doc || (ev.ref_documented_years ?? 0) >= 5;
  const ndaOk = !!ndaSignedAt;
  let bottom: { tone: string; text: string };
  if (ev.flag_no_cv) {
    bottom = { tone: "text-red-700", text: "→ HOLD: no CV on file — can't verify identity or basis. Request the CV first." };
  } else if (!competenceOk) {
    bottom = { tone: "text-amber-700", text: `→ Not yet — competence not demonstrated.${ev.skip_review_combos > 0 ? " Skip-review combos are not a test pass." : ""} Send/await a passed test or quiz, or establish a verified §3.1.4 basis.` };
  } else if (!basisOk) {
    bottom = { tone: "text-amber-700", text: "→ Not yet — §3.1.4 basis not established by VERIFIED evidence. Verify the degree (route a/b) or confirm ≥5 yrs via references (route c) before approving." };
  } else if (ev.refs_received === 0) {
    bottom = { tone: "text-amber-700", text: "→ Not yet — await at least one good reference." };
  } else if (!ndaOk) {
    bottom = { tone: "text-amber-700", text: "→ Not yet — no confidentiality agreement (NDA) on file for this application. Confirm a signed, current NDA before approving." };
  } else if (highRiskNoEvidence.length > 0) {
    const removeStr = highRiskNoEvidence.map((d) => DOMAIN_DISPLAY[d] ?? d).join(", ");
    bottom = { tone: "text-amber-700", text: `→ Approvable with edits: remove ${removeStr} from the domain list (no specific evidence), record the §3.1.4 basis, then approve only the evidenced domains.` };
  } else {
    bottom = { tone: "text-green-700", text: `→ Approvable. Record the §3.1.4 basis${(ev.ref_documented_years ?? 0) >= 5 && !ev.has_verified_degree_doc ? " = route (c)" : ""} and approve.` };
  }

  const ICON: Record<Step["state"], string> = { done: "✓", check: "⚠", todo: "◻" };
  const COLOR: Record<Step["state"], string> = { done: "text-green-600", check: "text-amber-600", todo: "text-gray-400" };

  return (
    <details className="mt-3 border-t border-gray-200 pt-2" open>
      <summary className="cursor-pointer text-sm font-semibold text-gray-800">Reviewer guide — how to approve this candidate</summary>
      <ol className="mt-2 space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
            <span className={`font-bold ${COLOR[s.state]}`}>{ICON[s.state]}</span>
            <span><strong>{i + 1}.</strong> {s.text}</span>
          </li>
        ))}
      </ol>
      <p className={`mt-2 text-xs font-medium ${bottom.tone}`}>{bottom.text}</p>
    </details>
  );
}

const EV_TYPE_LABEL: Record<string, string> = {
  degree_translation: "Translation degree",
  degree_other: "Degree (other field)",
  documented_translation_experience: "Experience",
  references_verified: "Reference",
  domain_specific_certification: "Certification",
  internal_test_passed: "Internal test",
  professional_membership: "Membership",
  language_proficiency_test: "Language proficiency",
};

function DocOpenButton({ storagePath }: { storagePath?: string | null }) {
  const [opening, setOpening] = useState(false);
  if (!storagePath) return null;
  const handleOpen = async () => {
    setOpening(true);
    const { data } = await supabase.storage.from("vendor-certifications").createSignedUrl(storagePath, 3600);
    setOpening(false);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };
  return (
    <button
      onClick={handleOpen}
      disabled={opening}
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 disabled:opacity-50"
      title="Open document in new tab"
    >
      {opening ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <ExternalLink className="w-2.5 h-2.5" />}
      Open
    </button>
  );
}

// ISO 17100 evidence summary shown at the top of the profile for review/approval.
// Pure/deterministic (driven by cvp_application_iso_evidence) — the flags are
// review PROMPTS, not gates. Reviewer still records the §3.1.4 basis on approval.
function IsoEvidencePanel({ ev, ndaSignedAt, coaQuiz }: { ev: IsoEvidence | null; ndaSignedAt: string | null; coaQuiz?: QuizSubmission | null }) {
  if (!ev) return null;
  const theme =
    ev.iso_badge === "ready"
      ? { box: "bg-green-50 border-green-200", chip: "bg-green-100 text-green-800", Icon: CheckCircle, label: "Ready for ISO review", iconColor: "text-green-600" }
      : ev.iso_badge === "hold"
        ? { box: "bg-red-50 border-red-200", chip: "bg-red-100 text-red-800", Icon: Ban, label: "Hold — blocking issue", iconColor: "text-red-600" }
        : { box: "bg-amber-50 border-amber-200", chip: "bg-amber-100 text-amber-800", Icon: AlertTriangle, label: "Check before approving", iconColor: "text-amber-600" };
  const { Icon } = theme;

  const flags: string[] = [];
  if (ev.flag_no_cv) flags.push("No CV on file — cannot verify the §3.1.4 basis or identity. Request a CV before approving.");
  if (ev.flag_low_prescreen) flags.push(`Low AI prescreen (${ev.ai_prescreening_score ?? "?"}) — read the AI red flags below and corroborate against the CV.`);
  if (ev.flag_thin_experience) flags.push(`Thin experience (${ev.years_experience}y) — only approvable via a translation degree (route a); otherwise hold.`);
  if (ev.flag_broad_domains) flags.push(`${ev.declared_domains} domains declared — approve only evidenced domains (§6.1.6); medical/pharma/legal/certified need proof.`);

  const Item = ({ label, value, ok }: { label: string; value: string; ok?: boolean }) => (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-gray-500">{label}</span>
      <span className={`text-sm font-medium ${ok === false ? "text-red-600" : "text-gray-900"}`}>{value}</span>
    </div>
  );

  const competence = ev.real_passed_combos > 0
    ? `Test passed (${ev.real_passed_combos} combo${ev.real_passed_combos > 1 ? "s" : ""})`
    : ev.quiz_score != null ? `Quiz ${ev.quiz_score}%`
    : ev.skip_review_combos > 0 ? `${ev.skip_review_combos} in credential review (not tested)` : "—";
  const basis = `${ev.education_level ? ev.education_level + " (self-declared)" : "no degree declared"}${ev.years_experience != null ? ` · ${ev.years_experience}y exp (self-declared)` : ""}`;
  const docCount = ev.uploaded_docs_count || 0;
  const docsValue = ev.has_cv
    ? (docCount > 0 ? `CV + ${docCount} uploaded` : "CV/résumé only")
    : (docCount > 0 ? `${docCount} uploaded (no CV)` : "none");

  return (
    <div className={`mb-6 rounded-lg border p-4 ${theme.box}`}>
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-gray-500" />
        <span className="font-semibold text-gray-900">ISO 17100 evidence</span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${theme.chip}`}>
          <Icon className={`w-3.5 h-3.5 ${theme.iconColor}`} /> {theme.label}
        </span>
        {ev.applicant_vendor_id && (
          <a
            href={`/admin/vendors/${ev.applicant_vendor_id}?tab=qms`}
            target="_blank"
            rel="noopener noreferrer"
            title="Manually upload a document the applicant emailed in (AI-screens automatically)"
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-800"
          >
            <FileText className="w-3.5 h-3.5" /> Upload / manage documents
          </a>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Item label="Competence" value={competence} ok={ev.real_passed_combos > 0 || ev.quiz_score != null} />
        <Item label="§3.1.4 basis — self-declared" value={basis} />
        <Item label="Documents on file" value={docsValue} ok={ev.has_cv || docCount > 0} />
        <Item label="References in" value={`${ev.refs_received} received`} ok={ev.refs_received >= 1} />
        <Item label="Domains" value={`${ev.declared_domains} declared${ev.tested_domains ? ` · combos: ${ev.tested_domains}` : ""}`} />
      </div>
      {ev.screened_items && ev.screened_items.length > 0 ? (
        <div className="mt-3">
          <span className="text-[11px] uppercase tracking-wide text-gray-500">
            AI document screening ({ev.screened_count}){ev.screened_any_verified ? "" : " — all unverified, confirm before recording basis"}
          </span>
          <ul className="mt-1 space-y-1">
            {ev.screened_items.map((it, i) => {
              const conf = it.confidence != null ? Number(it.confidence) : null;
              const confCls = conf == null ? "" : conf >= 70 ? "bg-green-100 text-green-700" : conf >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
              return (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                  <FileText className="w-3 h-3 text-gray-400 mt-0.5 shrink-0" />
                  <span className="flex-1">{it.title}</span>
                  {it.type && <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 whitespace-nowrap">{EV_TYPE_LABEL[it.type] ?? it.type}</span>}
                  {conf != null && <span className={`px-1.5 py-0.5 rounded whitespace-nowrap ${confCls}`}>AI {conf}%</span>}
                  <span className={`px-1.5 py-0.5 rounded whitespace-nowrap ${it.verified ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{it.verified ? "Verified" : "Screened"}</span>
                  <DocOpenButton storagePath={it.storage_path} />
                </li>
              );
            })}
          </ul>
        </div>
      ) : ev.uploaded_doc_names && ev.uploaded_doc_names.length > 0 ? (
        <div className="mt-3">
          <span className="text-[11px] uppercase tracking-wide text-gray-500">
            Uploaded documents{ev.has_degree_doc ? " — degree/diploma on file (unverified)" : ""} — not yet AI-screened
          </span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {ev.uploaded_doc_names.map((n, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200 text-xs text-gray-700">
                <FileText className="w-3 h-3 text-gray-400" /> {n}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {flags.length > 0 && (
        <ul className="mt-3 space-y-1">
          {flags.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" /> {f}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-gray-500">
        {docCount > 0 ? (
          <>
            Applicant has uploaded <strong>{docCount} document{docCount > 1 ? "s" : ""}</strong> (above, <strong>unverified</strong>). Open and verify the degree/experience evidence on the vendor's Documents/QMS tab, then record the §3.1.4 basis, read the reference, and approve only evidenced domains.
          </>
        ) : (
          <>
            Degree level &amp; years are <strong>self-declared</strong> from the application form — the only document on file is the CV/résumé (no diploma uploaded). Verify the diploma (route a/b) or experience evidence (route c) against the CV and record the §3.1.4 basis.
          </>
        )}{" "}
        Flags are review prompts, not gates.
      </p>
      <IsoReviewerGuide ev={ev} ndaSignedAt={ndaSignedAt} coaQuiz={coaQuiz} />
    </div>
  );
}

export default function RecruitmentDetail() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAdminAuthContext();

  const [app, setApp] = useState<Application | null>(null);
  const [isoEvidence, setIsoEvidence] = useState<IsoEvidence | null>(null);
  const [ndaSignedAt, setNdaSignedAt] = useState<string | null>(null);
  const [combinations, setCombinations] = useState<TestCombination[]>([]);
  const [submissions, setSubmissions] = useState<TestSubmission[]>([]);
  const [quizSubmissions, setQuizSubmissions] = useState<QuizSubmission[]>([]);
  const [coaResponses, setCoaResponses] = useState<CoaTranslationResponse[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<Record<string, QuizQuestion>>({});
  const [testLibrary, setTestLibrary] = useState<Record<string, TestLibraryRow>>({});
  const [errorFeedback, setErrorFeedback] = useState<Record<string, ErrorFeedbackRow[]>>({});
  const [feedbackRounds, setFeedbackRounds] = useState<Record<string, FeedbackRoundRow>>({});
  const [languages, setLanguages] = useState<Record<string, string>>({});
  const [languageCodes, setLanguageCodes] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);

  // Staff action state
  const [staffNotes, setStaffNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [tierValue, setTierValue] = useState("");
  const [savingTier, setSavingTier] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectionDraft, setRejectionDraft] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);

  // Rate suggester state — per-combination cache
  const [rateSuggestions, setRateSuggestions] = useState<Record<string, RateSuggestion | null>>({});
  const [rateSuggestingId, setRateSuggestingId] = useState<string | null>(null);
  const [rateSuggestError, setRateSuggestError] = useState<Record<string, string>>({});

  // Request-documents modal state
  const [docsModalOpen, setDocsModalOpen] = useState(false);
  const [docsSubject, setDocsSubject] = useState("");
  const [docsBody, setDocsBody] = useState("");
  const [selectedDocTypes, setSelectedDocTypes] = useState<string[]>([]);
  const [sendingDocs, setSendingDocs] = useState(false);
  const [flagFeedback, setFlagFeedback] = useState<FlagFeedback[]>([]);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [safeMode, setSafeMode] = useState<{
    active: boolean;
    startedAt: string | null;
    targetDays: number;
    targetApps: number;
    daysRemaining: number | null;
    appsRemaining: number | null;
    manualOverride: "on" | "off" | null;
  } | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // Fetch application
      const { data: appData, error: appError } = await supabase
        .from("cvp_applications")
        .select("*")
        .eq("id", id)
        .single();
      if (appError) throw appError;

      const application = appData as Application;
      setApp(application);

      // ISO 17100 evidence summary (deterministic view) for the top-of-profile panel.
      const { data: isoEv } = await supabase
        .from("cvp_application_iso_evidence")
        .select("*")
        .eq("application_id", id)
        .maybeSingle();
      setIsoEvidence((isoEv as IsoEvidence) ?? null);

      // NDA signing status
      const vendorId = (isoEv as IsoEvidence | null)?.applicant_vendor_id;
      const ndaFilter = vendorId
        ? `application_id.eq.${id},vendor_id.eq.${vendorId}`
        : `application_id.eq.${id}`;
      const { data: ndaRow } = await supabase
        .from("vendor_nda_signatures")
        .select("signed_at")
        .or(ndaFilter)
        .eq("is_current", true)
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setNdaSignedAt((ndaRow as { signed_at: string } | null)?.signed_at ?? null);

      setStaffNotes(application.staff_review_notes || "");
      setTierValue(application.assigned_tier || "");
      setRejectionDraft(application.rejection_email_draft || "");

      // Fetch test combinations
      const { data: combos } = await supabase
        .from("cvp_test_combinations")
        .select("*")
        .eq("application_id", id)
        .order("created_at", { ascending: true });
      setCombinations((combos as TestCombination[]) || []);

      // Fetch test submissions
      const { data: subs } = await supabase
        .from("cvp_test_submissions")
        .select("*")
        .eq("application_id", id)
        .order("created_at", { ascending: true });
      const subsList = (subs as TestSubmission[]) || [];
      setSubmissions(subsList);

      // Fetch quiz submissions for this applicant (one per target language).
      // Quiz path is parallel to translation tests; visible for all statuses
      // so staff can audit rejected attempts too.
      const { data: quizSubs } = await supabase
        .from("cvp_quiz_submissions")
        .select("*")
        .eq("application_id", id)
        .order("created_at", { ascending: true });
      const quizList = (quizSubs as QuizSubmission[]) || [];
      setQuizSubmissions(quizList);

      // COA Part-2 translation responses (verbatim translations + MQM verdicts).
      const { data: coaResp } = await supabase
        .from("cvp_coa_translation_responses")
        .select("id, application_id, target_language_name, applicant_translation, mqm_score, verdict, conceptual_equivalence, ai_rationale, needs_human_review")
        .eq("application_id", id)
        .order("created_at", { ascending: true });
      setCoaResponses((coaResp as CoaTranslationResponse[]) || []);

      // Pull the iso_competence_quizzes rows referenced by every response so
      // we can show question text + options + correct answer alongside the
      // applicant's pick.
      const questionIds = Array.from(
        new Set(
          quizList.flatMap((qs) =>
            (qs.responses ?? []).map((r) => r.question_id),
          ),
        ),
      );
      if (questionIds.length > 0) {
        const { data: questionRows } = await supabase
          .from("iso_competence_quizzes")
          .select(
            "id, competence_slug, question, options, correct_option, explanation, target_language_id",
          )
          .in("id", questionIds);
        const qMap: Record<string, QuizQuestion> = {};
        for (const row of (questionRows as QuizQuestion[]) || []) qMap[row.id] = row;
        setQuizQuestions(qMap);
      } else {
        setQuizQuestions({});
      }

      // Fetch the test-library rows referenced by these submissions so the
      // review panel can show source + reference translation side-by-side
      // with the applicant's draft.
      const testIds = Array.from(
        new Set(subsList.map((s) => s.test_id).filter((x): x is string => !!x))
      );
      if (testIds.length > 0) {
        const { data: lib } = await supabase
          .from("cvp_test_library")
          .select("id, title, domain, service_type, difficulty, source_text, reference_translation")
          .in("id", testIds);
        const map: Record<string, TestLibraryRow> = {};
        for (const row of (lib as TestLibraryRow[]) || []) map[row.id] = row;
        setTestLibrary(map);
      } else {
        setTestLibrary({});
      }

      // Per-error feedback rows + per-submission round state.
      const submissionIds = subsList.map((s) => s.id);
      if (submissionIds.length > 0) {
        const [{ data: feedbackRows }, { data: roundRows }] = await Promise.all([
          supabase
            .from("cvp_test_error_feedback")
            .select(
              "id, submission_id, combination_id, error_index, applicant_response, applicant_reason, applicant_submitted_at, auto_triage_verdict, auto_triage_confidence, auto_triage_reasoning, auto_triage_at, hitl_status",
            )
            .in("submission_id", submissionIds),
          supabase
            .from("cvp_test_feedback_rounds")
            .select(
              "submission_id, combination_id, token, status, staff_skip, v12_sent_at, applicant_first_view_at, applicant_submitted_at, expires_at, auto_send_at, auto_sent_at, manual_send_requested_at",
            )
            .in("submission_id", submissionIds),
        ]);
        const byCombo: Record<string, ErrorFeedbackRow[]> = {};
        for (const r of (feedbackRows as ErrorFeedbackRow[]) || []) {
          (byCombo[r.combination_id] ??= []).push(r);
        }
        for (const list of Object.values(byCombo)) {
          list.sort((a, b) => a.error_index - b.error_index);
        }
        setErrorFeedback(byCombo);
        const roundsMap: Record<string, FeedbackRoundRow> = {};
        for (const r of (roundRows as FeedbackRoundRow[]) || []) {
          roundsMap[r.combination_id] = r;
        }
        setFeedbackRounds(roundsMap);
      } else {
        setErrorFeedback({});
        setFeedbackRounds({});
      }

      // Fetch safe-mode config + approved-count to render the status banner.
      // Mirrors the server-side logic in _shared/safe-mode.ts so the UI can
      // show "(12 days remaining, 42 apps remaining)" without an RPC round-trip.
      try {
        const { data: cfgRow } = await supabase
          .from("cvp_system_config")
          .select("value")
          .eq("key", "safe_mode")
          .maybeSingle();
        if (cfgRow?.value) {
          const cfg = cfgRow.value as {
            manual_override?: "on" | "off" | null;
            started_at?: string;
            target_days?: number;
            target_apps?: number;
          };
          const targetDays = cfg.target_days ?? 30;
          const targetApps = cfg.target_apps ?? 200;
          const startedAt = cfg.started_at ?? null;
          const manualOverride = cfg.manual_override ?? null;
          let daysRemaining: number | null = null;
          if (startedAt) {
            const elapsedMs = Date.now() - Date.parse(startedAt);
            const daysElapsed = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
            daysRemaining = Math.max(0, targetDays - daysElapsed);
          }
          const { count: approvedCount } = await supabase
            .from("cvp_applications")
            .select("id", { count: "exact", head: true })
            .eq("status", "approved");
          const appsRemaining = Math.max(0, targetApps - (approvedCount ?? 0));
          const auto =
            (daysRemaining !== null && daysRemaining > 0) && appsRemaining > 0;
          const active =
            manualOverride === "on" ||
            (manualOverride !== "off" && auto);
          setSafeMode({
            active,
            startedAt,
            targetDays,
            targetApps,
            daysRemaining,
            appsRemaining,
            manualOverride,
          });
        } else {
          setSafeMode({
            active: true,
            startedAt: null,
            targetDays: 30,
            targetApps: 200,
            daysRemaining: null,
            appsRemaining: null,
            manualOverride: null,
          });
        }
      } catch (_e) {
        /* non-fatal — banner just hides if we can't read config */
      }

      // Fetch existing flag-feedback verdicts for this app
      const { data: feedback } = await supabase
        .from("cvp_prescreen_flag_feedback")
        .select("flag_kind, flag_text, verdict, staff_notes, updated_at")
        .eq("application_id", id);
      setFlagFeedback((feedback as FlagFeedback[]) ?? []);

      // Fetch conversation: outbound (tracked) + inbound for this app
      try {
        const [outboundRes, inboundRes] = await Promise.all([
          supabase
            .from("cvp_outbound_messages")
            .select("id, sent_at, subject, body_html, body_text, template_tag")
            .eq("application_id", id)
            .order("sent_at", { ascending: true }),
          supabase
            .from("cvp_inbound_emails")
            .select(
              "id, received_at, from_email, from_name, subject, body_plain, stripped_text, classified_intent, ai_reply_analysis, acknowledged_at",
            )
            .eq("matched_application_id", id)
            .order("received_at", { ascending: true }),
        ]);
        const outbound: ConversationItem[] = (outboundRes.data ?? []).map((r) => ({
          kind: "outbound" as const,
          id: r.id as string,
          at: r.sent_at as string,
          subject: r.subject as string | null,
          body_html: r.body_html as string | null,
          body_text: r.body_text as string | null,
          template_tag: r.template_tag as string | null,
        }));
        const inbound: ConversationItem[] = (inboundRes.data ?? []).map((r) => ({
          kind: "inbound" as const,
          id: r.id as string,
          at: r.received_at as string,
          from_email: r.from_email as string | null,
          from_name: r.from_name as string | null,
          subject: r.subject as string | null,
          body_plain: r.body_plain as string | null,
          stripped_text: r.stripped_text as string | null,
          classified_intent: r.classified_intent as string | null,
          ai_reply_analysis: r.ai_reply_analysis as Record<string, unknown> | null,
          acknowledged_at: r.acknowledged_at as string | null,
        }));
        setConversation(
          [...outbound, ...inbound].sort(
            (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
          ),
        );
      } catch (_e) {
        /* tables may not exist yet — silent */
      }

      // Resolve language names
      const langIds = new Set<string>();
      (combos || []).forEach((c: TestCombination) => {
        langIds.add(c.source_language_id);
        langIds.add(c.target_language_id);
      });
      if (langIds.size > 0) {
        const { data: langs } = await supabase
          .from("languages")
          .select("id, name, code")
          .in("id", Array.from(langIds));
        const map: Record<string, string> = {};
        const codeMap: Record<string, string | null> = {};
        (langs || []).forEach((l: Language) => {
          map[l.id] = l.name;
          codeMap[l.id] = l.code ?? null;
        });
        setLanguages(map);
        setLanguageCodes(codeMap);
      }
    } catch (err) {
      console.error("Failed to fetch application:", err);
      toast.error("Failed to load application data");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ---------- Actions ----------

  const updateApplication = async (updates: Record<string, unknown>, successMsg: string) => {
    if (!id) return;
    const { error } = await supabase
      .from("cvp_applications")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Update failed: " + error.message);
      return false;
    }
    toast.success(successMsg);
    await fetchData();
    return true;
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    await updateApplication({
      staff_review_notes: staffNotes,
      staff_reviewed_by: session?.staffId,
      staff_reviewed_at: new Date().toISOString(),
    }, "Staff notes saved");
    setSavingNotes(false);
  };

  const handleTierUpdate = async () => {
    if (!tierValue) return;
    setSavingTier(true);
    await updateApplication({
      assigned_tier: tierValue,
      tier_override_by: session?.staffId,
      tier_override_at: new Date().toISOString(),
    }, "Tier updated");
    setSavingTier(false);
  };

  const callEdgeFunction = async (fnSlug: string, body: Record<string, unknown>) => {
    // Use supabase.functions.invoke so the staff session JWT + anon apikey
    // are attached automatically. The previous hand-rolled fetch omitted
    // both headers, which made the Supabase gateway 401 functions deployed
    // with verify_jwt=true.
    const { data, error } = await supabase.functions.invoke(fnSlug, { body });
    if (error) {
      throw new Error((error as { message?: string })?.message || `Edge function ${fnSlug} failed`);
    }
    if (data && typeof data === "object" && (data as { success?: boolean }).success === false) {
      throw new Error((data as { error?: string }).error || `Edge function ${fnSlug} returned success:false`);
    }
    return data;
  };

  // Per-combination rate suggestion. Caches in rateSuggestions so staff can
  // open multiple combos without re-hitting Claude/the pool query.
  const handleSuggestRateForCombo = async (combo: TestCombination) => {
    if (!id) return;
    const src = languages[combo.source_language_id];
    const tgt = languages[combo.target_language_id];
    if (!src || !tgt) {
      setRateSuggestError((m) => ({ ...m, [combo.id]: "Language code not resolved yet" }));
      return;
    }
    setRateSuggestingId(combo.id);
    setRateSuggestError((m) => ({ ...m, [combo.id]: "" }));
    try {
      const data = await callEdgeFunction("cvp-suggest-vendor-rate", {
        application_id: id,
        source_language: src,
        target_language: tgt,
        calculation_unit: "per_page",
      });
      if ((data as any)?.do_not_hire) {
        setRateSuggestError((m) => ({
          ...m,
          [combo.id]: (data as any).reason || "Do not hire on this lane",
        }));
        setRateSuggestions((s) => ({ ...s, [combo.id]: null }));
        return;
      }
      setRateSuggestions((s) => ({ ...s, [combo.id]: data as RateSuggestion }));
    } catch (err: any) {
      setRateSuggestError((m) => ({ ...m, [combo.id]: err?.message || "Suggest failed" }));
    } finally {
      setRateSuggestingId(null);
    }
  };

  const openRequestDocsModal = () => {
    if (!app) return;
    // Default selection: everything that's typically required for the ISO
    // file. Staff unticks anything they've already received. NDA is handled
    // separately via the in-portal clickwrap flow — not in this modal.
    const defaultSelected: string[] = ISO_DOC_TYPES
      .filter((d) => d.default_selected || ["competence_a", "competence_b", "competence_c", "verification", "business"].includes(d.group))
      .map((d) => d.slug);

    const name = app.full_name || "there";
    const subject = `Cethos — documents needed for your translator profile (ISO 17100)`;
    setDocsSubject(subject);
    setSelectedDocTypes(defaultSelected);
    setDocsBody(buildDocsEmailBody(name, defaultSelected));
    setDocsModalOpen(true);
  };

  const buildDocsEmailBody = (name: string, selected: string[]): string => {
    const seen = new Set<string>();
    const itemsHtml = selected
      .map((slug) => {
        if (seen.has(slug)) return ""; // dedupe across competence routes
        seen.add(slug);
        const dt = ISO_DOC_TYPES.find((d) => d.slug === slug);
        return dt ? `<li><strong>${dt.label}</strong> &mdash; <span style="color:#666">${dt.rationale}</span></li>` : "";
      })
      .filter(Boolean)
      .join("\n");

    return [
      `<p>Hi ${name},</p>`,
      `<p>Thanks for your application. Before we can finalize your onboarding to the Cethos vendor network, we need to assemble your ISO 17100 competence file. The standard requires every translator to qualify via <strong>one of three routes</strong> (translation degree, other-field degree + 2y experience, or 5y experience alone) plus documentation of language proficiency and confidentiality.</p>`,
      `<p><strong>Please provide the following documents:</strong></p>`,
      `<ul>`,
      itemsHtml,
      `</ul>`,
      `<p style="margin:14px 0;padding:12px 14px;background:#f0fdfa;border-left:3px solid #0F9DA0;color:#134e4a;border-radius:4px;">The easiest way to send these is through your applicant portal &mdash; <strong>log in and upload them under Profile &rsaquo; Supporting Documents</strong>. Sign in at <a href="https://vendor.cethos.com" style="color:#0F9DA0;font-weight:600;">vendor.cethos.com</a> with this email address and you'll receive a one-time code by email or SMS.</p>`,
      `<p style="color:#475569;font-size:13px;">Prefer email? You can also reply directly to this message with the PDFs attached.</p>`,
      `<p><strong>Professional references</strong> &mdash; handled separately. If we haven't already, we'll send a short form to two of your professional references; they reply directly to us so the verification stays independent. No reference letters needed from you.</p>`,
      `<p><strong>Confidentiality (NDA)</strong> &mdash; handled in your portal: when you log in you'll be prompted to sign electronically (clickwrap), so we can begin your assessment. No separate PDF is needed.</p>`,
      `<p>If anything is unclear or you don't have a particular document, just reply and let us know.</p>`,
      `<p>Best regards,<br/>Cethos Recruitment Team</p>`,
    ].join("\n");
  };

  const toggleDocType = (slug: string) => {
    setSelectedDocTypes((prev) => {
      const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug];
      const name = app?.full_name || "there";
      setDocsBody(buildDocsEmailBody(name, next));
      return next;
    });
  };

  const handleSendDocsRequest = async () => {
    if (!id) return;
    if (selectedDocTypes.length === 0) {
      toast.error("Pick at least one document type");
      return;
    }
    if (!docsBody.trim()) {
      toast.error("Email body is empty");
      return;
    }
    setSendingDocs(true);
    try {
      await callEdgeFunction("cvp-request-documents", {
        application_id: id,
        subject: docsSubject,
        body_html: docsBody,
        missing_doc_types: selectedDocTypes,
      });
      toast.success("Document request sent");
      setDocsModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to send request");
    } finally {
      setSendingDocs(false);
    }
  };

  const [rerunPrescreenBusy, setRerunPrescreenBusy] = useState(false);
  const handleRerunPrescreen = async () => {
    if (!id) return;
    setRerunPrescreenBusy(true);
    try {
      await callEdgeFunction("cvp-prescreen-application", { applicationId: id });
      toast.success("AI pre-screen re-queued — refreshing in a moment");
      // Prescreen takes ~5–15s. Give it a beat, then reload.
      setTimeout(() => {
        fetchData();
        setRerunPrescreenBusy(false);
      }, 8000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to re-run pre-screen: ${msg}`);
      setRerunPrescreenBusy(false);
    }
  };

  const [reassessBusy, setReassessBusy] = useState(false);
  const handleReassess = async () => {
    if (!id) return;
    const feedbackCount = flagFeedback.length;
    if (
      !window.confirm(
        `Reassess this application using your ${feedbackCount} flag verdict(s) + any decision notes + any inbound replies as context?\n\nThis overwrites the current prescreen score with a refined version. Takes ~15 seconds.`,
      )
    ) {
      return;
    }
    setReassessBusy(true);
    try {
      const res = await callEdgeFunction("cvp-prescreen-application", {
        applicationId: id,
        includeStaffContext: true,
      });
      const data = (res as { data?: { score?: number; tier?: string } }).data;
      const scoreLine =
        data?.score !== undefined
          ? ` — new score ${data.score}${data.tier ? ` (${data.tier})` : ""}`
          : "";
      toast.success(`Reassessed with your feedback${scoreLine}`);
      // Give it a beat to settle, then reload
      setTimeout(() => {
        fetchData();
        setReassessBusy(false);
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Reassess failed: ${msg}`);
      setReassessBusy(false);
    }
  };

  // Decision-modal flow: every action button opens a 2-step modal.
  // Step 1: staff types notes. Step 2: modal fetches dryRun preview from the
  // matching edge function, shows the rendered email with editable subject +
  // body. On Send, the edge function re-runs with editedSubject + edited
  // content overrides and performs the real state change + mail send.
  //
  // All raw notes + AI output are stored in cvp_application_decisions.
  type Decision = "approved" | "rejected" | "waitlisted" | "info_requested";
  const [decisionModal, setDecisionModal] = useState<Decision | null>(null);
  // Phase C.2 — staff reply modal is keyed by the inbound we're replying to.
  const [replyInboundId, setReplyInboundId] = useState<string | null>(null);
  // Compose a fresh message to the applicant (no inbound to reply to).
  const [composeNew, setComposeNew] = useState(false);

  // Maps the generic "editedContent" field in the modal to the per-action
  // request body parameter name.
  const editedContentField: Record<Decision, string> = {
    approved: "editedWelcomeMessage",
    rejected: "editedReason",
    waitlisted: "editedMessage",
    info_requested: "editedRequest",
  };

  const fnSlug: Record<Decision, string> = {
    approved: "cvp-approve-application",
    rejected: "cvp-reject-application",
    waitlisted: "cvp-waitlist-application",
    info_requested: "cvp-request-info",
  };

  const previewDecision = async (
    decision: Decision,
    notes: string,
    approvalOpts?: { combinationIds: string[]; combinationRationales: Record<string, string> },
  ): Promise<DecisionPreview> => {
    if (!id) throw new Error("No application ID");
    const payload: Record<string, unknown> = {
      applicationId: id,
      staffId: session?.staffId,
      staffNotes: notes,
      dryRun: true,
    };
    if (decision === "approved" && approvalOpts) {
      payload.combinationIds = approvalOpts.combinationIds;
      payload.combinationRationales = approvalOpts.combinationRationales;
    }
    const res = await callEdgeFunction(fnSlug[decision], payload);
    const d = (res as { data?: Record<string, unknown> }).data ?? {};
    return {
      subject: String(d.subject ?? ""),
      html: String(d.html ?? ""),
      aiOutput: d.aiOutput ? String(d.aiOutput) : null,
      aiError: d.aiError ? String(d.aiError) : null,
    };
  };

  const sendDecision = async (
    decision: Decision,
    args: {
      notes: string;
      editedSubject: string;
      editedContent: string;
      combinationIds?: string[];
      combinationRationales?: Record<string, string>;
    },
  ) => {
    if (!id) return;
    setActionLoading(decision);
    try {
      const body: Record<string, unknown> = {
        applicationId: id,
        staffId: session?.staffId,
        staffNotes: args.notes,
        editedSubject: args.editedSubject || undefined,
      };
      if (args.editedContent) {
        body[editedContentField[decision]] = args.editedContent;
      }
      if (decision === "approved" && args.combinationIds) {
        body.combinationIds = args.combinationIds;
        body.combinationRationales = args.combinationRationales ?? {};
      }
      await callEdgeFunction(fnSlug[decision], body);
      if (decision === "approved") toast.success("Application approved — welcome email sent");
      else if (decision === "rejected") toast.success("Rejection queued — V12 sends in 48h unless intercepted");
      else if (decision === "waitlisted") toast.success("Application waitlisted — V13 sent");
      else toast.success("Info request sent");
      setDecisionModal(null);
      await fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecision = (decision: Decision) => {
    setDecisionModal(decision);
  };

  const handleIntercept = async () => {
    setActionLoading("intercept");
    await updateApplication({ rejection_email_status: "intercepted" }, "Rejection email intercepted");
    setActionLoading(null);
  };

  const saveFlagFeedback = async (
    flagKind: FlagKind,
    flagText: string,
    verdict: FlagVerdict,
    notes: string | null,
  ) => {
    if (!id) throw new Error("No application ID");
    try {
      await callEdgeFunction("cvp-save-flag-feedback", {
        applicationId: id,
        flagKind,
        flagText,
        verdict,
        staffNotes: notes,
        staffUserId: session?.staffId,
        prescreenAt: app?.ai_prescreening_at ?? null,
        promptVersion:
          app?.ai_prescreening_result &&
          typeof (app.ai_prescreening_result as Record<string, unknown>).prompt_version === "string"
            ? String((app.ai_prescreening_result as Record<string, unknown>).prompt_version)
            : null,
      });
      // Optimistic local update so the UI feels snappy
      setFlagFeedback((prev) => {
        const without = prev.filter(
          (f) => !(f.flag_kind === flagKind && f.flag_text === flagText),
        );
        return [
          ...without,
          {
            flag_kind: flagKind,
            flag_text: flagText,
            verdict,
            staff_notes: notes,
            updated_at: new Date().toISOString(),
          },
        ];
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save verdict");
      throw err; // re-throw so FlagWithFeedback's inline "Save failed" indicator fires
    }
  };

  const clearFlagFeedback = async (flagKind: FlagKind, flagText: string) => {
    if (!id) throw new Error("No application ID");
    try {
      await callEdgeFunction("cvp-save-flag-feedback", {
        applicationId: id,
        flagKind,
        flagText,
        remove: true,
      });
      setFlagFeedback((prev) =>
        prev.filter(
          (f) => !(f.flag_kind === flagKind && f.flag_text === flagText),
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear verdict");
      throw err; // re-throw so FlagWithFeedback's inline indicator fires
    }
  };

  // Exact match first, then fuzzy (Jaccard similarity ≥ 0.5). Fuzzy keeps
  // prior verdicts attached to flags that AI reworded during a reassess.
  const findFeedback = (
    flagKind: FlagKind,
    flagText: string,
  ): FlagFeedback | undefined => {
    const exact = flagFeedback.find(
      (f) => f.flag_kind === flagKind && f.flag_text === flagText,
    );
    if (exact) return exact;
    const candidates = flagFeedback.filter((f) => f.flag_kind === flagKind);
    let best: FlagFeedback | null = null;
    let bestScore = 0.5; // threshold
    for (const c of candidates) {
      const s = jaccard(flagText, c.flag_text);
      if (s > bestScore) {
        best = c;
        bestScore = s;
      }
    }
    return best
      ? { ...best, _matchedViaFuzzy: true, _matchedFromText: best.flag_text }
      : undefined;
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    await updateApplication({ rejection_email_draft: rejectionDraft }, "Draft saved");
    setSavingDraft(false);
  };

  // ---------- Render ----------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
        <span className="ml-2 text-gray-500">Loading application...</span>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Application not found.</p>
        <Link to="/admin/recruitment" className="text-teal-600 hover:underline mt-2 inline-block">Back to list</Link>
      </div>
    );
  }

  const aiResult = app.ai_prescreening_result;
  const isTranslator = app.role_type === "translator";
  const isCog = app.role_type === "cognitive_debriefing";

  const rejectionWindowHours = app.rejection_email_queued_at
    ? Math.max(0, 48 - differenceInHours(new Date(), new Date(app.rejection_email_queued_at)))
    : null;

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Safe-mode banner — shows while pipeline is gated on staff approval */}
      {safeMode?.active && (
        <div className="mb-4 flex items-start gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
          <Shield className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-medium text-indigo-900">Safe mode active</span>
            <span className="text-indigo-800">
              {" "}— no decisive email goes to an applicant without your explicit approval.{" "}
              {safeMode.manualOverride === "on"
                ? "Admin has manually enabled safe mode."
                : safeMode.daysRemaining !== null
                ? `Lifts in ${safeMode.daysRemaining} days or after ${safeMode.appsRemaining} more approvals, whichever comes first.`
                : "Lifts on configured thresholds."}
            </span>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="mb-6">
        <Link to="/admin/recruitment" className="flex items-center gap-1 text-sm text-gray-500 hover:text-teal-600 mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to Recruitment
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{app.full_name}</h1>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[app.status] || "bg-gray-100 text-gray-700"}`}>
            {STATUS_LABELS[app.status] || app.status}
          </span>
          {app.assigned_tier && (
            <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${TIER_COLORS[app.assigned_tier] || "bg-gray-100 text-gray-600"}`}>
              {TIER_LABELS[app.assigned_tier]}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
          <span className="font-mono">{app.application_number}</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${isTranslator ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}>
            {isTranslator ? "Translator" : app.role_type === "cd_clinician_consultant" ? "CD & Clinician Consultant" : "CD Interviewer"}
          </span>
          <span>Applied {format(new Date(app.created_at), "MMM d, yyyy")}</span>
          <span>({formatDistanceToNow(new Date(app.created_at), { addSuffix: true })})</span>
        </div>
      </div>

      {/* ISO 17100 evidence — top of profile, for review/approval */}
      <IsoEvidencePanel ev={isoEvidence} ndaSignedAt={ndaSignedAt} coaQuiz={quizSubmissions.find(q => q.is_coa) ?? null} />

      {/* COA Quiz Results — dedicated full-width panel, always visible for COA applicants.
          Surfaces score + AI decision prominently so reviewers can't miss translation failures. */}
      {(() => {
        const coaQuizzes = quizSubmissions.filter(q => q.is_coa);
        if (coaQuizzes.length === 0) return null;
        return (
          <div className="mb-6 rounded-lg border-2 border-indigo-300 bg-indigo-50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold text-indigo-900 uppercase tracking-wide">COA Linguistic Validation — Quiz Results</span>
            </div>
            <p className="text-[11px] text-indigo-700 mb-3">
              Competence bar: <strong>90% MCQ</strong>. The AI recommendation reflects Part-2 translation quality and is <strong>advisory</strong> — corroborate the overall score with references + §3.1.4 at final approval.
            </p>
            <div className="space-y-3">
              {coaQuizzes.map(q => {
                const scorePct = q.score_pct !== null ? Number(q.score_pct) : null;
                const rec = q.assessment_recommendation ?? null;
                const meetsBar = scorePct !== null && scorePct >= 90;
                const scoreColor = scorePct === null ? "bg-gray-100 text-gray-600"
                  : scorePct >= 90 ? "bg-green-100 text-green-700"
                  : scorePct >= 70 ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700";
                const recColor = !rec ? "bg-gray-100 text-gray-600"
                  : /not recommended|fail/i.test(rec) ? "bg-red-100 text-red-700"
                  : /needs human review|flagged/i.test(rec) ? "bg-amber-100 text-amber-700"
                  : "bg-green-100 text-green-700";
                const breakdown = q.competence_breakdown ?? {};
                const competenceOrder = ["linguistic_textual_competence","cultural_competence","domain_competence","research_competence","technical_competence"];
                return (
                  <div key={q.id} className="bg-white rounded-lg border border-indigo-200 p-3">
                    {/* Header row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-bold px-2.5 py-1 rounded ${scoreColor}`}>
                          {scorePct === null ? (q.status === "submitted" ? "Scored 0%" : "Not submitted") : `${scorePct.toFixed(0)}%`}
                          {q.correct_count !== null && q.total_count !== null && (
                            <span className="ml-1 font-normal opacity-75"> ({q.correct_count}/{q.total_count} correct)</span>
                          )}
                        </span>
                        {scorePct !== null && (
                          <span className={`text-[10px] font-semibold px-2 py-1 rounded ${meetsBar ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                            {meetsBar ? "≥ 90% bar" : "below 90% bar"}
                          </span>
                        )}
                        {rec && (
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded ${recColor}`}>
                            AI (advisory): {rec}
                          </span>
                        )}
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 capitalize">{q.status}</span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {q.submitted_at
                          ? `Submitted ${format(new Date(q.submitted_at), "MMM d, yyyy h:mm a")}`
                          : `Issued ${format(new Date(q.created_at), "MMM d, yyyy h:mm a")}`}
                      </span>
                    </div>

                    {/* Assessment summary */}
                    {q.assessment_summary && (
                      <div className={`mb-3 p-2 rounded border text-xs ${/not recommended|fail/i.test(rec ?? "") ? "border-red-200 bg-red-50 text-red-800" : /needs human review|flagged/i.test(rec ?? "") ? "border-amber-200 bg-amber-50 text-amber-800" : "border-gray-200 bg-gray-50 text-gray-800"}`}>
                        <span className="font-semibold block mb-1">AI Assessment</span>
                        {q.assessment_summary}
                      </div>
                    )}

                    {/* Competence breakdown */}
                    {Object.keys(breakdown).length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
                        {competenceOrder.map(slug => {
                          const b = breakdown[slug];
                          if (!b) return null;
                          const pct = b.total > 0 ? (b.correct / b.total) * 100 : 0;
                          const cellColor = pct >= 70 ? "text-green-700 border-green-200" : pct >= 60 ? "text-yellow-700 border-yellow-200" : "text-red-700 border-red-200";
                          return (
                            <div key={slug} className={`rounded border px-2 py-1.5 ${cellColor}`}>
                              <div className="text-[10px] uppercase tracking-wide text-gray-500">
                                {COMPETENCE_LABELS[slug] ?? slug.replace(/_/g, " ")}
                              </div>
                              <div className="text-sm font-bold">{b.correct}/{b.total}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* COA Part-2 translation responses */}
                    {q.is_coa && coaResponses.length > 0 && (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 mb-1">
                          Part-2 translations — {coaResponses.length} sentence{coaResponses.length > 1 ? "s" : ""}
                        </div>
                        <div className="space-y-2">
                          {coaResponses.map(cr => {
                            const vColor = cr.verdict === "pass" ? "bg-green-100 text-green-700"
                              : cr.verdict === "fail" ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700";
                            return (
                              <div key={cr.id} className="rounded border border-gray-200 p-2 bg-gray-50">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${vColor}`}>
                                    {cr.verdict ?? (cr.needs_human_review ? "needs review" : "—")}
                                  </span>
                                  {cr.mqm_score != null && <span className="text-[10px] text-gray-500">MQM {cr.mqm_score}</span>}
                                  {cr.conceptual_equivalence && <span className="text-[10px] text-gray-500">conceptual: {cr.conceptual_equivalence}</span>}
                                  {cr.target_language_name && <span className="text-[10px] text-gray-500">{cr.target_language_name}</span>}
                                </div>
                                {cr.applicant_translation && <p className="text-xs text-gray-900 whitespace-pre-wrap mb-1">{cr.applicant_translation}</p>}
                                {cr.ai_rationale && <p className="text-[11px] text-gray-500 italic">{cr.ai_rationale}</p>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Three-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT PANEL — Applicant Info */}
        <div className="lg:col-span-3 space-y-4">
          {/* Contact */}
          <Section title="Contact">
            <dl className="space-y-1 mt-2">
              <InfoRow label="Email" value={<a href={`mailto:${app.email}`} className="text-teal-600 hover:underline flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{app.email}</a>} />
              <InfoRow label="Phone" value={app.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-gray-400" />{app.phone}</span>} />
              <InfoRow label="Location" value={<span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-gray-400" />{[app.city, app.country].filter(Boolean).join(", ")}</span>} />
              {app.linkedin_url && (
                <InfoRow label="LinkedIn" value={<a href={app.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline flex items-center gap-1"><Linkedin className="w-3.5 h-3.5" />Profile <ExternalLink className="w-3 h-3" /></a>} />
              )}
            </dl>
          </Section>

          {/* Professional Background */}
          {isTranslator && (
            <Section title="Professional Background">
              <dl className="space-y-1 mt-2">
                <InfoRow label="Experience" value={app.years_experience !== null ? EXPERIENCE_LABELS[app.years_experience] || `${app.years_experience} years` : null} />
                <InfoRow label="Education" value={app.education_level ? EDUCATION_LABELS[app.education_level] || app.education_level : null} />
                {app.certifications && app.certifications.length > 0 && (
                  <InfoRow label="Certifications" value={
                    <ul className="space-y-1">
                      {app.certifications.map((c, i) => (
                        <li key={i} className="text-sm">
                          {CERT_LABELS[c.name] || c.customName || c.name}
                          {c.expiryDate && <span className="text-xs text-gray-500 ml-1">(exp. {format(new Date(c.expiryDate), "MMM yyyy")})</span>}
                        </li>
                      ))}
                    </ul>
                  } />
                )}
                {app.cat_tools.length > 0 && (
                  <InfoRow label="CAT Tools" value={<div className="flex flex-wrap gap-1">{app.cat_tools.map(t => <span key={t} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{t}</span>)}</div>} />
                )}
                {app.services_offered.length > 0 && (
                  <InfoRow label="Services" value={<div className="flex flex-wrap gap-1">{app.services_offered.map(s => <span key={s} className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded text-xs">{SERVICE_LABELS[s] || s}</span>)}</div>} />
                )}
              </dl>
            </Section>
          )}

          {isCog && (
            <Section title="Professional Background">
              <dl className="space-y-1 mt-2">
                <InfoRow label="Experience" value={app.cog_years_experience !== null ? EXPERIENCE_LABELS[app.cog_years_experience] || `${app.cog_years_experience} years` : null} />
                <InfoRow label="Degree Field" value={app.cog_degree_field} />
                <InfoRow label="Credentials" value={app.cog_credentials} />
                {app.cog_instrument_types.length > 0 && (
                  <InfoRow label="COA Instrument Types" value={<div className="flex flex-wrap gap-1">{app.cog_instrument_types.map(t => <span key={t} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{COA_LABELS[t] || t}</span>)}</div>} />
                )}
                {app.cog_therapy_areas.length > 0 && (
                  <InfoRow label="Therapy Areas" value={<div className="flex flex-wrap gap-1">{app.cog_therapy_areas.map(t => <span key={t} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{t}</span>)}</div>} />
                )}
                <InfoRow label="Pharma / CRO Clients" value={app.cog_pharma_clients} />
                <InfoRow label="ISPOR Familiarity" value={app.cog_ispor_familiarity ? FAMILIARITY_LABELS[app.cog_ispor_familiarity] || app.cog_ispor_familiarity : null} />
                <InfoRow label="FDA COA Familiarity" value={app.cog_fda_familiarity ? FAMILIARITY_LABELS[app.cog_fda_familiarity] || app.cog_fda_familiarity : null} />
                <InfoRow label="Prior Debrief Reports" value={app.cog_prior_debrief_reports ? "Yes" : "No"} />
                <InfoRow label="Sample Report on File" value={app.cog_sample_report_path ? "Yes" : "No"} />
                <InfoRow label="Availability" value={app.cog_availability ? AVAILABILITY_LABELS[app.cog_availability] || app.cog_availability : null} />
                <InfoRow label="Time Zone" value={app.cog_timezone} />
              </dl>
            </Section>
          )}

          {isCog && (app.cog_interviews_conducted || app.cog_interview_modes?.length || app.cog_ecoa_platforms?.length || app.cog_conducts_direct_patient_interviews !== null) && (
            <Section title="Patient Interview Experience">
              <dl className="space-y-1 mt-2">
                <InfoRow label="CD Interviews Conducted" value={app.cog_interviews_conducted ? INTERVIEWS_CONDUCTED_LABELS[app.cog_interviews_conducted] || app.cog_interviews_conducted : null} />
                <InfoRow label="Direct Patient Interviews" value={app.cog_conducts_direct_patient_interviews === null ? null : (app.cog_conducts_direct_patient_interviews ? "Yes" : "No")} />
                {app.cog_interview_modes && app.cog_interview_modes.length > 0 && (
                  <InfoRow label="Interview Modes" value={<div className="flex flex-wrap gap-1">{app.cog_interview_modes.map(t => <span key={t} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{INTERVIEW_MODE_LABELS[t] || t}</span>)}</div>} />
                )}
                {app.cog_ecoa_platforms && app.cog_ecoa_platforms.length > 0 && (
                  <InfoRow label="Remote eCOA Platforms" value={<div className="flex flex-wrap gap-1">{app.cog_ecoa_platforms.map(t => <span key={t} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{ECOA_PLATFORM_LABELS[t] || t}</span>)}</div>} />
                )}
              </dl>
            </Section>
          )}

          {isCog && (app.cog_ema_familiarity || app.cog_concept_elicitation_years || app.cog_special_populations?.length || app.cog_gcp_trained !== null) && (
            <Section title="Regulatory & Specialized Experience">
              <dl className="space-y-1 mt-2">
                <InfoRow label="EMA COA Familiarity" value={app.cog_ema_familiarity ? FAMILIARITY_LABELS[app.cog_ema_familiarity] || app.cog_ema_familiarity : null} />
                <InfoRow label="Concept-Elicitation Experience" value={app.cog_concept_elicitation_years ? EXPERIENCE_BRACKET_LABELS[app.cog_concept_elicitation_years] || app.cog_concept_elicitation_years : null} />
                {app.cog_special_populations && app.cog_special_populations.length > 0 && (
                  <InfoRow label="Special Populations" value={<div className="flex flex-wrap gap-1">{app.cog_special_populations.map(t => <span key={t} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{SPECIAL_POPULATIONS_LABELS[t] || t}</span>)}</div>} />
                )}
                <InfoRow label="GCP Trained" value={app.cog_gcp_trained === null ? null : (app.cog_gcp_trained ? (app.cog_gcp_year ? `Yes (${app.cog_gcp_year})` : "Yes") : "No")} />
              </dl>
            </Section>
          )}

          {isCog && (app.cog_license_type || app.cog_license_jurisdiction || app.cog_license_number) && (
            <Section title="Professional License">
              <dl className="space-y-1 mt-2">
                <InfoRow label="License Type" value={app.cog_license_type} />
                <InfoRow label="Jurisdiction" value={app.cog_license_jurisdiction} />
                <InfoRow label="License Number" value={app.cog_license_number} />
                <InfoRow label="Active / In Good Standing" value={app.cog_license_active === null ? null : (app.cog_license_active ? "Yes" : "No")} />
              </dl>
            </Section>
          )}

          {/* CV / Resume — preview + download */}
          <Section title="Resume / CV">
            <CvSection applicationId={app.id} cvStoragePath={app.cv_storage_path} callEdgeFunction={callEdgeFunction} />
          </Section>

          {/* Rate & Referral */}
          <Section title="Rate & Referral">
            <dl className="space-y-1 mt-2">
              {isTranslator && <InfoRow label="Expected Rate (per page, CAD)" value={app.rate_expectation ? `$${Number(app.rate_expectation).toFixed(2)}` : null} />}
              {isCog && <InfoRow label={`Expected Rate (${app.cog_rate_currency || "CAD"})`} value={app.cog_rate_expectation ? `${Number(app.cog_rate_expectation).toFixed(2)}` : null} />}
              <InfoRow label="Agreed Rate" value={app.final_agreed_rate ? `$${Number(app.final_agreed_rate).toFixed(2)}` : null} />
              <InfoRow label="Referral Source" value={app.referral_source} />
            </dl>
          </Section>

          {/* Work Samples */}
          {app.work_samples && app.work_samples.length > 0 && (
            <Section title="Work Samples">
              <ul className="space-y-2 mt-2">
                {app.work_samples.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-gray-900">{s.description || "Sample " + (i + 1)}</p>
                      <p className="text-xs text-gray-500 font-mono truncate max-w-[200px]">{s.storage_path}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Applicant Notes */}
          {app.notes && (
            <Section title="Applicant Notes">
              <p className="text-sm text-gray-700 whitespace-pre-wrap mt-2">{app.notes}</p>
            </Section>
          )}
        </div>

        {/* CENTRE PANEL — Stage Content */}
        <div className="lg:col-span-5 space-y-4">
          {/* AI Pre-screening */}
          <Section title="AI Pre-screening (advisory)" defaultOpen={false}>
            {/* Reassess button — visible once there's staff context for this app */}
            {aiResult && (flagFeedback.length > 0 || (() => {
              const r = aiResult as Record<string, unknown>;
              return !!r.reassessed_with_staff_context;
            })()) && (
              <div className="mt-2 flex items-center justify-between gap-2 p-2.5 bg-teal-50 border border-teal-200 rounded-md">
                <div className="text-xs text-teal-800">
                  {(() => {
                    const r = aiResult as Record<string, unknown>;
                    const wasReassessed = !!r.reassessed_with_staff_context;
                    const ctx = (r.per_app_context as Record<string, number> | undefined) ?? {};
                    if (wasReassessed) {
                      return (
                        <>
                          <strong>Reassessed with staff context</strong>
                          {ctx.flag_feedback_count !== undefined && (
                            <span className="text-teal-700">
                              {" "}· {ctx.flag_feedback_count} verdicts, {ctx.decision_count ?? 0} decisions, {ctx.inbound_count ?? 0} replies folded in
                            </span>
                          )}
                        </>
                      );
                    }
                    return (
                      <>
                        <strong>{flagFeedback.length}</strong> flag verdict{flagFeedback.length === 1 ? "" : "s"} recorded on this app. Want AI to refine the score?
                      </>
                    );
                  })()}
                </div>
                <button
                  type="button"
                  onClick={handleReassess}
                  disabled={reassessBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-medium rounded-md flex-shrink-0"
                >
                  {reassessBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {reassessBusy ? "Reassessing…" : "Reassess with my feedback"}
                </button>
              </div>
            )}
            {!aiResult ? (
              <p className="text-sm text-gray-500 mt-2">No AI pre-screening data available.</p>
            ) : (aiResult as Record<string, unknown>).error === "ai_fallback" ? (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mt-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800">AI Pre-screening Failed</p>
                  <p className="text-xs text-amber-600 mt-1 break-words">{(aiResult as Record<string, unknown>).reason as string}</p>
                  <button
                    type="button"
                    onClick={handleRerunPrescreen}
                    disabled={rerunPrescreenBusy}
                    className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-medium rounded-md"
                  >
                    {rerunPrescreenBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    {rerunPrescreenBusy ? "Re-running…" : "Re-run AI pre-screen"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 mt-2">
                {/* Score */}
                <div className="flex items-center gap-4">
                  <div className={`text-4xl font-bold ${
                    (app.ai_prescreening_score ?? 0) >= 70 ? "text-green-600" :
                    (app.ai_prescreening_score ?? 0) >= 50 ? "text-yellow-600" : "text-red-600"
                  }`}>
                    {app.ai_prescreening_score ?? "--"}
                  </div>
                  <div className="text-sm text-gray-500">
                    AI Score
                    {app.ai_prescreening_at && (
                      <div className="text-xs">Screened {format(new Date(app.ai_prescreening_at), "MMM d, yyyy h:mm a")}</div>
                    )}
                  </div>
                </div>

                {/* Safe-mode prescreen-outcome callout — visible when AI says
                    proceed or staff_review but status hasn't advanced yet.
                    Under safe mode (first 30d / 200 apps) AI never auto-sends
                    V2/V8; staff must explicitly approve the outbound. */}
                {(() => {
                  const r = aiResult as Record<string, unknown>;
                  const rec = r.recommendation;
                  if (rec !== "proceed" && rec !== "staff_review") return null;
                  // Hide once the applicant has progressed past the
                  // prescreen-approval gate — V2/V8 has either gone out or
                  // the manual queue picked them up. Anything in the test
                  // pipeline or beyond is downstream of this banner.
                  const downstream = new Set([
                    "prescreened",
                    "approved",
                    "rejected",
                    "test_pending",
                    "test_sent",
                    "test_in_progress",
                    "test_submitted",
                    "test_assessed",
                    "negotiation",
                    "archived",
                    "waitlisted",
                  ]);
                  if (downstream.has(app.status)) return null;
                  // Already sent V8 / moved forward? Skip.
                  const isAdvance = rec === "proceed";
                  const isManual = rec === "staff_review";
                  const colorWrapper = isAdvance
                    ? "bg-green-50 border-green-200"
                    : "bg-amber-50 border-amber-200";
                  const headingColor = isAdvance ? "text-green-800" : "text-amber-800";
                  const noteColor = isAdvance ? "text-green-700" : "text-amber-700";
                  const primaryBtn = isAdvance
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-amber-600 hover:bg-amber-700";
                  const primaryLabel = isAdvance
                    ? "Approve advance — send V2 (passed pre-screen)"
                    : "Acknowledge — send V8 (under manual review)";
                  const outcomeValue = isAdvance ? "prescreened" : "staff_review_notice";
                  const loadingKey = `presc-${outcomeValue}`;
                  const busy = actionLoading === loadingKey;
                  return (
                    <div className={`p-3 border rounded-lg ${colorWrapper}`}>
                      <div className="flex items-start gap-2">
                        <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isAdvance ? "text-green-500" : "text-amber-500"}`} />
                        <div className="flex-1">
                          <p className={`text-sm font-semibold ${headingColor}`}>
                            {isAdvance
                              ? "AI recommends advancing to testing"
                              : "AI recommends manual staff review"}
                          </p>
                          <p className={`text-xs mt-1 ${noteColor}`}>
                            {r.notes ? String(r.notes) : ""}{" "}
                            <strong>No email has been sent to the applicant yet.</strong>{" "}
                            Approve one of the actions below to communicate.
                          </p>
                          <div className="flex flex-wrap gap-2 mt-3">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                if (!id) return;
                                setActionLoading(loadingKey);
                                try {
                                  await callEdgeFunction("cvp-approve-prescreen-outcome", {
                                    applicationId: id,
                                    outcome: outcomeValue,
                                    staffId: session?.staffId,
                                  });
                                  toast.success(isAdvance ? "V2 sent — applicant advanced" : "V8 sent — applicant notified of manual review");
                                  await fetchData();
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "Failed");
                                } finally {
                                  setActionLoading(null);
                                }
                              }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-medium rounded-md disabled:opacity-50 ${primaryBtn}`}
                            >
                              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                              {primaryLabel}
                            </button>
                            <button
                              type="button"
                              disabled={actionLoading === "presc-silent"}
                              onClick={async () => {
                                if (!id) return;
                                setActionLoading("presc-silent");
                                try {
                                  await callEdgeFunction("cvp-approve-prescreen-outcome", {
                                    applicationId: id,
                                    outcome: "silent",
                                    staffId: session?.staffId,
                                  });
                                  toast.success("Acknowledged silently — no email sent");
                                  await fetchData();
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "Failed");
                                } finally {
                                  setActionLoading(null);
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 text-xs font-medium rounded-md disabled:opacity-50"
                            >
                              Acknowledge silently (no email)
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* AI pre-screen note — advisory only, NON-ACTIONABLE. The
                    pre-screen is an early CV-vs-form check (it can misread a
                    strong candidate whose background is simply misaligned with
                    the test domain). The qualification decision is made from the
                    competence test/quiz, references, and §3.1.4 evidence via the
                    Reviewer guide at the top — never from this score. */}
                {(() => {
                  const r = aiResult as Record<string, unknown>;
                  if (r.recommendation === "proceed" || r.recommendation === "staff_review") return null;
                  if (!r.notes) return null;
                  return (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-xs font-semibold text-gray-600">AI pre-screen note — advisory, not a decision</p>
                      <p className="text-xs text-gray-700 mt-1">{String(r.notes)}</p>
                      <p className="text-[11px] text-gray-400 mt-1.5">
                        Early CV-vs-form screen only — it can flag a qualified applicant whose background is misaligned with the test domain. Decide from the competence test/quiz, references, and §3.1.4 evidence, not this score.
                      </p>
                    </div>
                  );
                })()}

                {/* Score badges */}
                {isTranslator ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <ScoreBadge label="Recommendation" value={String((aiResult as Record<string, unknown>).recommendation || "")} type="recommendation" />
                      <ScoreBadge label="Demand Match" value={String((aiResult as Record<string, unknown>).demand_match || "")} />
                      <ScoreBadge label="Certification Quality" value={String((aiResult as Record<string, unknown>).certification_quality || "")} />
                      <ScoreBadge label="Experience Consistency" value={String((aiResult as Record<string, unknown>).experience_consistency || "")} />
                      <ScoreBadge label="Sample Quality" value={String((aiResult as Record<string, unknown>).sample_quality || "")} />
                      <ScoreBadge label="Rate Assessment" value={String((aiResult as Record<string, unknown>).rate_expectation_assessment || "")} type="rate" />
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm">
                      {(aiResult as Record<string, unknown>).suggested_test_difficulty && (
                        <div><span className="text-gray-500">Test difficulty:</span> <span className="font-medium capitalize">{String((aiResult as Record<string, unknown>).suggested_test_difficulty)}</span></div>
                      )}
                      {(aiResult as Record<string, unknown>).suggested_tier && (
                        <div><span className="text-gray-500">Suggested tier:</span> <span className="font-medium capitalize">{String((aiResult as Record<string, unknown>).suggested_tier)}</span></div>
                      )}
                    </div>
                    {(aiResult as Record<string, unknown>).suggested_test_types && (
                      <div>
                        <span className="text-xs text-gray-500">Suggested test types:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {((aiResult as Record<string, unknown>).suggested_test_types as string[]).map((t) => (
                            <span key={t} className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded text-xs">{SERVICE_LABELS[t] || t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : isCog ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <ScoreBadge label="COA/PRO Experience" value={String((aiResult as Record<string, unknown>).coa_instrument_experience || "")} />
                    <ScoreBadge label="Guideline Familiarity" value={String((aiResult as Record<string, unknown>).guideline_familiarity || "")} />
                    <ScoreBadge label="Interviewing Skills" value={String((aiResult as Record<string, unknown>).interviewing_skills || "")} />
                    <ScoreBadge label="Language Fluency" value={String((aiResult as Record<string, unknown>).language_fluency || "")} />
                    <ScoreBadge label="Report Writing" value={String((aiResult as Record<string, unknown>).report_writing_experience || "")} />
                    <ScoreBadge label="Recommendation" value={String((aiResult as Record<string, unknown>).recommendation || "")} type="recommendation" />
                  </div>
                ) : null}

                {/* Assets — positive signals (v3-assets-aware+). Surfaced first
                    because staff should see strengths before concerns. */}
                {Array.isArray((aiResult as Record<string, unknown>).assets) && ((aiResult as Record<string, unknown>).assets as string[]).length > 0 && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-emerald-800">Assets</p>
                      <span className="text-[11px] text-emerald-700/70">
                        Positive signals the AI identified
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {((aiResult as Record<string, unknown>).assets as string[]).map((a, i) => (
                        <FlagWithFeedback
                          key={`a-${i}-${a.slice(0, 32)}`}
                          flagKind="green_flag"
                          flagText={a}
                          existing={findFeedback("green_flag", a)}
                          onSave={(v, n) => saveFlagFeedback("green_flag", a, v, n)}
                          onClear={() => clearFlagFeedback("green_flag", a)}
                        />
                      ))}
                    </ul>
                  </div>
                )}

                {/* Red flags — staff verdict per flag drives prescreen learning */}
                {Array.isArray((aiResult as Record<string, unknown>).red_flags) && ((aiResult as Record<string, unknown>).red_flags as string[]).length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-red-700">Red Flags</p>
                      <span className="text-[11px] text-red-500/70">
                        Verdict each flag — feeds prescreener learning
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {((aiResult as Record<string, unknown>).red_flags as string[]).map((f, i) => (
                        <FlagWithFeedback
                          key={`r-${i}-${f.slice(0, 32)}`}
                          flagKind="red_flag"
                          flagText={f}
                          existing={findFeedback("red_flag", f)}
                          onSave={(v, n) => saveFlagFeedback("red_flag", f, v, n)}
                          onClear={() => clearFlagFeedback("red_flag", f)}
                        />
                      ))}
                    </ul>
                  </div>
                )}

                {/* AI notes */}
                {(aiResult as Record<string, unknown>).notes && (
                  <div>
                    <span className="text-xs text-gray-500">AI Notes</span>
                    <p className="text-sm text-gray-700 mt-1">{String((aiResult as Record<string, unknown>).notes)}</p>
                  </div>
                )}

                {/* CV-aware fields (v2-cv-aware prompt and later). Older results
                    won't have these — render only when present. */}
                {(() => {
                  const r = aiResult as Record<string, unknown>;
                  const hasAnyCv =
                    r.cv_quality !== undefined ||
                    r.cv_corroborates_form !== undefined ||
                    Array.isArray(r.cv_unique_signals);
                  if (!hasAnyCv) return null;

                  const corrobColor =
                    r.cv_corroborates_form === "fully"
                      ? "bg-green-50 text-green-700 border-green-200"
                      : r.cv_corroborates_form === "partially"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : r.cv_corroborates_form === "contradicts"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-gray-50 text-gray-600 border-gray-200";
                  const qualityColor =
                    r.cv_quality === "high"
                      ? "bg-green-50 text-green-700 border-green-200"
                      : r.cv_quality === "medium"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : r.cv_quality === "low"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-gray-50 text-gray-600 border-gray-200";

                  return (
                    <div className="space-y-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-2 text-xs">
                        <FileText className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-gray-500 uppercase tracking-wide font-medium">CV signals</span>
                        {r.cv_read === false && (
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px]">
                            CV not read{r.cv_read_error ? ` — ${String(r.cv_read_error)}` : ""}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {r.cv_quality && (
                          <span className={`px-2 py-1 rounded border text-xs ${qualityColor}`}>
                            CV Quality: <span className="font-semibold capitalize">{String(r.cv_quality).replace("_", " ")}</span>
                          </span>
                        )}
                        {r.cv_corroborates_form && (
                          <span className={`px-2 py-1 rounded border text-xs ${corrobColor}`}>
                            Corroborates form: <span className="font-semibold capitalize">{String(r.cv_corroborates_form).replace("_", " ")}</span>
                          </span>
                        )}
                      </div>
                      {Array.isArray(r.cv_unique_signals) && (r.cv_unique_signals as string[]).length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-500">Green flags — unique CV signals (not in form)</span>
                            <span className="text-[11px] text-gray-400">
                              Verdict each — feeds prescreener learning
                            </span>
                          </div>
                          <ul className="space-y-2">
                            {(r.cv_unique_signals as string[]).map((s, i) => (
                              <FlagWithFeedback
                                key={`g-${i}-${s.slice(0, 32)}`}
                                flagKind="green_flag"
                                flagText={s}
                                existing={findFeedback("green_flag", s)}
                                onSave={(v, n) => saveFlagFeedback("green_flag", s, v, n)}
                                onClear={() => clearFlagFeedback("green_flag", s)}
                              />
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Observability footer — only render when v2+ */}
                {(() => {
                  const r = aiResult as Record<string, unknown>;
                  if (!r.prompt_version && !r.model_used) return null;
                  return (
                    <p className="text-[11px] text-gray-400 mt-2">
                      {r.model_used ? <>model: <span className="font-mono">{String(r.model_used)}</span></> : null}
                      {r.model_used && r.prompt_version ? " · " : ""}
                      {r.prompt_version ? <>prompt: <span className="font-mono">{String(r.prompt_version)}</span></> : null}
                    </p>
                  );
                })()}
              </div>
            )}
          </Section>

          {/* Assessment Path (test or quiz) */}
          <AssessmentPathPanel
            app={app}
            combinations={combinations}
            languages={languages}
            callEdgeFunction={callEdgeFunction}
            staffId={session?.staffId}
            staffEmail={session?.staffEmail}
            onAfterAction={fetchData}
          />

          {/* Test Combinations */}
          <Section title={`Test Combinations (${combinations.length})`} defaultOpen={combinations.length > 0}>
            <SendTestsControls
              app={app}
              combinations={combinations}
              languages={languages}
              callEdgeFunction={callEdgeFunction}
              staffId={session?.staffId}
              onAfterAction={fetchData}
            />
            <SendSpecificTest
              app={app}
              combinations={combinations}
              languages={languages}
              callEdgeFunction={callEdgeFunction}
              staffId={session?.staffId}
              onAfterAction={fetchData}
            />
            {combinations.length === 0 ? (
              <p className="text-sm text-gray-500 mt-2">No test combinations.</p>
            ) : (() => {
              const renderCard = (combo: TestCombination) => {
                const sub = submissions.find((s) => s.combination_id === combo.id);
                return (
                    <div key={combo.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {languages[combo.source_language_id] || "?"} → {languages[combo.target_language_id] || "?"}
                          </span>
                          {combo.domain && <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">{DOMAIN_LABELS[combo.domain] || combo.domain}</span>}
                          {combo.service_type && <span className="text-xs px-2 py-0.5 bg-teal-50 text-teal-700 rounded">{SERVICE_LABELS[combo.service_type] || combo.service_type}</span>}
                        </div>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${COMBO_STATUS_COLORS[combo.status] || "bg-gray-100 text-gray-700"}`}>
                          {COMBO_STATUS_LABELS[combo.status] || combo.status}
                        </span>
                      </div>
                      {combo.ai_score !== null && (
                        <div className="text-sm">
                          <span className="text-gray-500">Test score: </span>
                          <span className={`font-semibold ${combo.ai_score >= 80 ? "text-green-600" : combo.ai_score >= 65 ? "text-yellow-600" : "text-red-600"}`}>
                            {combo.ai_score}
                          </span>
                        </div>
                      )}
                      {combo.approved_at && (
                        <div className="text-xs text-gray-500 mt-1">
                          Approved {format(new Date(combo.approved_at), "MMM d, yyyy")}
                          {combo.approved_rate && <span> at ${Number(combo.approved_rate).toFixed(2)}</span>}
                        </div>
                      )}

                      {/* Rate suggester — per-lane AI suggestion at 20% of
                          client per-page price, test-tiered. */}
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() => handleSuggestRateForCombo(combo)}
                          disabled={rateSuggestingId === combo.id}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 rounded disabled:opacity-40"
                        >
                          {rateSuggestingId === combo.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                          {rateSuggestions[combo.id] ? "Re-suggest rate" : "Suggest rate"}
                        </button>
                        {rateSuggestError[combo.id] && (
                          <p className="text-xs text-red-600 mt-1.5">{rateSuggestError[combo.id]}</p>
                        )}
                        {rateSuggestions[combo.id] && (
                          <div className="mt-2 p-2.5 rounded-md bg-violet-50 border border-violet-200 text-xs space-y-1.5">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className="font-medium text-violet-900">
                                Recommended: {rateSuggestions[combo.id]!.currency} ${rateSuggestions[combo.id]!.recommended_rate.toFixed(2)}/page
                              </span>
                              <span className="text-violet-700">
                                Test {rateSuggestions[combo.id]!.test_score_used ?? "—"} ({rateSuggestions[combo.id]!.test_bucket})
                              </span>
                            </div>
                            <p className="text-violet-800 leading-relaxed">{rateSuggestions[combo.id]!.reasoning}</p>
                            <div className="text-violet-700">
                              Alternatives: ↓ ${rateSuggestions[combo.id]!.alternative_lower.toFixed(2)} · ↑ ${rateSuggestions[combo.id]!.alternative_higher.toFixed(2)}
                              <span className="ml-2 text-violet-600">Ceiling ${rateSuggestions[combo.id]!.ceiling.toFixed(2)} / Floor ${rateSuggestions[combo.id]!.floor.toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                      {sub && (
                        <InstrumentReminderControls
                          kind="test"
                          submissionId={sub.id}
                          status={sub.status}
                          createdAt={sub.created_at}
                          tokenExpiresAt={sub.token_expires_at}
                          submittedAt={sub.submitted_at}
                          firstViewedAt={sub.first_viewed_at}
                          viewCount={sub.view_count}
                          reminders={[sub.reminder_1_sent_at, sub.reminder_2_sent_at, sub.reminder_3_sent_at]}
                          callEdgeFunction={callEdgeFunction}
                          onAfterAction={fetchData}
                        />
                      )}
                      {combo.ai_assessment_result && (
                        <TestAssessmentPanel
                          assessment={combo.ai_assessment_result}
                          combo={combo}
                          submission={sub ?? null}
                          test={sub?.test_id ? testLibrary[sub.test_id] ?? null : null}
                          sourceLanguageCode={languageCodes[combo.source_language_id] ?? null}
                          targetLanguageCode={languageCodes[combo.target_language_id] ?? null}
                          staffId={session?.staffId}
                          onAfterAction={fetchData}
                          callEdgeFunction={callEdgeFunction}
                          errorFeedback={errorFeedback[combo.id] ?? []}
                          feedbackRound={feedbackRounds[combo.id] ?? null}
                        />
                      )}
                      {combo.instrument_kind === "quiz" && (() => {
                        const quizSub = quizSubmissions.find(
                          (qs) => qs.target_language_id === combo.target_language_id,
                        );
                        if (!quizSub) {
                          return (
                            <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500 italic">
                              Quiz routed for this language but no submission row found.
                            </div>
                          );
                        }
                        return (
                          <QuizSubmissionPanel
                            submission={quizSub}
                            questions={quizQuestions}
                            languageLabel={languages[combo.target_language_id] || "?"}
                            coaResponses={coaResponses}
                            callEdgeFunction={callEdgeFunction}
                            onAfterAction={fetchData}
                          />
                        );
                      })()}
                    </div>
                  );
              };
              const approvedCombos = combinations.filter((c) => c.status === "approved");
              const otherCombos = combinations.filter((c) => c.status !== "approved");
              return (
                <div className="mt-2 space-y-2">
                  {approvedCombos.length > 0 && (
                    <details open className="border border-emerald-200 rounded-lg bg-emerald-50/30">
                      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-emerald-800">
                        Approved pairs ({approvedCombos.length})
                      </summary>
                      <div className="space-y-3 p-3 pt-0">{approvedCombos.map(renderCard)}</div>
                    </details>
                  )}
                  {otherCombos.length > 0 && (
                    <details className="border border-gray-200 rounded-lg">
                      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-gray-700">
                        Pending / in review ({otherCombos.length})
                      </summary>
                      <div className="space-y-3 p-3 pt-0">{otherCombos.map(renderCard)}</div>
                    </details>
                  )}
                </div>
              );
            })()}
          </Section>

          {/* Quiz Results — standalone, so quiz-only candidates (cognitive
              debriefing has NO test combos) still show their quiz + score.
              Skips quizzes already rendered under a quiz combo (no dup). */}
          {(() => {
            const shownLangIds = new Set(
              combinations
                .filter((c) => c.instrument_kind === "quiz")
                .map((c) => c.target_language_id),
            );
            const orphanQuizzes = quizSubmissions.filter(
              (q) => !shownLangIds.has(q.target_language_id),
            );
            if (orphanQuizzes.length === 0) return null;
            return (
              <Section title={`Quiz Results (${orphanQuizzes.length})`} defaultOpen>
                <div className="space-y-3">
                  {orphanQuizzes.map((q, i) => (
                    <QuizSubmissionPanel
                      key={q.id ?? i}
                      submission={q}
                      questions={quizQuestions}
                      languageLabel={languages[q.target_language_id] || "?"}
                      coaResponses={coaResponses}
                      callEdgeFunction={callEdgeFunction}
                      onAfterAction={fetchData}
                    />
                  ))}
                </div>
              </Section>
            );
          })()}

          {/* Negotiation History */}
          {app.negotiation_log && app.negotiation_log.length > 0 && (
            <Section title="Negotiation History">
              <div className="space-y-2 mt-2">
                {app.negotiation_log.map((ev, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm border-l-2 border-gray-200 pl-3 py-1">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 capitalize">{ev.event?.replace(/_/g, " ")}</div>
                      {ev.amount !== undefined && <div className="text-gray-600">Amount: ${Number(ev.amount).toFixed(2)}</div>}
                      {ev.final_amount !== undefined && <div className="text-gray-600">Final: ${Number(ev.final_amount).toFixed(2)}</div>}
                      {ev.notes && <div className="text-gray-500 text-xs mt-0.5">{ev.notes}</div>}
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{format(new Date(ev.timestamp), "MMM d, h:mm a")}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Reapplication Cooldown */}
          {app.can_reapply_after && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <Clock className="w-4 h-4 text-yellow-600 mt-0.5" />
              <div className="text-sm">
                <span className="font-medium text-yellow-800">Reapplication cooldown</span>
                <span className="text-yellow-700 ml-1">— Can reapply after {format(new Date(app.can_reapply_after), "MMM d, yyyy")}</span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL — Staff Actions */}
        <div className="lg:col-span-4 space-y-4">
          {/* Staff Notes */}
          <Section title="Staff Notes">
            <div className="mt-2 space-y-2">
              <textarea
                value={staffNotes}
                onChange={(e) => setStaffNotes(e.target.value)}
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y"
                placeholder="Add notes about this application..."
              />
              <div className="flex items-center justify-between">
                <button
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  {savingNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Notes
                </button>
                {app.staff_reviewed_at && (
                  <span className="text-xs text-gray-500">
                    Last reviewed {format(new Date(app.staff_reviewed_at), "MMM d, yyyy")}
                  </span>
                )}
              </div>
            </div>
          </Section>

          {/* Tier Override (translator only) */}
          {isTranslator && (
            <Section title="Tier Override">
              <div className="mt-2 space-y-2">
                <select
                  value={tierValue}
                  onChange={(e) => setTierValue(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="">Select tier...</option>
                  <option value="standard">Standard</option>
                  <option value="senior">Senior</option>
                  <option value="expert">Expert</option>
                </select>
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleTierUpdate}
                    disabled={savingTier || !tierValue}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                  >
                    {savingTier ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                    Update Tier
                  </button>
                  {app.tier_override_at && (
                    <span className="text-xs text-gray-500">
                      Overridden {format(new Date(app.tier_override_at), "MMM d, yyyy")}
                    </span>
                  )}
                </div>
              </div>
            </Section>
          )}

          {/* Decision Buttons */}
          <Section title="Decision">
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                onClick={() => handleDecision("approved")}
                disabled={actionLoading !== null}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading === "approved" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Approve
              </button>
              <button
                onClick={() => handleDecision("rejected")}
                disabled={actionLoading !== null}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading === "rejected" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Reject
              </button>
              <button
                onClick={() => handleDecision("waitlisted")}
                disabled={actionLoading !== null}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 border-2 border-cyan-500 text-cyan-700 text-sm font-medium rounded-lg hover:bg-cyan-50 disabled:opacity-50 transition-colors"
              >
                {actionLoading === "waitlisted" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                Waitlist
              </button>
              <button
                onClick={() => handleDecision("info_requested")}
                disabled={actionLoading !== null}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 border-2 border-yellow-500 text-yellow-700 text-sm font-medium rounded-lg hover:bg-yellow-50 disabled:opacity-50 transition-colors"
              >
                {actionLoading === "info_requested" ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                Request Info
              </button>
              <button
                onClick={openRequestDocsModal}
                disabled={actionLoading !== null}
                className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2.5 border-2 border-indigo-500 text-indigo-700 text-sm font-medium rounded-lg hover:bg-indigo-50 disabled:opacity-50 transition-colors"
                title="Draft an email asking the applicant for ISO 17100 documents we still need"
              >
                <FileSearch className="w-4 h-4" />
                Request Documents
              </button>
            </div>
          </Section>

          {/* Request Documents modal */}
          {docsModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Request Documents</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Tick the docs you need; the email body updates automatically.
                    </p>
                  </div>
                  <button onClick={() => setDocsModalOpen(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-md">
                    <XIcon className="w-5 h-5" />
                  </button>
                </div>
                <div className="px-6 py-4 overflow-y-auto space-y-4 flex-1">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-gray-700">ISO 17100 competence file</p>
                      <p className="text-[11px] text-gray-500">
                        Tick what the applicant still owes you. Email body updates live.
                      </p>
                    </div>
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800 mb-3 space-y-1">
                      <div><strong>References</strong> &mdash; not in this list. Use the dedicated <em>Request References</em> button so each contact submits via the structured rubric form (more reliable than collecting reference letters).</div>
                      <div><strong>NDA</strong> &mdash; handled by the in-portal clickwrap once the applicant is approved. Don't request a separate signed PDF unless they can't access the portal.</div>
                    </div>
                    <div className="space-y-3">
                      {ISO_DOC_GROUPS.map((g) => {
                        const groupItems = ISO_DOC_TYPES.filter((d) => d.group === g.key);
                        if (groupItems.length === 0) return null;
                        return (
                          <div key={g.key}>
                            <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">{g.label}</p>
                            <div className="space-y-1">
                              {groupItems.map((dt) => (
                                <label key={`${g.key}-${dt.slug}-${dt.label}`} className="flex items-start gap-2 text-xs p-2 rounded hover:bg-gray-50 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selectedDocTypes.includes(dt.slug)}
                                    onChange={() => toggleDocType(dt.slug)}
                                    className="mt-0.5"
                                  />
                                  <span>
                                    <span className="font-medium text-gray-900">{dt.label}</span>
                                    <span className="block text-gray-500">{dt.rationale}</span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
                    <input
                      type="text"
                      value={docsSubject}
                      onChange={(e) => setDocsSubject(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Email body (HTML)</label>
                    <textarea
                      value={docsBody}
                      onChange={(e) => setDocsBody(e.target.value)}
                      rows={12}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-100">
                  <button
                    onClick={() => setDocsModalOpen(false)}
                    disabled={sendingDocs}
                    className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendDocsRequest}
                    disabled={sendingDocs || selectedDocTypes.length === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {sendingDocs && <Loader2 className="w-4 h-4 animate-spin" />}
                    Send request
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Rejection Email Editor (conditional) */}
          {(app.rejection_email_status === "queued" || app.rejection_email_status === "intercepted") && (
            <Section title="Rejection Email">
              <div className="mt-2 space-y-3">
                {app.rejection_email_status === "intercepted" && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                    <Ban className="w-4 h-4" /> Email has been intercepted — it will not be sent.
                  </div>
                )}
                {app.rejection_email_status === "queued" && rejectionWindowHours !== null && (
                  <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                    <Clock className="w-4 h-4" />
                    {rejectionWindowHours > 0
                      ? `Auto-sends in ${rejectionWindowHours}h — intercept to stop`
                      : "Window expired — email may have been sent"
                    }
                  </div>
                )}
                <textarea
                  value={rejectionDraft}
                  onChange={(e) => setRejectionDraft(e.target.value)}
                  rows={6}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y"
                  placeholder="Rejection email draft..."
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveDraft}
                    disabled={savingDraft}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save Draft
                  </button>
                  {app.rejection_email_status === "queued" && (
                    <button
                      onClick={handleIntercept}
                      disabled={actionLoading === "intercept"}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === "intercept" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                      Intercept
                    </button>
                  )}
                </div>
              </div>
            </Section>
          )}

          {/* Waitlist Details (conditional) */}
          {app.status === "waitlisted" && (
            <Section title="Waitlist Details">
              <dl className="space-y-1 mt-2">
                <InfoRow label="Language Pair" value={app.waitlist_language_pair} />
                <InfoRow label="Notes" value={app.waitlist_notes} />
              </dl>
            </Section>
          )}

          {/* Conversation — outbound + inbound interleaved. Always available so
              staff can message the applicant even before any reply exists. */}
          {id && (
            <Section title={`Conversation (${conversation.length})`}>
              <div className="mt-2 mb-3 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  Emails send from <span className="font-mono">vm@cethos.com</span>; replies come back
                  here automatically.
                </p>
                <button
                  type="button"
                  onClick={() => setComposeNew(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md whitespace-nowrap"
                >
                  <Mail className="w-3.5 h-3.5" /> Message applicant
                </button>
              </div>
              {conversation.length > 0 ? (
                <ConversationTimeline
                  items={conversation}
                  onReply={(inboundId) => setReplyInboundId(inboundId)}
                  onAcknowledge={async (inboundId) => {
                    try {
                      await supabase
                        .from("cvp_inbound_emails")
                        .update({
                          acknowledged_at: new Date().toISOString(),
                          acknowledged_by: session?.staffId,
                        })
                        .eq("id", inboundId);
                      toast.success("Marked reviewed");
                      await fetchData();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed");
                    }
                  }}
                />
              ) : (
                <p className="text-sm text-gray-400 py-4 text-center">
                  No messages yet. Use “Message applicant” to start the conversation.
                </p>
              )}
            </Section>
          )}

          {/* References (Phase E) */}
          {id && (
            <ReferencesSection
              applicationId={id}
              callEdgeFunction={callEdgeFunction}
              staffId={session?.staffId}
            />
          )}

          {/* Timeline */}
          <Section title="Timeline">
            <div className="space-y-2 mt-2">
              {[
                { label: "Applied", date: app.created_at },
                app.ai_prescreening_at ? { label: `AI Pre-screened (Score: ${app.ai_prescreening_score ?? "?"})`, date: app.ai_prescreening_at } : null,
                app.staff_reviewed_at ? { label: "Staff Reviewed", date: app.staff_reviewed_at } : null,
                app.rejection_email_queued_at ? { label: "Rejection Queued", date: app.rejection_email_queued_at } : null,
                app.tier_override_at ? { label: `Tier → ${TIER_LABELS[app.assigned_tier || ""] || app.assigned_tier}`, date: app.tier_override_at } : null,
                app.updated_at !== app.created_at ? { label: "Last Updated", date: app.updated_at } : null,
              ]
                .filter((e): e is { label: string; date: string } => e !== null)
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((ev, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm border-l-2 border-gray-200 pl-3 py-1">
                    <span className="text-gray-500 text-xs whitespace-nowrap">{format(new Date(ev.date), "MMM d, yyyy")}</span>
                    <span className="text-gray-700">{ev.label}</span>
                  </div>
                ))}
            </div>
          </Section>
        </div>
      </div>

      {decisionModal && (
        <DecisionModal
          decision={decisionModal}
          onClose={() => setDecisionModal(null)}
          onPreview={(notes, approvalOpts) => previewDecision(decisionModal, notes, approvalOpts)}
          onSend={(args) => sendDecision(decisionModal, args)}
          busy={actionLoading === decisionModal}
          initialNotes={
            decisionModal === "info_requested" ? staffNotes : ""
          }
          approvalContext={
            decisionModal === "approved"
              ? { combinations, languages }
              : undefined
          }
          isAgency={
            app?.role_type === "agency" ||
            (app as { applicant_type?: string } | null)?.applicant_type === "agency"
          }
        />
      )}

      {(replyInboundId || composeNew) && id && (
        <StaffReplyModal
          applicationId={id}
          inboundEmailId={replyInboundId}
          onClose={() => {
            setReplyInboundId(null);
            setComposeNew(false);
          }}
          onSent={fetchData}
          callEdgeFunction={callEdgeFunction}
          staffId={session?.staffId}
        />
      )}
    </div>
  );
}
