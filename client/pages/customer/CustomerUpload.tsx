// client/pages/customer/CustomerUpload.tsx
//
// Authenticated customer upload page. Sends `customerToken` to upload-start /
// upload-complete edge functions; the server resolves the token to a customer
// record and creates one customer_files row per uploaded file. Files land in
// customer-files/<customerId>/customer/<sessionId>/...

import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Upload,
  X,
  CheckCircle,
  Loader2,
  XCircle,
  ShieldCheck,
  FileText,
} from "lucide-react";
import CustomerLayout from "../../components/layouts/CustomerLayout";
import { useAuth } from "../../context/CustomerAuthContext";
import { supabase } from "../../lib/supabase";

const MAX_FILES = 25;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ACCEPTED_EXTENSIONS =
  ".pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff,.heic,.heif,.doc,.docx";
const ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/heic",
  "image/heif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

type UploadStatus = "pending" | "uploading" | "success" | "error";

interface LocalFile {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  storagePath?: string;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CustomerUpload() {
  const { customer, session } = useAuth();
  const customerToken = session?.token || null;

  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<
    "idle" | "starting" | "uploading" | "finalizing" | "success" | "error"
  >("idle");
  const [doneSession, setDoneSession] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_MIME_TYPES.has(file.type))
      return `${file.name}: file type not allowed`;
    if (file.size > MAX_FILE_SIZE) return `${file.name}: exceeds 100 MB`;
    if (file.size === 0) return `${file.name}: empty file`;
    return null;
  };

  const addFiles = useCallback(
    (incoming: File[]) => {
      const next: LocalFile[] = [];
      const errs: string[] = [];
      for (const f of incoming) {
        if (
          files.some((x) => x.file.name === f.name && x.file.size === f.size)
        )
          continue;
        const err = validateFile(f);
        if (err) {
          errs.push(err);
          continue;
        }
        next.push({
          id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file: f,
          status: "pending",
          progress: 0,
        });
      }
      if (files.length + next.length > MAX_FILES) {
        errs.push(`At most ${MAX_FILES} files per upload`);
      }
      if (errs.length > 0) {
        setErrors((p) => ({ ...p, files: errs.join(" \u00b7 ") }));
      } else {
        setErrors((p) => {
          const n = { ...p };
          delete n.files;
          delete n.noFiles;
          return n;
        });
      }
      if (next.length > 0) {
        setFiles((prev) => [...prev, ...next].slice(0, MAX_FILES));
      }
    },
    [files],
  );

  const removeFile = (id: string) =>
    setFiles((prev) => prev.filter((f) => f.id !== id));

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files) addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitting =
      phase === "starting" || phase === "uploading" || phase === "finalizing";
    if (submitting) return;
    if (files.length === 0) {
      setErrors({ noFiles: "Please attach at least one document" });
      return;
    }
    if (!customer?.id || !customerToken) {
      setErrors({ submit: "Your session has expired — please sign in again." });
      return;
    }

    setPhase("starting");
    setErrors({});

    try {
      const startBody = {
        customerToken,
        files: files.map((f) => ({
          name: f.file.name,
          size: f.file.size,
          type: f.file.type,
        })),
      };
      const startRes = await supabase.functions.invoke("upload-start", {
        body: startBody,
      });
      if (startRes.error || !startRes.data?.success) {
        throw new Error(
          startRes.data?.error ||
            startRes.error?.message ||
            "Could not start upload",
        );
      }
      const { submissionId, bucket, uploads } = startRes.data as {
        submissionId: string;
        bucket: string;
        uploads: Array<{
          index: number;
          originalName: string;
          path: string;
          signedUrl: string;
          token: string;
        }>;
      };

      setPhase("uploading");
      for (const u of uploads) {
        const localFile = files.find((f) => f.file.name === u.originalName);
        if (!localFile) continue;
        setFiles((prev) =>
          prev.map((f) =>
            f.id === localFile.id
              ? { ...f, status: "uploading" as const, progress: 0 }
              : f,
          ),
        );
        try {
          await uploadWithProgress({
            url: u.signedUrl,
            file: localFile.file,
            onProgress: (p) =>
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === localFile.id ? { ...f, progress: p } : f,
                ),
              ),
          });
          setFiles((prev) =>
            prev.map((f) =>
              f.id === localFile.id
                ? {
                    ...f,
                    status: "success" as const,
                    progress: 100,
                    storagePath: u.path,
                  }
                : f,
            ),
          );
        } catch (err) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === localFile.id
                ? {
                    ...f,
                    status: "error" as const,
                    error: (err as Error)?.message || "Upload failed",
                  }
                : f,
            ),
          );
          throw err;
        }
      }

      setPhase("finalizing");
      const completePayload = {
        submissionId,
        bucket,
        customerToken,
        message: message.trim() || undefined,
        submittedFrom: "customer_portal",
        files: uploads.map((u) => {
          const lf = files.find((f) => f.file.name === u.originalName);
          return {
            path: u.path,
            originalName: u.originalName,
            size: lf?.file.size ?? 0,
            mimeType: lf?.file.type ?? "application/octet-stream",
          };
        }),
      };
      const completeRes = await supabase.functions.invoke("upload-complete", {
        body: completePayload,
      });
      if (completeRes.error || !completeRes.data?.success) {
        throw new Error(
          completeRes.data?.error ||
            completeRes.error?.message ||
            "Could not finalize upload",
        );
      }

      setDoneSession(submissionId);
      setPhase("success");
    } catch (err) {
      console.error("customer-upload submit error:", err);
      setErrors({
        submit:
          (err as Error)?.message ||
          "Network error. Please check your connection and try again.",
      });
      setPhase("error");
    }
  };

  const submitting =
    phase === "starting" || phase === "uploading" || phase === "finalizing";

  return (
    <CustomerLayout>
      <div className="max-w-3xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Upload className="w-6 h-6" />
            Upload documents
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Files you upload here are added to your account. Our team can see
            them as soon as they pass our security scan.
          </p>
        </div>

        {phase === "success" && doneSession && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-5 text-center">
            <CheckCircle className="w-10 h-10 text-green-600 mx-auto mb-2" />
            <h2 className="text-lg font-semibold mb-1">
              {files.length} file{files.length === 1 ? "" : "s"} uploaded
            </h2>
            <p className="text-sm text-slate-700 mb-3">
              Your documents are queued for malware scanning. They&apos;ll appear
              in your <Link to="/dashboard/documents" className="text-teal-600 underline">documents library</Link> once cleared.
            </p>
            <button
              onClick={() => {
                setFiles([]);
                setMessage("");
                setDoneSession(null);
                setPhase("idle");
              }}
              className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
            >
              Upload more
            </button>
          </div>
        )}

        {phase !== "success" && (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl border p-6 space-y-5"
          >
            {errors.submit && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                {errors.submit}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Message (optional)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Anything you'd like our team to know about these files…"
                rows={3}
                disabled={submitting}
                className="w-full px-3 py-2 border rounded-md text-sm bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Documents <span className="text-red-500">*</span>
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                }}
                onDrop={onDrop}
                onClick={() => !submitting && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? "border-teal-500 bg-teal-50"
                    : "border-slate-300 hover:border-teal-500 hover:bg-slate-50"
                } ${submitting ? "pointer-events-none opacity-50" : ""}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS}
                  multiple
                  onChange={(e) => {
                    if (e.target.files) addFiles(Array.from(e.target.files));
                    e.target.value = "";
                  }}
                  className="hidden"
                  disabled={submitting}
                />
                <Upload className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <p className="text-slate-700 mb-1">
                  <span className="font-semibold text-teal-600">
                    Click to upload
                  </span>{" "}
                  or drag and drop
                </p>
                <p className="text-sm text-slate-500">
                  PDF, images, Word documents · max 100 MB each · up to{" "}
                  {MAX_FILES} files
                </p>
              </div>
              {errors.files && (
                <p className="text-sm text-red-600 mt-2">{errors.files}</p>
              )}
              {errors.noFiles && (
                <p className="text-sm text-red-600 mt-2">{errors.noFiles}</p>
              )}

              {files.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {files.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-3 p-3 bg-slate-50 rounded-md"
                    >
                      <StatusIcon status={f.status} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {f.file.name}
                        </p>
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                          <span>{formatBytes(f.file.size)}</span>
                          {f.status === "uploading" && (
                            <span>{f.progress}%</span>
                          )}
                          {f.status === "error" && f.error && (
                            <span className="text-red-500 truncate">
                              {f.error}
                            </span>
                          )}
                        </div>
                        {f.status === "uploading" && (
                          <div className="w-full bg-slate-200 rounded-full h-1 mt-1">
                            <div
                              className="bg-teal-500 h-1 rounded-full transition-all duration-200"
                              style={{ width: `${f.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                      {!submitting && (
                        <button
                          type="button"
                          onClick={() => removeFile(f.id)}
                          className="p-1 hover:bg-slate-200 rounded"
                          aria-label={`Remove ${f.file.name}`}
                        >
                          <X className="w-4 h-4 text-slate-500" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-green-600" />
              <span>
                Encrypted transit · malware scanned · stored privately, linked
                to your account
              </span>
            </div>

            <button
              type="submit"
              disabled={submitting || files.length === 0}
              className="w-full px-4 py-3 rounded-md bg-teal-600 text-white font-semibold hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {phase === "starting" && (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Preparing upload…
                </>
              )}
              {phase === "uploading" && (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading documents…
                </>
              )}
              {phase === "finalizing" && (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Finalizing…
                </>
              )}
              {(phase === "idle" || phase === "error") && (
                <>
                  <FileText className="w-4 h-4" />
                  Upload {files.length > 0 ? `(${files.length})` : ""}
                </>
              )}
            </button>

            {phase === "uploading" && files.length > 3 && (
              <p className="text-xs text-slate-500 text-center">
                Don&apos;t close this tab — large uploads may take several
                minutes.
              </p>
            )}
          </form>
        )}
      </div>
    </CustomerLayout>
  );
}

function StatusIcon({ status }: { status: UploadStatus }) {
  switch (status) {
    case "pending":
      return <div className="w-4 h-4 rounded-full border-2 border-slate-300" />;
    case "uploading":
      return <Loader2 className="w-4 h-4 text-teal-500 animate-spin" />;
    case "success":
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "error":
      return <XCircle className="w-4 h-4 text-red-500" />;
  }
}

function uploadWithProgress(args: {
  url: string;
  file: File;
  onProgress: (percent: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", args.url);
    xhr.setRequestHeader(
      "Content-Type",
      args.file.type || "application/octet-stream",
    );
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        args.onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload aborted"));
    xhr.send(args.file);
  });
}
