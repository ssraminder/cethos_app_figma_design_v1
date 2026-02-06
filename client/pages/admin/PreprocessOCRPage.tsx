// client/pages/admin/PreprocessOCRPage.tsx

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PDFDocument } from 'pdf-lib';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Upload,
  FileText,
  Scissors,
  Loader2,
  Trash2,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Info
} from 'lucide-react';

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_PAGES_PER_CHUNK = 10;
const MAX_FILE_SIZE_MB = 100; // Upload limit
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const WARN_CHUNK_SIZE_MB = 15; // Warn if chunk exceeds this

// ============================================================================
// TYPES
// ============================================================================

interface UploadedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount: number | null; // null = not yet analyzed
  status: 'pending' | 'analyzing' | 'ready' | 'error';
  error?: string;
  chunks: ChunkInfo[];
}

interface ChunkInfo {
  id: string;
  name: string;
  pageStart: number;
  pageEnd: number;
  pageCount: number;
  blob: Blob | null;
  size: number;
  status: 'pending' | 'splitting' | 'ready' | 'uploading' | 'uploaded' | 'error';
  error?: string;
}

interface SubmitProgress {
  phase: 'idle' | 'splitting' | 'uploading' | 'creating-batch' | 'done' | 'error';
  currentFile: string;
  currentChunk: number;
  totalChunks: number;
  uploadedChunks: number;
  totalUploadChunks: number;
  message: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function PreprocessOCRPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [progress, setProgress] = useState<SubmitProgress>({
    phase: 'idle',
    currentFile: '',
    currentChunk: 0,
    totalChunks: 0,
    uploadedChunks: 0,
    totalUploadChunks: 0,
    message: '',
  });
  const [batchId, setBatchId] = useState<string | null>(null);

  const isProcessing = progress.phase !== 'idle' && progress.phase !== 'done' && progress.phase !== 'error';

