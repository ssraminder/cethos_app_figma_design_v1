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
  RefreshCw,
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
  cv_storage_path: string | null;
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
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">(
    (app.ai_prescreening_result as Record<string, unknown> | null)?.suggested_test_difficulty as
      | "beginner"
      | "intermediate"
      | "advanced"
      | undefined ?? "intermediate",
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [skipNotes, setSkipNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Pending combinations are the only ones eligible for a test send.
  const pending = combinations.filter((c) => c.status === "pending");

  useEffect(() => {
    // Pre-select all pending combinations by default when the panel opens.
    setSelectedIds(new Set(pending.map((c) => c.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Only render the controls when the app is in a state where sending tests
  // makes sense. "prescreened" is the canonical ready-to-test state; also
  // allow staff_review for flexibility.
  const eligibleStatuses = ["prescreened", "staff_review"];
  if (!eligibleStatuses.includes(app.status)) return null;
  if (pending.length === 0) return null;

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleSend = async () => {
    if (selectedIds.size === 0) {
      toast.error("Pick at least one combination to test");
      return;
    }
    setBusy(true);
    try {
      await callEdgeFunction("cvp-send-tests", {
        applicationId: app.id,
        combinationIds: Array.from(selectedIds),
        difficulty,
        staffId,
      });
      toast.success(
        `V3 test invitation sent — ${selectedIds.size} combination${selectedIds.size === 1 ? "" : "s"} assigned at ${difficulty} difficulty`,
      );
      setOpen(false);
      await onAfterAction();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSkipToApprove = async () => {
    if (skipNotes.trim().length < 10) {
      toast.error("Explain why you're skipping testing (min 10 chars)");
      return;
    }
    setBusy(true);
    try {
      await callEdgeFunction("cvp-approve-application", {
        applicationId: app.id,
        staffId,
        staffNotes: `[TESTING SKIPPED] ${skipNotes.trim()}`,
      });
      toast.success("Application approved without testing — V11 welcome sent");
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

      {mode === "send" && (
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
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Combinations to test ({selectedIds.size}/{pending.length})
            </label>
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
              onClick={handleSend}
              disabled={busy || selectedIds.size === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Send V3 ({selectedIds.size} combo{selectedIds.size === 1 ? "" : "s"}, {difficulty})
            </button>
          </div>
        </>
      )}

      {mode === "skip" && (
        <>
          <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-900">
            <strong>No test will be sent.</strong> Application goes straight to approved, V11 welcome email fires with the password-setup link, and all pending combinations are approved at their default rates. Use this for senior applicants where the CV + references are enough.
          </div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Why are you skipping testing? (captured in cvp_application_decisions; AI may use the first line in the welcome email)
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
              disabled={busy || skipNotes.trim().length < 10}
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
  inboundEmailId: string;
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
        inboundEmailId,
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
        inboundEmailId,
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
        inboundEmailId,
        body: bodyDraft,
        editedSubject: subject,
        staffId,
      });
      toast.success("Reply sent");
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
            Reply to applicant
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
                placeholder="Type your reply, or click 'Draft with AI' above to generate one."
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
              <strong>Subject:</strong> {subject || "Re: Your message"}
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
                  {busy === "send" ? "Sending…" : "Send reply"}
                </button>
              </div>
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

interface DecisionModalProps {
  decision: DecisionType;
  onClose: () => void;
  /** Preview: runs AI + renders email without sending. */
  onPreview: (notes: string) => Promise<DecisionPreview>;
  /** Send: uses edited subject/body if provided, else AI output. */
  onSend: (args: { notes: string; editedSubject: string; editedContent: string }) => Promise<void>;
  busy: boolean;
  initialNotes?: string;
}

function DecisionModal({
  decision,
  onClose,
  onPreview,
  onSend,
  busy,
  initialNotes,
}: DecisionModalProps) {
  const cfg = DECISION_CONFIGS[decision];
  const [step, setStep] = useState<"notes" | "preview">("notes");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [preview, setPreview] = useState<DecisionPreview | null>(null);
  const [editedSubject, setEditedSubject] = useState("");
  const [editedContent, setEditedContent] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const tooShort = notes.trim().length < cfg.minLength;

  const handleGoToPreview = async () => {
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const p = await onPreview(notes.trim());
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
      const p = await onPreview(notes.trim());
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

        {step === "notes" && (
          <>
            <p className="text-sm text-gray-600 mb-3">{cfg.intro}</p>
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

  const callEdgeFunction = async (fnSlug: string, body: Record<string, unknown>) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://lmzoyezvsjgsxveoakdr.supabase.co";
    const resp = await fetch(`${supabaseUrl}/functions/v1/${fnSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await resp.json();
    if (!resp.ok || json?.success === false) {
      throw new Error(json?.error || `HTTP ${resp.status}`);
    }
    return json;
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
  ): Promise<DecisionPreview> => {
    if (!id) throw new Error("No application ID");
    const res = await callEdgeFunction(fnSlug[decision], {
      applicationId: id,
      staffId: session?.staffId,
      staffNotes: notes,
      dryRun: true,
    });
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
    args: { notes: string; editedSubject: string; editedContent: string },
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

          {/* CV / Resume — preview + download */}
          <Section title="Resume / CV">
            <CvSection applicationId={app.id} cvStoragePath={app.cv_storage_path} callEdgeFunction={callEdgeFunction} />
          </Section>

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
                  if (app.status === "rejected" || app.status === "approved" || app.status === "prescreened") return null;
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

                {/* AI-recommended rejection callout — visible when AI says reject
                    but staff hasn't decided yet. Clicking Approve runs the same
                    rejection flow as the right-panel Reject button (queues V12
                    inside 48hr intercept). AI never auto-emails on rejection. */}
                {(() => {
                  const r = aiResult as Record<string, unknown>;
                  if (r.recommendation !== "reject") return null;
                  if (app.status === "rejected") return null;
                  if (app.status === "approved") return null;
                  return (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-red-800">AI recommends rejection</p>
                          <p className="text-xs text-red-700 mt-1">
                            {r.notes ? String(r.notes) : "Score below the auto-advance threshold."}
                            {" "}
                            No email is sent until you approve below.
                          </p>
                          <div className="flex gap-2 mt-3">
                            <button
                              type="button"
                              disabled={actionLoading === "rejected"}
                              onClick={() => handleDecision("rejected")}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium rounded-md"
                            >
                              {actionLoading === "rejected" ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Ban className="w-3.5 h-3.5" />
                              )}
                              Approve rejection (queues 48h intercept)
                            </button>
                            <button
                              type="button"
                              disabled={actionLoading === "info_requested"}
                              onClick={() => handleDecision("info_requested")}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 text-xs font-medium rounded-md"
                            >
                              Request more info instead
                            </button>
                          </div>
                        </div>
                      </div>
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

          {/* Conversation — outbound + inbound interleaved */}
          {conversation.length > 0 && (
            <Section title={`Conversation (${conversation.length})`}>
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

      {decisionModal && (
        <DecisionModal
          decision={decisionModal}
          onClose={() => setDecisionModal(null)}
          onPreview={(notes) => previewDecision(decisionModal, notes)}
          onSend={(args) => sendDecision(decisionModal, args)}
          busy={actionLoading === decisionModal}
          initialNotes={
            decisionModal === "info_requested" ? staffNotes : ""
          }
        />
      )}

      {replyInboundId && id && (
        <StaffReplyModal
          applicationId={id}
          inboundEmailId={replyInboundId}
          onClose={() => setReplyInboundId(null)}
          onSent={fetchData}
          callEdgeFunction={callEdgeFunction}
          staffId={session?.staffId}
        />
      )}
    </div>
  );
}
