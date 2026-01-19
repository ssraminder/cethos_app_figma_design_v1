import { useState, useRef } from "react";
import { FileText } from "lucide-react";

export default function FileUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
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
    setFiles((prev) => [...prev, ...droppedFiles]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selectedFiles]);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  return (
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
  );
}
