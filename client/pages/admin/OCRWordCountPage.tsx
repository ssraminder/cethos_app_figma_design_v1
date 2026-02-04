import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import {
  Upload,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  Eye,
  Send
} from 'lucide-react';

interface QueuedFile {
  file: File;
  id: string;
  name: string;
  size: number;
}

interface BatchSummary {
  id: string;
  status: string;
  total_files: number;
  completed_files: number;
  failed_files: number;
  total_pages: number;
  total_words: number;
  created_at: string;
  completed_at: string | null;
  staff_name: string;
}

export default function OCRWordCountPage() {
  const navigate = useNavigate();
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);

  // Fetch batch history
  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    setLoadingBatches(true);
    try {
      const { data, error } = await supabase
        .from('ocr_batches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setBatches(data || []);
    } catch (err) {
      console.error('Failed to fetch batches:', err);
    } finally {
      setLoadingBatches(false);
    }
  };

  // Handle file drop/select
  const handleFiles = (files: FileList | File[]) => {
    const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');

    if (pdfFiles.length !== files.length) {
      toast.warning('Only PDF files are accepted');
    }

    const oversized = pdfFiles.filter(f => f.size > 100 * 1024 * 1024);
    if (oversized.length > 0) {
      toast.error(`${oversized.length} file(s) exceed 100MB limit`);
    }

    const validFiles = pdfFiles
      .filter(f => f.size <= 100 * 1024 * 1024)
      .map(file => ({
        file,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        size: file.size,
      }));

    setQueuedFiles(prev => [...prev, ...validFiles]);
  };

  // Remove file from queue
  const removeFile = (id: string) => {
    setQueuedFiles(prev => prev.filter(f => f.id !== id));
  };

  // Submit batch
  const submitBatch = async () => {
    if (queuedFiles.length === 0) {
      toast.error('No files to submit');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // 1. Upload files to storage
      const uploadedFiles: { filename: string; storagePath: string; fileSize: number }[] = [];

      for (const qf of queuedFiles) {
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(7);
        const sanitizedName = qf.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${timestamp}-${randomSuffix}-${sanitizedName}`;

        toast.info(`Uploading ${qf.name}...`);

        const { error: uploadError } = await supabase.storage
          .from('ocr-uploads')
          .upload(storagePath, qf.file, {
            contentType: 'application/pdf',
          });

        if (uploadError) {
          throw new Error(`Failed to upload ${qf.name}: ${uploadError.message}`);
        }

        uploadedFiles.push({
          filename: qf.name,
          storagePath,
          fileSize: qf.size,
        });
      }

      // 2. Create batch via edge function
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
            notes: null,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create batch');
      }

      const result = await response.json();

      toast.success(
        `Batch created! ${result.fileCount} file(s) queued. Estimated time: ${result.estimatedMinutes} minutes.`
      );

      // Clear queue and refresh history
      setQueuedFiles([]);
      fetchBatches();

    } catch (err) {
      console.error('Submit error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to submit batch');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  // Status badge
  const StatusBadge = ({ status }: { status: string }) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100'}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">OCR Word Count</h1>
          <p className="text-gray-600 mt-2">
            Upload PDF files to extract text and count words per page using Google Document AI.
            Files are processed one at a time (every 2 minutes). You'll receive an email when complete.
          </p>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Files
          </h2>

          {/* Drop Zone */}
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-2">
              Drag & drop PDF files here, or click to select
            </p>
            <p className="text-sm text-gray-500">
              Maximum 100MB per file - PDF only
            </p>
            <input
              id="file-input"
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </div>

          {/* Queued Files */}
          {queuedFiles.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Files to Process ({queuedFiles.length})
              </h3>
              <div className="space-y-2">
                {queuedFiles.map((qf) => (
                  <div
                    key={qf.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-red-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{qf.name}</p>
                        <p className="text-xs text-gray-500">{formatSize(qf.size)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile(qf.id)}
                      className="p-1 text-gray-400 hover:text-red-500"
                      disabled={isSubmitting}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Submit Button */}
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Estimated processing time: ~{queuedFiles.length * 2} minutes
                </p>
                <button
                  onClick={submitBatch}
                  disabled={isSubmitting || queuedFiles.length === 0}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Submit Batch
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Batch History */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Batch History
          </h2>

          {loadingBatches ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
            </div>
          ) : batches.length === 0 ? (
            <p className="text-center py-8 text-gray-500">No batches yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b">
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Files</th>
                    <th className="pb-3 font-medium">Pages</th>
                    <th className="pb-3 font-medium">Words</th>
                    <th className="pb-3 font-medium">Created</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id} className="border-b last:border-0">
                      <td className="py-3">
                        <StatusBadge status={batch.status} />
                        {batch.status === 'processing' && (
                          <span className="ml-2 text-xs text-gray-500">
                            {batch.completed_files}/{batch.total_files}
                          </span>
                        )}
                      </td>
                      <td className="py-3">{batch.total_files}</td>
                      <td className="py-3">{batch.total_pages}</td>
                      <td className="py-3">{batch.total_words.toLocaleString()}</td>
                      <td className="py-3 text-sm text-gray-500">
                        {formatDate(batch.created_at)}
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => navigate(`/admin/ocr-word-count/${batch.id}`)}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
