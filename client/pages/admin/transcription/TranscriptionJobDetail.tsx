import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeft,
  Play,
  FileText,
  Clock,
  Globe,
  DollarSign,
  CheckCircle,
  XCircle,
  RefreshCw,
  Download,
  Languages,
  Shield,
  User,
  Loader2,
} from "lucide-react";

interface Job {
  id: string;
  customer_email: string;
  file_name: string;
  file_path: string;
  file_duration_seconds: number;
  file_size_bytes: number;
  file_format: string;
  status: string;
  provider: string | null;
  provider_job_id: string | null;
  provider_cost: number | null;
  detected_language: string | null;
  language_confidence: number | null;
  transcript_text: string | null;
  transcript_json: Record<string, unknown> | null;
  word_count: number | null;
  ai_quality_score: string | null;
  ai_quality_notes: string | null;
  pricing_tier: string;
  amount_charged: number;
  currency: string;
  payment_status: string;
  stripe_session_id: string | null;
  human_review_requested: boolean;
  translation_requested: boolean;
  translation_type: string | null;
  translated_text: string | null;
  delivery_formats: string[];
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  source_language_id: string | null;
  translation_target_language_id: string | null;
}

interface AuditEntry {
  id: string;
  action: string;
  actor_type: string;
  actor_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const QUALITY_LABELS: Record<string, { label: string; color: string }> = {
  A: { label: "High Quality", color: "text-green-700 bg-green-50 border-green-200" },
  B: { label: "Good Quality", color: "text-blue-700 bg-blue-50 border-blue-200" },
  C: { label: "Acceptable", color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
  D: { label: "Review Recommended", color: "text-red-700 bg-red-50 border-red-200" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function TranscriptionJobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reprocessing, setReprocessing] = useState(false);
  const [tab, setTab] = useState<"transcript" | "translation" | "audit">("transcript");

  useEffect(() => {
    if (!id) return;
    fetchJob();
    fetchAudit();
  }, [id]);

  const fetchJob = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("transcription_jobs")
      .select("*")
      .eq("id", id!)
      .maybeSingle();

    if (error || !data) {
      toast.error("Job not found");
      navigate("/admin/transcription");
      return;
    }
    setJob(data as Job);
    setLoading(false);
  };

  const fetchAudit = async () => {
    const { data } = await supabase
      .from("transcription_audit_log")
      .select("*")
      .eq("job_id", id!)
      .order("created_at", { ascending: false });
    setAudit((data ?? []) as AuditEntry[]);
  };

  const reprocess = async () => {
    if (!job) return;
    setReprocessing(true);
    try {
      const { error } = await supabase.functions.invoke("transcription-process", {
        body: { job_id: job.id },
      });
      if (error) throw error;
      toast.success("Reprocessing triggered");
      setTimeout(fetchJob, 3000);
    } catch (e) {
      toast.error("Failed to trigger reprocessing");
    } finally {
      setReprocessing(false);
    }
  };

  if (loading || !job) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
      </div>
    );
  }

  const quality = QUALITY_LABELS[job.ai_quality_score ?? ""] ?? null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={() => navigate("/admin/transcription")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Jobs
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{job.file_name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{job.customer_email}</p>
            </div>
            <div className="flex items-center gap-3">
              {(job.status === "failed" || job.status === "pending") && (
                <button
                  onClick={reprocess}
                  disabled={reprocessing}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
                >
                  {reprocessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Reprocess
                </button>
              )}
              <span className={`px-3 py-1 rounded-full text-sm font-medium border ${
                job.status === "completed" ? "bg-green-50 text-green-700 border-green-200" :
                job.status === "failed" ? "bg-red-50 text-red-700 border-red-200" :
                job.status === "processing" ? "bg-blue-50 text-blue-700 border-blue-200" :
                "bg-gray-50 text-gray-600 border-gray-200"
              }`}>
                {job.status}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Info cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <InfoCard icon={Clock} label="Duration" value={formatDuration(job.file_duration_seconds)} sub={`${formatBytes(job.file_size_bytes)} · ${job.file_format.toUpperCase()}`} />
          <InfoCard icon={Globe} label="Language" value={job.detected_language ? job.detected_language.charAt(0).toUpperCase() + job.detected_language.slice(1) : "Detecting..."} sub={job.language_confidence ? `Confidence: ${(job.language_confidence * 100).toFixed(0)}%` : undefined} />
          <InfoCard icon={DollarSign} label="Charged" value={job.amount_charged > 0 ? `$${job.amount_charged.toFixed(2)} ${job.currency}` : "Free"} sub={`Tier: ${job.pricing_tier} · Payment: ${job.payment_status}`} />
          <InfoCard icon={Shield} label="Provider" value={job.provider ?? "—"} sub={job.provider_cost ? `Cost: $${job.provider_cost.toFixed(4)}` : undefined} />
        </div>

        {/* Quality + meta row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quality && (
            <div className={`rounded-lg border p-4 ${quality.color}`}>
              <p className="text-xs font-medium uppercase tracking-wide mb-1">AI Quality Score</p>
              <p className="text-2xl font-bold">{job.ai_quality_score} — {quality.label}</p>
              {job.ai_quality_notes && <p className="text-sm mt-2 opacity-80">{job.ai_quality_notes}</p>}
            </div>
          )}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Details</p>
            <div className="space-y-1 text-sm text-gray-700">
              <p>Words: <strong>{job.word_count ?? "—"}</strong></p>
              <p>Formats: <strong>{(job.delivery_formats ?? []).map(f => f.toUpperCase()).join(", ")}</strong></p>
              <p>Created: <strong>{format(new Date(job.created_at), "MMM d, yyyy HH:mm")}</strong></p>
              {job.delivered_at && <p>Delivered: <strong>{format(new Date(job.delivered_at), "MMM d, yyyy HH:mm")}</strong></p>}
              {job.expires_at && <p>Expires: <strong>{format(new Date(job.expires_at), "MMM d, yyyy")}</strong></p>}
            </div>
          </div>
          {job.translation_requested && (
            <div className="bg-purple-50 rounded-lg border border-purple-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Languages className="w-4 h-4 text-purple-600" />
                <p className="text-xs text-purple-700 font-medium uppercase tracking-wide">Translation</p>
              </div>
              <p className="text-sm text-purple-800">Type: <strong>{job.translation_type ?? "—"}</strong></p>
              <p className="text-sm text-purple-800 mt-1">
                {job.translated_text ? "Translation complete" : "Translation pending..."}
              </p>
            </div>
          )}
        </div>

        {/* Downloads */}
        {job.status === "completed" && (job.delivery_formats ?? []).length > 0 && (
          <DownloadSection jobId={job.id} formats={job.delivery_formats} />
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="border-b border-gray-200 flex">
            {(["transcript", ...(job.translation_requested ? ["translation"] : []), "audit"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t as typeof tab)}
                className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t
                    ? "border-teal-600 text-teal-700"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t === "transcript" ? "Transcript" : t === "translation" ? "Translation" : "Audit Log"}
              </button>
            ))}
          </div>

          <div className="p-6">
            {tab === "transcript" && (
              <div>
                {job.transcript_text ? (
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed font-sans max-h-[600px] overflow-y-auto">
                    {job.transcript_text}
                  </pre>
                ) : (
                  <p className="text-gray-400 text-center py-8">
                    {job.status === "processing" ? "Transcription in progress..." : "No transcript available"}
                  </p>
                )}
              </div>
            )}

            {tab === "translation" && (
              <div>
                {job.translated_text ? (
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed font-sans max-h-[600px] overflow-y-auto">
                    {job.translated_text}
                  </pre>
                ) : (
                  <p className="text-gray-400 text-center py-8">Translation not yet available</p>
                )}
              </div>
            )}

            {tab === "audit" && (
              <div className="space-y-3">
                {audit.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No audit entries</p>
                ) : (
                  audit.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-teal-400 mt-1.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-gray-900 font-medium">{entry.action.replace(/_/g, " ")}</p>
                        <p className="text-gray-500 text-xs">
                          {entry.actor_type}{entry.actor_id ? ` · ${entry.actor_id}` : ""} · {format(new Date(entry.created_at), "MMM d, HH:mm:ss")}
                        </p>
                        {entry.details && (
                          <pre className="text-xs text-gray-400 mt-1 bg-gray-50 rounded p-2 overflow-x-auto">
                            {JSON.stringify(entry.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function DownloadSection({ jobId, formats }: { jobId: string; formats: string[] }) {
  const [links, setLinks] = useState<Array<{ format: string; url: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchLinks() {
      setLoading(true);
      const results: Array<{ format: string; url: string }> = [];

      for (const fmt of formats) {
        const path = `${jobId}/output/transcript.${fmt}`;
        const { data, error } = await supabase.storage
          .from("transcription-uploads")
          .createSignedUrl(path, 60 * 60); // 1 hour

        if (!error && data?.signedUrl) {
          results.push({ format: fmt, url: data.signedUrl });
        }
      }

      if (!cancelled) {
        setLinks(results);
        setLoading(false);
      }
    }

    fetchLinks();
    return () => { cancelled = true; };
  }, [jobId, formats]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading download links...
      </div>
    );
  }

  if (links.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Download className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-700">Download Files</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <a
            key={link.format}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition"
          >
            <Download className="w-3.5 h-3.5" />
            {link.format.toUpperCase()}
          </a>
        ))}
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}
