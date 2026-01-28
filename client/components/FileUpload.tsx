import { useState, useRef, useContext } from "react";
import { X, Loader2, CheckCircle, XCircle } from "lucide-react";
import { useQuote } from "@/context/QuoteContext";
import { useUpload } from "@/context/UploadContext";
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

  // Try to use QuoteContext first (for /quote route), fall back to UploadContext (for /upload route)
  let state: any, addFile: any, removeFile: any;

  try {
    const quoteContext = useQuote();
    state = quoteContext.state;
    addFile = quoteContext.addFile;
    removeFile = quoteContext.removeFile;
  } catch {
    // Fall back to UploadContext
    const uploadContext = useUpload();
    state = uploadContext.state;
    addFile = uploadContext.addFile;
    removeFile = uploadContext.removeFile;
  }

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
    const newUploadingFiles: UploadingFile[] = droppedFiles.map((file) => ({
      file,
      progress: 0,
      status: "uploading" as const,
    }));

    setUploadingFiles((prev) => [...prev, ...newUploadingFiles]);

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
      const newUploadingFiles: UploadingFile[] = selectedFiles.map((file) => ({
        file,
        progress: 0,
        status: "uploading" as const,
      }));

      setUploadingFiles((prev) => [...prev, ...newUploadingFiles]);

      // Start uploading each file
      selectedFiles.forEach((file, index) => {
        const uploadIndex = uploadingFiles.length + index;
        handleFileUpload(file, uploadIndex);
      });
    }
  };

  const handleFileUpload = async (file: File, index: number) => {
    try {
      // Update progress to 0
      setUploadingFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, progress: 0, status: "uploading" as const } : f,
        ),
      );

      // Simulate progress (Supabase doesn't provide upload progress)
      const progressInterval = setInterval(() => {
        setUploadingFiles((prev) =>
          prev.map((f, i) => {
            if (i === index && f.status === "uploading" && f.progress < 90) {
              return { ...f, progress: f.progress + 10 };
            }
            return f;
          }),
        );
      }, 200);

      // Generate unique filename
      const fileExt = file.name.split(".").pop();
      const fileName = `uploads/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Actual upload to Supabase storage
      const { error } = await supabase.storage
        .from("quote-files")
        .upload(fileName, file);

      clearInterval(progressInterval);

      if (error) {
        setUploadingFiles((prev) =>
          prev.map((f, i) =>
            i === index
              ? { ...f, status: "error" as const, error: error.message }
              : f,
          ),
        );
      } else {
        setUploadingFiles((prev) =>
          prev.map((f, i) =>
            i === index
              ? { ...f, progress: 100, status: "success" as const }
              : f,
          ),
        );

        // Add to context state after successful upload
        addFile({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          name: file.name,
          size: file.size,
          type: file.type,
          file,
        });

        // Remove from uploading list after a brief delay to show success state
        setTimeout(() => {
          setUploadingFiles((prev) => prev.filter((f) => f.file !== file));
        }, 1500);
      }
    } catch (err) {
      setUploadingFiles((prev) =>
        prev.map((f, i) =>
          i === index
            ? { ...f, status: "error" as const, error: "Upload failed" }
            : f,
        ),
      );
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const removeUploadingFile = (index: number) => {
    setUploadingFiles((prev) => prev.filter((_, i) => i !== index));
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
            ? "border-cethos-teal bg-cethos-teal-50"
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
            className="px-6 py-3.5 border-2 border-cethos-teal text-cethos-teal font-semibold text-base rounded-lg hover:bg-cethos-teal hover:text-white transition-all"
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

      {/* Uploading Files List */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-cethos-navy">
            Uploading Files ({uploadingFiles.length})
          </h3>
          {uploadingFiles.map((item, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
            >
              {/* Status Icon */}
              {item.status === "uploading" && (
                <Loader2 className="w-5 h-5 animate-spin text-cethos-teal flex-shrink-0" />
              )}
              {item.status === "success" && (
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              )}
              {item.status === "error" && (
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              )}

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 truncate">
                  {item.file.name}
                </p>

                {/* Progress Bar */}
                {item.status === "uploading" && (
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                    <div
                      className="bg-cethos-teal h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}

                {/* Error Message */}
                {item.status === "error" && (
                  <p className="text-xs text-red-600 mt-1">{item.error}</p>
                )}

                {/* Success Message */}
                {item.status === "success" && (
                  <p className="text-xs text-green-600 mt-1">Upload complete</p>
                )}
              </div>

              {/* File Size */}
              <span className="text-xs text-gray-500 flex-shrink-0">
                {(item.file.size / 1024 / 1024).toFixed(2)} MB
              </span>

              {/* Remove Button */}
              <button
                onClick={() => removeUploadingFile(index)}
                className="p-1 hover:bg-gray-200 rounded flex-shrink-0"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          ))}
        </div>
      )}

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
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
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
