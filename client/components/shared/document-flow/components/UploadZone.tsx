import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { FileCategory, UploadProgress } from '../types';

interface UploadZoneProps {
  categories: FileCategory[];
  onFilesSelected: (files: File[], categoryId: string) => Promise<void>;
  disabled?: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  categories,
  onFilesSelected,
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set default category on load
  React.useEffect(() => {
    if (categories.length > 0 && !selectedCategoryId) {
      const defaultCat = categories.find(c => c.slug === 'to_translate');
      setSelectedCategoryId(defaultCat?.id || categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || !selectedCategoryId) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setIsUploading(true);
      try {
        await onFilesSelected(files, selectedCategoryId);
      } finally {
        setIsUploading(false);
      }
    }
  }, [disabled, selectedCategoryId, onFilesSelected]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled || !selectedCategoryId) return;

    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setIsUploading(true);
      try {
        await onFilesSelected(files, selectedCategoryId);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  }, [disabled, selectedCategoryId, onFilesSelected]);

  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="space-y-4">
      {/* Category Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          File Category
        </label>
        <select
          value={selectedCategoryId}
          onChange={(e) => setSelectedCategoryId(e.target.value)}
          disabled={disabled || isUploading}
          className="w-full md:w-64 border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
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
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${isUploading ? 'pointer-events-none' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.docx"
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />

        {isUploading ? (
          <div className="flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-2" />
            <p className="text-gray-600">Uploading files...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <Upload className={`w-10 h-10 mb-2 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
            <p className="text-gray-600 font-medium">
              {isDragging ? 'Drop files here' : 'Drag & drop files here'}
            </p>
            <p className="text-gray-500 text-sm mt-1">or click to browse</p>
            <p className="text-gray-400 text-xs mt-2">PDF, JPG, PNG, DOCX up to 50MB</p>
          </div>
        )}
      </div>

      {/* Upload Progress */}
      {uploadProgress.length > 0 && (
        <div className="space-y-2">
          {uploadProgress.map((item) => (
            <div key={item.fileId} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
              {item.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
              {item.status === 'complete' && <CheckCircle className="w-4 h-4 text-green-500" />}
              {item.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
              <span className="text-sm flex-1 truncate">{item.filename}</span>
              {item.status === 'uploading' && (
                <span className="text-sm text-gray-500">{item.progress}%</span>
              )}
              {item.error && (
                <span className="text-sm text-red-500">{item.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UploadZone;
