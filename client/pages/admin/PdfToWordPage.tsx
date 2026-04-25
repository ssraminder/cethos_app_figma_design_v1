// client/pages/admin/PdfToWordPage.tsx
//
// Admin utility: upload scanned PDFs, convert each to DOCX with preserved
// layout. Two engines:
//   - Standard (Adobe PDF Services — pdf-to-word-convert) — fast, best for
//     clean printed English/Latin docs.
//   - AI (Mistral OCR + Pixtral — pdf-to-word-mistral) — slower but handles
//     multilingual, mixed-script, and handwritten documents much better.
// Output always DOCX. Standalone — not tied to quotes/orders.

import { useCallback, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  Loader2,
  Download,
  Trash2,
  CheckCircle,
  XCircle,
  RefreshCw,
  FileType2,
  Sparkles,
  Zap,
  X as XIcon,
} from "lucide-react";
import { supabase } from "../../lib/supabase";

const BUCKET = "pdf-to-word";
const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

type Engine = "adobe" | "mistral";
type QualityMode = "fast" | "thorough";
type Formatting = "preserve" | "clean";
type PageSize = "source" | "letter" | "a4" | "legal";

type JobStatus =
  | "queued"
  | "uploading"
  | "converting"
  | "done"
  | "error";

interface Job {
  id: string;
  file: File;
  name: string;
  size: number;
  status: JobStatus;
  progressMsg: string;
  outputSignedUrl?: string;
  outputSizeBytes?: number;
  error?: string;
}

const ADOBE_LANGS: { value: string; label: string }[] = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
  { value: "es-ES", label: "Spanish" },
  { value: "it-IT", label: "Italian" },
  { value: "pt-BR", label: "Portuguese (BR)" },
  { value: "nl-NL", label: "Dutch" },
  { value: "ja-JP", label: "Japanese" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "ko-KR", label: "Korean" },
];

// Common languages for the Mistral chip input; users can also type any free-form name.
const MISTRAL_SUGGESTIONS = [
  "English",
  "French",
  "Spanish",
  "German",
  "Italian",
  "Portuguese",
  "Dutch",
  "Arabic",
  "Hindi",
  "Punjabi",
  "Urdu",
  "Bengali",
  "Gujarati",
  "Tamil",
  "Telugu",
  "Marathi",
  "Nepali",
  "Chinese (Simplified)",
  "Chinese (Traditional)",
  "Japanese",
  "Korean",
  "Vietnamese",
  "Thai",
  "Russian",
  "Ukrainian",
  "Polish",
  "Turkish",
  "Persian",
  "Hebrew",
  "Tagalog",
];

