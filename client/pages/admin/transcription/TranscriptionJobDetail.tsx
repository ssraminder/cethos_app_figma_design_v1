import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeft,
  FileText,
  Clock,
  Globe,
  DollarSign,
  Shield,
  Loader2,
  Copy,
  ChevronDown,
  Sparkles,
  GitCompare,
  Zap,
  Star,
  ChevronRight,
  FileAudio,
  RefreshCw,
  Languages,
  CheckCircle,
  Download,
  Eye,
  EyeOff,
  Square,
  CheckSquare,
} from "lucide-react";
import { useDropdownOptions } from "@/hooks/useDropdownOptions";

// ── Interfaces ──────────────────────────────────────────────────────────────

interface SourceFile {
  name: string;
  path: string;
  size: number;
  duration: number;
  format: string;
  transcript_text?: string;
  transcript_json?: Record<string, unknown>;
  translated_text?: string;
}

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
  source_files: SourceFile[] | null;
}

interface Version {
  id: string;
  job_id: string;
  version_type: string;
  provider: string | null;
  model: string | null;
  transcript_text: string | null;
  transcript_json: Record<string, unknown> | null;
  word_count: number | null;
  cost: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  file_index: number | null;
}

interface AuditEntry {
  id: string;
  action: string;
  actor_type: string;
  actor_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const QUALITY_LABELS: Record<string, { label: string; color: string }> = {
  A: { label: "High Quality", color: "text-green-700 bg-green-50 border-green-200" },
  B: { label: "Good Quality", color: "text-blue-700 bg-blue-50 border-blue-200" },
  C: { label: "Acceptable", color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
  D: { label: "Review Recommended", color: "text-red-700 bg-red-50 border-red-200" },
};

const FORMAT_BADGE_COLORS: Record<string, string> = {
  mp3: "bg-blue-100 text-blue-700",
  wav: "bg-green-100 text-green-700",
  m4a: "bg-purple-100 text-purple-700",
  mp4: "bg-orange-100 text-orange-700",
  mov: "bg-pink-100 text-pink-700",
  ogg: "bg-gray-100 text-gray-700",
  flac: "bg-teal-100 text-teal-700",
  webm: "bg-red-100 text-red-700",
};

const DOWNLOAD_FORMAT_STYLES: Record<string, string> = {
  txt: "bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200",
  docx: "bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200",
  doc: "bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200",
  pdf: "bg-red-50 text-red-700 hover:bg-red-100 border-red-200",
  srt: "bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border-yellow-200",
  json: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200",
};

const SPEAKER_COLORS = [
  { text: "text-blue-700", bg: "bg-blue-50", badge: "bg-blue-100 text-blue-800" },
  { text: "text-emerald-700", bg: "bg-emerald-50", badge: "bg-emerald-100 text-emerald-800" },
  { text: "text-purple-700", bg: "bg-purple-50", badge: "bg-purple-100 text-purple-800" },
  { text: "text-orange-700", bg: "bg-orange-50", badge: "bg-orange-100 text-orange-800" },
  { text: "text-pink-700", bg: "bg-pink-50", badge: "bg-pink-100 text-pink-800" },
  { text: "text-cyan-700", bg: "bg-cyan-50", badge: "bg-cyan-100 text-cyan-800" },
];

const LANGUAGE_NAMES: Record<string, string> = {
  pan: "Punjabi", pa: "Punjabi",
  hin: "Hindi", hi: "Hindi",
  eng: "English", en: "English",
  fra: "French", fr: "French",
  spa: "Spanish", es: "Spanish",
  deu: "German", de: "German",
  por: "Portuguese", pt: "Portuguese",
  ita: "Italian", it: "Italian",
  ara: "Arabic", ar: "Arabic",
  zho: "Chinese", zh: "Chinese",
  jpn: "Japanese", ja: "Japanese",
  kor: "Korean", ko: "Korean",
  urd: "Urdu", ur: "Urdu",
  tur: "Turkish", tr: "Turkish",
  rus: "Russian", ru: "Russian",
};

function resolveLanguageName(raw: string | null): string {
  if (!raw) return "Detecting...";
  const lower = raw.toLowerCase();
  return LANGUAGE_NAMES[lower] ?? raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ── Utilities ───────────────────────────────────────────────────────────────

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

function fmtTs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Main component ──────────────────────────────────────────────────────────

export default function TranscriptionJobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<Version[]>([]);

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

  const onUpdate = () => {
    fetchJob();
    fetchVersions();
  };

  if (loading || !job) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
      </div>
    );
  }

  const quality = QUALITY_LABELS[job.ai_quality_score ?? ""] ?? null;

  // Build per-file list: real source_files or synthetic single-file entry
  const isMultiFile = (job.source_files?.length ?? 0) > 1;
  const isSyntheticSingleFile = !job.source_files || job.source_files.length === 0;
  const files: SourceFile[] = job.source_files && job.source_files.length > 0
    ? job.source_files
    : [{
        name: job.file_name,
        path: job.file_path,
        size: job.file_size_bytes,
        duration: job.file_duration_seconds,
        format: job.file_format,
        transcript_text: job.transcript_text ?? undefined,
        transcript_json: job.transcript_json ?? undefined,
        translated_text: job.translated_text ?? undefined,
      }];

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
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Info cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <InfoCard icon={Clock} label="Duration" value={formatDuration(job.file_duration_seconds)} sub={`${formatBytes(job.file_size_bytes)} · ${job.file_format.toUpperCase()}`} />
          <InfoCard icon={Globe} label="Language" value={resolveLanguageName(job.detected_language)} sub={job.language_confidence ? `Confidence: ${(job.language_confidence * 100).toFixed(0)}%` : undefined} />
          <InfoCard icon={DollarSign} label="Charged" value={job.amount_charged > 0 ? `$${job.amount_charged.toFixed(2)} ${job.currency}` : "Free"} sub={`Tier: ${job.pricing_tier} · Payment: ${job.payment_status}`} />
          <InfoCard icon={Shield} label="Provider" value={job.provider ?? "—"} sub={`STT: $${(job.provider_cost ?? 0).toFixed(4)} · Total AI: $${(job.ai_total_cost ?? 0).toFixed(4)}`} />
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

        {/* Per-file accordions — shown when we have files to display */}
        {files.length > 0 && (
          <PerFileAccordions
            job={job}
            files={files}
            versions={versions}
            isSyntheticSingleFile={isSyntheticSingleFile}
            onUpdate={onUpdate}
          />
        )}

