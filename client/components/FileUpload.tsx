import { useState, useRef } from "react";
import { X, Loader2, CheckCircle, XCircle } from "lucide-react";
import { useQuote } from "@/context/QuoteContext";
import { supabase } from "@/lib/supabase";

interface UploadingFile {
  file: File;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
}

export default function FileUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const { state, addFile, removeFile } = useQuote();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    const droppedFiles = Array.from(e.dataTransfer.files);

    // Add files to uploading state
    const newUploadingFiles: UploadingFile[] = droppedFiles.map(file => ({
      file,
      progress: 0,
      status: "uploading" as const,
    }));

    setUploadingFiles(prev => [...prev, ...newUploadingFiles]);

    // Start uploading each file
    droppedFiles.forEach((file, index) => {
      const uploadIndex = uploadingFiles.length + index;
      handleFileUpload(file, uploadIndex);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);

      // Add files to uploading state
      const newUploadingFiles: UploadingFile[] = selectedFiles.map(file => ({
        file,
        progress: 0,
        status: "uploading" as const,
      }));

      setUploadingFiles(prev => [...prev, ...newUploadingFiles]);

      // Start uploading each file
      selectedFiles.forEach((file, index) => {
        const uploadIndex = uploadingFiles.length + index;
        handleFileUpload(file, uploadIndex);
      });
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        className={`w-full border-2 border-dashed rounded-xl transition-all ${
          isDragging
            ? "border-cethos-blue bg-blue-50"
            : "border-cethos-border bg-[#FAFBFC]"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="py-12 px-6 flex flex-col items-center justify-center min-h-[308px]">
          {/* File Icon */}
          <div className="mb-6">
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-cethos-slate-light"
            >
              <path
                d="M30 4H12C10.9391 4 9.92172 4.42143 9.17157 5.17157C8.42143 5.92172 8 6.93913 8 8V40C8 41.0609 8.42143 42.0783 9.17157 42.8284C9.92172 43.5786 10.9391 44 12 44H36C37.0609 44 38.0783 43.5786 38.8284 42.8284C39.5786 42.0783 40 41.0609 40 40V14L30 4Z"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M28 4V12C28 13.0609 28.4214 14.0783 29.1716 14.8284C29.9217 15.5786 30.9391 16 32 16H40"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M20 18H16"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M32 26H16"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M32 34H16"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Text */}
          <p className="text-cethos-slate-dark text-base mb-1">
            Drag and drop files here
          </p>
          <p className="text-cethos-slate text-sm mb-6">or</p>

          {/* Browse Button */}
          <button
            onClick={handleBrowseClick}
            className="px-6 py-3.5 border-2 border-cethos-blue text-cethos-blue font-semibold text-base rounded-lg hover:bg-cethos-blue hover:text-white transition-all"
          >
            Browse Files
          </button>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.docx"
          />

          {/* Accepted formats */}
          <p className="text-cethos-slate-light text-xs mt-6 text-center">
            Accepted: PDF, JPG, PNG, DOCX (max 20MB)
          </p>
        </div>
      </div>

      {/* Uploaded Files List */}
      {state.files.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-cethos-navy">
            Uploaded Files ({state.files.length})
          </h3>
          {state.files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between p-4 bg-white border border-cethos-border rounded-lg"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-cethos-blue flex-shrink-0"
                >
                  <path
                    d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M14 2V8H20"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-cethos-navy truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-cethos-slate">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => removeFile(file.id)}
                className="p-1.5 text-cethos-slate-light hover:text-red-500 transition-colors flex-shrink-0"
              >
                <X size={20} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