  // ============================================================================
  // FILE HANDLING
  // ============================================================================

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await addFiles(e.dataTransfer.files);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await addFiles(e.target.files);
      // Reset input so same file can be selected again
      e.target.value = '';
    }
  };

  const addFiles = async (fileList: FileList) => {
    const pdfFiles = Array.from(fileList).filter(f => f.type === 'application/pdf');

    if (pdfFiles.length !== fileList.length) {
      toast.warning('Only PDF files are accepted. Non-PDF files were skipped.');
    }

    const oversized = pdfFiles.filter(f => f.size > MAX_FILE_SIZE_BYTES);
    if (oversized.length > 0) {
      toast.error(`${oversized.length} file(s) exceed ${MAX_FILE_SIZE_MB}MB limit and were skipped.`);
    }

    const validFiles = pdfFiles.filter(f => f.size <= MAX_FILE_SIZE_BYTES);

    // Create file entries
    const newFiles: UploadedFile[] = validFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      name: file.name,
      size: file.size,
      pageCount: null,
      status: 'pending',
      chunks: [],
    }));

    setFiles(prev => [...prev, ...newFiles]);

    // Analyze each file to get page count and plan chunks
    for (const f of newFiles) {
      await analyzeFile(f.id, f.file);
    }
  };

  const analyzeFile = async (fileId: string, file: File) => {
    setFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, status: 'analyzing' } : f
    ));

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const pageCount = pdfDoc.getPageCount();

      if (pageCount === 0) {
        setFiles(prev => prev.map(f =>
          f.id === fileId ? { ...f, status: 'error', error: 'PDF has no pages', pageCount: 0, chunks: [] } : f
        ));
        return;
      }

      // Plan chunks
      const chunks: ChunkInfo[] = [];

      if (pageCount <= MAX_PAGES_PER_CHUNK) {
        // No splitting needed
        chunks.push({
          id: `${fileId}-chunk-1`,
          name: file.name,
          pageStart: 1,
          pageEnd: pageCount,
          pageCount: pageCount,
          blob: null, // Will use original file
          size: file.size,
          status: 'ready',
        });
      } else {
        // Split into chunks
        const numChunks = Math.ceil(pageCount / MAX_PAGES_PER_CHUNK);
        for (let i = 0; i < numChunks; i++) {
          const start = i * MAX_PAGES_PER_CHUNK + 1;
          const end = Math.min((i + 1) * MAX_PAGES_PER_CHUNK, pageCount);
          const baseName = file.name.replace(/\.pdf$/i, '');
          chunks.push({
            id: `${fileId}-chunk-${i + 1}`,
            name: `${baseName}_p${start}-${end}.pdf`,
            pageStart: start,
            pageEnd: end,
            pageCount: end - start + 1,
            blob: null, // Will be created during splitting
            size: 0,
            status: 'pending',
          });
        }
      }

      setFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'ready', pageCount, chunks } : f
      ));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to read PDF';
      console.error(`Error analyzing ${file.name}:`, err);
      setFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'error', error: errorMessage } : f
      ));
    }
  };

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // ============================================================================
  // SUBMIT: SPLIT + UPLOAD + CREATE BATCH
  // ============================================================================

  const submitBatch = async () => {
    const readyFiles = files.filter(f => f.status === 'ready');
    if (readyFiles.length === 0) {
      toast.error('No files ready to process');
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error('Not authenticated');
      return;
    }

    // Count total chunks to upload
    const totalChunks = readyFiles.reduce((sum, f) => sum + f.chunks.length, 0);
    let uploadedCount = 0;

    setProgress({
      phase: 'splitting',
      currentFile: '',
      currentChunk: 0,
      totalChunks: 0,
      uploadedChunks: 0,
      totalUploadChunks: totalChunks,
      message: 'Preparing files...',
    });

    try {
      const uploadedFiles: {
        filename: string;
        storagePath: string;
        fileSize: number;
        fileGroupId: string | null;
        originalFilename: string | null;
        chunkIndex: number | null;
      }[] = [];

      for (const uploadFile of readyFiles) {
        // Generate a group UUID for files that were split into multiple chunks
        // Files with only 1 chunk (not split) get null
        const wasSplit = uploadFile.chunks.length > 1;
        const fileGroupId = wasSplit ? crypto.randomUUID() : null;
        const originalFilename = wasSplit ? uploadFile.name : null;

        const needsSplitting = uploadFile.chunks.length > 1 ||
          (uploadFile.chunks.length === 1 && uploadFile.chunks[0].status === 'pending');

        if (!needsSplitting && uploadFile.chunks.length === 1) {
          // Single chunk - upload original file directly
          const chunk = uploadFile.chunks[0];

          setProgress(prev => ({
            ...prev,
            phase: 'uploading',
            currentFile: uploadFile.name,
            message: `Uploading ${uploadFile.name}...`,
          }));

          const storagePath = generateStoragePath(chunk.name);
          const { error: uploadError } = await supabase.storage
            .from('ocr-uploads')
            .upload(storagePath, uploadFile.file, { contentType: 'application/pdf' });

          if (uploadError) {
            throw new Error(`Upload failed for ${uploadFile.name}: ${uploadError.message}`);
          }

          uploadedFiles.push({
            filename: chunk.name,
            storagePath,
            fileSize: uploadFile.size,
            // Group metadata (null for unsplit files)
            fileGroupId: null,
            originalFilename: null,
            chunkIndex: null,
          });

          uploadedCount++;
          setProgress(prev => ({ ...prev, uploadedChunks: uploadedCount }));

        } else {
          // Multiple chunks - need to split
          setProgress(prev => ({
            ...prev,
            phase: 'splitting',
            currentFile: uploadFile.name,
            totalChunks: uploadFile.chunks.length,
            message: `Splitting ${uploadFile.name} into ${uploadFile.chunks.length} chunks...`,
          }));

          const arrayBuffer = await uploadFile.file.arrayBuffer();
          const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

          for (let i = 0; i < uploadFile.chunks.length; i++) {
            const chunk = uploadFile.chunks[i];

            setProgress(prev => ({
              ...prev,
              phase: 'splitting',
              currentChunk: i + 1,
              message: `Splitting ${uploadFile.name}: chunk ${i + 1}/${uploadFile.chunks.length} (pages ${chunk.pageStart}-${chunk.pageEnd})...`,
            }));

            // Create chunk PDF
            const chunkPdf = await PDFDocument.create();
            const pageIndices = Array.from(
              { length: chunk.pageCount },
              (_, idx) => chunk.pageStart - 1 + idx // 0-indexed
            );
            const copiedPages = await chunkPdf.copyPages(pdfDoc, pageIndices);
            copiedPages.forEach(page => chunkPdf.addPage(page));
            const chunkBytes = await chunkPdf.save();
            const chunkBlob = new Blob([chunkBytes], { type: 'application/pdf' });
            const chunkSizeMB = chunkBytes.length / (1024 * 1024);

            if (chunkSizeMB > WARN_CHUNK_SIZE_MB) {
              console.warn(`Warning: Chunk ${chunk.name} is ${chunkSizeMB.toFixed(1)}MB (over ${WARN_CHUNK_SIZE_MB}MB warning threshold)`);
            }

            // Upload chunk
            setProgress(prev => ({
              ...prev,
              phase: 'uploading',
              message: `Uploading ${chunk.name} (${chunkSizeMB.toFixed(1)}MB)...`,
            }));

            const storagePath = generateStoragePath(chunk.name);
            const { error: uploadError } = await supabase.storage
              .from('ocr-uploads')
              .upload(storagePath, chunkBlob, { contentType: 'application/pdf' });

            if (uploadError) {
              throw new Error(`Upload failed for ${chunk.name}: ${uploadError.message}`);
            }

            uploadedFiles.push({
              filename: chunk.name,
              storagePath,
              fileSize: chunkBytes.length,
              // Group metadata for split files
              fileGroupId: fileGroupId,           // same UUID for all chunks of this file
              originalFilename: originalFilename, // e.g. "contract.pdf"
              chunkIndex: i + 1,                  // 1-based index
            });

            uploadedCount++;
            setProgress(prev => ({ ...prev, uploadedChunks: uploadedCount }));
          }
        }
      }

      // Create batch via existing edge function
      setProgress(prev => ({
        ...prev,
        phase: 'creating-batch',
        message: `Creating batch with ${uploadedFiles.length} files...`,
      }));

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-batch-create`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            files: uploadedFiles,
            notes: `Preprocessed batch. Original files: ${readyFiles.map(f => `${f.name} (${f.pageCount} pages)`).join(', ')}`,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create batch');
      }

      const result = await response.json();
      setBatchId(result.batchId);

      setProgress(prev => ({
        ...prev,
        phase: 'done',
        message: `Batch created! ${uploadedFiles.length} chunk(s) queued. Estimated time: ~${uploadedFiles.length * 2} minutes.`,
      }));

      toast.success(`Batch created! ${uploadedFiles.length} file(s) queued for OCR processing.`);

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit batch';
      console.error('Submit error:', err);
      setProgress(prev => ({
        ...prev,
        phase: 'error',
        message: errorMessage,
      }));
      toast.error(errorMessage);
    }
  };

  const resetForm = () => {
    setFiles([]);
    setProgress({
      phase: 'idle',
      currentFile: '',
      currentChunk: 0,
      totalChunks: 0,
      uploadedChunks: 0,
      totalUploadChunks: 0,
      message: '',
    });
    setBatchId(null);
  };

  // ============================================================================
  // HELPERS
  // ============================================================================

  const generateStoragePath = (filename: string): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${timestamp}-${random}-${sanitized}`;
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Summary stats
  const readyFiles = files.filter(f => f.status === 'ready');
  const totalOriginalPages = readyFiles.reduce((sum, f) => sum + (f.pageCount || 0), 0);
  const totalChunks = readyFiles.reduce((sum, f) => sum + f.chunks.length, 0);
  const filesNeedingSplit = readyFiles.filter(f => f.chunks.length > 1).length;

  // Suppress unused variable warning
  void isProcessing;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Scissors className="w-8 h-8 text-blue-600" />
            Preprocess & OCR
          </h1>
          <p className="text-gray-600 mt-2">
            Upload large PDFs — they'll be automatically split into smaller chunks (≤10 pages each)
            before OCR processing. Handles files of any size.
          </p>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">How it works:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Upload PDF files (up to 100MB each)</li>
              <li>Files with more than 10 pages are automatically split into chunks</li>
              <li>All chunks are submitted for OCR word counting</li>
              <li>Processing takes ~2 minutes per chunk</li>
              <li>You'll receive an email when results are ready</li>
            </ol>
          </div>
        </div>

        {/* Upload Section */}
        {progress.phase === 'idle' && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Files
            </h2>

            {/* Drop Zone */}
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer"
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">
                Drag & drop PDF files here, or click to select
              </p>
              <p className="text-sm text-gray-500">
                Maximum 100MB per file • PDF only • Files &gt;10 pages will be split automatically
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          </div>
        )}

        {/* File List */}
        {files.length > 0 && progress.phase === 'idle' && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">
              Files ({files.length})
            </h2>

            <div className="space-y-3">
              {files.map((f) => (
                <div key={f.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {f.status === 'analyzing' && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
                      {f.status === 'ready' && <CheckCircle className="w-5 h-5 text-green-500" />}
                      {f.status === 'error' && <XCircle className="w-5 h-5 text-red-500" />}
                      {f.status === 'pending' && <Clock className="w-5 h-5 text-gray-400" />}

                      <div>
                        <p className="font-medium text-gray-900">{f.name}</p>
                        <p className="text-sm text-gray-500">
                          {formatSize(f.size)}
                          {f.pageCount !== null && ` • ${f.pageCount} pages`}
                          {f.status === 'analyzing' && ' • Analyzing...'}
                          {f.error && ` • Error: ${f.error}`}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => removeFile(f.id)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Chunk Preview */}
                  {f.chunks.length > 1 && (
                    <div className="mt-3 ml-8">
                      <p className="text-sm text-amber-600 flex items-center gap-1 mb-2">
                        <Scissors className="w-4 h-4" />
                        Will be split into {f.chunks.length} chunks:
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {f.chunks.map((chunk) => (
                          <div key={chunk.id} className="text-xs bg-gray-50 rounded px-2 py-1 text-gray-600">
                            Pages {chunk.pageStart}-{chunk.pageEnd} ({chunk.pageCount} pages)
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {f.chunks.length === 1 && f.status === 'ready' && (
                    <div className="mt-2 ml-8">
                      <p className="text-sm text-green-600">
                        No splitting needed ({f.pageCount} pages)
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Summary & Submit */}
            {readyFiles.length > 0 && (
              <div className="mt-6 border-t pt-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>
                      <strong>{readyFiles.length}</strong> file(s) ready •
                      <strong> {totalOriginalPages}</strong> total pages •
                      <strong> {totalChunks}</strong> chunk(s) to process
                    </p>
                    {filesNeedingSplit > 0 && (
                      <p className="text-amber-600">
                        <Scissors className="w-3 h-3 inline" /> {filesNeedingSplit} file(s) will be split
                      </p>
                    )}
                    <p className="text-gray-500">
                      Estimated time: ~{totalChunks * 2} minutes
                    </p>
                  </div>

                  <button
                    onClick={submitBatch}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    <Send className="w-4 h-4" />
                    Process {totalChunks} Chunk(s)
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Progress Display */}
        {(progress.phase !== 'idle') && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">
              {progress.phase === 'done' ? 'Batch Submitted!' :
               progress.phase === 'error' ? 'Error' : 'Processing...'}
            </h2>

            {/* Progress Bar */}
            {(progress.phase === 'splitting' || progress.phase === 'uploading') && (
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>{progress.message}</span>
                  <span>{progress.uploadedChunks}/{progress.totalUploadChunks}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                    style={{
                      width: `${progress.totalUploadChunks > 0
                        ? (progress.uploadedChunks / progress.totalUploadChunks) * 100
                        : 0}%`
                    }}
                  />
                </div>
              </div>
            )}

            {progress.phase === 'creating-batch' && (
              <div className="flex items-center gap-3 text-blue-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{progress.message}</span>
              </div>
            )}

            {progress.phase === 'done' && (
              <div>
                <div className="flex items-center gap-3 text-green-600 mb-4">
                  <CheckCircle className="w-6 h-6" />
                  <span className="text-lg">{progress.message}</span>
                </div>
                <p className="text-gray-600 mb-4">
                  You'll receive an email at info@cethos.com, pm@cethoscorp.com, and raminder@cethos.com when processing is complete.
                </p>
                <div className="flex gap-3">
                  {batchId && (
                    <button
                      onClick={() => navigate(`/admin/ocr-word-count/${batchId}`)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      <Eye className="w-4 h-4" />
                      View Batch Status
                    </button>
                  )}
                  <button
                    onClick={resetForm}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Process More Files
                  </button>
                </div>
              </div>
            )}

            {progress.phase === 'error' && (
              <div>
                <div className="flex items-center gap-3 text-red-600 mb-4">
                  <XCircle className="w-6 h-6" />
                  <span>{progress.message}</span>
                </div>
                <button
                  onClick={resetForm}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}

        {/* Link to results */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">View Past Results</h2>
              <p className="text-sm text-gray-500">
                Check the OCR Word Count page for batch history and results
              </p>
            </div>
            <button
              onClick={() => navigate('/admin/ocr-word-count')}
              className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg"
            >
              <Eye className="w-4 h-4" />
              OCR Word Count
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
