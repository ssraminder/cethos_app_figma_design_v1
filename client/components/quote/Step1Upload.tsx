import { useState, useRef, useEffect } from "react";
import { useQuote } from "@/context/QuoteContext";
import { supabase } from "@/lib/supabase";
import StartOverLink from "@/components/quote/StartOverLink";
import { ChevronRight, X, Loader2, CheckCircle, XCircle } from "lucide-react";

// ── Constants ───────────────────────────────────────────────────────────────

const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const ACCEPTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.docx";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

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

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[()[\]]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase();
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

  // UI state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const processFiles = (files: File[]) => {
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

      // 1. Create or update quote
      if (!quoteId) {
        const { data: quote, error: quoteError } = await supabase
          .from("quotes")
          .insert({
            status: "draft",
            source_language_id: sourceLanguageId,
            target_language_id: targetLanguageId,
            entry_point: "customer_web",
          })
          .select("id, quote_number")
          .single();

        if (quoteError) throw quoteError;
        if (!quote) throw new Error("Failed to create quote");

        quoteId = quote.id;
        quoteNumber = quote.quote_number;
        updateState({ quoteId, quoteNumber });
      } else {
        // Update languages on existing quote
        const { error: updateError } = await supabase
          .from("quotes")
          .update({
            source_language_id: sourceLanguageId,
            target_language_id: targetLanguageId,
          })
          .eq("id", quoteId);

        if (updateError) throw updateError;
      }

      // 2. Upload files to final storage path and create quote_files records
      for (const lf of successFiles) {
        const sanitized = sanitizeFilename(lf.name);
        const finalPath = `${quoteId}/${sanitized}`;

        // Re-upload to the canonical {quoteId}/{filename} path
        const { error: uploadError } = await supabase.storage
          .from("quote-files")
          .upload(finalPath, lf.file, {
            cacheControl: "3600",
            upsert: true,
          });

        if (uploadError) {
          console.error(`Failed to upload ${lf.name}:`, uploadError);
          continue;
        }

        // Create quote_files record
        const { error: recordError } = await supabase
          .from("quote_files")
          .insert({
            quote_id: quoteId,
            original_filename: lf.name,
            storage_path: finalPath,
            file_size: lf.size,
            mime_type: lf.mimeType,
            upload_status: "uploaded",
          });

        if (recordError) {
          console.error(`Failed to create file record for ${lf.name}:`, recordError);
        }

        // Clean up temp upload if it exists at a different path
        if (lf.storagePath && lf.storagePath !== finalPath) {
          supabase.storage
            .from("quote-files")
            .remove([lf.storagePath])
            .catch(() => {});
        }
      }

      // 3. Fire AI processing (fire and forget — don't await)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      fetch(`${supabaseUrl}/functions/v1/process-quote-documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ quoteId }),
      });
      // Do NOT await — fire and forget

      // 4. Navigate to Step 2
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
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Source Language <span className="text-red-500">*</span>
          </label>
          <select
            value={sourceLanguageId}
            onChange={(e) => handleSourceChange(e.target.value)}
            className={`w-full px-3 py-2 border-[1.5px] rounded-lg text-sm bg-white transition ${
              errors.sourceLanguage || errors.sameLang
                ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                : "border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
            }`}
          >
            <option value="">Select&hellip;</option>
            {sourceLanguages.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.name}
              </option>
            ))}
          </select>
          {errors.sourceLanguage && (
            <p className="text-xs text-red-600 mt-1">{errors.sourceLanguage}</p>
          )}
        </div>

        {/* Target Language */}
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Target Language <span className="text-red-500">*</span>
          </label>
          <select
            value={targetLanguageId}
            onChange={(e) => handleTargetChange(e.target.value)}
            className={`w-full px-3 py-2 border-[1.5px] rounded-lg text-sm bg-white transition ${
              errors.targetLanguage || errors.sameLang
                ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                : "border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
            }`}
          >
            <option value="">Select&hellip;</option>
            {targetLanguages.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.name}
              </option>
            ))}
          </select>
          {errors.targetLanguage && (
            <p className="text-xs text-red-600 mt-1">{errors.targetLanguage}</p>
          )}
        </div>
      </div>

      {/* Same-language error */}
      {errors.sameLang && (
        <p className="text-sm text-red-600 mt-2">{errors.sameLang}</p>
      )}

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
          disabled={!canContinue || isSubmitting}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-base text-white transition-all ${
            canContinue && !isSubmitting
              ? "bg-cethos-teal hover:bg-cethos-teal-light"
              : "bg-gray-300 cursor-not-allowed"
          }`}
        >
          {isSubmitting ? (
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
