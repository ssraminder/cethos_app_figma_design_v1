import { useState, useRef, useEffect } from "react";
import { useQuote } from "@/context/QuoteContext";
import { supabase } from "@/lib/supabase";
import {
  createCustomerQuote,
  updateCustomerQuote,
  finalizeCustomerQuoteFiles,
} from "@/lib/customer-quote-api";
import StartOverLink from "@/components/quote/StartOverLink";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { ChevronRight, X, Loader2, CheckCircle, XCircle, Paperclip } from "lucide-react";
import { compressPdfIfNeeded, needsCompression } from "@/utils/compressPdf";
import { trackQuoteStep, trackFileUpload } from "@/lib/tracking";

// ── Constants ───────────────────────────────────────────────────────────────

const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const ACCEPTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.docx";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const POPULAR_LANGUAGE_CODES = ['en', 'fr', 'es', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ar', 'ru', 'hi', 'nl', 'pl', 'uk'];

// ── Local types ─────────────────────────────────────────────────────────────

interface LocalFile {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  status: "uploading" | "success" | "error";
  progress: number;
  storagePath?: string;
  error?: string;
}

interface LanguageOption {
  id: string;
  name: string;
  code: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function fileIcon(mime: string): string {
  return mime.startsWith("image/") ? "\u{1F5BC}\uFE0F" : "\u{1F4C4}";
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Step1Upload() {
  const { state, updateState, goToNextStep } = useQuote();

  // File state (managed locally — File objects can't be serialised to context)
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Language state
  const [sourceLanguages, setSourceLanguages] = useState<LanguageOption[]>([]);
  const [targetLanguages, setTargetLanguages] = useState<LanguageOption[]>([]);
  const [sourceLanguageId, setSourceLanguageId] = useState(
    state.sourceLanguageId || "",
  );
  const [targetLanguageId, setTargetLanguageId] = useState(
    state.targetLanguageId || "",
  );

  // Reference file state
  const [refFiles, setRefFiles] = useState<LocalFile[]>([]);
  const [isRefDragging, setIsRefDragging] = useState(false);
  const refFileInputRef = useRef<HTMLInputElement>(null);
  const [refSectionOpen, setRefSectionOpen] = useState(false);

  // UI state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOptimising, setIsOptimising] = useState(false);

  // ── Fetch languages on mount ────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function fetchLanguages() {
      if (!supabase) return;

      const [srcRes, tgtRes] = await Promise.all([
        supabase
          .from("languages")
          .select("id, name, code")
          .eq("is_active", true)
          .eq("is_source_available", true)
          .order("sort_order")
          .order("name"),
        supabase
          .from("languages")
          .select("id, name, code")
          .eq("is_active", true)
          .eq("is_target_available", true)
          .order("sort_order")
          .order("name"),
      ]);

      if (cancelled) return;

      if (srcRes.data) setSourceLanguages(srcRes.data);
      if (tgtRes.data) {
        setTargetLanguages(tgtRes.data);
        // Default target to English when no prior selection
        if (!state.targetLanguageId) {
          const english = tgtRes.data.find(
            (l) => l.code === "en" || l.code === "eng",
          );
          if (english) {
            setTargetLanguageId(english.id);
            updateState({ targetLanguageId: english.id });
          }
        }
      }
    }

    fetchLanguages();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Language handlers ───────────────────────────────────────────────────

  const handleSourceChange = (id: string) => {
    setSourceLanguageId(id);
    updateState({ sourceLanguageId: id });
    clearError("sourceLanguage");
    if (id !== targetLanguageId) clearError("sameLang");
  };

  const handleTargetChange = (id: string) => {
    setTargetLanguageId(id);
    updateState({ targetLanguageId: id });
    clearError("targetLanguage");
    if (id !== sourceLanguageId) clearError("sameLang");
  };

  // ── Error helpers ───────────────────────────────────────────────────────

  const clearError = (key: string) => {
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // ── File validation & processing ────────────────────────────────────────

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      return `${file.name}: Unsupported file type. Please upload PDF, JPG, PNG, or DOCX.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `${file.name}: File exceeds 20 MB limit.`;
    }
    return null;
  };

  const processFiles = async (rawFiles: File[]) => {
    // Compress large PDFs before processing
    const hasBig = rawFiles.some(needsCompression);
    if (hasBig) setIsOptimising(true);

    let files: File[];
    try {
      files = await Promise.all(rawFiles.map(compressPdfIfNeeded));
    } finally {
      setIsOptimising(false);
    }

    const newFiles: LocalFile[] = [];
    const fileErrors: string[] = [];

    for (const file of files) {
      // Skip duplicates
      if (localFiles.some((f) => f.name === file.name && f.size === file.size))
        continue;

      const err = validateFile(file);
      if (err) {
        fileErrors.push(err);
        continue;
      }

      newFiles.push({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        status: "uploading",
        progress: 0,
      });
    }

    if (fileErrors.length > 0) {
      setErrors((prev) => ({ ...prev, files: fileErrors.join(" ") }));
    } else {
      clearError("files");
    }

    if (newFiles.length > 0) {
      setLocalFiles((prev) => [...prev, ...newFiles]);
      clearError("noFiles");

      // Upload each file to Supabase storage immediately
      newFiles.forEach((lf) => uploadFile(lf));
    }
  };

  /** Upload a single file to Supabase storage (temp path). */
  const uploadFile = async (localFile: LocalFile) => {
    // Simulate progress since Supabase JS SDK doesn't emit progress events
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 25 + 5;
      if (progress >= 95) {
        clearInterval(interval);
        progress = 95;
      }
      setLocalFiles((prev) =>
        prev.map((f) =>
          f.id === localFile.id && f.status === "uploading"
            ? { ...f, progress: Math.min(Math.round(progress), 95) }
            : f,
        ),
      );
    }, 200);

    try {
      if (!supabase) throw new Error("Supabase not configured");

      const ext = localFile.name.split(".").pop();
      const tempPath = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage
        .from("quote-files")
        .upload(tempPath, localFile.file, {
          cacheControl: "3600",
          upsert: false,
        });

      clearInterval(interval);

      if (error) throw error;

      setLocalFiles((prev) =>
        prev.map((f) =>
          f.id === localFile.id
            ? { ...f, progress: 100, status: "success", storagePath: tempPath }
            : f,
        ),
      );
    } catch (err: any) {
      clearInterval(interval);
      setLocalFiles((prev) =>
        prev.map((f) =>
          f.id === localFile.id
            ? {
                ...f,
                status: "error",
                error: err?.message || "Upload failed",
              }
            : f,
        ),
      );
    }
  };

  /** Remove a file from the list (and from storage if already uploaded). */
  const removeFile = (fileId: string) => {
    const file = localFiles.find((f) => f.id === fileId);

    // Clean up from storage if it was uploaded
    if (file?.storagePath && supabase) {
      supabase.storage
        .from("quote-files")
        .remove([file.storagePath])
        .catch(() => {});
    }

    setLocalFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // ── Drag-and-drop handlers ─────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(Array.from(e.target.files));
      e.target.value = ""; // allow re-selecting same file
    }
  };

  // ── Reference file handlers ─────────────────────────────────────────────

  const processRefFiles = async (rawFiles: File[]) => {
    // Compress large PDFs before processing
    const hasBig = rawFiles.some(needsCompression);
    if (hasBig) setIsOptimising(true);

    let files: File[];
    try {
      files = await Promise.all(rawFiles.map(compressPdfIfNeeded));
    } finally {
      setIsOptimising(false);
    }

    const newFiles: LocalFile[] = [];
    const fileErrors: string[] = [];

    for (const file of files) {
      if (refFiles.some((f) => f.name === file.name && f.size === file.size))
        continue;

      const err = validateFile(file);
      if (err) {
        fileErrors.push(err);
        continue;
      }

      newFiles.push({
        id: `ref-${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        status: "uploading",
        progress: 0,
      });
    }

