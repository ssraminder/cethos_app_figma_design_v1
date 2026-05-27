import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileSearch,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Download,
  Eye,
  Upload,
  Loader2,
  X,
} from "lucide-react";
import { useDropdownOptions } from "@/hooks/useDropdownOptions";

interface TranscriptionJob {
  id: string;
  customer_email: string;
  file_name: string;
  file_duration_seconds: number;
  status: string;
  provider: string | null;
  detected_language: string | null;
  pricing_tier: string;
  amount_charged: number;
  payment_status: string;
  ai_quality_score: string | null;
  translation_requested: boolean;
  word_count: number | null;
  created_at: string;
  delivered_at: string | null;
}

interface Stats {
  total: number;
  processing: number;
  completed: number;
  failed: number;
  revenue: number;
  freeCount: number;
}

// ── Staff Transcription Tool (Full-Featured) ────────────────────────────────

const FORMAT_OPTIONS = [
  { key: "txt", label: "TXT", desc: "Plain text" },
  { key: "docx", label: "DOCX", desc: "Word document" },
  { key: "pdf", label: "PDF", desc: "PDF (text)" },
  { key: "srt", label: "SRT", desc: "Subtitles" },
  { key: "vtt", label: "VTT", desc: "Web subtitles" },
  { key: "json", label: "JSON", desc: "Structured data" },
];

const PROVIDER_OPTIONS = [
  { value: "google", label: "Google STT v2 (Chirp 2)", desc: "Widest catalog, 100+ langs incl. Punjabi/Persian/Pashto" },
  { value: "elevenlabs", label: "ElevenLabs Scribe v2", desc: "Strong for Indic/RTL, 90+ langs" },
  { value: "deepgram", label: "Deepgram Nova-3", desc: "Fast + cheap, but only 36 langs (no Punjabi/Persian)" },
  { value: "assemblyai", label: "AssemblyAI Universal-2", desc: "50+ languages" },
  { value: "openai", label: "OpenAI gpt-4o-transcribe", desc: "99+ languages" },
];

const LANG_SCRIPT_LABELS: Record<string, string> = {
  pa: "Gurmukhi (ਪੰਜਾਬੀ)",
  hi: "Devanagari (हिन्दी)",
  mr: "Devanagari (मराठी)",
  ne: "Devanagari (नेपाली)",
  bn: "Bengali (বাংলা)",
  ta: "Tamil (தமிழ்)",
  te: "Telugu (తెలుగు)",
  kn: "Kannada (ಕನ್ನಡ)",
  ml: "Malayalam (മലയാളം)",
  ur: "Arabic/Nastaliq (اردو)",
  ar: "Arabic (العربية)",
  fa: "Persian (فارسی)",
  th: "Thai (ไทย)",
  ka: "Georgian (ქართული)",
  ru: "Cyrillic (Русский)",
  uk: "Cyrillic (Українська)",
  el: "Greek (Ελληνικά)",
  ko: "Hangul (한국어)",
  ja: "Japanese (日本語)",
  zh: "CJK (中文)",
};

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "avi", "mkv", "webm", "wmv", "flv", "m4v"]);
const COMPRESS_THRESHOLD_BYTES = 25 * 1024 * 1024; // 25 MB

function isVideoFile(f: File): boolean {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.has(ext) || f.type.startsWith("video/");
}

function needsCompression(f: File): boolean {
  return isVideoFile(f) || f.size > COMPRESS_THRESHOLD_BYTES;
}

// Fast path for large audio files: resample to 16kHz mono WAV (no external lib)
async function compressToWav(f: File): Promise<{ audio: File; duration: number; format: string }> {
  const buf = await f.arrayBuffer();
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(buf);
  const duration = decoded.duration;
  const sr = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(duration * sr), sr);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  ctx.close();

  const pcm = rendered.getChannelData(0);
  const wavBuf = new ArrayBuffer(44 + pcm.length * 2);
  const dv = new DataView(wavBuf);
  const ws = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  ws(0, "RIFF");
  dv.setUint32(4, 36 + pcm.length * 2, true);
  ws(8, "WAVE");
  ws(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  ws(36, "data");
  dv.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  const blob = new Blob([wavBuf], { type: "audio/wav" });
  const baseName = f.name.replace(/\.[^.]+$/, "");
  return {
    audio: new File([blob], `${baseName}.wav`, { type: "audio/wav" }),
    duration: Math.ceil(duration),
    format: "wav",
  };
}

