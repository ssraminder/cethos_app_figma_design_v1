import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
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
const EDUCATION_LABELS: Record<string, string> = { bachelor: "Bachelor's", master: "Master's", phd: "PhD", diploma_certificate: "Diploma / Certificate", other: "Other" };
const CERT_LABELS: Record<string, string> = { ATA: "ATA", CTTIC: "CTTIC", ITI: "ITI", CIOL: "CIOL", ISO_17100: "ISO 17100" };
const DOMAIN_LABELS: Record<string, string> = { legal: "Legal", medical: "Medical", immigration: "Immigration", financial: "Financial", technical: "Technical", general: "General" };
const SERVICE_LABELS: Record<string, string> = { translation: "Translation", translation_review: "Translation + Review", lqa_review: "LQA Review" };
const COA_LABELS: Record<string, string> = { pro: "PROs", clinro: "ClinROs", obro: "ObsROs", interview_guide: "Interview guides", survey: "Surveys & questionnaires" };
const FAMILIARITY_LABELS: Record<string, string> = { yes: "Yes", no: "No", partially: "Partially" };
const AVAILABILITY_LABELS: Record<string, string> = { full_time: "Full-time", part_time: "Part-time", project_based: "Project-based" };

const COMBO_STATUS_LABELS: Record<string, string> = {
  pending: "Pending", no_test_available: "No Test Available", test_assigned: "Test Assigned",
  test_sent: "Test Sent", test_submitted: "Test Submitted", assessed: "Assessed",
  approved: "Approved", rejected: "Rejected", skipped: "Skipped",
};

const COMBO_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700", no_test_available: "bg-yellow-100 text-yellow-700",
  test_assigned: "bg-blue-100 text-blue-700", test_sent: "bg-blue-100 text-blue-700",
  test_submitted: "bg-indigo-100 text-indigo-700", assessed: "bg-purple-100 text-purple-700",
  approved: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700",
  skipped: "bg-gray-100 text-gray-500",
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
  created_at: string;
}

interface TestSubmission {
  id: string;
  combination_id: string;
  token: string;
  token_expires_at: string;
  status: string;
  submitted_at: string | null;
  ai_assessment_score: number | null;
  first_viewed_at: string | null;
  view_count: number;
  created_at: string;
}

interface Language { id: string; name: string }

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

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="py-1.5">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
    </div>
  );
}

// ---------- Component ----------

export default function RecruitmentDetail() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAdminAuthContext();

  const [app, setApp] = useState<Application | null>(null);
  const [combinations, setCombinations] = useState<TestCombination[]>([]);
  const [submissions, setSubmissions] = useState<TestSubmission[]>([]);
  const [languages, setLanguages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Staff action state
  const [staffNotes, setStaffNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [tierValue, setTierValue] = useState("");
  const [savingTier, setSavingTier] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectionDraft, setRejectionDraft] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);

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
      setSubmissions((subs as TestSubmission[]) || []);

      // Resolve language names
      const langIds = new Set<string>();
      (combos || []).forEach((c: TestCombination) => {
        langIds.add(c.source_language_id);
        langIds.add(c.target_language_id);
      });
      if (langIds.size > 0) {
        const { data: langs } = await supabase
          .from("languages")
          .select("id, name")
          .in("id", Array.from(langIds));
        const map: Record<string, string> = {};
        (langs || []).forEach((l: Language) => { map[l.id] = l.name; });
        setLanguages(map);
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

  const handleDecision = async (decision: "approved" | "rejected" | "waitlisted" | "info_requested") => {
    setActionLoading(decision);
    const updates: Record<string, unknown> = { status: decision };
    if (decision === "rejected") {
      updates.rejection_reason = "Staff decision";
      updates.rejection_email_status = "queued";
      updates.rejection_email_queued_at = new Date().toISOString();
      updates.can_reapply_after = format(addMonths(new Date(), 6), "yyyy-MM-dd");
    }
    await updateApplication(updates, `Application ${decision}`);
    setActionLoading(null);
  };

  const handleIntercept = async () => {
    setActionLoading("intercept");
    await updateApplication({ rejection_email_status: "intercepted" }, "Rejection email intercepted");
    setActionLoading(null);
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
            {isTranslator ? "Translator" : "Cog. Debrief"}
          </span>
          <span>Applied {format(new Date(app.created_at), "MMM d, yyyy")}</span>
          <span>({formatDistanceToNow(new Date(app.created_at), { addSuffix: true })})</span>
        </div>
      </div>

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
                <InfoRow label="ISPOR Familiarity" value={app.cog_ispor_familiarity ? FAMILIARITY_LABELS[app.cog_ispor_familiarity] || app.cog_ispor_familiarity : null} />
                <InfoRow label="FDA COA Familiarity" value={app.cog_fda_familiarity ? FAMILIARITY_LABELS[app.cog_fda_familiarity] || app.cog_fda_familiarity : null} />
                <InfoRow label="Prior Debrief Reports" value={app.cog_prior_debrief_reports ? "Yes" : "No"} />
                <InfoRow label="Availability" value={app.cog_availability ? AVAILABILITY_LABELS[app.cog_availability] || app.cog_availability : null} />
              </dl>
            </Section>
          )}

          {/* Rate & Referral */}
          <Section title="Rate & Referral">
            <dl className="space-y-1 mt-2">
              {isTranslator && <InfoRow label="Expected Rate (per page, CAD)" value={app.rate_expectation ? `$${Number(app.rate_expectation).toFixed(2)}` : null} />}
              {isCog && <InfoRow label="Expected Rate (CAD)" value={app.cog_rate_expectation ? `$${Number(app.cog_rate_expectation).toFixed(2)}` : null} />}
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
          <Section title="AI Pre-screening">
            {!aiResult ? (
              <p className="text-sm text-gray-500 mt-2">No AI pre-screening data available.</p>
            ) : (aiResult as Record<string, unknown>).error === "ai_fallback" ? (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mt-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">AI Pre-screening Failed</p>
                  <p className="text-xs text-amber-600 mt-1">{(aiResult as Record<string, unknown>).reason as string}</p>
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

                {/* Red flags */}
                {Array.isArray((aiResult as Record<string, unknown>).red_flags) && ((aiResult as Record<string, unknown>).red_flags as string[]).length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs font-medium text-red-700 mb-1">Red Flags</p>
                    <ul className="list-disc list-inside text-sm text-red-600 space-y-0.5">
                      {((aiResult as Record<string, unknown>).red_flags as string[]).map((f, i) => <li key={i}>{f}</li>)}
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
              </div>
            )}
          </Section>

          {/* Test Combinations */}
          <Section title={`Test Combinations (${combinations.length})`} defaultOpen={combinations.length > 0}>
            {combinations.length === 0 ? (
              <p className="text-sm text-gray-500 mt-2">No test combinations.</p>
            ) : (
              <div className="space-y-3 mt-2">
                {combinations.map((combo) => {
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
                      {sub && (
                        <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500 space-y-0.5">
                          <div>Token status: <span className="font-medium text-gray-700">{sub.status}</span></div>
                          <div>Expires: {differenceInHours(new Date(sub.token_expires_at), new Date()) > 0
                            ? `${differenceInHours(new Date(sub.token_expires_at), new Date())}h remaining`
                            : "Expired"
                          }</div>
                          <div>Views: {sub.view_count}</div>
                          {sub.submitted_at && <div>Submitted: {format(new Date(sub.submitted_at), "MMM d, yyyy h:mm a")}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

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
            </div>
          </Section>

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
    </div>
  );
}
