// client/components/customer/CustomerUploadWidget.tsx
//
// Inline upload widget for the customer portal, used inside CustomerDocuments.
// Sends `customerToken` to upload-start / upload-complete edge functions;
// files land in customer-files/<customerId>/customer/<sessionId>/...
// Mirrors the secure-upload DocsStep folder UX: one card per labelled
// folder, drop files into the card, "Add another folder" to add more.

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Upload,
  X,
  CheckCircle,
  Loader2,
  XCircle,
  ShieldCheck,
  ChevronUp,
  Folder,
  FolderPlus,
  Trash2,
} from "lucide-react";
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

interface FolderGroup {
  id: string;
  name: string;
  files: LocalFile[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function newGroupId(): string {
  return `g-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface Props {
  /** Called after a successful upload so the parent can refresh its file list. */
  onUploaded?: () => void;
  /** Start collapsed (compact button) vs expanded (full dropzones). */
  defaultExpanded?: boolean;
}

export default function CustomerUploadWidget({
  onUploaded,
  defaultExpanded = false,
}: Props) {
  const { customer, session } = useAuth();
  const customerToken = session?.token || null;

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [message, setMessage] = useState("");
  const [groups, setGroups] = useState<FolderGroup[]>([
    { id: newGroupId(), name: "", files: [] },
  ]);
  const [phase, setPhase] = useState<
    "idle" | "starting" | "uploading" | "finalizing"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const isUploading =
    phase === "starting" || phase === "uploading" || phase === "finalizing";

  const totalFiles = useMemo(
    () => groups.reduce((sum, g) => sum + g.files.length, 0),
    [groups],
  );

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_MIME_TYPES.has(file.type))
      return `${file.name}: file type not allowed`;
    if (file.size > MAX_FILE_SIZE) return `${file.name}: exceeds 100 MB`;
    if (file.size === 0) return `${file.name}: empty file`;
    return null;
  };

  const addFilesTo = useCallback(
    (groupId: string, incoming: File[]) => {
      const errs: string[] = [];
      const newFiles: LocalFile[] = [];
      const allFiles = groups.flatMap((g) => g.files);
      for (const f of incoming) {
        if (allFiles.some((x) => x.file.name === f.name && x.file.size === f.size))
          continue;
        const err = validateFile(f);
        if (err) {
          errs.push(err);
          continue;
        }
        newFiles.push({
          id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file: f,
          status: "pending",
          progress: 0,
        });
      }
      if (totalFiles + newFiles.length > MAX_FILES) {
        errs.push(`At most ${MAX_FILES} files per upload`);
      }
      setError(errs.length > 0 ? errs.join(" \u00b7 ") : null);
      if (newFiles.length > 0) {
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? { ...g, files: [...g.files, ...newFiles].slice(0, MAX_FILES) }
              : g,
          ),
        );
      }
    },
    [groups, totalFiles],
  );

  const removeFile = (groupId: string, fileId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, files: g.files.filter((f) => f.id !== fileId) } : g,
      ),
    );
  };

  const addFolder = () => {
    setGroups((prev) => [...prev, { id: newGroupId(), name: "", files: [] }]);
  };

  const renameFolder = (groupId: string, name: string) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)));
  };

  const removeFolder = (groupId: string) => {
    setGroups((prev) => {
      if (prev.length <= 1) return prev.map((g) => ({ ...g, name: "", files: [] }));
      return prev.filter((g) => g.id !== groupId);
    });
  };

  const handleSubmit = async () => {
    if (isUploading) return;
    if (totalFiles === 0) {
      setError("Please attach at least one document");
      return;
    }
    if (!customer?.id || !customerToken) {
      setError("Your session has expired — please sign in again.");
      return;
    }

    setPhase("starting");
    setError(null);

    try {
      const allFiles = groups.flatMap((g) => g.files);
      const startRes = await supabase.functions.invoke("upload-start", {
        body: {
          customerToken,
          files: allFiles.map((f) => ({
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
        // Find the file in whichever group it's in
        let localFile: LocalFile | undefined;
        let groupId: string | undefined;
        for (const g of groups) {
          const found = g.files.find((f) => f.file.name === u.originalName);
          if (found) {
            localFile = found;
            groupId = g.id;
            break;
          }
        }
        if (!localFile || !groupId) continue;

        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  files: g.files.map((f) =>
                    f.id === localFile!.id
                      ? { ...f, status: "uploading" as const, progress: 0 }
                      : f,
                  ),
                }
              : g,
          ),
        );

        try {
          await uploadWithProgress({
            url: u.signedUrl,
            file: localFile.file,
            onProgress: (p) =>
              setGroups((prev) =>
                prev.map((g) =>
                  g.id === groupId
                    ? {
                        ...g,
                        files: g.files.map((f) =>
                          f.id === localFile!.id ? { ...f, progress: p } : f,
                        ),
                      }
                    : g,
                ),
              ),
          });
          setGroups((prev) =>
            prev.map((g) =>
              g.id === groupId
                ? {
                    ...g,
                    files: g.files.map((f) =>
                      f.id === localFile!.id
                        ? {
                            ...f,
                            status: "success" as const,
                            progress: 100,
                            storagePath: u.path,
                          }
                        : f,
                    ),
                  }
                : g,
            ),
          );
        } catch (err) {
          setGroups((prev) =>
            prev.map((g) =>
              g.id === groupId
                ? {
                    ...g,
                    files: g.files.map((f) =>
                      f.id === localFile!.id
                        ? {
                            ...f,
                            status: "error" as const,
                            error: (err as Error)?.message || "Upload failed",
                          }
                        : f,
                    ),
                  }
                : g,
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
          customerToken,
          message: message.trim() || undefined,
          submittedFrom: "customer_portal",
          files: uploads.map((u) => {
            let lf: LocalFile | undefined;
            let folder = "";
            for (const g of groups) {
              const found = g.files.find((f) => f.file.name === u.originalName);
              if (found) {
                lf = found;
                folder = g.name.trim();
                break;
              }
            }
            return {
              path: u.path,
              originalName: u.originalName,
              size: lf?.file.size ?? 0,
              mimeType: lf?.file.type ?? "application/octet-stream",
              folder: folder || undefined,
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

      // Reset
      setGroups([{ id: newGroupId(), name: "", files: [] }]);
      setMessage("");
      setPhase("idle");
      onUploaded?.();
    } catch (err) {
      setError((err as Error)?.message || "Upload failed");
      setPhase("idle");
    }
  };

  // Compact (collapsed) state — single button bar
  if (!expanded) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
              <Upload className="w-5 h-5 text-teal-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                Upload documents
              </p>
              <p className="text-xs text-gray-500 truncate">
                Group files into folders. Up to {MAX_FILES} files, 100 MB each.
              </p>
            </div>
          </div>
          <button
            onClick={() => setExpanded(true)}
            className="px-4 py-2 text-sm font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex items-center gap-1.5 flex-shrink-0"
          >
            <Upload className="w-4 h-4" />
            Upload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Upload className="w-4 h-4 text-teal-600" />
          Upload documents
        </h3>
        <button
          onClick={() => {
            if (!isUploading) setExpanded(false);
          }}
          disabled={isUploading}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 disabled:opacity-50"
        >
          <ChevronUp className="w-3.5 h-3.5" />
          Collapse
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Note (optional)
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Anything our team should know about these files…"
          rows={2}
          disabled={isUploading}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
        />
      </div>

      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-medium text-gray-600">
          Files
        </label>
        <span className="text-xs text-gray-500">
          {totalFiles}/{MAX_FILES} files
        </span>
      </div>

      <div className="space-y-3">
        {groups.map((g, i) => (
          <FolderCard
            key={g.id}
            group={g}
            index={i}
            isOnly={groups.length === 1}
            disabled={isUploading}
            onRename={(name) => renameFolder(g.id, name)}
            onRemove={() => removeFolder(g.id)}
            onAddFiles={(files) => addFilesTo(g.id, files)}
            onRemoveFile={(fileId) => removeFile(g.id, fileId)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={addFolder}
        disabled={isUploading}
        className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs text-teal-700 border border-dashed border-teal-300 rounded-lg hover:bg-teal-50 disabled:opacity-50"
      >
        <FolderPlus className="w-3.5 h-3.5" />
        Add another folder
      </button>

      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
          Encrypted · scanned · linked to your account
        </div>
        <button
          onClick={handleSubmit}
          disabled={isUploading || totalFiles === 0}
          className="px-4 py-2 rounded-md bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {phase === "starting" && (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Preparing…
            </>
          )}
          {phase === "uploading" && (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading…
            </>
          )}
          {phase === "finalizing" && (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Finalizing…
            </>
          )}
          {phase === "idle" && (
            <>
              <Upload className="w-4 h-4" />
              Upload {totalFiles > 0 ? `(${totalFiles})` : ""}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function FolderCard(props: {
  group: FolderGroup;
  index: number;
  isOnly: boolean;
  disabled: boolean;
  onRename: (name: string) => void;
  onRemove: () => void;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (fileId: string) => void;
}) {
  const { group, index, isOnly, disabled, onRename, onRemove, onAddFiles, onRemoveFile } = props;
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="border border-gray-200 rounded-md p-3 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <Folder className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <input
          type="text"
          value={group.name}
          onChange={(e) => onRename(e.target.value)}
          placeholder={
            index === 0 ? "Folder name (optional, e.g. Project 1)" : `Folder ${index + 1} name`
          }
          disabled={disabled}
          maxLength={80}
          className="flex-1 px-2 py-1 text-sm border-0 border-b border-transparent focus:border-teal-500 focus:outline-none bg-transparent"
        />
        <span className="text-xs text-gray-400 flex-shrink-0">
          {group.files.length} file{group.files.length === 1 ? "" : "s"}
        </span>
        {!isOnly && !disabled && (
          <button
            type="button"
            onClick={onRemove}
            className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-red-500"
            title="Remove this folder and its files"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
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
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);
          if (e.dataTransfer.files) onAddFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-teal-500 bg-teal-50"
            : "border-gray-300 hover:border-teal-500 hover:bg-gray-50"
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          multiple
          onChange={(e) => {
            if (e.target.files) onAddFiles(Array.from(e.target.files));
            e.target.value = "";
          }}
          className="hidden"
          disabled={disabled}
        />
        <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
        <p className="text-xs text-gray-700">
          <span className="font-semibold text-teal-600">Click to upload</span>{" "}
          or drag and drop
        </p>
      </div>

      {group.files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {group.files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 p-2 bg-gray-50 rounded-md text-sm"
            >
              <StatusIcon status={f.status} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 truncate">{f.file.name}</p>
                <div className="text-xs text-gray-500 flex items-center gap-2">
                  <span>{formatBytes(f.file.size)}</span>
                  {f.status === "uploading" && <span>{f.progress}%</span>}
                  {f.status === "error" && f.error && (
                    <span className="text-red-500 truncate">{f.error}</span>
                  )}
                </div>
                {f.status === "uploading" && (
                  <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                    <div
                      className="bg-teal-500 h-1 rounded-full transition-all duration-200"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onRemoveFile(f.id)}
                  className="p-1 hover:bg-gray-200 rounded"
                  aria-label={`Remove ${f.file.name}`}
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: UploadStatus }) {
  switch (status) {
    case "pending":
      return <div className="w-4 h-4 rounded-full border-2 border-gray-300" />;
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
