// client/components/admin/hitl-file-list/FileUploadZone.tsx

import React, { useState, useRef, useCallback } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { usePdfPages } from './hooks/usePdfPages';
import { FileCategory } from './types';

interface FileUploadZoneProps {
  onUpload: (file: File, pageCount: number) => Promise<void>;
  categories: FileCategory[];
  selectedCategoryId: string;
  onCategoryChange: (categoryId: string) => void;
}

export function FileUploadZone({
  onUpload,
  categories,
  selectedCategoryId,
  onCategoryChange,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { countPages, convertImageToPdf } = usePdfPages();

  const processFile = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadStatus(`Processing ${file.name}...`);

    try {
      let pdfFile = file;
      let pageCount = 1;

      // Convert image to PDF if needed
      if (file.type.startsWith('image/')) {
        setUploadStatus(`Converting ${file.name} to PDF...`);
        pdfFile = await convertImageToPdf(file);
        pageCount = 1;
      } else if (file.type === 'application/pdf') {
        setUploadStatus(`Counting pages in ${file.name}...`);
        pageCount = await countPages(file);
      }

      setUploadStatus(`Uploading ${file.name}...`);
      await onUpload(pdfFile, pageCount);
      setUploadStatus('');
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus(`Failed to upload ${file.name}`);
      setTimeout(() => setUploadStatus(''), 3000);
    } finally {
      setIsUploading(false);
    }
  }, [onUpload, countPages, convertImageToPdf]);

  const handleFiles = useCallback(async (fileList: FileList) => {
    for (const file of Array.from(fileList)) {
      // Validate file type
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!validTypes.includes(file.type)) {
        alert(`Invalid file type: ${file.name}. Please upload PDF, JPG, or PNG.`);
        continue;
      }

      // Validate file size (50MB max)
      if (file.size > 50 * 1024 * 1024) {
        alert(`File too large: ${file.name}. Maximum size is 50MB.`);
        continue;
      }

      await processFile(file);
    }
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClick = () => {
    if (!isUploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      {/* Category Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          File Category
        </label>
        <select
          value={selectedCategoryId}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-teal-500 focus:border-teal-500"
        >
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name} {cat.is_billable ? '(Billable)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragging ? 'border-teal-500 bg-teal-50' : 'border-gray-300 hover:border-gray-400'}
          ${isUploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFileSelect}
          className="hidden"
        />

        {isUploading ? (
          <div className="flex flex-col items-center">
            <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
            <p className="mt-2 text-gray-600">{uploadStatus}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <Upload className={`w-8 h-8 ${isDragging ? 'text-teal-500' : 'text-gray-400'}`} />
            <p className="mt-2 text-gray-600 font-medium">
              {isDragging ? 'Drop files here' : 'Drag & drop files or click to browse'}
            </p>
            <p className="text-sm text-gray-500">PDF, JPG, PNG up to 50MB</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default FileUploadZone;
