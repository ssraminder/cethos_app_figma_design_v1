import { useState, useRef } from "react";
import { X, Upload, FileText, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface OrderUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  quoteId: string;
  onUploadComplete: () => void;
}

interface UploadingFile {
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

export default function OrderUploadModal({
  isOpen,
  onClose,
  quoteId,
  onUploadComplete,
}: OrderUploadModalProps) {
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const newFiles = selectedFiles.map((file) => ({
      file,
      status: "pending" as const,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    const newFiles = droppedFiles.map((file) => ({
      file,
      status: "pending" as const,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;

    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      const fileItem = files[i];
      if (fileItem.status !== "pending") continue;

      // Update status to uploading
      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: "uploading" } : f))
      );

      try {
        const file = fileItem.file;
        const timestamp = Date.now();
        const storagePath = `${quoteId}/${timestamp}_${file.name}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("quote-files")
          .upload(storagePath, file);

        if (uploadError) throw uploadError;

        // Create quote_files record
        const { error: dbError } = await supabase.from("quote_files").insert({
          quote_id: quoteId,
          original_filename: file.name,
          storage_path: storagePath,
          mime_type: file.type,
          file_size: file.size,
          ai_processing_status: "skipped", // Ready for manual analysis
        });

        if (dbError) throw dbError;

        // Update status to success
        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: "success" } : f))
        );
      } catch (err: any) {
        console.error("Upload error:", err);
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: "error", error: err.message } : f
          )
        );
      }
    }

    setUploading(false);

    // Check if all successful
    const updatedFiles = files.map((f, idx) => {
      if (f.status === "pending") {
        return f;
      }
      return f;
    });

    // Small delay to allow state to update, then check
    setTimeout(() => {
      const allSuccess = files.filter(f => f.status === "pending").length === 0 &&
        files.every((f) => f.status === "success" || f.status === "pending");
      if (files.filter(f => f.status === "success").length > 0) {
        toast.success(`File(s) uploaded successfully`);
        onUploadComplete();
        onClose();
      }
    }, 100);
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const successCount = files.filter((f) => f.status === "success").length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Upload Documents
          </h2>
          <button
            onClick={onClose}
            disabled={uploading}
            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-teal-500 hover:bg-teal-50/50 transition-colors"
          >
            <Upload className="w-10 h-10 mx-auto text-gray-400 mb-3" />
            <p className="text-gray-600">
              Drag & drop files here, or{" "}
              <span className="text-teal-600 font-medium">browse</span>
            </p>
            <p className="text-sm text-gray-400 mt-1">
              PDF, JPG, PNG up to 25MB each
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {files.map((fileItem, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {fileItem.file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(fileItem.file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  {fileItem.status === "pending" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {fileItem.status === "uploading" && (
                    <Loader2 className="w-5 h-5 text-teal-600 animate-spin" />
                  )}
                  {fileItem.status === "success" && (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  )}
                  {fileItem.status === "error" && (
                    <AlertCircle className="w-5 h-5 text-red-500" title={fileItem.error} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <div className="text-sm text-gray-500">
            {files.length > 0 && (
              <>
                {successCount > 0 && (
                  <span className="text-green-600">{successCount} uploaded</span>
                )}
                {successCount > 0 && pendingCount > 0 && " • "}
                {pendingCount > 0 && <span>{pendingCount} pending</span>}
              </>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={uploading}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={uploadFiles}
              disabled={uploading || pendingCount === 0}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload {pendingCount > 0 && `(${pendingCount})`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
