import { useEffect, useState } from "react";
import { X, Download, Eye, FileText, Loader2, Layers } from "lucide-react";
import { supabase } from "@/lib/supabase";
import JSZip from "jszip";

interface SourceFile {
  id: string;
  original_filename: string;
  file_size: number | null;
  mime_type: string | null;
  storage_path: string;
  created_at: string;
}

interface OriginalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  combinedFileName: string;
  sourceFiles: SourceFile[];
  quoteId: string;
}

export default function OriginalsModal({
  isOpen,
  onClose,
  combinedFileName,
  sourceFiles,
  quoteId,
}: OriginalsModalProps) {
  const [downloadingZip, setDownloadingZip] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sorted = [...sourceFiles].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handlePreview = async (file: SourceFile) => {
    try {
      const { data } = await supabase.storage
        .from("quote-files")
        .createSignedUrl(file.storage_path, 60);
      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank");
      }
    } catch (err) {
      console.error("Preview error:", err);
    }
  };

  const handleDownload = async (file: SourceFile) => {
    try {
      const { data } = await supabase.storage
        .from("quote-files")
        .download(file.storage_path);
      if (data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.original_filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Download error:", err);
    }
  };

  const handleDownloadAllAsZip = async () => {
    setDownloadingZip(true);
    try {
      const zip = new JSZip();
      for (const file of sorted) {
        const { data: signedData } = await supabase.storage
          .from("quote-files")
          .createSignedUrl(file.storage_path, 60);
        if (signedData?.signedUrl) {
          const response = await fetch(signedData.signedUrl);
          const blob = await response.blob();
          zip.file(file.original_filename, blob);
        }
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `originals_${quoteId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("ZIP download error:", err);
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Original Files
            </h2>
            <p className="text-sm text-gray-500 truncate max-w-md">
              {combinedFileName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subheader */}
        <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-b border-gray-200">
          <span className="text-sm text-gray-600">
            {sorted.length} original image{sorted.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={handleDownloadAllAsZip}
            disabled={downloadingZip}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-teal-700 border border-teal-300 rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloadingZip ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Downloading…
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download all as ZIP
              </>
            )}
          </button>
        </div>

        {/* Body — grid of file cards */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sorted.map((file) => (
              <div
                key={file.id}
                className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-50 rounded flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {file.original_filename}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatSize(file.file_size)}
                      {file.mime_type ? ` · ${file.mime_type.split("/")[1] || file.mime_type}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePreview(file)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded hover:bg-blue-50 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview
                  </button>
                  <button
                    onClick={() => handleDownload(file)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-teal-700 border border-teal-200 rounded hover:bg-teal-50 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleDownloadAllAsZip}
            disabled={downloadingZip}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloadingZip ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Downloading…
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download all as ZIP
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