    if (fileErrors.length > 0) {
      setErrors((prev) => ({ ...prev, refFiles: fileErrors.join(" ") }));
    } else {
      clearError("refFiles");
    }

    if (newFiles.length > 0) {
      setRefFiles((prev) => [...prev, ...newFiles]);
      newFiles.forEach((lf) => uploadRefFile(lf));
    }
  };

  const uploadRefFile = async (localFile: LocalFile) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 25 + 5;
      if (progress >= 95) {
        clearInterval(interval);
        progress = 95;
      }
      setRefFiles((prev) =>
        prev.map((f) =>
          f.id === localFile.id && f.status === "uploading"
            ? { ...f, progress: Math.min(Math.round(progress), 95) }
            : f,
        ),
      );
    }, 200);

    try {
      if (!supabase) throw new Error("Supabase not configured");

      const ext = localFile.name.split(".").pop();
      const tempPath = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage
        .from("quote-reference-files")
        .upload(tempPath, localFile.file, {
          cacheControl: "3600",
          upsert: false,
        });

      clearInterval(interval);

      if (error) throw error;

      setRefFiles((prev) =>
        prev.map((f) =>
          f.id === localFile.id
            ? { ...f, progress: 100, status: "success", storagePath: tempPath }
            : f,
        ),
      );
    } catch (err: any) {
      clearInterval(interval);
      setRefFiles((prev) =>
        prev.map((f) =>
          f.id === localFile.id
            ? {
                ...f,
                status: "error",
                error: err?.message || "Upload failed",
              }
            : f,
        ),
      );
    }
  };

  const removeRefFile = (fileId: string) => {
    const file = refFiles.find((f) => f.id === fileId);

    if (file?.storagePath && supabase) {
      supabase.storage
        .from("quote-reference-files")
        .remove([file.storagePath])
        .catch(() => {});
    }

    setRefFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const handleRefDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsRefDragging(true);
  };

  const handleRefDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsRefDragging(false);
  };

  const handleRefDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsRefDragging(false);
    processRefFiles(Array.from(e.dataTransfer.files));
  };

  const handleRefFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processRefFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  // ── Validation ──────────────────────────────────────────────────────────

  const successFiles = localFiles.filter((f) => f.status === "success");

  const canContinue =
    successFiles.length > 0 &&
    !!sourceLanguageId &&
    !!targetLanguageId &&
    sourceLanguageId !== targetLanguageId;

  const validate = (): boolean => {
    const next: Record<string, string> = {};

    if (successFiles.length === 0) {
      next.noFiles = "Please upload at least one document.";
    }
    if (!sourceLanguageId) {
      next.sourceLanguage = "Please select a source language.";
    }
    if (!targetLanguageId) {
      next.targetLanguage = "Please select a target language.";
    }
    if (
      sourceLanguageId &&
      targetLanguageId &&
      sourceLanguageId === targetLanguageId
    ) {
      next.sameLang = "Source and target languages must be different.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // ── Continue handler ────────────────────────────────────────────────────

  const handleContinue = async () => {
    if (!validate() || isSubmitting) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      if (!supabase) throw new Error("Supabase not configured");

      let quoteId = state.quoteId;
      let quoteNumber = state.quoteNumber;

      // 1. Create or update quote via edge function (anon RLS blocks direct writes)
      if (!quoteId) {
        // Read partner data from sessionStorage (set by ?ref= capture)
        const partnerId = sessionStorage.getItem("cethos_partner_id");
        const partnerCode = sessionStorage.getItem("cethos_partner_code");
        const partnerRate = sessionStorage.getItem("cethos_partner_rate");

        const created = await createCustomerQuote({
          source_language_id: sourceLanguageId,
          target_language_id: targetLanguageId,
          ...(partnerId
            ? {
                partner_id: partnerId,
                partner_code: partnerCode,
                partner_rate: partnerRate ?? undefined,
                referral_url: window.location.href,
              }
            : {}),
        });

        quoteId = created.id;
        quoteNumber = created.quote_number;
        updateState({ quoteId, quoteNumber });
      } else {
        // Update languages on existing quote
        await updateCustomerQuote(quoteId, {
          source_language_id: sourceLanguageId,
          target_language_id: targetLanguageId,
        });
      }

      // 2. Finalize uploaded translation files via edge function.
      // The client already uploaded each file to `uploads/<temp>` (anon
      // INSERT is allowed only under the `uploads/` prefix by the lockdown
      // migration). The edge function moves objects to `<quoteId>/<file>`
      // and inserts the quote_files row using service role.
      const translationFinalizeInput = successFiles
        .filter((lf) => lf.storagePath)
        .map((lf) => ({
          temp_path: lf.storagePath!,
          original_filename: lf.name,
          file_size: lf.size,
          mime_type: lf.mimeType,
          is_reference: false,
        }));

      if (translationFinalizeInput.length > 0) {
        const res = await finalizeCustomerQuoteFiles(quoteId!, translationFinalizeInput);
        if (res.errors.length > 0) {
          console.error("Some translation files failed to finalize:", res.errors);
        }
      }

      // 2b. Finalize reference files via the same edge function.
      const successRefFiles = refFiles.filter((f) => f.status === "success");
      const referenceFinalizeInput = successRefFiles
        .filter((rf) => rf.storagePath)
        .map((rf) => ({
          temp_path: rf.storagePath!,
          original_filename: rf.name,
          file_size: rf.size,
          mime_type: rf.mimeType,
          is_reference: true,
        }));

      if (referenceFinalizeInput.length > 0) {
        const res = await finalizeCustomerQuoteFiles(quoteId!, referenceFinalizeInput);
        if (res.errors.length > 0) {
          console.error("Some reference files failed to finalize:", res.errors);
        }
      }

      // 3. Fire AI processing (fire and forget — don't await)
      // keepalive: true tells the browser to hold the connection open even
      // if the page navigates away before the response arrives. Without it,
      // navigating from Step 1 → Step 2 immediately after the call (which
      // happens on line 614) cancels the request before it reaches the
      // server — the quote ends up with the file uploaded but OCR never
      // triggered, processing_status stuck at 'pending'. Caught on
      // QT26-10514 where the file sat on disk and no ocr_batches were ever
      // created. keepalive caps the body at 64 KB; our payload is < 100 B.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      fetch(`${supabaseUrl}/functions/v1/process-quote-documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ quoteId }),
        keepalive: true,
      }).catch((err) => {
        // Defensive: with keepalive the request is durable, but we still
        // want a visible signal if the fetch initialization itself failed.
        console.error("process-quote-documents fire-and-forget failed:", err);
      });

      // 4. Track file upload conversion event
      const totalSizeMB = localFiles.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024);
      trackFileUpload(localFiles.length, totalSizeMB);
      trackQuoteStep(1, "file_upload", quoteId);

      // 5. Navigate to Step 2
      goToNextStep();
    } catch (err: any) {
      console.error("Error in Step 1 Continue:", err);
      setErrors({
        submit:
          err?.message || "Something went wrong. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* Page Title */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy mb-2">
          Upload Your Documents
        </h1>
        <p className="text-base text-cethos-gray">
          Upload the documents you need translated.
        </p>
        <p className="text-sm text-cethos-gray-light mt-1">
          PDF, JPG, PNG, DOCX up to 20MB each.
        </p>
      </div>

      {/* ── Dropzone ────────────────────────────────────────────────────── */}
      <div
        role="button"
        tabIndex={0}
        className={`border-2 border-dashed rounded-xl p-9 text-center cursor-pointer bg-white transition ${
          isDragging
            ? "border-teal-500 bg-teal-50"
            : "border-gray-300 hover:border-teal-500 hover:bg-teal-50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
        }}
      >
        <div className="flex flex-col items-center py-3">
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-gray-400 mb-4"
          >
            <path
              d="M30 4H12C10.9391 4 9.92172 4.42143 9.17157 5.17157C8.42143 5.92172 8 6.93913 8 8V40C8 41.0609 8.42143 42.0783 9.17157 42.8284C9.92172 43.5786 10.9391 44 12 44H36C37.0609 44 38.0783 43.5786 38.8284 42.8284C39.5786 42.0783 40 41.0609 40 40V14L30 4Z"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M28 4V12C28 13.0609 28.4214 14.0783 29.1716 14.8284C29.9217 15.5786 30.9391 16 32 16H40"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M24 22V34"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M18 28L24 22L30 28"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-base text-gray-700">
            Drag and drop files or click to browse
          </p>
          <p className="text-sm text-gray-400 mt-1">
            PDF, JPG, PNG, DOCX &mdash; max 20MB per file
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Optimising indicator */}
      {isOptimising && (
        <p className="text-sm text-blue-600 mt-2 flex items-center gap-1">
          <span className="animate-spin">⏳</span> Optimising files for upload...
        </p>
      )}

      {/* File-level validation error */}
      {errors.files && (
        <p className="text-sm text-red-600 mt-2">{errors.files}</p>
      )}
      {errors.noFiles && (
        <p className="text-sm text-red-600 mt-2">{errors.noFiles}</p>
      )}

      {/* ── File List ───────────────────────────────────────────────────── */}
      {localFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          {localFiles.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2.5 p-2.5 px-3.5 bg-white border border-gray-200 rounded-lg mt-2"
            >
              {/* Icon */}
              <span className="text-lg flex-shrink-0">
                {fileIcon(f.mimeType)}
              </span>

              {/* Filename + progress */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 truncate">{f.name}</p>
                {f.status === "uploading" && (
                  <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                    <div
                      className="bg-teal-500 h-1 rounded-full transition-all duration-200"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}
                {f.status === "error" && f.error && (
                  <p className="text-xs text-red-500 mt-0.5 truncate">
                    {f.error}
                  </p>
                )}
              </div>

              {/* Size */}
              <span className="text-xs text-gray-400 flex-shrink-0">
                {formatFileSize(f.size)}
              </span>

              {/* Status indicator */}
              <span className="flex-shrink-0">
                {f.status === "uploading" && (
                  <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                )}
                {f.status === "success" && (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                )}
                {f.status === "error" && (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
              </span>

              {/* Remove */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(f.id);
                }}
                className="p-1 text-gray-400 hover:text-red-500 transition flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Language Dropdowns ───────────────────────────────────────────── */}
      <div className="flex gap-3.5 mt-6">
        {/* Source Language */}
        <div className="flex-1">
          <SearchableSelect
            options={sourceLanguages.map((lang) => ({
              value: lang.id,
              label: lang.name,
              group: POPULAR_LANGUAGE_CODES.includes(lang.code?.split('-')[0]) ? "Common" : "Other",
            }))}
            value={sourceLanguageId}
            onChange={handleSourceChange}
            placeholder="Select source language"
            label="Source Language"
            required={true}
            error={errors.sourceLanguage || errors.sameLang}
            groupOrder={["Common", "Other"]}
          />
        </div>

        {/* Target Language */}
        <div className="flex-1">
          <SearchableSelect
            options={targetLanguages
              .filter((lang) => lang.id !== sourceLanguageId)
              .map((lang) => ({
                value: lang.id,
                label: lang.name,
                group: POPULAR_LANGUAGE_CODES.includes(lang.code?.split('-')[0]) ? "Common" : "Other",
              }))}
            value={targetLanguageId}
            onChange={handleTargetChange}
            placeholder="Select target language"
            label="Target Language"
            required={true}
            error={errors.targetLanguage || errors.sameLang}
            groupOrder={["Common", "Other"]}
          />
        </div>
      </div>

      {/* Same-language error */}
      {errors.sameLang && (
        <p className="text-sm text-red-600 mt-2">{errors.sameLang}</p>
      )}

      {/* Reference Files Accordion */}
      <div className="mt-6 border border-gray-200 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setRefSectionOpen(!refSectionOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition text-left"
        >
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">
              Reference Files
              <span className="text-gray-400 font-normal ml-1">(optional)</span>
            </span>
            {!refSectionOpen && refFiles.length > 0 && (
              <span className="bg-teal-100 text-teal-700 text-xs px-1.5 py-0.5 rounded-full">
                {refFiles.length}
              </span>
            )}
          </div>
          <ChevronRight
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
              refSectionOpen ? "rotate-90" : ""
            }`}
          />
        </button>

        {refSectionOpen && (
          <div className="px-4 py-4">
            <p className="text-xs text-gray-500 mb-3">
              Upload glossaries, style guides, or reference materials to help the translator. These files won't be translated or counted toward pricing.
            </p>

            <div
              role="button"
              tabIndex={0}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                isRefDragging
                  ? "border-gray-400 bg-gray-50"
                  : "border-gray-200 bg-gray-50/50 hover:border-gray-400 hover:bg-gray-50"
              }`}
              onDragOver={handleRefDragOver}
              onDragLeave={handleRefDragLeave}
              onDrop={handleRefDrop}
              onClick={() => refFileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") refFileInputRef.current?.click();
              }}
            >
              <div className="flex flex-col items-center py-2">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 mb-2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                </svg>
                <p className="text-sm text-gray-500">
                  Drag and drop reference files or click to browse
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  PDF, JPG, PNG, DOCX &mdash; max 20MB per file
                </p>
              </div>

              <input
                ref={refFileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleRefFileSelect}
                className="hidden"
              />
            </div>

            {errors.refFiles && (
              <p className="text-sm text-red-600 mt-2">{errors.refFiles}</p>
            )}

            {refFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                {refFiles.map((f) => (
                  <div key={f.id} className="flex items-center gap-2.5 p-2.5 px-3.5 bg-white border border-gray-200 rounded-lg">
                    <span className="text-lg flex-shrink-0">{fileIcon(f.mimeType)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">{f.name}</p>
                      {f.status === "uploading" && (
                        <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                          <div className="bg-gray-400 h-1 rounded-full transition-all duration-200" style={{ width: `${f.progress}%` }} />
                        </div>
                      )}
                      {f.status === "error" && f.error && (
                        <p className="text-xs text-red-500 mt-0.5 truncate">{f.error}</p>
                      )}
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">Ref</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatFileSize(f.size)}</span>
                    <span className="flex-shrink-0">
                      {f.status === "uploading" && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                      {f.status === "success" && <CheckCircle className="w-4 h-4 text-green-500" />}
                      {f.status === "error" && <XCircle className="w-4 h-4 text-red-500" />}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeRefFile(f.id); }}
                      className="p-1 text-gray-400 hover:text-red-500 transition flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* General submit error */}
      {errors.submit && (
        <p className="text-sm text-red-600 mt-4 p-3 bg-red-50 rounded-lg">
          {errors.submit}
        </p>
      )}

      {/* ── Navigation Bar ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
        <StartOverLink />

        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue || isSubmitting || isOptimising}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-base text-white transition-all ${
            canContinue && !isSubmitting && !isOptimising
              ? "bg-cethos-teal hover:bg-cethos-teal-light"
              : "bg-gray-300 cursor-not-allowed"
          }`}
        >
          {isOptimising ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Optimising&hellip;</span>
            </>
          ) : isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Processing&hellip;</span>
            </>
          ) : (
            <>
              <span>Continue</span>
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </>
  );
}
