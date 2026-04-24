// client/pages/admin/PdfToWordPage.tsx
//
// Admin utility: upload scanned PDFs, convert each to DOCX with preserved
// layout via Adobe PDF Services OCR (edge function: pdf-to-word-convert),
// then download the .docx. Standalone — not tied to quotes/orders.

import { useCallback, useRef, useState } from "react";
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
} from "lucide-react";
import { supabase } from "../../lib/supabase";

const BUCKET = "pdf-to-word";
const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

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

const OCR_LANGS: { value: string; label: string }[] = [
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

export default function PdfToWordPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [ocrLang, setOcrLang] = useState<string>("en-US");
  const isProcessingRef = useRef(false);

  const onDrop = useCallback((accepted: File[]) => {
    const valid: Job[] = [];
    for (const file of accepted) {
      if (file.type !== "application/pdf") {
        toast.error(`${file.name}: only PDF files are supported`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast.error(
          `${file.name}: exceeds ${MAX_FILE_SIZE_MB}MB limit`,
        );
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
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, ...patch } : j)),
    );
  };

  const removeJob = (id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
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

      updateJob(job.id, {
        status: "converting",
        progressMsg: "Running OCR + layout extraction…",
      });

      const { data, error } = await supabase.functions.invoke(
        "pdf-to-word-convert",
        {
          body: {
            jobId: job.id,
            storagePath: inputPath,
            filename: job.name,
            ocrLang,
          },
        },
      );

      if (error) throw new Error(error.message || "Conversion failed");
      if (!data?.success) {
        throw new Error(data?.error || "Conversion failed");
      }

      updateJob(job.id, {
        status: "done",
        progressMsg: "Ready to download",
        outputSignedUrl: data.signedUrl,
        outputSizeBytes: data.sizeBytes,
      });
    } catch (err: any) {
      const msg = err?.message || "Unknown error";
      updateJob(job.id, {
        status: "error",
        progressMsg: "Failed",
        error: msg,
      });
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

  // keep a ref mirror so runQueue sees the latest list
  const jobsRef = useRef<Job[]>(jobs);
  jobsRef.current = jobs;

  const startAll = async () => {
    if (jobs.every((j) => j.status !== "queued")) {
      toast.info("Nothing to convert");
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
    const docxName = job.name.replace(/\.pdf$/i, "") + ".docx";
    a.download = docxName;
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileType2 className="w-6 h-6" />
          PDF → Word (OCR)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload scanned PDFs and download editable .docx files with the
          original layout preserved. Powered by Adobe PDF Services OCR.
        </p>
      </div>

      {/* Language selector */}
      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm font-medium">OCR language:</label>
        <select
          value={ocrLang}
          onChange={(e) => setOcrLang(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm bg-background"
          disabled={activeCount > 0}
        >
          {OCR_LANGS.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          Applies to all files in the current queue
        </span>
      </div>

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
          {isDragActive
            ? "Drop PDFs here"
            : "Drag PDFs here, or click to select"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Max {MAX_FILE_SIZE_MB}MB per file · PDF only
        </p>
      </div>

      {/* Action bar */}
      {jobs.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-muted-foreground">
            {jobs.length} file{jobs.length !== 1 ? "s" : ""} · {queuedCount}{" "}
            queued · {activeCount} running · {doneCount} done · {errorCount}{" "}
            failed
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
