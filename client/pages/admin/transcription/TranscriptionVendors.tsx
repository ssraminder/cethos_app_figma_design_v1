import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Users,
  Search,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Eye,
  UserPlus,
  Loader2,
  X,
  ChevronRight,
  Star,
  Globe,
  ArrowRight,
  FileText,
  Zap,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

interface ReviewJob {
  id: string;
  customer_email: string;
  file_name: string;
  file_duration_seconds: number;
  detected_language: string | null;
  ai_quality_score: string | null;
  transcript_text: string | null;
  human_review_requested: boolean;
  human_review_tier: string | null;
  human_review_vendor_id: string | null;
  human_review_completed_at: string | null;
  human_reviewed_text: string | null;
  status: string;
  pricing_tier: string;
  amount_charged: number;
  created_at: string;
  word_count: number | null;
}

interface Vendor {
  id: string;
  full_name: string;
  email: string;
  status: string;
  source_languages: string[] | null;
  target_languages: string[] | null;
  specializations: string[] | null;
  availability_status: string;
  rating: number | null;
  total_projects: number;
}

interface ReviewStats {
  pending: number;
  assigned: number;
  completed: number;
  total: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const QUALITY_COLORS: Record<string, string> = {
  A: "text-green-700 bg-green-50",
  B: "text-blue-700 bg-blue-50",
  C: "text-yellow-700 bg-yellow-50",
  D: "text-red-700 bg-red-50",
};

const TIER_BADGE: Record<string, { label: string; color: string }> = {
  standard: { label: "Standard", color: "bg-blue-50 text-blue-700 border-blue-200" },
  rush: { label: "Rush", color: "bg-orange-50 text-orange-700 border-orange-200" },
};

type TabKey = "queue" | "assigned" | "completed";

// ── Main Component ──────────────────────────────────────────────────────────

export default function TranscriptionVendors() {
  const [jobs, setJobs] = useState<ReviewJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReviewStats>({ pending: 0, assigned: 0, completed: 0, total: 0 });
  const [tab, setTab] = useState<TabKey>("queue");
  const [assignModal, setAssignModal] = useState<ReviewJob | null>(null);
  const [reviewModal, setReviewModal] = useState<ReviewJob | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("transcription_jobs")
        .select("id, customer_email, file_name, file_duration_seconds, detected_language, ai_quality_score, transcript_text, human_review_requested, human_review_tier, human_review_vendor_id, human_review_completed_at, human_reviewed_text, status, pricing_tier, amount_charged, created_at, word_count")
        .eq("human_review_requested", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const rows = (data ?? []) as ReviewJob[];
      setJobs(rows);

      setStats({
        pending: rows.filter((j) => !j.human_review_vendor_id && !j.human_review_completed_at).length,
        assigned: rows.filter((j) => j.human_review_vendor_id && !j.human_review_completed_at).length,
        completed: rows.filter((j) => !!j.human_review_completed_at).length,
        total: rows.length,
      });
    } catch (e) {
      toast.error("Failed to load review queue");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const filtered = jobs.filter((j) => {
    if (tab === "queue") return !j.human_review_vendor_id && !j.human_review_completed_at;
    if (tab === "assigned") return !!j.human_review_vendor_id && !j.human_review_completed_at;
    if (tab === "completed") return !!j.human_review_completed_at;
    return true;
  });

  const markCompleted = async (job: ReviewJob, reviewedText: string) => {
    try {
      const { error } = await supabase
        .from("transcription_jobs")
        .update({
          human_reviewed_text: reviewedText,
          human_review_completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (error) throw error;
      toast.success("Review marked as completed");
      setReviewModal(null);
      fetchJobs();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to complete review");
    }
  };

  const unassignVendor = async (jobId: string) => {
    try {
      const { error } = await supabase
        .from("transcription_jobs")
        .update({ human_review_vendor_id: null })
        .eq("id", jobId);

      if (error) throw error;
      toast.success("Vendor unassigned");
      fetchJobs();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to unassign");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Human Review Queue</h1>
              <p className="text-sm text-gray-500 mt-1">Manage transcription vendor assignments and reviews</p>
            </div>
            <button
              onClick={fetchJobs}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatCard label="Pending Assignment" value={stats.pending} icon={Clock} color="yellow" />
          <StatCard label="In Review" value={stats.assigned} icon={Users} color="blue" />
          <StatCard label="Completed" value={stats.completed} icon={CheckCircle} color="green" />
          <StatCard label="Total Requests" value={stats.total} icon={FileText} color="gray" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-white rounded-lg border border-gray-200 p-1 w-fit">
          {([
            { key: "queue" as TabKey, label: "Queue", count: stats.pending },
            { key: "assigned" as TabKey, label: "In Review", count: stats.assigned },
            { key: "completed" as TabKey, label: "Completed", count: stats.completed },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                tab === t.key
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                  tab === t.key ? "bg-teal-500 text-white" : "bg-gray-200 text-gray-600"
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>{tab === "queue" ? "No jobs waiting for assignment" : tab === "assigned" ? "No reviews in progress" : "No completed reviews"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">File</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Duration</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Language</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Quality</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Review Tier</th>
                    {tab !== "queue" && (
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Vendor</th>
                    )}
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((job) => {
                    const tierBadge = TIER_BADGE[job.human_review_tier ?? "standard"] ?? TIER_BADGE.standard;
                    return (
                      <tr key={job.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="text-gray-900 truncate max-w-[180px] block">{job.customer_email}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-gray-700 truncate max-w-[150px] block" title={job.file_name}>
                            {job.file_name}
                          </span>
                          <span className="text-xs text-gray-400">{job.word_count ?? "—"} words</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{formatDuration(job.file_duration_seconds)}</td>
                        <td className="px-4 py-3 text-gray-700 capitalize text-xs">
                          {job.detected_language ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {job.ai_quality_score ? (
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${QUALITY_COLORS[job.ai_quality_score] ?? ""}`}>
                              {job.ai_quality_score}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${tierBadge.color}`}>
                            {job.human_review_tier === "rush" && <Zap className="w-3 h-3" />}
                            {tierBadge.label}
                          </span>
                        </td>
                        {tab !== "queue" && (
                          <td className="px-4 py-3">
                            <VendorName vendorId={job.human_review_vendor_id} />
                          </td>
                        )}
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {format(new Date(job.created_at), "MMM d, HH:mm")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {tab === "queue" && (
                              <button
                                onClick={() => setAssignModal(job)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                                Assign
                              </button>
                            )}
                            {tab === "assigned" && (
                              <>
                                <button
                                  onClick={() => setReviewModal(job)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-teal-700 hover:bg-teal-50 rounded"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  Complete
                                </button>
                                <button
                                  onClick={() => unassignVendor(job.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {tab === "completed" && (
                              <button
                                onClick={() => setReviewModal(job)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-teal-700 hover:bg-teal-50 rounded"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                View
                              </button>
                            )}
                            <Link
                              to={`/admin/transcription/${job.id}`}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Assign Vendor Modal */}
      {assignModal && (
        <AssignVendorModal
          job={assignModal}
          onClose={() => setAssignModal(null)}
          onAssigned={() => {
            setAssignModal(null);
            fetchJobs();
          }}
        />
      )}

      {/* Review Modal */}
      {reviewModal && (
        <ReviewModal
          job={reviewModal}
          onClose={() => setReviewModal(null)}
          onComplete={markCompleted}
        />
      )}
    </div>
  );
}

// ── Vendor Name Component (async lookup) ────────────────────────────────────

function VendorName({ vendorId }: { vendorId: string | null }) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!vendorId) return;
    supabase
      .from("vendors")
      .select("full_name")
      .eq("id", vendorId)
      .maybeSingle()
      .then(({ data }) => setName(data?.full_name ?? null));
  }, [vendorId]);

  if (!vendorId) return <span className="text-gray-300">—</span>;
  return <span className="text-gray-800 text-xs">{name ?? "Loading..."}</span>;
}

// ── Assign Vendor Modal ─────────────────────────────────────────────────────

function AssignVendorModal({
  job,
  onClose,
  onAssigned,
}: {
  job: ReviewJob;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("vendors")
        .select("id, full_name, email, status, source_languages, target_languages, specializations, availability_status, rating, total_projects")
        .eq("status", "active")
        .order("rating", { ascending: false, nullsFirst: false });

      if (!error) setVendors((data ?? []) as Vendor[]);
      setLoading(false);
    })();
  }, []);

  const filtered = vendors.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      v.full_name.toLowerCase().includes(q) ||
      v.email.toLowerCase().includes(q) ||
      (v.source_languages ?? []).some((l) => l.toLowerCase().includes(q)) ||
      (v.target_languages ?? []).some((l) => l.toLowerCase().includes(q))
    );
  });

  const assign = async (vendorId: string) => {
    setAssigning(vendorId);
    try {
      const { error } = await supabase
        .from("transcription_jobs")
        .update({ human_review_vendor_id: vendorId })
        .eq("id", job.id);

      if (error) throw error;
      toast.success("Vendor assigned to review");
      onAssigned();
    } catch (e: any) {
      toast.error(e.message ?? "Assignment failed");
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Assign Vendor</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {job.file_name} · {job.detected_language ?? "Unknown language"} · {job.word_count ?? 0} words
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search vendors by name, email, or language..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              autoFocus
            />
          </div>
        </div>

        {/* Vendor List */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-12">No matching vendors found</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-teal-300 hover:bg-teal-50/30 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{v.full_name}</p>
                      <AvailabilityDot status={v.availability_status} />
                      {v.rating && (
                        <span className="flex items-center gap-0.5 text-xs text-yellow-600">
                          <Star className="w-3 h-3 fill-current" />
                          {v.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{v.email}</p>
                    <div className="flex items-center gap-3 mt-1">
                      {v.source_languages && v.source_languages.length > 0 && (
                        <span className="text-xs text-gray-400">
                          <Globe className="w-3 h-3 inline mr-0.5" />
                          {v.source_languages.slice(0, 3).join(", ")}
                          {v.source_languages.length > 3 && ` +${v.source_languages.length - 3}`}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{v.total_projects} projects</span>
                    </div>
                  </div>
                  <button
                    onClick={() => assign(v.id)}
                    disabled={assigning === v.id}
                    className="ml-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50"
                  >
                    {assigning === v.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowRight className="w-3.5 h-3.5" />
                    )}
                    Assign
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <p className="text-xs text-gray-500">
            {filtered.length} vendor{filtered.length !== 1 ? "s" : ""} available · Showing active vendors only
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Review Modal ────────────────────────────────────────────────────────────

function ReviewModal({
  job,
  onClose,
  onComplete,
}: {
  job: ReviewJob;
  onClose: () => void;
  onComplete: (job: ReviewJob, reviewedText: string) => void;
}) {
  const [reviewedText, setReviewedText] = useState(job.human_reviewed_text ?? job.transcript_text ?? "");
  const isCompleted = !!job.human_review_completed_at;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isCompleted ? "Review Details" : "Complete Review"}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {job.file_name} · {job.detected_language ?? "Unknown"} · {job.word_count ?? 0} words
              {job.human_review_completed_at && (
                <span className="ml-2 text-green-600">
                  Completed {format(new Date(job.human_review_completed_at), "MMM d, yyyy HH:mm")}
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Original */}
          <div className="flex-1 border-r border-gray-200 flex flex-col">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">AI Transcript</span>
              {job.ai_quality_score && (
                <span className={`ml-auto px-2 py-0.5 rounded text-xs font-bold ${QUALITY_COLORS[job.ai_quality_score] ?? ""}`}>
                  {job.ai_quality_score}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed font-sans">
                {job.transcript_text ?? "No transcript available"}
              </pre>
            </div>
          </div>

          {/* Reviewed */}
          <div className="flex-1 flex flex-col">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-teal-500" />
              <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Human-Reviewed</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {isCompleted ? (
                <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed font-sans">
                  {job.human_reviewed_text ?? "—"}
                </pre>
              ) : (
                <textarea
                  value={reviewedText}
                  onChange={(e) => setReviewedText(e.target.value)}
                  className="w-full h-full text-sm text-gray-800 leading-relaxed font-sans resize-none border-0 focus:outline-none focus:ring-0"
                  placeholder="Paste or type the reviewed transcript here..."
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl flex items-center justify-between">
          <p className="text-xs text-gray-500">
            <VendorName vendorId={job.human_review_vendor_id} />
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              {isCompleted ? "Close" : "Cancel"}
            </button>
            {!isCompleted && (
              <button
                onClick={() => onComplete(job, reviewedText)}
                disabled={!reviewedText.trim()}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Mark Complete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared Components ───────────────────────────────────────────────────────

function AvailabilityDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    available: "bg-green-500",
    busy: "bg-yellow-500",
    on_leave: "bg-blue-500",
    unavailable: "bg-gray-400",
  };
  return (
    <div
      className={`w-2 h-2 rounded-full ${colors[status] ?? colors.unavailable}`}
      title={status.replace(/_/g, " ")}
    />
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color = "gray",
}: {
  label: string;
  value: number;
  icon: typeof Clock;
  color?: string;
}) {
  const colors: Record<string, string> = {
    gray: "text-gray-600 bg-gray-50",
    blue: "text-blue-600 bg-blue-50",
    green: "text-green-600 bg-green-50",
    yellow: "text-yellow-600 bg-yellow-50",
    teal: "text-teal-600 bg-teal-50",
  };
  const c = colors[color] ?? colors.gray;
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded ${c}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