        {/* Audit log */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="border-b border-gray-200 px-4 py-3">
            <span className="text-sm font-medium text-gray-700">Audit Log</span>
          </div>
          <div className="p-6 space-y-3">
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
        </div>
      </main>
    </div>
  );
}

// ── Info card ────────────────────────────────────────────────────────────────

function InfoCard({ icon: Icon, label, value, sub }: {
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

// ── Per-file accordions ─────────────────────────────────────────────────────

function PerFileAccordions({ job, files, versions, isSyntheticSingleFile, onUpdate }: {
  job: Job;
  files: SourceFile[];
  versions: Version[];
  isSyntheticSingleFile: boolean;
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(files.length === 1 ? 0 : null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { targetLanguages } = useDropdownOptions();

  const toggleSelect = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(files.map((_, i) => i)));
  const deselectAll = () => setSelected(new Set());

  return (
    <div className="space-y-2">
      {files.length > 1 && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <FileAudio className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Source Files ({files.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={selected.size === files.length ? deselectAll : selectAll}
              className="text-xs text-teal-600 hover:text-teal-800 font-medium"
            >
              {selected.size === files.length ? "Deselect All" : "Select All"}
            </button>
          </div>
        </div>
      )}

      {/* Batch action bar */}
      {selected.size > 0 && files.length > 1 && (
        <BatchActionBar
          job={job}
          files={files}
          selectedIndexes={selected}
          targetLanguages={targetLanguages}
          onUpdate={onUpdate}
        />
      )}

      {files.map((sf, i) => {
        const fileVersions = versions.filter(v =>
          v.file_index === i || (isSyntheticSingleFile && v.file_index == null)
        );

        return (
          <FileCard
            key={i}
            file={sf}
            fileIndex={i}
            job={job}
            fileVersions={fileVersions}
            isExpanded={expanded === i}
            isSelected={selected.has(i)}
            onToggleSelect={() => toggleSelect(i)}
            onToggle={() => setExpanded(expanded === i ? null : i)}
            onUpdate={onUpdate}
            targetLanguages={targetLanguages}
            isSyntheticSingleFile={isSyntheticSingleFile}
            showCheckbox={files.length > 1}
          />
        );
      })}
    </div>
  );
}

// ── Batch action bar (multi-select operations) ────────────────────────────────

function BatchActionBar({ job, files, selectedIndexes, targetLanguages, onUpdate }: {
  job: Job;
  files: SourceFile[];
  selectedIndexes: Set<number>;
  targetLanguages: Array<{ id: string; name: string; native_name?: string }>;
  onUpdate: () => void;
}) {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [langId, setLangId] = useState(job.translation_target_language_id ?? "");
  const [proofModel, setProofModel] = useState("sonnet");
  const [reprocessProvider, setReprocessProvider] = useState(job.provider ?? "openai");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");

  const count = selectedIndexes.size;
  const sortedIndexes = Array.from(selectedIndexes).sort((a, b) => a - b);

  const runBatchTranslate = async () => {
    if (!langId) { toast.error("Select a target language"); return; }
    setRunning(true);
    await supabase.from("transcription_jobs").update({
      translation_requested: true,
      translation_target_language_id: langId,
      translation_type: "ai_instant",
    }).eq("id", job.id);

    for (let i = 0; i < sortedIndexes.length; i++) {
      setProgress(`Translating file ${i + 1} of ${sortedIndexes.length}...`);
      const { error } = await supabase.functions.invoke("transcription-ai-translate", {
        body: { job_id: job.id, file_index: sortedIndexes[i] },
      });
      if (error) { toast.error(`Translation failed on file ${sortedIndexes[i] + 1}`); break; }
    }
    toast.success(`Translated ${sortedIndexes.length} files`);
    supabase.functions.invoke("transcription-deliver", { body: { job_id: job.id } }).catch(() => {});
    setRunning(false); setProgress(""); setActiveAction(null); onUpdate();
  };

  const runBatchProofread = async () => {
    setRunning(true);
    // Build cross-file context from ALL files (names, terms, speakers)
    const contextParts = files.map((f, i) => {
      const text = f.transcript_text ?? "";
      const excerpt = text.length > 500 ? text.slice(0, 500) + "..." : text;
      return `File ${i + 1} (${f.name ?? "unknown"}): ${excerpt}`;
    });
    const context = contextParts.join("\n\n");

    for (let i = 0; i < sortedIndexes.length; i++) {
      setProgress(`Proofreading file ${i + 1} of ${sortedIndexes.length}...`);
      const { data, error } = await supabase.functions.invoke("transcription-ai-proofread", {
        body: { job_id: job.id, model: proofModel, file_index: sortedIndexes[i], context },
      });
      if (error || !data?.success) { toast.error(`Proofread failed on file ${sortedIndexes[i] + 1}`); break; }
    }
    toast.success(`Proofread ${sortedIndexes.length} files`);
    setRunning(false); setProgress(""); setActiveAction(null); onUpdate();
  };

  const runBatchReprocess = async () => {
    setRunning(true);
    setProgress("Reprocessing all selected files...");
    await supabase.from("transcription_jobs").update({ status: "pending", provider: reprocessProvider }).eq("id", job.id);
    const { error } = await supabase.functions.invoke("transcription-process", {
      body: { job_id: job.id },
    });
    if (error) toast.error("Reprocess failed");
    else toast.success("Reprocessed");
    setTimeout(onUpdate, 2000);
    setRunning(false); setProgress(""); setActiveAction(null);
  };

  const downloadCombined = (format: "txt" | "srt" | "json") => {
    const sections = sortedIndexes.map((idx) => {
      const f = files[idx];
      const text = f.transcript_text ?? "";
      const translated = f.translated_text ?? "";
      const divider = `━━━ ${f.name} ━━━`;

      if (format === "json") {
        return JSON.stringify({
          file: f.name,
          file_index: idx,
          transcript: text,
          ...(translated ? { translation: translated } : {}),
        }, null, 2);
      }

      let section = `${divider}\n\n${text}`;
      if (translated) {
        section += `\n\n--- Translation ---\n\n${translated}`;
      }
      return section;
    });

    let content: string;
    let mimeType: string;
    let ext: string;

    if (format === "json") {
      content = `[\n${sections.join(",\n")}\n]`;
      mimeType = "application/json";
      ext = "json";
    } else {
      // Page-break separator: form feed character between files
      content = sections.join("\n\n\f\n\n");
      mimeType = "text/plain";
      ext = format;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `combined-${count}-files.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded combined ${ext.toUpperCase()}`);
  };

  const downloadCombinedDocx = async () => {
    setRunning(true);
    setProgress("Downloading combined DOCX...");
    const { data: url } = await supabase.storage
      .from("transcription-uploads")
      .createSignedUrl(`${job.id}/output/transcript.docx`, 3600);
    if (url?.signedUrl) {
      window.open(url.signedUrl, "_blank");
    } else {
      toast.error("Combined DOCX not generated yet — run Deliver first");
    }
    setRunning(false); setProgress("");
  };

  return (
    <div className="bg-teal-50 rounded-lg border border-teal-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-teal-800">
          {count} file{count !== 1 ? "s" : ""} selected
        </span>
        {running && progress && (
          <span className="flex items-center gap-1.5 text-xs text-teal-600">
            <Loader2 className="w-3 h-3 animate-spin" /> {progress}
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mb-3">
        <ActionToggleButton label="Translate" icon={Languages} active={activeAction === "translate"} loading={running && activeAction === "translate"} color="purple" onClick={() => setActiveAction(activeAction === "translate" ? null : "translate")} />
        <ActionToggleButton label="Proofread" icon={Sparkles} active={activeAction === "proofread"} loading={running && activeAction === "proofread"} color="amber" onClick={() => setActiveAction(activeAction === "proofread" ? null : "proofread")} />
        <ActionToggleButton label="Reprocess" icon={RefreshCw} active={activeAction === "reprocess"} loading={running && activeAction === "reprocess"} color="blue" onClick={() => setActiveAction(activeAction === "reprocess" ? null : "reprocess")} />
      </div>

      {/* Inline panels for each action */}
      {activeAction === "translate" && (
        <InlinePanel color="purple">
          <select value={langId} onChange={(e) => setLangId(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500">
            <option value="">Select target language...</option>
            {targetLanguages.map((lang) => (
              <option key={lang.id} value={lang.id}>{lang.name}{lang.native_name && lang.native_name !== lang.name ? ` (${lang.native_name})` : ""}</option>
            ))}
          </select>
          <ActionButtons onRun={runBatchTranslate} onCancel={() => setActiveAction(null)} disabled={!langId || running} loading={running} label={`Translate ${count} files`} loadingLabel={progress || "Translating..."} icon={Languages} color="purple" />
        </InlinePanel>
      )}

      {activeAction === "proofread" && (
        <InlinePanel color="amber">
          <select value={proofModel} onChange={(e) => setProofModel(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="haiku">Haiku (fastest, cheapest)</option>
            <option value="sonnet">Sonnet (balanced)</option>
            <option value="opus">Opus (best quality)</option>
          </select>
          <ActionButtons onRun={runBatchProofread} onCancel={() => setActiveAction(null)} disabled={running} loading={running} label={`Proofread ${count} files`} loadingLabel={progress || "Proofreading..."} icon={Sparkles} color="amber" />
        </InlinePanel>
      )}

      {activeAction === "reprocess" && (
        <InlinePanel color="blue">
          <select value={reprocessProvider} onChange={(e) => setReprocessProvider(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="openai">OpenAI gpt-4o-transcribe</option>
            <option value="assemblyai">AssemblyAI Universal-2</option>
            <option value="elevenlabs">ElevenLabs Scribe v2</option>
          </select>
          <ActionButtons onRun={runBatchReprocess} onCancel={() => setActiveAction(null)} disabled={running} loading={running} label="Reprocess All" loadingLabel={progress || "Processing..."} icon={RefreshCw} color="blue" />
        </InlinePanel>
      )}

      {/* Combined download */}
      {!activeAction && (
        <div>
          <p className="text-xs text-teal-600 font-medium uppercase tracking-wide mb-1.5">Combined Download</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => downloadCombined("txt")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200">
              <Download className="w-3 h-3" /> TXT
            </button>
            <button onClick={downloadCombinedDocx} disabled={running} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 disabled:opacity-50">
              <Download className="w-3 h-3" /> DOCX
            </button>
            <button onClick={() => downloadCombined("srt")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border-yellow-200">
              <Download className="w-3 h-3" /> SRT
            </button>
            <button onClick={() => downloadCombined("json")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
              <Download className="w-3 h-3" /> JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── File card (full per-file workspace) ─────────────────────────────────────

function FileCard({
  file,
  fileIndex,
  job,
  fileVersions,
  isExpanded,
  isSelected,
  onToggleSelect,
  onToggle,
  onUpdate,
  targetLanguages,
  isSyntheticSingleFile,
  showCheckbox,
}: {
  file: SourceFile;
  fileIndex: number;
  job: Job;
  fileVersions: Version[];
  isExpanded: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onToggle: () => void;
  onUpdate: () => void;
  targetLanguages: Array<{ id: string; code?: string; name: string; native_name?: string }>;
  isSyntheticSingleFile: boolean;
  showCheckbox: boolean;
}) {
  const badgeColor = FORMAT_BADGE_COLORS[file.format.toLowerCase()] ?? "bg-gray-100 text-gray-700";
  const hasTranscript = !!file.transcript_text;
  const hasTranslation = !!file.translated_text;
  const wordCount = file.transcript_text ? file.transcript_text.split(/\s+/).filter(Boolean).length : 0;
  const translatedLangCode = useMemo<string | null>(() => {
    if (!job.translation_target_language_id) return null;
    const lang = targetLanguages.find((l) => l.id === job.translation_target_language_id);
    return lang?.code ?? null;
  }, [job.translation_target_language_id, targetLanguages]);

  return (
    <div className={`bg-white rounded-lg border overflow-hidden transition ${isSelected ? "border-teal-300 ring-1 ring-teal-200" : "border-gray-200"}`}>
      {/* Accordion header */}
      <div className="flex items-center gap-0">
        {showCheckbox && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            className="pl-3 pr-1 py-3.5 flex-shrink-0 hover:text-teal-600 text-gray-400 transition"
          >
            {isSelected
              ? <CheckSquare className="w-4 h-4 text-teal-600" />
              : <Square className="w-4 h-4" />
            }
          </button>
        )}
        <button
          onClick={onToggle}
          className={`flex-1 flex items-center gap-3 ${showCheckbox ? "pl-1" : "pl-4"} pr-4 py-3.5 text-left hover:bg-gray-50 transition`}
        >
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`} />
          <span className={`px-2 py-0.5 text-xs font-semibold rounded ${badgeColor}`}>
            {file.format.toUpperCase()}
          </span>
          <span className="flex-1 text-sm font-medium text-gray-800 truncate">{file.name}</span>
          <span className="text-xs text-gray-500 flex-shrink-0">{formatDuration(file.duration)}</span>
          <span className="text-xs text-gray-400 flex-shrink-0">{formatBytes(file.size)}</span>

          {/* Per-file status indicators */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {hasTranscript ? (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-green-50 text-green-700 border border-green-200">
                <CheckCircle className="w-3 h-3" /> {wordCount > 0 ? `${wordCount.toLocaleString()} words` : "Transcribed"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-gray-50 text-gray-400 border border-gray-200">
                Pending
              </span>
            )}
            {hasTranslation && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                <Globe className="w-3 h-3" /> Translated
              </span>
            )}
            {fileVersions.length > 1 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {fileVersions.length} versions
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Expanded workspace */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-4 py-4 pl-11 space-y-5">
          {/* 1. Transcript + inline translation */}
          <FileTranscriptSection
            job={job}
            file={file}
            fileIndex={fileIndex}
            isSyntheticSingleFile={isSyntheticSingleFile}
            translatedText={file.translated_text}
            translatedLangCode={translatedLangCode}
            onChanged={onUpdate}
          />

          {/* 3. Versions list */}
          {fileVersions.length > 0 && (
            <FileVersionsSection
              job={job}
              versions={fileVersions}
              fileIndex={fileIndex}
              isSyntheticSingleFile={isSyntheticSingleFile}
              onUpdate={onUpdate}
            />
          )}

          {/* 4. AI Tools */}
          <FileActionsSection
            job={job}
            fileIndex={fileIndex}
            fileVersions={fileVersions}
            targetLanguages={targetLanguages}
            hasTranslation={!!file.translated_text}
            onUpdate={onUpdate}
          />

          {/* 5. Downloads */}
          <FileDownloadsSection
            job={job}
            file={file}
            fileIndex={fileIndex}
            isSyntheticSingleFile={isSyntheticSingleFile}
          />
        </div>
      )}
    </div>
  );
}

// ── 1. Transcript preview section ───────────────────────────────────────────

function FileTranscriptSection({
  job,
  file,
  fileIndex,
  isSyntheticSingleFile,
  translatedText,
  translatedLangCode,
  onChanged,
}: {
  job: Job;
  file: SourceFile;
  fileIndex: number;
  isSyntheticSingleFile: boolean;
  translatedText?: string;
  translatedLangCode?: string | null;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<SpeakerSeg | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{ versionId: string; applied: number; sourceEdits: number; translationEdits: number } | null>(null);

  // file_index argument: null when this is a synthetic single-file job (the
  // transcript lives on the job row, not in source_files), otherwise the index.
  const effectiveFileIndex = isSyntheticSingleFile ? null : fileIndex;

  const isV2 = useMemo(() => {
    const json = file.transcript_json as Record<string, unknown> | null;
    return !!json && json.format_version === 2 && Array.isArray(json.segments);
  }, [file.transcript_json]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const langs = translatedLangCode ? [translatedLangCode] : [];
      const { data, error } = await supabase.functions.invoke("transcription-export-xlsx", {
        body: { job_id: job.id, file_index: effectiveFileIndex, include_languages: langs },
      });
      if (error || !data?.success) {
        toast.error(data?.error || error?.message || "Export failed");
        return;
      }
      if (data.url) {
        window.open(data.url, "_blank");
      }
      toast.success(`Exported ${data.segment_count} segments`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const arrayBuf = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      const { data, error } = await supabase.functions.invoke("transcription-import-xlsx", {
        body: { job_id: job.id, file_index: effectiveFileIndex, file_base64: b64 },
      });
      if (error || !data?.success) {
        toast.error(data?.error || error?.message || "Import failed");
        return;
      }
      if (typeof data.applied === "number" && data.applied > 0) {
        setImportResult({
          versionId: data.version_id,
          applied: data.applied,
          sourceEdits: data.source_edits ?? 0,
          translationEdits: data.translation_edits ?? 0,
        });
        toast.success(`Staged ${data.applied} edits as a new version — activate from Versions tab to apply`);
      } else {
        toast.info(data.message ?? "No changes detected");
      }
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  if (!file.transcript_text) {
    return (
      <div>
        <SectionLabel label="Transcript" />
        <p className="text-sm text-gray-400 italic">No transcript available</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <SectionLabel label={translatedText ? "Transcript & Translation" : "Transcript"} />
        <div className="flex items-center gap-1 flex-wrap">
          {isV2 && (
            <>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-1 px-2 py-1 text-xs text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 rounded border border-emerald-200 disabled:opacity-50"
                title="Download segments as xlsx for human review"
              >
                {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                Export xlsx
              </button>
              <label className={`flex items-center gap-1 px-2 py-1 text-xs text-amber-700 hover:text-amber-900 hover:bg-amber-50 rounded border border-amber-200 cursor-pointer ${importing ? "opacity-50 pointer-events-none" : ""}`}>
                {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                Import xlsx
                <input
                  type="file"
                  accept=".xlsx"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) await handleImport(f);
                  }}
                />
              </label>
            </>
          )}
          <button
            onClick={() => {
              navigator.clipboard.writeText(file.transcript_text ?? "");
              toast.success("Copied to clipboard");
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
          >
            <Copy className="w-3 h-3" /> Copy
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
          >
            {expanded ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      {!isV2 && (
        <div className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Legacy v1 transcript. Run the segment-id backfill on this job to enable inline edit + xlsx round-trip.
        </div>
      )}
      {importResult && (
        <div className="mb-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex items-center justify-between gap-2">
          <span>
            Staged {importResult.applied} edits ({importResult.sourceEdits} source, {importResult.translationEdits} translation). Activate from the Versions tab.
          </span>
          <button
            onClick={() => setImportResult(null)}
            className="text-amber-600 hover:text-amber-900 px-1"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      <div className={`${expanded ? "" : "max-h-[300px]"} overflow-y-auto rounded-lg border border-gray-100 p-3 bg-gray-50/50`}>
        <SpeakerTranscript
          transcriptJson={file.transcript_json ?? null}
          transcriptText={file.transcript_text}
          translatedText={translatedText}
          translatedLangCode={translatedLangCode}
          compact
          onSegmentEdit={isV2 ? (seg) => setEditing(seg) : undefined}
        />
      </div>
      {editing && (
        <SegmentEditModal
          jobId={job.id}
          fileIndex={effectiveFileIndex}
          translatedLangCode={translatedLangCode ?? null}
          segment={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

// ── Segment edit modal (inline per-segment source + translation) ────────────

function SegmentEditModal({
  jobId,
  fileIndex,
  translatedLangCode,
  segment,
  onClose,
  onSaved,
}: {
  jobId: string;
  fileIndex: number | null;
  translatedLangCode: string | null;
  segment: SpeakerSeg;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialTrans = translatedLangCode ? (segment.translations?.[translatedLangCode] ?? "") : "";
  const [text, setText] = useState(segment.text);
  const [translation, setTranslation] = useState(initialTrans);
  const [saving, setSaving] = useState(false);

  const dirty = text !== segment.text || translation !== initialTrans;

  const save = async () => {
    if (!segment.id || !dirty) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const edit: Record<string, unknown> = { id: segment.id };
      if (text !== segment.text) edit.text = text;
      if (translatedLangCode && translation !== initialTrans) {
        edit.translations = { [translatedLangCode]: translation };
      }
      const { data, error } = await supabase.functions.invoke("transcription-segment-edit", {
        body: { job_id: jobId, file_index: fileIndex, edits: [edit] },
      });
      if (error || !data?.success) {
        toast.error(data?.error || error?.message || "Save failed");
        return;
      }
      toast.success("Segment updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900">Edit segment</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="text-xs text-gray-500 mb-3 flex items-center gap-3 flex-wrap">
          <span className="font-mono text-gray-400">{segment.id?.slice(0, 8) ?? "—"}</span>
          {segment.speaker && <span className="font-medium">{segment.speaker}</span>}
          <span className="font-mono">{fmtTs(segment.startMs)}</span>
        </div>

        <label className="block text-xs font-medium text-gray-700 mb-1">Source text</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg p-2 mb-3 min-h-[80px] focus:ring-2 focus:ring-blue-200 focus:outline-none"
        />

        {translatedLangCode && (
          <>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Translation <span className="font-mono text-gray-400 text-[10px]">[{translatedLangCode}]</span>
            </label>
            <textarea
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              className="w-full text-sm border border-purple-200 rounded-lg p-2 mb-3 min-h-[80px] focus:ring-2 focus:ring-purple-200 focus:outline-none text-purple-900"
            />
          </>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Save edit
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 3. Versions section (mini list) ─────────────────────────────────────────

function FileVersionsSection({ job, versions, fileIndex, isSyntheticSingleFile, onUpdate }: {
  job: Job;
  versions: Version[];
  fileIndex: number;
  isSyntheticSingleFile: boolean;
  onUpdate: () => void;
}) {
  const [activating, setActivating] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const activateVersion = async (version: Version) => {
    setActivating(version.id);
    try {
      if (isSyntheticSingleFile) {
        await supabase
          .from("transcription_jobs")
          .update({ transcript_text: version.transcript_text, word_count: version.word_count })
          .eq("id", job.id);
      } else {
        const files = [...(job.source_files ?? [])];
        if (files[fileIndex]) {
          const patch: Record<string, unknown> = { ...files[fileIndex], transcript_text: version.transcript_text ?? undefined };
          if (version.transcript_json) patch.transcript_json = version.transcript_json;
          files[fileIndex] = patch;
          await supabase
            .from("transcription_jobs")
            .update({ source_files: files })
            .eq("id", job.id);
        }
      }

      await supabase
        .from("transcription_versions")
        .update({ is_active: false })
        .eq("job_id", job.id)
        .eq("file_index", fileIndex);
      await supabase
        .from("transcription_versions")
        .update({ is_active: true })
        .eq("id", version.id);

      toast.success("Version activated");
      supabase.functions.invoke("transcription-deliver", { body: { job_id: job.id } }).catch(() => {});
      onUpdate();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to activate version");
    } finally {
      setActivating(null);
    }
  };

  return (
    <div>
      <SectionLabel label={`Versions (${versions.length})`} />
      <div className="space-y-2 mt-2">
        {versions.map((v) => (
          <div key={v.id} className={`rounded-lg border p-3 ${v.is_active ? "border-teal-300 bg-teal-50/50" : "border-gray-100 bg-gray-50/30"}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                v.version_type === "original" ? "bg-gray-100 text-gray-600" :
                v.version_type === "reprocess" ? "bg-blue-100 text-blue-600" :
                "bg-amber-100 text-amber-600"
              }`}>
                {v.version_type}
              </span>
              <span className="text-xs text-gray-500">{v.provider}{v.model ? `/${v.model}` : ""}</span>
              <span className="text-xs text-gray-400">{format(new Date(v.created_at), "MMM d HH:mm")}</span>
              {v.word_count && <span className="text-xs text-gray-400">{v.word_count} words</span>}
              {v.is_active && (
                <span className="flex items-center gap-0.5 text-xs text-teal-700 font-medium">
                  <Star className="w-3 h-3 fill-current" /> Active
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setPreviewId(previewId === v.id ? null : v.id)}
                  className="px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                >
                  {previewId === v.id ? "Hide" : "Preview"}
                </button>
                {!v.is_active && v.transcript_text && (
                  <button
                    onClick={() => activateVersion(v)}
                    disabled={activating === v.id}
                    className="flex items-center gap-1 px-2 py-0.5 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
                  >
                    {activating === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    Set Active
                  </button>
                )}
              </div>
            </div>
            {previewId === v.id && v.transcript_text && (
              <pre className="mt-2 p-2 bg-white rounded text-xs text-gray-700 max-h-[200px] overflow-y-auto whitespace-pre-wrap font-sans border border-gray-100">
                {v.transcript_text.slice(0, 2000)}{v.transcript_text.length > 2000 ? "\n\n[...truncated...]" : ""}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 4. AI tools section ─────────────────────────────────────────────────────

function FileActionsSection({ job, fileIndex, fileVersions, targetLanguages, hasTranslation, onUpdate }: {
  job: Job;
  fileIndex: number;
  fileVersions: Version[];
  targetLanguages: Array<{ id: string; name: string; native_name?: string }>;
  hasTranslation: boolean;
  onUpdate: () => void;
}) {
  const [activeAction, setActiveAction] = useState<string | null>(null);

  // Translate state
  const [langId, setLangId] = useState(job.translation_target_language_id ?? "");
  const [translating, setTranslating] = useState(false);

  // Proofread state
  const [proofModel, setProofModel] = useState("sonnet");
  const [proofreading, setProofreading] = useState(false);

  // Reprocess state
  const [reprocessProvider, setReprocessProvider] = useState(job.provider ?? "openai");
  const [reprocessing, setReprocessing] = useState(false);

  // Compare state
  const [compareModel, setCompareModel] = useState("sonnet");
  const [versionA, setVersionA] = useState("current");
  const [versionB, setVersionB] = useState(fileVersions[0]?.id ?? "");
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<Record<string, unknown> | null>(null);

  const runTranslate = async () => {
    if (!langId) { toast.error("Select a target language"); return; }
    setTranslating(true);
    try {
      await supabase.from("transcription_jobs").update({
        translation_requested: true,
        translation_target_language_id: langId,
        translation_type: "ai_instant",
      }).eq("id", job.id);

      const { error } = await supabase.functions.invoke("transcription-ai-translate", {
        body: { job_id: job.id, file_index: fileIndex },
      });
      if (error) throw error;
      toast.success("Translation complete");
      supabase.functions.invoke("transcription-deliver", { body: { job_id: job.id } }).catch(() => {});
      onUpdate();
    } catch (e: any) {
      toast.error(e.message ?? "Translation failed");
    } finally {
      setTranslating(false);
      setActiveAction(null);
    }
  };

  const runProofread = async () => {
    setProofreading(true);
    try {
      const { data, error } = await supabase.functions.invoke("transcription-ai-proofread", {
        body: { job_id: job.id, model: proofModel, file_index: fileIndex },
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error);
      const extra = data?.translation_proofread ? " + translation" : "";
      toast.success(`Proofread complete${extra} (${proofModel}) — cost: $${data?.cost?.toFixed(4) ?? "?"}`);
      onUpdate();
    } catch (e: any) {
      toast.error(e.message ?? "Proofread failed");
    } finally {
      setProofreading(false);
      setActiveAction(null);
    }
  };

  const runReprocess = async () => {
    setReprocessing(true);
    try {
      await supabase.from("transcription_jobs").update({ status: "pending", provider: reprocessProvider }).eq("id", job.id);
      const { error } = await supabase.functions.invoke("transcription-process", {
        body: { job_id: job.id },
      });
      if (error) throw error;
      toast.success(`Reprocessed with ${reprocessProvider}`);
      setTimeout(onUpdate, 2000);
    } catch (e: any) {
      toast.error(e.message ?? "Reprocess failed");
    } finally {
      setReprocessing(false);
      setActiveAction(null);
    }
  };

  const runCompare = async () => {
    setComparing(true);
    setCompareResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("transcription-ai-compare", {
        body: { job_id: job.id, version_a: versionA, version_b: versionB, model: compareModel, file_index: fileIndex },
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error);
      setCompareResult(data?.comparison ?? null);
      toast.success(`Comparison complete — cost: $${data?.cost?.toFixed(4) ?? "?"}`);
      onUpdate();
    } catch (e: any) {
      toast.error(e.message ?? "Compare failed");
    } finally {
      setComparing(false);
    }
  };

  const versionOptions = [
    { value: "current", label: "Current (active)" },
    ...fileVersions.map((v) => ({
      value: v.id,
      label: `${v.version_type} — ${v.provider}/${v.model} (${format(new Date(v.created_at), "MMM d HH:mm")})`,
    })),
  ];

  return (
    <div>
      <SectionLabel label="AI Tools" />
      <div className="flex flex-wrap gap-2 mt-2">
        <ActionToggleButton
          label={hasTranslation ? "Re-translate" : "Translate"}
          icon={Languages}
          active={activeAction === "translate"}
          loading={translating}
          color="purple"
          onClick={() => setActiveAction(activeAction === "translate" ? null : "translate")}
        />
        <ActionToggleButton
          label="Proofread"
          icon={Sparkles}
          active={activeAction === "proofread"}
          loading={proofreading}
          color="amber"
          onClick={() => setActiveAction(activeAction === "proofread" ? null : "proofread")}
        />
        <ActionToggleButton
          label="Reprocess"
          icon={RefreshCw}
          active={activeAction === "reprocess"}
          loading={reprocessing}
          color="blue"
          onClick={() => setActiveAction(activeAction === "reprocess" ? null : "reprocess")}
        />
        {fileVersions.length >= 2 && (
          <ActionToggleButton
            label="Compare"
            icon={GitCompare}
            active={activeAction === "compare"}
            loading={comparing}
            color="indigo"
            onClick={() => setActiveAction(activeAction === "compare" ? null : "compare")}
          />
        )}
      </div>

      {/* Translate panel */}
      {activeAction === "translate" && (
        <InlinePanel color="purple">
          <select value={langId} onChange={(e) => setLangId(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">Select target language...</option>
            {targetLanguages.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.name}{lang.native_name && lang.native_name !== lang.name ? ` (${lang.native_name})` : ""}
              </option>
            ))}
          </select>
          <ActionButtons
            onRun={runTranslate}
            onCancel={() => setActiveAction(null)}
            disabled={!langId || translating}
            loading={translating}
            label="Translate"
            loadingLabel="Translating..."
            icon={Languages}
            color="purple"
          />
        </InlinePanel>
      )}

      {/* Proofread panel */}
      {activeAction === "proofread" && (
        <InlinePanel color="amber">
          <select value={proofModel} onChange={(e) => setProofModel(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="haiku">Haiku (fastest, cheapest)</option>
            <option value="sonnet">Sonnet (balanced)</option>
            <option value="opus">Opus (best quality)</option>
          </select>
          <ActionButtons
            onRun={runProofread}
            onCancel={() => setActiveAction(null)}
            disabled={proofreading}
            loading={proofreading}
            label="Run Proofread"
            loadingLabel="Proofreading..."
            icon={Sparkles}
            color="amber"
          />
        </InlinePanel>
      )}

      {/* Reprocess panel */}
      {activeAction === "reprocess" && (
        <InlinePanel color="blue">
          <select value={reprocessProvider} onChange={(e) => setReprocessProvider(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="openai">OpenAI gpt-4o-transcribe</option>
            <option value="assemblyai">AssemblyAI Universal-2</option>
            <option value="elevenlabs">ElevenLabs Scribe v2</option>
          </select>
          <ActionButtons
            onRun={runReprocess}
            onCancel={() => setActiveAction(null)}
            disabled={reprocessing}
            loading={reprocessing}
            label="Reprocess"
            loadingLabel="Processing..."
            icon={RefreshCw}
            color="blue"
          />
        </InlinePanel>
      )}

      {/* Compare panel */}
      {activeAction === "compare" && (
        <InlinePanel color="indigo">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Version A</label>
              <select value={versionA} onChange={(e) => setVersionA(e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg">
                {versionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Version B</label>
              <select value={versionB} onChange={(e) => setVersionB(e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg">
                {versionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <select value={compareModel} onChange={(e) => setCompareModel(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg">
            <option value="haiku">Haiku (cheapest)</option>
            <option value="sonnet">Sonnet (balanced)</option>
            <option value="opus">Opus (best)</option>
          </select>
          <ActionButtons
            onRun={runCompare}
            onCancel={() => { setActiveAction(null); setCompareResult(null); }}
            disabled={comparing || versionA === versionB}
            loading={comparing}
            label="Compare"
            loadingLabel="Comparing..."
            icon={GitCompare}
            color="indigo"
          />
          {compareResult && (
            <div className="p-3 bg-white rounded-lg text-sm space-y-2 max-h-[300px] overflow-y-auto border border-indigo-100">
              {(compareResult as any).summary && (
                <p className="font-medium text-indigo-900">{(compareResult as any).summary}</p>
              )}
              {(compareResult as any).recommendation && (
                <p className="text-indigo-700 text-xs">
                  <strong>Recommendation:</strong> Version {(compareResult as any).recommendation?.toUpperCase()} — {(compareResult as any).recommendation_reason}
                </p>
              )}
              {(compareResult as any).differences && (
                <div className="space-y-1">
                  <p className="font-medium text-indigo-800 text-xs uppercase tracking-wide">Key Differences</p>
                  {((compareResult as any).differences as any[]).map((d: any, i: number) => (
                    <div key={i} className="bg-indigo-50/50 rounded p-2 text-xs border border-indigo-100">
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
        </InlinePanel>
      )}
    </div>
  );
}

// ── 5. Downloads section ────────────────────────────────────────────────────

function FileDownloadsSection({ job, file, fileIndex, isSyntheticSingleFile }: {
  job: Job;
  file: SourceFile;
  fileIndex: number;
  isSyntheticSingleFile: boolean;
}) {
  const [outputLinks, setOutputLinks] = useState<Array<{ label: string; format: string; url: string }>>([]);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchLinks() {
      const outputs: Array<{ label: string; format: string; url: string }> = [];

      // Per-file output format downloads — only try when the pipeline
      // actually produced outputs. Failed / processing / pending / expired
      // jobs never reach transcription-deliver, so the output files don't
      // exist and Supabase storage 400s with "object not found" on every
      // delivery_format. That floods the console and makes the actual
      // upstream failure harder to spot.
      const outputsExpected = job.status === "completed" || !!job.delivered_at;
      if (outputsExpected) {
        for (const fmt of (job.delivery_formats ?? [])) {
          const outputPath = isSyntheticSingleFile
            ? `${job.id}/output/transcript.${fmt}`
            : `${job.id}/output/file-${fileIndex + 1}.${fmt}`;
          const { data: outUrl } = await supabase.storage
            .from("transcription-uploads")
            .createSignedUrl(outputPath, 3600);
          if (outUrl?.signedUrl) {
            outputs.push({ label: fmt.toUpperCase(), format: fmt.toLowerCase(), url: outUrl.signedUrl });
          }
        }
      }

      // Source audio download (secondary) — always try; the source file
      // always exists from the moment the upload completes.
      const { data: srcUrl } = await supabase.storage
        .from("transcription-uploads")
        .createSignedUrl(file.path, 3600);

      if (!cancelled) {
        setOutputLinks(outputs);
        setSourceUrl(srcUrl?.signedUrl ?? null);
        setLoading(false);
      }
    }
    fetchLinks();
    return () => { cancelled = true; };
  }, [job.id, job.status, job.delivered_at, file.path, fileIndex, isSyntheticSingleFile, job.delivery_formats]);

  return (
    <div>
      <SectionLabel label="Downloads" />
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 mt-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading...
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {/* Output format downloads — primary */}
          {outputLinks.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {outputLinks.map((link) => {
                const style = DOWNLOAD_FORMAT_STYLES[link.format] ?? "bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200";
                return (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition ${style}`}
                  >
                    <FileText className="w-3 h-3" /> {link.label}
                  </a>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">Output files not generated yet</p>
          )}

          {/* Source audio — secondary, subtle */}
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-600 transition"
            >
              <FileAudio className="w-3 h-3" /> Source {file.format.toUpperCase()}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── UI helpers ───────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
  );
}

const TOGGLE_ACTIVE_STYLES: Record<string, string> = {
  purple: "border-purple-300 bg-purple-50 text-purple-700",
  amber: "border-amber-300 bg-amber-50 text-amber-700",
  blue: "border-blue-300 bg-blue-50 text-blue-700",
  indigo: "border-indigo-300 bg-indigo-50 text-indigo-700",
};

const PANEL_STYLES: Record<string, string> = {
  purple: "bg-purple-50/50 border-purple-100",
  amber: "bg-amber-50/50 border-amber-100",
  blue: "bg-blue-50/50 border-blue-100",
  indigo: "bg-indigo-50/50 border-indigo-100",
};

const BUTTON_STYLES: Record<string, string> = {
  purple: "bg-purple-600 hover:bg-purple-700",
  amber: "bg-amber-600 hover:bg-amber-700",
  blue: "bg-blue-600 hover:bg-blue-700",
  indigo: "bg-indigo-600 hover:bg-indigo-700",
};

function ActionToggleButton({ label, icon: Icon, active, loading, color, onClick }: {
  label: string;
  icon: typeof Languages;
  active: boolean;
  loading: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition ${
        active
          ? TOGGLE_ACTIVE_STYLES[color] ?? ""
          : "border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

function InlinePanel({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className={`mt-3 p-3 rounded-lg border space-y-2 ${PANEL_STYLES[color] ?? ""}`}>
      {children}
    </div>
  );
}

function ActionButtons({ onRun, onCancel, disabled, loading, label, loadingLabel, icon: Icon, color }: {
  onRun: () => void;
  onCancel: () => void;
  disabled: boolean;
  loading: boolean;
  label: string;
  loadingLabel: string;
  icon: typeof Languages;
  color: string;
}) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onRun}
        disabled={disabled}
        className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-white rounded-lg disabled:opacity-50 ${BUTTON_STYLES[color] ?? ""}`}
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
        {loading ? loadingLabel : label}
      </button>
      <button onClick={onCancel} className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
    </div>
  );
}

// ── Speaker-formatted transcript view ────────────────────────────────────────

interface SpeakerSeg {
  id?: string;                       // v2 only — stable segment UUID
  speaker: string;
  startMs: number;
  text: string;
  translations?: Record<string, string>; // v2 only
}

function SpeakerTranscript({
  transcriptJson,
  transcriptText,
  translatedText,
  translatedLangCode,
  compact,
  onSegmentEdit,
}: {
  transcriptJson: Record<string, unknown> | null;
  transcriptText?: string | null;
  translatedText?: string | null;
  translatedLangCode?: string | null;
  compact?: boolean;
  onSegmentEdit?: (seg: SpeakerSeg) => void;
}) {
  const segments = useMemo<SpeakerSeg[] | null>(() => {
    const json = transcriptJson;
    if (!json) return null;

    // v2 canonical: { format_version: 2, segments: [{id, speaker_id, start, end, text, translations?}] }
    if (json.format_version === 2 && Array.isArray(json.segments)) {
      type V2Seg = {
        id: string;
        speaker_id?: string | null;
        start: number;
        end: number;
        text: string;
        translations?: Record<string, string>;
      };
      return (json.segments as V2Seg[]).map((s, i) => ({
        id: s.id,
        speaker: s.speaker_id ?? `Segment ${i + 1}`,
        startMs: Math.round(s.start ?? 0),
        text: s.text,
        translations: s.translations,
      }));
    }

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
  }, [transcriptJson]);

  // v2: per-segment translations come from segment.translations[lang] directly.
  // Legacy: distribute the flat translated_text blob across speaker segments
  // proportionally by word count (this is the buggy heuristic — only used for v1).
  const translatedSegments = useMemo(() => {
    if (!segments) return null;

    // v2 path: every segment carries its own translations[lang].
    const isV2 = segments.length > 0 && segments[0].id !== undefined;
    if (isV2 && translatedLangCode) {
      return segments.map((s) => s.translations?.[translatedLangCode] ?? "");
    }

    // Legacy heuristic alignment
    if (!translatedText) return null;
    let parts = translatedText.split(/\n+/).filter(p => p.trim());
    if (parts.length <= 1) {
      parts = translatedText.match(/[^.!?]+[.!?]+[\s]*/g) || [translatedText];
      parts = parts.map(s => s.trim()).filter(Boolean);
    }
    if (parts.length === 0) return null;
    if (parts.length === segments.length) return parts;

    const segWordCounts = segments.map(s => s.text.split(/\s+/).length);
    const totalSegWords = segWordCounts.reduce((a, b) => a + b, 0) || 1;
    const result: string[] = [];
    let partIdx = 0;
    for (let i = 0; i < segments.length; i++) {
      const ratio = segWordCounts[i] / totalSegWords;
      const targetCount = Math.max(1, Math.round(ratio * parts.length));
      const chunk = parts.slice(partIdx, partIdx + targetCount);
      result.push(chunk.join(" "));
      partIdx += targetCount;
      if (partIdx >= parts.length && i < segments.length - 1) {
        for (let j = i + 1; j < segments.length; j++) result.push("");
        break;
      }
    }
    if (partIdx < parts.length) {
      const remaining = parts.slice(partIdx).join(" ");
      if (result.length > 0) result[result.length - 1] += " " + remaining;
    }
    return result;
  }, [translatedText, translatedLangCode, segments]);

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

  if (!segments) {
    return (
      <div>
        <pre className={`whitespace-pre-wrap text-sm text-gray-800 leading-relaxed font-sans ${compact ? "" : "max-h-[600px] overflow-y-auto"}`}>
          {transcriptText ?? ""}
        </pre>
        {translatedText && (
          <div className="mt-3 pt-3 border-t border-purple-100">
            <p className="text-[10px] text-purple-500 font-medium uppercase tracking-wide mb-1">Translation</p>
            <pre className="whitespace-pre-wrap text-sm text-purple-800 leading-relaxed font-sans">
              {translatedText}
            </pre>
          </div>
        )}
      </div>
    );
  }

  const hasSpeakers = segments.some((s) => s.speaker);

  return (
    <div>
      {hasSpeakers && !compact && (
        <div className="flex items-center gap-2 mb-3">
          {Array.from(speakerColorMap.entries()).map(([name, color]) => (
            <span key={name} className={`text-xs font-medium px-2 py-0.5 rounded-full ${color.badge}`}>
              {name}
            </span>
          ))}
        </div>
      )}
      <div className={`space-y-3 ${compact ? "" : "max-h-[600px] overflow-y-auto"}`}>
        {segments.map((seg, i) => {
          const color = speakerColorMap.get(seg.speaker);
          const transText = translatedSegments?.[i];
          const editable = !!onSegmentEdit && !!seg.id;
          return (
            <div
              key={seg.id ?? i}
              className={`rounded-lg p-2.5 ${color?.bg ?? "bg-gray-50"} ${editable ? "cursor-pointer hover:ring-2 hover:ring-blue-200" : ""}`}
              onClick={editable ? () => onSegmentEdit!(seg) : undefined}
              title={editable ? "Click to edit this segment" : undefined}
            >
              <div className="flex items-center gap-2 mb-1">
                {seg.speaker && (
                  <span className={`text-xs font-semibold ${color?.text ?? "text-gray-700"}`}>{seg.speaker}</span>
                )}
                <span className="text-xs text-gray-400 font-mono">{fmtTs(seg.startMs)}</span>
                {seg.id && (
                  <span className="text-[10px] text-gray-300 font-mono ml-auto">{seg.id.slice(0, 8)}</span>
                )}
              </div>
              <p className="text-sm text-gray-800 leading-relaxed">{seg.text}</p>
              {transText && (
                <p className="text-sm text-purple-700 leading-relaxed mt-1.5 pl-3 border-l-2 border-purple-200 italic">{transText}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ── Versions panel (combined, for bottom tabs) ──────────────────────────────

function VersionsPanel({ job, versions, onActivated }: { job: Job; versions: Version[]; onActivated: () => void }) {
  const [activating, setActivating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const activateVersion = async (version: Version) => {
    setActivating(version.id);
    try {
      const { error } = await supabase
        .from("transcription_jobs")
        .update({ transcript_text: version.transcript_text, word_count: version.word_count })
        .eq("id", job.id);
      if (error) throw error;

      await supabase
        .from("transcription_versions")
        .update({ is_active: false })
        .eq("job_id", job.id)
        .is("file_index", null);
      await supabase
        .from("transcription_versions")
        .update({ is_active: true })
        .eq("id", version.id);

      toast.success("Version activated — re-delivering...");
      supabase.functions.invoke("transcription-deliver", { body: { job_id: job.id } }).catch(() => {});
      onActivated();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to activate version");
    } finally {
      setActivating(null);
    }
  };

  if (versions.length === 0) {
    return <p className="text-gray-400 text-center py-8">No combined versions recorded</p>;
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
              <span className="text-sm text-gray-600">{v.provider}{v.model ? ` / ${v.model}` : ""}</span>
              <span className="text-xs text-gray-400">{format(new Date(v.created_at), "MMM d, HH:mm")}</span>
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