export default function PdfToWordPage() {
  const [jobs, setJobs] = useState<Job[]>([]);

  // Shared
  const [engine, setEngine] = useState<Engine>("adobe");

  // Adobe
  const [adobeOcrLang, setAdobeOcrLang] = useState<string>("en-US");

  // Mistral
  const [mistralLangs, setMistralLangs] = useState<string[]>(["English"]);
  const [mistralLangInput, setMistralLangInput] = useState<string>("");
  const [qualityMode, setQualityMode] = useState<QualityMode>("thorough");
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [formatting, setFormatting] = useState<Formatting>("preserve");
  const [pageSize, setPageSize] = useState<PageSize>("source");
  const [embedPageImages, setEmbedPageImages] = useState<boolean>(false);

  const isProcessingRef = useRef(false);
  const jobsRef = useRef<Job[]>(jobs);
  jobsRef.current = jobs;

  const onDrop = useCallback((accepted: File[]) => {
    const valid: Job[] = [];
    for (const file of accepted) {
      if (file.type !== "application/pdf") {
        toast.error(`${file.name}: only PDF files are supported`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast.error(`${file.name}: exceeds ${MAX_FILE_SIZE_MB}MB limit`);
        continue;
      }
      valid.push({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        status: "queued",
        progressMsg: "Queued",
      });
    }
    if (valid.length > 0) {
      setJobs((prev) => [...valid, ...prev]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: true,
  });

  const updateJob = (id: string, patch: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  };

  const removeJob = (id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const addLang = (raw: string) => {
    const lang = raw.trim();
    if (!lang) return;
    if (mistralLangs.some((l) => l.toLowerCase() === lang.toLowerCase())) return;
    setMistralLangs((prev) => [...prev, lang]);
    setMistralLangInput("");
  };

  const removeLang = (lang: string) => {
    setMistralLangs((prev) => prev.filter((l) => l !== lang));
  };

  const processJob = async (job: Job) => {
    const inputPath = `input/${job.id}.pdf`;

    try {
      updateJob(job.id, { status: "uploading", progressMsg: "Uploading PDF…" });
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(inputPath, job.file, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (uploadErr) throw new Error(uploadErr.message);

      if (engine === "adobe") {
        updateJob(job.id, {
          status: "converting",
          progressMsg: "Running Adobe OCR + layout…",
        });
        const { data, error } = await supabase.functions.invoke(
          "pdf-to-word-convert",
          {
            body: {
              jobId: job.id,
              storagePath: inputPath,
              filename: job.name,
              ocrLang: adobeOcrLang,
            },
          },
        );
        if (error) throw new Error(error.message || "Conversion failed");
        if (!data?.success) throw new Error(data?.error || "Conversion failed");
        updateJob(job.id, {
          status: "done",
          progressMsg: "Ready to download",
          outputSignedUrl: data.signedUrl,
          outputSizeBytes: data.sizeBytes,
        });
      } else {
        // Mistral
        updateJob(job.id, {
          status: "converting",
          progressMsg:
            qualityMode === "thorough"
              ? "AI OCR + Pixtral correction…"
              : "AI OCR (fast)…",
        });
        const { data, error } = await supabase.functions.invoke(
          "pdf-to-word-mistral",
          {
            body: {
              jobId: job.id,
              storagePath: inputPath,
              filename: job.name,
              sourceLanguages: mistralLangs,
              qualityMode,
              autoRotate,
              formatting,
              pageSize,
              embedPageImages,
            },
          },
        );
        if (error) throw new Error(error.message || "Conversion failed");
        if (!data?.success) throw new Error(data?.error || "Conversion failed");
        updateJob(job.id, {
          status: "done",
          progressMsg: `Ready to download (${data.pages || "?"} pages)`,
          outputSignedUrl: data.signedUrl,
          outputSizeBytes: data.sizeBytes,
        });
      }
    } catch (err: any) {
      const msg = err?.message || "Unknown error";
      updateJob(job.id, { status: "error", progressMsg: "Failed", error: msg });
      toast.error(`${job.name}: ${msg}`);
    }
  };

  const runQueue = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    try {
      while (true) {
        const next = jobsRef.current.find((j) => j.status === "queued");
        if (!next) break;
        await processJob(next);
      }
    } finally {
      isProcessingRef.current = false;
    }
  };

  const startAll = () => {
    if (jobs.every((j) => j.status !== "queued")) {
      toast.info("Nothing to convert");
      return;
    }
    if (engine === "mistral" && mistralLangs.length === 0) {
      toast.error("Add at least one source language");
      return;
    }
    runQueue();
  };

  const retryJob = (job: Job) => {
    updateJob(job.id, {
      status: "queued",
      progressMsg: "Queued",
      error: undefined,
    });
    runQueue();
  };

  const clearCompleted = () => {
    setJobs((prev) =>
      prev.filter((j) => j.status !== "done" && j.status !== "error"),
    );
  };

  const downloadDocx = (job: Job) => {
    if (!job.outputSignedUrl) return;
    const a = document.createElement("a");
    a.href = job.outputSignedUrl;
    a.download = job.name.replace(/\.pdf$/i, "") + ".docx";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const queuedCount = jobs.filter((j) => j.status === "queued").length;
  const activeCount = jobs.filter(
    (j) => j.status === "uploading" || j.status === "converting",
  ).length;
  const doneCount = jobs.filter((j) => j.status === "done").length;
  const errorCount = jobs.filter((j) => j.status === "error").length;

  const remainingSuggestions = useMemo(
    () =>
      MISTRAL_SUGGESTIONS.filter(
        (s) =>
          !mistralLangs.some((l) => l.toLowerCase() === s.toLowerCase()) &&
          s.toLowerCase().includes(mistralLangInput.toLowerCase()),
      ).slice(0, 6),
    [mistralLangs, mistralLangInput],
  );

  const disabledBecauseActive = activeCount > 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileType2 className="w-6 h-6" />
          PDF → Word (OCR)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload scanned PDFs and download editable .docx files. Choose the
          engine that best matches your documents.
        </p>
      </div>

      {/* Engine toggle */}
      <div className="mb-4 border rounded-lg p-4 bg-muted/30">
        <div className="text-sm font-medium mb-3">OCR engine</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <EngineCard
            active={engine === "adobe"}
            disabled={disabledBecauseActive}
            onClick={() => setEngine("adobe")}
            icon={<Zap className="w-5 h-5" />}
            title="Standard (Adobe)"
            subtitle="Fast. Best for clean typed documents in a single language."
            meta="~30–60s per doc · $0.05/doc"
          />
          <EngineCard
            active={engine === "mistral"}
            disabled={disabledBecauseActive}
            onClick={() => setEngine("mistral")}
            icon={<Sparkles className="w-5 h-5" />}
            title="AI (Mistral)"
            subtitle="Multilingual, mixed scripts, and handwritten documents."
            meta={
              qualityMode === "thorough"
                ? "~30s/page · ~$0.003/page (thorough)"
                : "~10s/page · ~$0.001/page (fast)"
            }
          />
        </div>
      </div>

      {/* Config — Adobe */}
      {engine === "adobe" && (
        <div className="mb-4 border rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium">Adobe options</div>
          <div className="flex items-center gap-3">
            <label className="text-sm min-w-[140px]">Source language</label>
            <select
              value={adobeOcrLang}
              onChange={(e) => setAdobeOcrLang(e.target.value)}
              className="border rounded-md px-3 py-1.5 text-sm bg-background"
              disabled={disabledBecauseActive}
            >
              {ADOBE_LANGS.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              Adobe supports a single language per job.
            </span>
          </div>
        </div>
      )}

      {/* Config — Mistral */}
      {engine === "mistral" && (
        <div className="mb-4 border rounded-lg p-4 space-y-4">
          <div className="text-sm font-medium">AI options</div>

          {/* Source languages chip input */}
          <div>
            <label className="text-sm block mb-1.5">
              Source language(s) in document
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {mistralLangs.map((l) => (
                <span
                  key={l}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full"
                >
                  {l}
                  <button
                    type="button"
                    onClick={() => removeLang(l)}
                    className="hover:bg-primary/20 rounded-full p-0.5"
                    disabled={disabledBecauseActive}
                    aria-label={`Remove ${l}`}
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="relative">
              <input
                value={mistralLangInput}
                onChange={(e) => setMistralLangInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addLang(mistralLangInput);
                  } else if (
                    e.key === "Backspace" &&
                    !mistralLangInput &&
                    mistralLangs.length > 0
                  ) {
                    removeLang(mistralLangs[mistralLangs.length - 1]);
                  }
                }}
                placeholder="Type a language and press Enter (e.g. Hindi)"
                className="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
                disabled={disabledBecauseActive}
              />
              {mistralLangInput && remainingSuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-md">
                  {remainingSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addLang(s)}
                      className="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Used as hints — AI will still auto-detect, but hints improve
              mixed-script accuracy.
            </p>
          </div>

          {/* Quality, format, page size */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm block mb-1.5">Quality</label>
              <div className="flex gap-1.5">
                <QualityButton
                  active={qualityMode === "fast"}
                  onClick={() => setQualityMode("fast")}
                  disabled={disabledBecauseActive}
                  label="Fast"
                  hint="OCR only"
                />
                <QualityButton
                  active={qualityMode === "thorough"}
                  onClick={() => setQualityMode("thorough")}
                  disabled={disabledBecauseActive}
                  label="Thorough"
                  hint="+ vision correction"
                />
              </div>
            </div>

            <div>
              <label className="text-sm block mb-1.5">Formatting</label>
              <div className="flex gap-1.5">
                <QualityButton
                  active={formatting === "preserve"}
                  onClick={() => setFormatting("preserve")}
                  disabled={disabledBecauseActive}
                  label="Preserve"
                  hint="tables + structure"
                />
                <QualityButton
                  active={formatting === "clean"}
                  onClick={() => setFormatting("clean")}
                  disabled={disabledBecauseActive}
                  label="Clean"
                  hint="flat paragraphs"
                />
              </div>
            </div>

            <div>
              <label className="text-sm block mb-1.5">Output page size</label>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value as PageSize)}
                className="border rounded-md px-3 py-1.5 text-sm bg-background w-full"
                disabled={disabledBecauseActive}
              >
                <option value="source">Match source</option>
                <option value="letter">Letter (8.5 × 11 in)</option>
                <option value="a4">A4 (210 × 297 mm)</option>
                <option value="legal">Legal (8.5 × 14 in)</option>
              </select>
            </div>

            <div>
              <label className="text-sm block mb-1.5">Page orientation</label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoRotate}
                  onChange={(e) => setAutoRotate(e.target.checked)}
                  disabled={disabledBecauseActive}
                />
                Auto-rotate sideways / upside-down pages
              </label>
            </div>
          </div>

          {/* Embed page images — separate row so the explanation has room */}
          <div className="border-t pt-3">
            <label className="inline-flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={embedPageImages}
                onChange={(e) => setEmbedPageImages(e.target.checked)}
                disabled={disabledBecauseActive}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Embed source page images in output</span>
                <span className="block text-xs text-muted-foreground">
                  Each page&apos;s scanned image is inserted into the DOCX above
                  the extracted text — so the translator can always cross-reference
                  the original layout. Larger output file.
                </span>
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/30 hover:border-primary/60"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm font-medium">
          {isDragActive ? "Drop PDFs here" : "Drag PDFs here, or click to select"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Max {MAX_FILE_SIZE_MB}MB per file · PDF only
        </p>
      </div>

      {/* Action bar */}
      {jobs.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-muted-foreground">
            {jobs.length} file{jobs.length !== 1 ? "s" : ""} · {queuedCount} queued
            · {activeCount} running · {doneCount} done · {errorCount} failed
          </div>
          <div className="flex gap-2">
            <button
              onClick={clearCompleted}
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted disabled:opacity-50"
              disabled={doneCount + errorCount === 0}
            >
              Clear finished
            </button>
            <button
              onClick={startAll}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
              disabled={queuedCount === 0 || activeCount > 0}
            >
              {activeCount > 0 ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Converting…
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Convert {queuedCount > 0 ? `(${queuedCount})` : ""}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Job list */}
      {jobs.length > 0 && (
        <div className="mt-4 border rounded-lg divide-y">
          {jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              onRemove={() => removeJob(job.id)}
              onRetry={() => retryJob(job)}
              onDownload={() => downloadDocx(job)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EngineCard({
  active,
  disabled,
  onClick,
  icon,
  title,
  subtitle,
  meta,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  meta: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left p-3 rounded-lg border transition-colors ${
        active
          ? "border-primary bg-primary/5"
          : "border-muted hover:border-primary/40"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <div className="flex items-center gap-2 font-medium">
        <span className={active ? "text-primary" : "text-muted-foreground"}>
          {icon}
        </span>
        {title}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
      <div className="text-xs text-muted-foreground/70 mt-0.5">{meta}</div>
    </button>
  );
}

function QualityButton({
  active,
  onClick,
  disabled,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 text-left px-3 py-1.5 text-sm rounded-md border transition-colors ${
        active
          ? "border-primary bg-primary/5 text-primary"
          : "border-muted hover:border-primary/40"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <div className="font-medium">{label}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </button>
  );
}

function JobRow({
  job,
  onRemove,
  onRetry,
  onDownload,
}: {
  job: Job;
  onRemove: () => void;
  onRetry: () => void;
  onDownload: () => void;
}) {
  const StatusIcon = () => {
    switch (job.status) {
      case "queued":
        return <FileText className="w-5 h-5 text-muted-foreground" />;
      case "uploading":
      case "converting":
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case "done":
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case "error":
        return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  return (
    <div className="flex items-center gap-3 p-3">
      <StatusIcon />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{job.name}</div>
        <div className="text-xs text-muted-foreground">
          {formatBytes(job.size)} · {job.progressMsg}
          {job.status === "done" && job.outputSizeBytes !== undefined && (
            <> · DOCX {formatBytes(job.outputSizeBytes)}</>
          )}
          {job.status === "error" && job.error && (
            <span className="text-red-500"> — {job.error}</span>
          )}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        {job.status === "done" && (
          <button
            onClick={onDownload}
            className="px-2.5 py-1 text-xs border rounded-md hover:bg-muted flex items-center gap-1"
            title="Download .docx"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
        )}
        {job.status === "error" && (
          <button
            onClick={onRetry}
            className="px-2.5 py-1 text-xs border rounded-md hover:bg-muted flex items-center gap-1"
            title="Retry"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        )}
        {(job.status === "queued" ||
          job.status === "done" ||
          job.status === "error") && (
          <button
            onClick={onRemove}
            className="p-1 text-muted-foreground hover:text-red-500"
            title="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
