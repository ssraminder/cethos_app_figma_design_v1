import React, { useState } from "react";
import { Upload } from "lucide-react";

interface QuoteFile {
  id: string;
  original_filename: string;
  file_size: number;
  ai_processing_status?: string;
  storage_path?: string;
  mime_type: string;
  created_at: string;
}

interface DocumentManagementPanelProps {
  quoteId: string;
  staffId?: string;
  files: QuoteFile[];
  onFilesUploaded: () => void;
}

export default function DocumentManagementPanel({
  quoteId,
  staffId,
  files,
  onFilesUploaded,
}: DocumentManagementPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {},
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setUploading(true);

    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

      for (const file of Array.from(selectedFiles)) {
        setUploadProgress((prev) => ({ ...prev, [file.name]: 0 }));

        const formData = new FormData();
        formData.append("file", file);
        formData.append("quoteId", quoteId);
        formData.append("staffId", staffId || "");
        // Files are NOT auto-processed - they must be assigned to document groups first
        formData.append("processWithAI", "false");

        // Upload file
        const uploadResponse = await fetch(
          `${SUPABASE_URL}/functions/v1/upload-staff-quote-file`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: formData,
          },
        );

        if (!uploadResponse.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        setUploadProgress((prev) => ({ ...prev, [file.name]: 100 }));
      }

      // Clear progress after 2 seconds
      setTimeout(() => setUploadProgress({}), 2000);

      // Refresh files list
      onFilesUploaded();

      // Reset file input
      e.target.value = "";
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload files: " + (error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          Document Management
        </h3>
      </div>

      {/* Upload Section */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-teal-500 transition-colors">
        <label className="flex flex-col items-center cursor-pointer">
          <Upload className="w-8 h-8 text-gray-400 mb-2" />
          <span className="text-sm font-medium text-gray-700">
            Upload Additional Files
          </span>
          <span className="text-xs text-gray-500 mt-1">
            Click to browse or drag and drop
          </span>
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileUpload}
            className="hidden"
            disabled={uploading}
          />
        </label>

        {/* Upload Instructions */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-600">
            Files will be uploaded and appear in the <strong>Unassigned Pages/Files</strong> section below.
            Assign them to a Document Group, then click <strong>"Analyze"</strong> on the group to run AI analysis.
          </p>
        </div>
      </div>

      {/* Upload Progress */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="space-y-2">
          {Object.entries(uploadProgress).map(([filename, progress]) => (
            <div key={filename} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 truncate">{filename}</span>
                <span className="text-gray-500">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-teal-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* File Status Summary */}
      <div className="grid grid-cols-2 gap-2 text-center text-xs">
        <div className="bg-gray-50 rounded p-2">
          <div className="text-gray-900 font-semibold">{files.length}</div>
          <div className="text-gray-500">Total Files</div>
        </div>
        <div className="bg-amber-50 rounded p-2">
          <div className="text-amber-900 font-semibold">
            {files.filter((f) => f.ai_processing_status === "skipped").length}
          </div>
          <div className="text-amber-700">Awaiting Analysis</div>
        </div>
      </div>
    </div>
  );
}
