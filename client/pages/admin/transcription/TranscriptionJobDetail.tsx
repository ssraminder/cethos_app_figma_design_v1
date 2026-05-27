import { useState, useEffect, useMemo } from "react";
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
  Copy,
  ChevronDown,
  Sparkles,
  GitCompare,
  Zap,
  Star,
  ChevronRight,
  FileAudio,
} from "lucide-react";
import { useDropdownOptions } from "@/hooks/useDropdownOptions";

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
  ai_total_cost: number | null;
  source_files: Array<{
    name: string;
    path: string;
    size: number;
    duration: number;
    format: string;
    transcript_text?: string;
  }> | null;
}

interface Version {
  id: string;
  job_id: string;
  version_type: string;
  provider: string | null;
  model: string | null;
  transcript_text: string | null;
  word_count: number | null;
  cost: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
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
  const [versions, setVersions] = useState<Version[]>([]);
  const [reprocessing, setReprocessing] = useState(false);
  const [tab, setTab] = useState<"transcript" | "translation" | "versions" | "audit">("transcript");

  useEffect(() => {
    if (!id) return;
    fetchJob();
    fetchAudit();
    fetchVersions();
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

  const fetchVersions = async () => {
    const { data } = await supabase
      .from("transcription_versions")
      .select("*")
      .eq("job_id", id!)
      .order("created_at", { ascending: false });
    setVersions((data ?? []) as Version[]);
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
          <InfoCard icon={Shield} label="Provider" value={job.provider ?? "—"} sub={`STT: $${(job.provider_cost ?? 0).toFixed(4)} · Total AI: $${(job.ai_total_cost ?? 0).toFixed(4)}`} />
        </div>

        {/* Source files accordion (multi-file jobs) */}
        {job.source_files && job.source_files.length > 1 && (
          <SourceFilesAccordion job={job} />
        )}

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

        {/* Actions: Translate + AI Tools + Downloads */}
        {job.transcript_text && (
          <div className="flex flex-wrap items-start gap-4">
            <TranslateAction job={job} onTranslated={fetchJob} />
            <ProofreadAction job={job} onComplete={() => { fetchJob(); fetchVersions(); }} />
            <ReprocessAction job={job} onComplete={() => { fetchJob(); fetchVersions(); }} />
            {versions.length >= 2 && (
              <CompareAction job={job} versions={versions} onComplete={fetchJob} />
            )}
            {(job.delivery_formats ?? []).length > 0 && (
              <DownloadSection jobId={job.id} formats={job.delivery_formats} />
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="border-b border-gray-200 flex">
            {(["transcript", ...(job.translation_requested ? ["translation"] : []), ...(versions.length > 0 ? ["versions"] : []), "audit"] as const).map((t) => {
              const labels: Record<string, string> = { transcript: "Transcript", translation: "Translation", versions: `Versions (${versions.length})`, audit: "Audit Log" };
              return (
                <button
                  key={t}
                  onClick={() => setTab(t as typeof tab)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    tab === t
                      ? "border-teal-600 text-teal-700"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {labels[t] ?? t}
                </button>
              );
            })}
          </div>

          <div className="p-6">
            {tab === "transcript" && (
              <div>
                {job.transcript_text ? (
                  <SpeakerTranscript job={job} />
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

            {tab === "versions" && (
              <VersionsPanel job={job} versions={versions} onActivated={() => { fetchJob(); fetchVersions(); }} />
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

// ── Translate action ────────────────────────────────────────────────────────

function TranslateAction({ job, onTranslated }: { job: Job; onTranslated: () => void }) {
  const [open, setOpen] = useState(false);
  const [langId, setLangId] = useState(job.translation_target_language_id ?? "");
  const [translating, setTranslating] = useState(false);
  const { targetLanguages } = useDropdownOptions();

  const runTranslation = async () => {
    if (!langId) { toast.error("Select a target language"); return; }
    setTranslating(true);
    try {
      // Set translation fields on the job
      await supabase
        .from("transcription_jobs")
        .update({
          translation_requested: true,
          translation_target_language_id: langId,
          translation_type: "ai_instant",
          translated_text: null,
        })
        .eq("id", job.id);

      const { error } = await supabase.functions.invoke("transcription-ai-translate", {
        body: { job_id: job.id },
      });
      if (error) throw error;

      toast.success("Translation complete");

      // Re-generate deliverables with translation included
      supabase.functions.invoke("transcription-deliver", {
        body: { job_id: job.id },
      }).catch(() => {});

      onTranslated();
    } catch (e: any) {
      toast.error(e.message ?? "Translation failed");
    } finally {
      setTranslating(false);
      setOpen(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex-1 min-w-[280px]">
      <div className="flex items-center gap-2 mb-3">
        <Languages className="w-4 h-4 text-purple-500" />
        <span className="text-sm font-medium text-gray-700">Translate</span>
        {job.translated_text && (
          <span className="ml-auto text-xs text-green-600 font-medium flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Translated
          </span>
        )}
      </div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-50 transition"
        >
          <Languages className="w-3.5 h-3.5" />
          {job.translated_text ? "Re-translate" : "Translate transcript"}
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      ) : (
        <div className="space-y-2">
          <select
            value={langId}
            onChange={(e) => setLangId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">Select target language...</option>
            {targetLanguages.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.name}{lang.native_name && lang.native_name !== lang.name ? ` (${lang.native_name})` : ""}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={runTranslation}
              disabled={!langId || translating}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {translating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
              {translating ? "Translating..." : "Translate"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Speaker-formatted transcript view ──────────────────────────────────────

interface SpeakerSeg {
  speaker: string;
  startMs: number;
  text: string;
}

const SPEAKER_COLORS = [
  { text: "text-blue-700", bg: "bg-blue-50", badge: "bg-blue-100 text-blue-800" },
  { text: "text-emerald-700", bg: "bg-emerald-50", badge: "bg-emerald-100 text-emerald-800" },
  { text: "text-purple-700", bg: "bg-purple-50", badge: "bg-purple-100 text-purple-800" },
  { text: "text-orange-700", bg: "bg-orange-50", badge: "bg-orange-100 text-orange-800" },
  { text: "text-pink-700", bg: "bg-pink-50", badge: "bg-pink-100 text-pink-800" },
  { text: "text-cyan-700", bg: "bg-cyan-50", badge: "bg-cyan-100 text-cyan-800" },
];

function fmtTs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function SpeakerTranscript({ job }: { job: Job }) {
  const segments = useMemo<SpeakerSeg[] | null>(() => {
    const json = job.transcript_json;
    if (!json) return null;

    // AssemblyAI: utterances grouped by speaker
    const utterances = json.utterances as
      | Array<{ text: string; start: number; end: number; speaker: string }>
      | undefined;
    if (utterances?.length && utterances[0]?.speaker != null) {
      return utterances.map((u) => ({
        speaker: `Speaker ${u.speaker}`,
        startMs: u.start,
        text: u.text,
      }));
    }

    // ElevenLabs: words with speaker_id
    // ElevenLabs timestamps are in seconds (e.g., 8.06), not milliseconds
    const words = json.words as
      | Array<{ text: string; start: number; end: number; speaker_id?: string; type?: string }>
      | undefined;
    if (words?.length && words.some((w) => w.speaker_id != null)) {
      const maxTs = Math.max(...words.filter(w => w.type !== "spacing").map(w => w.end));
      const isSeconds = maxTs < 100000;
      const segs: SpeakerSeg[] = [];
      let cur: SpeakerSeg | null = null;
      for (const w of words) {
        if (w.type === "spacing") continue;
        const spk = (w.speaker_id ?? "unknown").replace("speaker_", "Speaker ");
        const startMs = isSeconds ? Math.round(w.start * 1000) : w.start;
        if (!cur || cur.speaker !== spk) {
          if (cur) segs.push(cur);
          cur = { speaker: spk, startMs, text: w.text };
        } else {
          cur.text += " " + w.text;
        }
      }
      if (cur) segs.push(cur);
      return segs.length > 0 ? segs : null;
    }

    // OpenAI: segments with timestamps (no speaker)
    const oaiSegments = json.segments as
      | Array<{ text: string; start: number; end: number }>
      | undefined;
    if (oaiSegments?.length) {
      return oaiSegments.map((s) => ({
        speaker: "",
        startMs: s.start,
        text: s.text,
      }));
    }

    return null;
  }, [job.transcript_json]);

  const speakerColorMap = useMemo(() => {
    const map = new Map<string, (typeof SPEAKER_COLORS)[0]>();
    if (!segments) return map;
    let idx = 0;
    for (const seg of segments) {
      if (seg.speaker && !map.has(seg.speaker)) {
        map.set(seg.speaker, SPEAKER_COLORS[idx % SPEAKER_COLORS.length]);
        idx++;
      }
    }
    return map;
  }, [segments]);

  const hasSpeakers = segments?.some((s) => s.speaker) ?? false;

  const copyAll = () => {
    if (!segments) {
      navigator.clipboard.writeText(job.transcript_text ?? "");
    } else {
      const text = segments
        .map((s) => `${s.speaker ? s.speaker + " " : ""}[${fmtTs(s.startMs)}]\n${s.text}`)
        .join("\n\n");
      navigator.clipboard.writeText(text);
    }
    toast.success("Copied to clipboard");
  };

  // Fallback: no structured data
  if (!segments) {
    return (
      <div>
        <div className="flex justify-end mb-2">
          <button onClick={copyAll} className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded">
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
        </div>
        <pre className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed font-sans max-h-[600px] overflow-y-auto">
          {job.transcript_text}
        </pre>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        {hasSpeakers && (
          <div className="flex items-center gap-2">
            {Array.from(speakerColorMap.entries()).map(([name, color]) => (
              <span key={name} className={`text-xs font-medium px-2 py-0.5 rounded-full ${color.badge}`}>
                {name}
              </span>
            ))}
          </div>
        )}
        <button onClick={copyAll} className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded ml-auto">
          <Copy className="w-3.5 h-3.5" /> Copy
        </button>
      </div>
      <div className="max-h-[600px] overflow-y-auto space-y-4">
        {segments.map((seg, i) => {
          const color = speakerColorMap.get(seg.speaker);
          return (
            <div key={i} className={`rounded-lg p-3 ${color?.bg ?? "bg-gray-50"}`}>
              <div className="flex items-center gap-2 mb-1.5">
                {seg.speaker && (
                  <span className={`text-sm font-semibold ${color?.text ?? "text-gray-700"}`}>{seg.speaker}</span>
                )}
                <span className="text-xs text-gray-400 font-mono">{fmtTs(seg.startMs)}</span>
              </div>
              <p className="text-sm text-gray-800 leading-relaxed">{seg.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── AI Proofread action ──────────────────────────────────────────────────

function ProofreadAction({ job, onComplete }: { job: Job; onComplete: () => void }) {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState("sonnet");
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("transcription-ai-proofread", {
        body: { job_id: job.id, model },
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error);
      toast.success(`Proofread complete (${model}) — cost: $${data?.cost?.toFixed(4) ?? "?"}`);
      onComplete();
    } catch (e: any) {
      toast.error(e.message ?? "Proofread failed");
    } finally {
      setRunning(false);
      setOpen(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 min-w-[220px]">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-medium text-gray-700">AI Proofread</span>
      </div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50 transition"
        >
          <Sparkles className="w-3.5 h-3.5" /> Proofread transcript
        </button>
      ) : (
        <div className="space-y-2">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="haiku">Haiku (fastest, cheapest)</option>
            <option value="sonnet">Sonnet (balanced)</option>
            <option value="opus">Opus (best quality)</option>
          </select>
          <div className="flex gap-2">
            <button
              onClick={run}
              disabled={running}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {running ? "Proofreading..." : "Run"}
            </button>
            <button onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reprocess with provider selection ──────────────────────────────────────

function ReprocessAction({ job, onComplete }: { job: Job; onComplete: () => void }) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState(job.provider ?? "openai");
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      // Reset job status + provider for reprocessing
      await supabase
        .from("transcription_jobs")
        .update({ status: "pending", provider })
        .eq("id", job.id);

      const { data, error } = await supabase.functions.invoke("transcription-process", {
        body: { job_id: job.id },
      });
      if (error) throw error;
      toast.success(`Reprocessed with ${provider} — ${data?.word_count ?? "?"} words`);
      setTimeout(onComplete, 2000);
    } catch (e: any) {
      toast.error(e.message ?? "Reprocess failed");
    } finally {
      setRunning(false);
      setOpen(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 min-w-[220px]">
      <div className="flex items-center gap-2 mb-3">
        <RefreshCw className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-medium text-gray-700">Reprocess</span>
      </div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Reprocess with different provider
        </button>
      ) : (
        <div className="space-y-2">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="openai">OpenAI gpt-4o-transcribe</option>
            <option value="assemblyai">AssemblyAI Universal-2</option>
            <option value="elevenlabs">ElevenLabs Scribe v2</option>
          </select>
          <div className="flex gap-2">
            <button
              onClick={run}
              disabled={running}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {running ? "Processing..." : "Reprocess"}
            </button>
            <button onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AI Compare action ────────────────────────────────────────────────────

function CompareAction({ job, versions, onComplete }: { job: Job; versions: Version[]; onComplete: () => void }) {
  const [open, setOpen] = useState(false);
  const [versionA, setVersionA] = useState("current");
  const [versionB, setVersionB] = useState(versions[0]?.id ?? "");
  const [model, setModel] = useState("sonnet");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("transcription-ai-compare", {
        body: { job_id: job.id, version_a: versionA, version_b: versionB, model },
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error);
      setResult(data?.comparison ?? null);
      toast.success(`Comparison complete — cost: $${data?.cost?.toFixed(4) ?? "?"}`);
      onComplete();
    } catch (e: any) {
      toast.error(e.message ?? "Compare failed");
    } finally {
      setRunning(false);
    }
  };

  const versionOptions = [
    { value: "current", label: "Current (active transcript)" },
    ...versions.map((v) => ({
      value: v.id,
      label: `${v.version_type} — ${v.provider}/${v.model} (${format(new Date(v.created_at), "MMM d HH:mm")})`,
    })),
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 min-w-[280px]">
      <div className="flex items-center gap-2 mb-3">
        <GitCompare className="w-4 h-4 text-indigo-500" />
        <span className="text-sm font-medium text-gray-700">AI Compare</span>
      </div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50 transition"
        >
          <GitCompare className="w-3.5 h-3.5" /> Compare versions
        </button>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Version A</label>
              <select
                value={versionA}
                onChange={(e) => setVersionA(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
              >
                {versionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Version B</label>
              <select
                value={versionB}
                onChange={(e) => setVersionB(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
              >
                {versionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
          >
            <option value="haiku">Haiku (cheapest)</option>
            <option value="sonnet">Sonnet (balanced)</option>
            <option value="opus">Opus (best)</option>
          </select>
          <div className="flex gap-2">
            <button
              onClick={run}
              disabled={running || versionA === versionB}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitCompare className="w-3.5 h-3.5" />}
              {running ? "Comparing..." : "Compare"}
            </button>
            <button onClick={() => { setOpen(false); setResult(null); }} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
              Cancel
            </button>
          </div>
          {result && (
            <div className="mt-3 p-3 bg-indigo-50 rounded-lg text-sm space-y-2 max-h-[400px] overflow-y-auto">
              {(result as any).summary && (
                <p className="font-medium text-indigo-900">{(result as any).summary}</p>
              )}
              {(result as any).recommendation && (
                <p className="text-indigo-700">
                  <strong>Recommendation:</strong> Version {(result as any).recommendation?.toUpperCase()} — {(result as any).recommendation_reason}
                </p>
              )}
              {(result as any).differences && (
                <div className="space-y-1">
                  <p className="font-medium text-indigo-800 text-xs uppercase tracking-wide">Key Differences</p>
                  {((result as any).differences as any[]).map((d: any, i: number) => (
                    <div key={i} className="bg-white rounded p-2 text-xs border border-indigo-100">
                      <p className="text-gray-500 mb-1">{d.location}</p>
                      <p><span className="text-red-600">A:</span> {d.version_a}</p>
                      <p><span className="text-green-600">B:</span> {d.version_b}</p>
                      <p className="text-gray-600 italic mt-1">{d.assessment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Versions panel ────────────────────────────────────────────────────────

function VersionsPanel({ job, versions, onActivated }: { job: Job; versions: Version[]; onActivated: () => void }) {
  const [activating, setActivating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const activateVersion = async (version: Version) => {
    setActivating(version.id);
    try {
      // Update the job's transcript with this version's text
      const { error } = await supabase
        .from("transcription_jobs")
        .update({
          transcript_text: version.transcript_text,
          transcript_json: version.transcript_json ?? null,
          word_count: version.word_count,
        })
        .eq("id", job.id);
      if (error) throw error;

      // Mark all versions inactive, then this one active
      await supabase
        .from("transcription_versions")
        .update({ is_active: false })
        .eq("job_id", job.id);
      await supabase
        .from("transcription_versions")
        .update({ is_active: true })
        .eq("id", version.id);

      toast.success("Version activated — re-delivering...");

      // Re-deliver with updated transcript
      supabase.functions.invoke("transcription-deliver", {
        body: { job_id: job.id },
      }).catch(() => {});

      onActivated();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to activate version");
    } finally {
      setActivating(null);
    }
  };

  if (versions.length === 0) {
    return <p className="text-gray-400 text-center py-8">No versions recorded yet</p>;
  }

  return (
    <div className="space-y-3">
      {versions.map((v) => (
        <div key={v.id} className={`rounded-lg border p-4 ${v.is_active ? "border-teal-300 bg-teal-50/50" : "border-gray-200 bg-white"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                v.version_type === "original" ? "bg-gray-100 text-gray-700" :
                v.version_type === "reprocess" ? "bg-blue-100 text-blue-700" :
                "bg-amber-100 text-amber-700"
              }`}>
                {v.version_type}
              </span>
              <span className="text-sm text-gray-600">
                {v.provider}{v.model ? ` / ${v.model}` : ""}
              </span>
              <span className="text-xs text-gray-400">
                {format(new Date(v.created_at), "MMM d, HH:mm")}
              </span>
              {v.word_count && <span className="text-xs text-gray-400">{v.word_count} words</span>}
              {v.cost != null && v.cost > 0 && <span className="text-xs text-gray-400">${v.cost.toFixed(4)}</span>}
              {v.is_active && (
                <span className="flex items-center gap-1 text-xs text-teal-700 font-medium">
                  <Star className="w-3 h-3 fill-current" /> Active
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              >
                {expanded === v.id ? "Hide" : "Preview"}
              </button>
              {!v.is_active && v.transcript_text && (
                <button
                  onClick={() => activateVersion(v)}
                  disabled={activating === v.id}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
                >
                  {activating === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  Set Active
                </button>
              )}
            </div>
          </div>
          {expanded === v.id && v.transcript_text && (
            <pre className="mt-3 p-3 bg-gray-50 rounded text-xs text-gray-700 max-h-[300px] overflow-y-auto whitespace-pre-wrap font-sans">
              {v.transcript_text.slice(0, 2000)}{v.transcript_text.length > 2000 ? "\n\n[...truncated...]" : ""}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Source files accordion ─────────────────────────────────────────────────

function SourceFilesAccordion({ job }: { job: Job }) {
  const files = job.source_files!;
  const [expanded, setExpanded] = useState<number | null>(null);
  const [fileLinks, setFileLinks] = useState<Record<number, Array<{ label: string; url: string }>>>({});
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null);

  const toggle = async (idx: number) => {
    if (expanded === idx) { setExpanded(null); return; }
    setExpanded(idx);

    if (fileLinks[idx]) return;
    setLoadingIdx(idx);

    const links: Array<{ label: string; url: string }> = [];

    // Source file download
    const { data: srcUrl } = await supabase.storage
      .from("transcription-uploads")
      .createSignedUrl(files[idx].path, 3600);
    if (srcUrl?.signedUrl) {
      links.push({ label: `Source (${files[idx].format.toUpperCase()})`, url: srcUrl.signedUrl });
    }

    // Per-file output downloads
    for (const fmt of (job.delivery_formats ?? [])) {
      const { data: outUrl } = await supabase.storage
        .from("transcription-uploads")
        .createSignedUrl(`${job.id}/output/file-${idx + 1}.${fmt}`, 3600);
      if (outUrl?.signedUrl) {
        links.push({ label: fmt.toUpperCase(), url: outUrl.signedUrl });
      }
    }

    setFileLinks((prev) => ({ ...prev, [idx]: links }));
    setLoadingIdx(null);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <FileAudio className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-700">Source Files ({files.length})</span>
      </div>
      {files.map((sf, i) => (
        <div key={i} className={`border-b border-gray-100 last:border-b-0 ${expanded === i ? "bg-gray-50" : ""}`}>
          <button
            onClick={() => toggle(i)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition"
          >
            <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded === i ? "rotate-90" : ""}`} />
            <span className="flex-1 text-sm font-medium text-gray-800 truncate">{sf.name}</span>
            <span className="text-xs text-gray-500">{formatDuration(sf.duration)}</span>
            <span className="text-xs text-gray-400">{formatBytes(sf.size)}</span>
          </button>
          {expanded === i && (
            <div className="px-4 pb-3 pl-11">
              {loadingIdx === i ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(fileLinks[i] ?? []).map((link) => (
                    <a
                      key={link.label}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 transition"
                    >
                      <Download className="w-3 h-3" /> {link.label}
                    </a>
                  ))}
                  {(fileLinks[i] ?? []).length === 0 && (
                    <span className="text-xs text-gray-400">No downloads available yet</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
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
