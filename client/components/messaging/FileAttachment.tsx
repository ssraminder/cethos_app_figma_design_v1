import { Download } from "lucide-react";

interface Attachment {
  id: string;
  original_filename?: string;
  file_name?: string; // Alternative field name from database
  filename?: string; // Alternative field name
  mime_type?: string;
  file_type?: string; // Alternative field name from database
  file_size: number;
  download_url?: string;
  storage_path?: string;
}

interface FileAttachmentProps {
  attachment: Attachment;
  isOwn: boolean;
}

export default function FileAttachment({
  attachment,
  isOwn,
}: FileAttachmentProps) {
  // Handle different field name conventions
  const fileName =
    attachment.original_filename ||
    attachment.file_name ||
    attachment.filename ||
    "file";
  const mimeType =
    attachment.mime_type || attachment.file_type || "application/octet-stream";

  const fileIcon = getFileIcon(mimeType);
  const fileSize = formatFileSize(attachment.file_size);

  // Use the pre-signed download_url from the server — no client-side storage calls
  const downloadUrl = attachment.download_url || null;
  const unavailable = !downloadUrl;

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg ${
        isOwn ? "bg-teal-700" : "bg-gray-50"
      } ${unavailable ? "opacity-60" : ""}`}
    >
      <span className="text-2xl">{fileIcon}</span>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium truncate ${
            isOwn ? "text-white" : "text-gray-900"
          }`}
        >
          {fileName}
        </p>
        <p className={`text-xs ${isOwn ? "text-teal-200" : "text-gray-500"}`}>
          {unavailable ? "(unavailable)" : fileSize}
        </p>
      </div>
      {downloadUrl ? (
        <a
          href={downloadUrl}
          download={fileName}
          target="_blank"
          rel="noopener noreferrer"
          className={`p-2 rounded-full hover:bg-opacity-20 hover:bg-black transition-colors ${
            isOwn ? "text-white" : "text-gray-600"
          }`}
          title="Download"
        >
          <Download className="w-5 h-5" />
        </a>
      ) : (
        <div
          className={`p-2 rounded-full ${
            isOwn ? "text-white opacity-50" : "text-gray-400"
          }`}
          title="File unavailable"
        >
          <Download className="w-5 h-5" />
        </div>
      )}
    </div>
  );
}

function getFileIcon(mimeType: string): string {
  if (mimeType === "application/pdf") return "📄";
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.includes("word")) return "📝";
  if (mimeType.includes("excel") || mimeType.includes("spreadsheet"))
    return "📊";
  return "📎";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