// Video files: real-time playback via <video> + MediaRecorder (WebM/Opus, no external lib)
async function extractFromVideo(
  f: File,
  onProgress?: (msg: string) => void,
): Promise<{ audio: File; duration: number; format: string }> {
  const url = URL.createObjectURL(f);
  try {
    const video = document.createElement("video");
    video.preload = "auto";
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Browser cannot decode this video format"));
      setTimeout(() => reject(new Error("Video load timeout")), 30000);
    });

    const duration = video.duration;
    const ctx = new AudioContext();
    await ctx.resume();

    const source = ctx.createMediaElementSource(video);
    const dest = ctx.createMediaStreamDestination();
    source.connect(dest);

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(dest.stream, { mimeType, audioBitsPerSecond: 64000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const recordingDone = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });
    const playbackDone = new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });

    const progressInterval = setInterval(() => {
      if (onProgress) {
        const pct = Math.round((video.currentTime / duration) * 100);
        onProgress(`Extracting audio… ${pct}%`);
      }
    }, 1000);

    recorder.start(1000);
    await video.play();
    await playbackDone;
    clearInterval(progressInterval);
    await new Promise((r) => setTimeout(r, 500));
    recorder.stop();
    const blob = await recordingDone;
    ctx.close();

    const baseName = f.name.replace(/\.[^.]+$/, "");
    return {
      audio: new File([blob], `${baseName}.webm`, { type: mimeType }),
      duration: Math.ceil(duration),
      format: "webm",
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function extractCompressedAudio(
  f: File,
  onProgress?: (msg: string) => void,
): Promise<{ audio: File; duration: number; format: string }> {
  if (isVideoFile(f)) {
    return await extractFromVideo(f, onProgress);
  }
  return await compressToWav(f);
}

function AdminUploadModal({ open, onClose, onUploaded }: { open: boolean; onClose: () => void; onUploaded: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");

  // Configuration
  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState("google");
  const [sourceLanguageId, setSourceLanguageId] = useState("");
  const [additionalLanguageIds, setAdditionalLanguageIds] = useState<string[]>([]);
  const [customInstructions, setCustomInstructions] = useState("");
  const [formats, setFormats] = useState<Set<string>>(new Set(["txt", "docx"]));
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [targetLanguageId, setTargetLanguageId] = useState("");
  const [humanReviewEnabled, setHumanReviewEnabled] = useState(false);
  const [humanReviewTier, setHumanReviewTier] = useState("standard");

  const { sourceLanguages, targetLanguages } = useDropdownOptions();

  const toggleFormat = (fmt: string) => {
    setFormats((prev) => {
      const next = new Set(prev);
      if (next.has(fmt)) {
        if (next.size > 1) next.delete(fmt);
      } else {
        next.add(fmt);
      }
      return next;
    });
  };

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const deduped = Array.from(newFiles).filter((f) => !existing.has(`${f.name}:${f.size}`));
      return [...prev, ...deduped];
    });
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setFiles([]);
    setEmail("");
    setProvider("google");
    setSourceLanguageId("");
    setAdditionalLanguageIds([]);
    setCustomInstructions("");
    setFormats(new Set(["txt", "docx"]));
    setTranslationEnabled(false);
    setTargetLanguageId("");
    setHumanReviewEnabled(false);
    setHumanReviewTier("standard");
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    if (formats.size === 0) { toast.error("Select at least one output format"); return; }
    if (translationEnabled && !targetLanguageId) { toast.error("Select a target language for translation"); return; }

    setUploading(true);
    const jobId = crypto.randomUUID();
    const sourceFiles: Array<{ name: string; path: string; size: number; duration: number; format: string }> = [];

    try {
      // Upload each file to storage under the same job ID
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Uploading file ${i + 1} of ${files.length}: ${file.name}`);

        let uploadFile = file;
        let durationSeconds = 60;
        let fileFormat = file.name.split(".").pop()?.toLowerCase() ?? "mp3";

        if (needsCompression(file)) {
          setProgress(isVideoFile(file) ? `Extracting audio: ${file.name}` : `Compressing: ${file.name}`);
          const result = await extractCompressedAudio(file, setProgress);
          uploadFile = result.audio;
          durationSeconds = result.duration;
          fileFormat = result.format;
        }

        const storagePath = `${jobId}/source/audio_${i}.${fileFormat}`;
        const buf = await uploadFile.arrayBuffer();
        const contentType = (uploadFile.type || "application/octet-stream").split(";")[0];

        const { error: upErr } = await supabase.storage
          .from("transcription-uploads")
          .upload(storagePath, buf, { contentType, upsert: false });
        if (upErr) throw new Error(`Upload failed for ${file.name}: ${upErr.message}`);

        if (!needsCompression(file)) {
          try {
            const audioCtx = new AudioContext();
            const audioBuffer = await audioCtx.decodeAudioData(buf.slice(0));
            durationSeconds = Math.ceil(audioBuffer.duration);
            audioCtx.close();
          } catch {
            durationSeconds = Math.max(1, Math.ceil(uploadFile.size / 16000));
          }
        }

        sourceFiles.push({
          name: file.name,
          path: storagePath,
          size: uploadFile.size,
          duration: durationSeconds,
          format: fileFormat,
        });
      }

      setProgress("Creating job...");
      const customerEmail = email.trim() || "internal@cethos.com";
      const totalDuration = sourceFiles.reduce((sum, f) => sum + f.duration, 0);
      const totalSize = sourceFiles.reduce((sum, f) => sum + f.size, 0);

      const { error: jobErr } = await supabase
        .from("transcription_jobs")
        .insert({
          id: jobId,
          customer_email: customerEmail,
          file_path: sourceFiles[0].path,
          file_name: sourceFiles.map((f) => f.name).join(", "),
          file_duration_seconds: totalDuration,
          file_size_bytes: totalSize,
          file_format: sourceFiles[0].format,
          status: "processing",
          provider,
          pricing_tier: "free",
          amount_charged: 0,
          payment_status: "none",
          delivery_formats: Array.from(formats),
          source_language_id: sourceLanguageId || null,
          additional_language_ids: additionalLanguageIds.length > 0 ? additionalLanguageIds : null,
          custom_instructions: customInstructions.trim() || null,
          translation_requested: translationEnabled,
          translation_target_language_id: translationEnabled && targetLanguageId ? targetLanguageId : null,
          translation_type: translationEnabled ? "ai_instant" : null,
          human_review_requested: humanReviewEnabled,
          human_review_tier: humanReviewEnabled ? humanReviewTier : null,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          source_files: sourceFiles.length > 1 ? sourceFiles : null,
        });

      if (jobErr) throw new Error(`Job insert failed: ${jobErr.message}`);

      setProgress("Starting transcription...");
      supabase.functions.invoke("transcription-process", {
        body: { job_id: jobId },
      }).catch((e) => console.error("Process trigger error:", e));

      toast.success("Transcription job created — processing started", {
        description: `${sourceFiles.length} file${sourceFiles.length > 1 ? "s" : ""} · Provider: ${provider}`,
      });
      resetForm();
      onClose();
      setTimeout(onUploaded, 2000);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
      setProgress("");
    }
  };

  if (!open) return null;

  const Toggle = ({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) => (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-gray-900" : "bg-gray-200"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Transcribe files</h2>
          <button onClick={() => { resetForm(); onClose(); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 pb-4 space-y-1 flex-1">
          {/* File Upload */}
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition mb-2 ${
              files.length > 0 ? "border-teal-400 bg-teal-50" : "border-gray-200 hover:border-gray-300"
            }`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); addFiles(e.dataTransfer.files); }}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="audio/*,video/*,.mp3,.wav,.m4a,.mp4,.mov,.webm,.ogg,.flac,.aac"
              className="hidden"
              onChange={(e) => { addFiles(e.target.files); if (fileRef.current) fileRef.current.value = ""; }}
            />
            <Upload className="w-6 h-6 mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-600">Click or drag files here</p>
            <p className="text-xs text-gray-400 mt-0.5">Audio & video · Multiple files OK · Up to 500MB each</p>
          </div>

          {files.length > 0 && (
            <div className="mb-4 space-y-1">
              {files.map((f, i) => (
                <div key={`${f.name}-${f.size}`} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 truncate">{f.name}</p>
                    <p className="text-xs text-gray-400">{(f.size / (1024 * 1024)).toFixed(1)} MB</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                    className="ml-2 p-1 text-gray-400 hover:text-red-500 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <p className="text-xs text-gray-400 text-center pt-1">
                {files.length} file{files.length > 1 ? "s" : ""} · {(files.reduce((a, f) => a + f.size, 0) / (1024 * 1024)).toFixed(1)} MB total
              </p>
            </div>
          )}

          {/* Primary Language */}
          <div className="flex items-center justify-between py-3">
            <p className="text-sm font-medium text-gray-900">Primary language</p>
            <select
              value={sourceLanguageId}
              onChange={(e) => setSourceLanguageId(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 max-w-[160px]"
            >
              <option value="">Detect</option>
              {sourceLanguages.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.name}{lang.native_name && lang.native_name !== lang.name ? ` (${lang.native_name})` : ""}
                </option>
              ))}
            </select>
          </div>
          {sourceLanguageId && (() => {
            const lang = sourceLanguages.find((l) => l.id === sourceLanguageId);
            const scriptHint = lang ? LANG_SCRIPT_LABELS[lang.code] : null;
            return scriptHint ? (
              <p className="text-xs text-teal-600 -mt-1 pb-2 pl-1">
                Output script: <strong>{scriptHint}</strong> — auto-enforced after transcription
              </p>
            ) : null;
          })()}

          {/* Additional languages (bilingual / code-switched audio) */}
          {sourceLanguageId && (
            <div className="py-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-gray-900">Additional languages</p>
                <span className="text-xs text-gray-400">code-switching</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">
                For bilingual audio (e.g. English + Kurdish). Google STT v2 (Chirp 2) is the only provider that supports this.
              </p>
              {additionalLanguageIds.map((id, idx) => {
                const lang = sourceLanguages.find((l) => l.id === id);
                return (
                  <div key={id} className="flex items-center gap-2 py-1">
                    <select
                      value={id}
                      onChange={(e) => {
                        const newId = e.target.value;
                        setAdditionalLanguageIds((prev) =>
                          newId ? prev.map((p, i) => (i === idx ? newId : p)) : prev.filter((_, i) => i !== idx),
                        );
                      }}
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="">— remove —</option>
                      {sourceLanguages
                        .filter((l) => l.id !== sourceLanguageId && !additionalLanguageIds.includes(l.id) || l.id === id)
                        .map((lang) => (
                          <option key={lang.id} value={lang.id}>
                            {lang.name}{lang.native_name && lang.native_name !== lang.name ? ` (${lang.native_name})` : ""}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setAdditionalLanguageIds((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1 text-gray-400 hover:text-red-500 rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  const firstAvailable = sourceLanguages.find(
                    (l) => l.id !== sourceLanguageId && !additionalLanguageIds.includes(l.id),
                  );
                  if (firstAvailable) setAdditionalLanguageIds((prev) => [...prev, firstAvailable.id]);
                }}
                className="text-xs text-teal-600 hover:text-teal-700 font-medium mt-1"
              >
                + Add another language
              </button>
            </div>
          )}

          <div className="border-t border-gray-100" />

          {/* Custom instructions for AI cleanup */}
          <div className="py-3">
            <p className="text-sm font-medium text-gray-900 mb-1.5">Custom instructions for AI cleanup</p>
            <p className="text-xs text-gray-500 mb-2">
              Free-form guidance for the Claude proofread step. Examples: "Treat unrecognized text as Badini Kurdish; preserve original script." "Speaker 1 is the judge; preserve legal terms verbatim."
            </p>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="(optional)"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
            />
          </div>

          <div className="border-t border-gray-100" />

          {/* Provider */}
          <div className="flex items-center justify-between py-3">
            <p className="text-sm font-medium text-gray-900">Provider</p>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 max-w-[200px]"
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="border-t border-gray-100" />

          {/* Toggle options */}
          <Toggle
            checked={translationEnabled}
            onChange={setTranslationEnabled}
            label="AI Translation"
            desc="Claude Sonnet, instant"
          />
          {translationEnabled && (
            <div className="pb-3">
              <select
                value={targetLanguageId}
                onChange={(e) => setTargetLanguageId(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Select target language...</option>
                {targetLanguages.map((lang) => (
                  <option key={lang.id} value={lang.id}>
                    {lang.name}{lang.native_name && lang.native_name !== lang.name ? ` (${lang.native_name})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="border-t border-gray-100" />

          <Toggle
            checked={humanReviewEnabled}
            onChange={setHumanReviewEnabled}
            label="Human review"
          />
          {humanReviewEnabled && (
            <div className="pb-3 flex gap-2">
              {[
                { value: "standard", label: "Standard (24–48h)" },
                { value: "rush", label: "Rush (4–8h)" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setHumanReviewTier(opt.value)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                    humanReviewTier === opt.value ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-gray-100" />

          {/* Output Formats */}
          <div className="py-3">
            <p className="text-sm font-medium text-gray-900 mb-2">Output formats</p>
            <div className="flex flex-wrap gap-1.5">
              {FORMAT_OPTIONS.map((fmt) => (
                <button
                  key={fmt.key}
                  onClick={() => toggleFormat(fmt.key)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                    formats.has(fmt.key) ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Recipient Email */}
          <div className="py-3">
            <p className="text-sm font-medium text-gray-900 mb-1.5">Recipient email</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Leave blank for internal use"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex-shrink-0">
          {progress ? (
            <div className="flex items-center justify-center gap-2 text-sm text-teal-700 mb-3">
              <Loader2 className="w-4 h-4 animate-spin" />
              {progress}
            </div>
          ) : null}
          <button
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
            className="w-full py-2.5 text-sm bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {files.length > 1 ? `Upload ${files.length} files` : "Upload file"}
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "expired", label: "Expired" },
];

const TIER_OPTIONS = [
  { value: "", label: "All Tiers" },
  { value: "free", label: "Free" },
  { value: "standard", label: "Standard (Paid)" },
];

const PAGE_SIZE = 25;

const STATUS_BADGES: Record<string, { bg: string; text: string; icon: typeof CheckCircle }> = {
  pending: { bg: "bg-yellow-50 border-yellow-200", text: "text-yellow-700", icon: Clock },
  processing: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", icon: RefreshCw },
  completed: { bg: "bg-green-50 border-green-200", text: "text-green-700", icon: CheckCircle },
  failed: { bg: "bg-red-50 border-red-200", text: "text-red-700", icon: XCircle },
  expired: { bg: "bg-gray-50 border-gray-200", text: "text-gray-500", icon: AlertCircle },
};

const QUALITY_COLORS: Record<string, string> = {
  A: "text-green-700 bg-green-50",
  B: "text-blue-700 bg-blue-50",
  C: "text-yellow-700 bg-yellow-50",
  D: "text-red-700 bg-red-50",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function TranscriptionDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState<TranscriptionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({ total: 0, processing: 0, completed: 0, failed: 0, revenue: 0, freeCount: 0 });
  const [totalCount, setTotalCount] = useState(0);
  const [showUpload, setShowUpload] = useState(false);

  const statusFilter = searchParams.get("status") || "";
  const tierFilter = searchParams.get("tier") || "";
  const searchQuery = searchParams.get("q") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("transcription_jobs")
        .select("id, customer_email, file_name, file_duration_seconds, status, provider, detected_language, pricing_tier, amount_charged, payment_status, ai_quality_score, translation_requested, word_count, created_at, delivered_at", { count: "exact" })
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (statusFilter) query = query.eq("status", statusFilter);
      if (tierFilter) query = query.eq("pricing_tier", tierFilter);
      if (searchQuery) query = query.or(`customer_email.ilike.%${searchQuery}%,file_name.ilike.%${searchQuery}%`);

      const { data, count, error } = await query;
      if (error) throw error;
      setJobs((data ?? []) as TranscriptionJob[]);
      setTotalCount(count ?? 0);
    } catch (e) {
      toast.error("Failed to load transcription jobs");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase
        .from("transcription_jobs")
        .select("status, pricing_tier, amount_charged")
        .is("deleted_at", null);

      if (error) throw error;

      const rows = data ?? [];
      setStats({
        total: rows.length,
        processing: rows.filter((r) => r.status === "processing").length,
        completed: rows.filter((r) => r.status === "completed").length,
        failed: rows.filter((r) => r.status === "failed").length,
        revenue: rows.reduce((sum, r) => sum + (r.amount_charged ?? 0), 0),
        freeCount: rows.filter((r) => r.pricing_tier === "free").length,
      });
    } catch {
      // stats are nice-to-have
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [statusFilter, tierFilter, searchQuery, page]);

  useEffect(() => {
    fetchStats();
  }, []);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Transcription Jobs</h1>
              <p className="text-sm text-gray-500 mt-1">AI transcription service management</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-teal-600 text-white hover:bg-teal-700 rounded-lg"
              >
                <Upload className="w-4 h-4" />
                Transcribe
              </button>
              <button
                onClick={() => { fetchJobs(); fetchStats(); }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <StatCard label="Total Jobs" value={stats.total} icon={FileSearch} />
          <StatCard label="Processing" value={stats.processing} icon={RefreshCw} color="blue" />
          <StatCard label="Completed" value={stats.completed} icon={CheckCircle} color="green" />
          <StatCard label="Failed" value={stats.failed} icon={XCircle} color="red" />
          <StatCard label="Revenue" value={`$${stats.revenue.toFixed(2)}`} icon={DollarSign} color="teal" />
          <StatCard label="Free Uses" value={stats.freeCount} icon={Clock} color="gray" />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by email or filename..."
              value={searchQuery}
              onChange={(e) => updateParam("q", e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => updateParam("status", e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={tierFilter}
            onChange={(e) => updateParam("tier", e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {TIER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <FileSearch className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No transcription jobs found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">File</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Duration</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Quality</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Tier</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Language</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Charged</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {jobs.map((job) => {
                    const badge = STATUS_BADGES[job.status] ?? STATUS_BADGES.pending;
                    const BadgeIcon = badge.icon;
                    return (
                      <tr key={job.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="text-gray-900 truncate max-w-[180px] block">{job.customer_email}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-gray-700 truncate max-w-[150px] block" title={job.file_name}>
                            {job.file_name}
                          </span>
                          {job.translation_requested && (
                            <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded mt-0.5 inline-block">+ Translation</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{formatDuration(job.file_duration_seconds)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${badge.bg} ${badge.text}`}>
                            <BadgeIcon className="w-3 h-3" />
                            {job.status}
                          </span>
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
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            job.pricing_tier === "free" ? "bg-gray-100 text-gray-600" : "bg-teal-50 text-teal-700"
                          }`}>
                            {job.pricing_tier}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 capitalize text-xs">
                          {job.detected_language ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-700">
                          {job.amount_charged > 0 ? `$${job.amount_charged.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {format(new Date(job.created_at), "MMM d, yyyy HH:mm")}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link
                            to={`/admin/transcription/${job.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-teal-700 hover:bg-teal-50 rounded"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-600">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => updateParam("page", String(page - 1))}
                  className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1 text-sm text-gray-700">Page {page} of {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => updateParam("page", String(page + 1))}
                  className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <AdminUploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onUploaded={() => { fetchJobs(); fetchStats(); }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color = "gray",
}: {
  label: string;
  value: string | number;
  icon: typeof FileSearch;
  color?: string;
}) {
  const colors: Record<string, string> = {
    gray: "text-gray-600 bg-gray-50",
    blue: "text-blue-600 bg-blue-50",
    green: "text-green-600 bg-green-50",
    red: "text-red-600 bg-red-50",
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
