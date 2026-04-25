// client/components/admin/CustomerFilesTab.tsx
//
// Admin tab on CustomerDetail page. Shows the customer's file library
// (from customer_files table via get-customer-files) and lets staff upload
// new files into the customer's admin/ directory via upload-start/complete.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  Download,
  DownloadCloud,
  ExternalLink,
  CheckCircle,
  Loader2,
  XCircle,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  RefreshCw,
  X,
  User,
  Briefcase,
} from "lucide-react";
import JSZip from "jszip";
import { supabase } from "@/lib/supabase";

interface CustomerFile {
  id: string;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
  uploadedByType: "customer" | "admin";
  uploadedByStaffName: string | null;
  scanStatus: "scan_pending" | "scan_clean" | "scan_infected" | "scan_error";
  folder: string | null;
  createdAt: string;
  downloadUrl: string | null;
}

interface Props {
  customerId: string;
}

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

type LocalStatus = "pending" | "uploading" | "success" | "error";
interface LocalFile {
  id: string;
  file: File;
  status: LocalStatus;
  progress: number;
  error?: string;
}

export default function CustomerFilesTab({ customerId }: Props) {
  const [files, setFiles] = useState<CustomerFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickedFiles, setPickedFiles] = useState<LocalFile[]>([]);
  const [phase, setPhase] = useState<
    "idle" | "starting" | "uploading" | "finalizing"
  >("idle");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadAll = async (allFiles: CustomerFile[]) => {
    const downloadable = allFiles.filter((f) => !!f.downloadUrl);
    if (downloadable.length === 0) {
      toast.info("No files ready to download");
      return;
    }
    const tid = toast.loading(`Zipping ${downloadable.length} files…`);
    try {
      const zip = new JSZip();
      await Promise.all(
        downloadable.map(async (f) => {
          const resp = await fetch(f.downloadUrl as string);
          if (!resp.ok) throw new Error(`${f.originalFilename}: HTTP ${resp.status}`);
          const blob = await resp.blob();
          let name = f.originalFilename;
          let suffix = 1;
          while (zip.file(name)) {
            const dot = f.originalFilename.lastIndexOf(".");
            name =
              dot === -1
                ? `${f.originalFilename} (${suffix})`
                : `${f.originalFilename.slice(0, dot)} (${suffix})${f.originalFilename.slice(dot)}`;
            suffix++;
          }
          zip.file(name, blob);
        }),
      );
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `customer-${customerId.slice(0, 8)}-files.zip`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${downloadable.length} files`, { id: tid });
    } catch (err: any) {
      toast.error(err?.message || "Failed to build zip", { id: tid });
    }
  };

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "get-customer-files",
        { body: { targetCustomerId: customerId } },
      );
      if (error || !data?.success) {
        toast.error(
          data?.error || error?.message || "Failed to load customer files",
        );
        setFiles([]);
      } else {
        setFiles((data.files || []) as CustomerFile[]);
      }
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

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
      for (const f of incoming) {
        if (
          pickedFiles.some(
            (x) => x.file.name === f.name && x.file.size === f.size,
          )
        )
          continue;
        const err = validateFile(f);
        if (err) {
          toast.error(err);
          continue;
        }
        next.push({
          id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file: f,
          status: "pending",
          progress: 0,
        });
      }
      if (pickedFiles.length + next.length > MAX_FILES) {
        toast.error(`At most ${MAX_FILES} files per upload`);
        return;
      }
      if (next.length > 0) {
        setPickedFiles((prev) => [...prev, ...next].slice(0, MAX_FILES));
      }
    },
    [pickedFiles],
  );

  const removePicked = (id: string) =>
    setPickedFiles((prev) => prev.filter((f) => f.id !== id));

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files) addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  const handleUpload = async () => {
    if (pickedFiles.length === 0) {
      toast.info("Pick at least one file");
      return;
    }
    setPhase("starting");
    try {
      const startRes = await supabase.functions.invoke("upload-start", {
        body: {
          targetCustomerId: customerId,
          files: pickedFiles.map((f) => ({
            name: f.file.name,
            size: f.file.size,
            type: f.file.type,
          })),
        },
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
        const lf = pickedFiles.find((x) => x.file.name === u.originalName);
        if (!lf) continue;
        setPickedFiles((prev) =>
          prev.map((f) =>
            f.id === lf.id
              ? { ...f, status: "uploading" as const, progress: 0 }
              : f,
          ),
        );
        try {
          await uploadWithProgress({
            url: u.signedUrl,
            file: lf.file,
            onProgress: (p) =>
              setPickedFiles((prev) =>
                prev.map((f) => (f.id === lf.id ? { ...f, progress: p } : f)),
              ),
          });
          setPickedFiles((prev) =>
            prev.map((f) =>
              f.id === lf.id
                ? { ...f, status: "success" as const, progress: 100 }
                : f,
            ),
          );
        } catch (err) {
          setPickedFiles((prev) =>
            prev.map((f) =>
              f.id === lf.id
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
      const completeRes = await supabase.functions.invoke("upload-complete", {
        body: {
          submissionId,
          bucket,
          targetCustomerId: customerId,
          submittedFrom: "admin",
          files: uploads.map((u) => {
            const lf = pickedFiles.find((x) => x.file.name === u.originalName);
            return {
              path: u.path,
              originalName: u.originalName,
              size: lf?.file.size ?? 0,
              mimeType: lf?.file.type ?? "application/octet-stream",
            };
          }),
        },
      });
      if (completeRes.error || !completeRes.data?.success) {
        throw new Error(
          completeRes.data?.error ||
            completeRes.error?.message ||
            "Could not finalize upload",
        );
      }

      toast.success(`${uploads.length} file(s) uploaded`);
      setPickedFiles([]);
      setPhase("idle");
      fetchFiles();
    } catch (err) {
      toast.error((err as Error)?.message || "Upload failed");
      setPhase("idle");
    }
  };

  const isUploading =
    phase === "starting" || phase === "uploading" || phase === "finalizing";

  return (
    <div className="space-y-6">
      {/* Upload zone */}
      <div className="border rounded-lg p-4 bg-muted/20">
        <div className="text-sm font-medium mb-3 flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Upload files for this customer
        </div>
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
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/30 hover:border-primary/60"
          } ${isUploading ? "pointer-events-none opacity-50" : ""}`}
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
            disabled={isUploading}
          />
          <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm">
            <span className="font-semibold">Click to upload</span> or drag and
            drop
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Max 100 MB · up to {MAX_FILES} files · PDF, image, Word
          </p>
        </div>

        {pickedFiles.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {pickedFiles.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-2 p-2 bg-background rounded border text-sm"
              >
                {f.status === "uploading" ? (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                ) : f.status === "success" ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : f.status === "error" ? (
                  <XCircle className="w-4 h-4 text-red-500" />
                ) : (
                  <FileText className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="flex-1 truncate">{f.file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatBytes(f.file.size)}
                </span>
                {f.status === "uploading" && (
                  <span className="text-xs">{f.progress}%</span>
                )}
                {f.status !== "uploading" && !isUploading && (
                  <button
                    onClick={() => removePicked(f.id)}
                    className="p-1 hover:bg-muted rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {pickedFiles.length > 0 && (
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setPickedFiles([])}
              disabled={isUploading}
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted disabled:opacity-50"
            >
              Clear
            </button>
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {phase === "starting"
                    ? "Preparing…"
                    : phase === "uploading"
                      ? "Uploading…"
                      : "Finalizing…"}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload {pickedFiles.length} file
                  {pickedFiles.length === 1 ? "" : "s"}
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Files list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">
            Files ({files.length})
          </h3>
          <div className="flex gap-1.5">
            {files.filter((f) => !!f.downloadUrl).length > 1 && (
              <button
                onClick={() => downloadAll(files)}
                className="px-2.5 py-1 text-xs border rounded-md hover:bg-muted flex items-center gap-1.5"
                title="Download all clean files as a single zip"
              >
                <DownloadCloud className="w-3.5 h-3.5" />
                Download all (zip)
              </button>
            )}
            <button
              onClick={fetchFiles}
              disabled={loading}
              className="px-2.5 py-1 text-xs border rounded-md hover:bg-muted flex items-center gap-1.5"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            <Loader2 className="w-5 h-5 mx-auto animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground border rounded-md">
            No files yet for this customer.
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">File</th>
                  <th className="px-3 py-2 font-medium">Folder</th>
                  <th className="px-3 py-2 font-medium">Size</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Scan</th>
                  <th className="px-3 py-2 font-medium">Uploaded</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {files.map((f) => (
                  <tr key={f.id} className="hover:bg-muted/50">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate" title={f.originalFilename}>
                          {f.originalFilename}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {f.folder ? (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded"
                          title={f.folder}
                        >
                          {f.folder}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                      {formatBytes(f.sizeBytes)}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {f.uploadedByType === "customer" ? (
                        <span className="inline-flex items-center gap-1 text-blue-700">
                          <User className="w-3 h-3" /> Customer
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-purple-700">
                          <Briefcase className="w-3 h-3" />
                          {f.uploadedByStaffName || "Admin"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <ScanBadge status={f.scanStatus} />
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                      {formatDate(f.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {f.downloadUrl ? (
                        <div className="inline-flex gap-1">
                          {(f.mimeType === "application/pdf" ||
                            f.mimeType.startsWith("image/")) && (
                            <a
                              href={f.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded-md hover:bg-muted"
                              title="Open in a new tab"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Preview
                            </a>
                          )}
                          <a
                            href={f.downloadUrl}
                            download={f.originalFilename}
                            rel="noopener"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded-md hover:bg-muted"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {f.scanStatus === "scan_pending"
                            ? "Scanning…"
                            : f.scanStatus === "scan_infected"
                              ? "Quarantined"
                              : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ScanBadge({ status }: { status: CustomerFile["scanStatus"] }) {
  switch (status) {
    case "scan_pending":
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-xs">
          <Loader2 className="w-3 h-3 animate-spin" />
          Scanning
        </span>
      );
    case "scan_clean":
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-xs">
          <ShieldCheck className="w-3 h-3" />
          Clean
        </span>
      );
    case "scan_infected":
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-50 text-red-700 rounded text-xs font-semibold">
          <ShieldAlert className="w-3 h-3" />
          INFECTED
        </span>
      );
    case "scan_error":
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
          <ShieldQuestion className="w-3 h-3" />
          Scan error
        </span>
      );
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
