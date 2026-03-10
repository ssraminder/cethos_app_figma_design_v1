import { useState, useEffect, useCallback, useRef } from 'react';
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
  Send,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Ban,
  ExternalLink
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

interface BatchFileStatus {
  id: string;
  filename: string;
  status: string;
  chunk_index: number | null;
  word_count: number | null;
  page_count: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  elapsed_seconds: number | null;
  storage_path: string | null;
}

interface ProcessingBatch {
  batch_id: string;
  batch_status: string;
  total_files: number;
  completed_files: number;
  failed_files: number;
  total_words: number;
  created_at: string;
  quote_id: string | null;
  quote_number: string | null;
  customer_name: string | null;
  files: BatchFileStatus[];
}

type DateFilter = 'today' | 'yesterday' | 'last_7_days' | 'last_30_days';

const DATE_FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
];

const PAGE_SIZE = 20;

function getDateRange(filter: DateFilter): { from: string; to: string } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filter) {
    case 'today':
      return {
        from: startOfToday.toISOString(),
        to: new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      };
    case 'yesterday': {
      const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
      return {
        from: startOfYesterday.toISOString(),
        to: startOfToday.toISOString(),
      };
    }
    case 'last_7_days': {
      const sevenDaysAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
      return {
        from: sevenDaysAgo.toISOString(),
        to: new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      };
    }
    case 'last_30_days': {
      const thirtyDaysAgo = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
      return {
        from: thirtyDaysAgo.toISOString(),
        to: new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      };
    }
  }
}

export default function OCRWordCountPage() {
  const navigate = useNavigate();
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Processing Status state
  const [processingBatches, setProcessingBatches] = useState<ProcessingBatch[]>([]);
  const [statusCollapsed, setStatusCollapsed] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Inline confirmation state: tracks which file/batch action is pending confirm
  const [confirmAction, setConfirmAction] = useState<{
    type: 'force_fail' | 'cancel_batch' | 'retry_file' | 'delete_file' | 'delete_batch';
    fileId?: string;
    batchId: string;
  } | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Fetch batch history when filter or page changes
  const fetchBatches = useCallback(async (filter: DateFilter, page: number) => {
    setLoadingBatches(true);
    try {
      const { from, to } = getDateRange(filter);
      const rangeFrom = (page - 1) * PAGE_SIZE;
      const rangeTo = rangeFrom + PAGE_SIZE - 1;

      const { data, error, count } = await supabase
        .from('ocr_batches')
        .select('*', { count: 'exact' })
        .gte('created_at', from)
        .lt('created_at', to)
        .order('created_at', { ascending: false })
        .range(rangeFrom, rangeTo);

      if (error) throw error;
      setBatches(data || []);
      setTotalCount(count ?? 0);
    } catch (err) {
      console.error('Failed to fetch batches:', err);
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  useEffect(() => {
    fetchBatches(dateFilter, currentPage);
  }, [dateFilter, currentPage, fetchBatches]);

  // Fetch processing status batches
  const fetchProcessingStatus = useCallback(async () => {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Fetch non-completed batches + recently completed with failures
      const { data: batchRows, error: batchError } = await supabase
        .from('ocr_batches')
        .select(`
          id,
          status,
          total_files,
          completed_files,
          failed_files,
          total_words,
          created_at,
          quote_id
        `)
        .or(`status.neq.completed,and(status.eq.completed,failed_files.gt.0,created_at.gte.${twentyFourHoursAgo})`)
        .order('created_at', { ascending: false });

      if (batchError) throw batchError;
      if (!batchRows || batchRows.length === 0) {
        setProcessingBatches([]);
        setLastRefreshed(new Date());
        setSecondsAgo(0);
        return;
      }

      const batchIds = batchRows.map(b => b.id);

      // Fetch files for these batches
      const { data: fileRows, error: fileError } = await supabase
        .from('ocr_batch_files')
        .select('id, batch_id, filename, status, chunk_index, word_count, page_count, error_message, started_at, completed_at, storage_path')
        .in('batch_id', batchIds);

      if (fileError) throw fileError;

      // Fetch quote info for batches with quote_id
      const quoteIds = batchRows.filter(b => b.quote_id).map(b => b.quote_id!);
      let quoteMap: Record<string, { quote_number: string; customer_name: string | null }> = {};

      if (quoteIds.length > 0) {
        const { data: quoteRows } = await supabase
          .from('quotes')
          .select('id, quote_number, customer_id, customers(full_name)')
          .in('id', quoteIds);

        if (quoteRows) {
          for (const q of quoteRows) {
            const customerData = q.customers as unknown as { full_name: string } | null;
            quoteMap[q.id] = {
              quote_number: q.quote_number,
              customer_name: customerData?.full_name || null,
            };
          }
        }
      }

      // Build processing batches
      const now = Date.now();
      const result: ProcessingBatch[] = batchRows.map(b => {
        const batchFiles = (fileRows || [])
          .filter(f => f.batch_id === b.id)
          .sort((a, f2) => (a.chunk_index ?? 999) - (f2.chunk_index ?? 999))
          .map(f => ({
            id: f.id,
            filename: f.filename,
            status: f.status,
            chunk_index: f.chunk_index,
            word_count: f.word_count,
            page_count: f.page_count,
            error_message: f.error_message,
            started_at: f.started_at,
            completed_at: f.completed_at,
            elapsed_seconds: f.started_at && f.status === 'processing'
              ? Math.floor((now - new Date(f.started_at).getTime()) / 1000)
              : null,
            storage_path: f.storage_path,
          }));

        const quoteInfo = b.quote_id ? quoteMap[b.quote_id] : null;

        return {
          batch_id: b.id,
          batch_status: b.status,
          total_files: b.total_files,
          completed_files: b.completed_files,
          failed_files: b.failed_files,
          total_words: b.total_words,
          created_at: b.created_at,
          quote_id: b.quote_id,
          quote_number: quoteInfo?.quote_number || null,
          customer_name: quoteInfo?.customer_name || null,
          files: batchFiles,
        };
      });

      setProcessingBatches(result);
      setLastRefreshed(new Date());
      setSecondsAgo(0);
    } catch (err) {
      console.error('Failed to fetch processing status:', err);
    }
  }, []);

  // Auto-refresh processing status every 15 seconds
  useEffect(() => {
    fetchProcessingStatus();
    refreshTimerRef.current = setInterval(fetchProcessingStatus, 15000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [fetchProcessingStatus]);

  // Tick the "last updated X seconds ago" counter
  useEffect(() => {
    tickTimerRef.current = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastRefreshed.getTime()) / 1000));
    }, 1000);
    return () => {
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    };
  }, [lastRefreshed]);

  // Categorize batches
  const activeBatches = processingBatches.filter(b =>
    b.files.some(f => f.status === 'processing')
  );
  const pendingBatches = processingBatches.filter(b =>
    b.files.every(f => f.status === 'pending')
  );
  const failedBatches = processingBatches.filter(b =>
    b.failed_files > 0
  );

  const allClear = activeBatches.length === 0 && pendingBatches.length === 0 && failedBatches.length === 0;

  // Auto-collapse when queue is clear
  useEffect(() => {
    if (allClear) setStatusCollapsed(true);
    else setStatusCollapsed(false);
  }, [allClear]);

  // Actions — per-file Force Fail
  const handleForceFailFile = async (fileId: string, batchId: string) => {
    try {
      await supabase
        .from('ocr_batch_files')
        .update({
          status: 'failed',
          error_message: 'Force-failed by staff',
          completed_at: new Date().toISOString(),
        })
        .eq('id', fileId);

      // Recount and update batch
      const { data: files } = await supabase
        .from('ocr_batch_files')
        .select('status, page_count, word_count')
        .eq('batch_id', batchId);

      if (files) {
        const completed = files.filter(f => f.status === 'completed').length;
        const failed = files.filter(f => f.status === 'failed').length;
        const allDone = completed + failed === files.length;

        await supabase
          .from('ocr_batches')
          .update({
            failed_files: failed,
            completed_files: completed,
            ...(allDone ? { status: 'completed', completed_at: new Date().toISOString() } : {}),
          })
          .eq('id', batchId);
      }

      setConfirmAction(null);
      toast.success('File force-failed');
      fetchProcessingStatus();
      fetchBatches(dateFilter, currentPage);
    } catch (err) {
      toast.error('Failed to force-fail file');
      console.error(err);
    }
  };

  // Cancel entire pending batch
  const handleCancelBatch = async (batchId: string, totalFiles: number) => {
    try {
      await supabase
        .from('ocr_batch_files')
        .update({ status: 'failed', error_message: 'Cancelled by staff' })
        .eq('batch_id', batchId)
        .eq('status', 'pending');

      await supabase
        .from('ocr_batches')
        .update({ status: 'completed', failed_files: totalFiles })
        .eq('id', batchId);

      setConfirmAction(null);
      toast.success('Batch cancelled');
      fetchProcessingStatus();
      fetchBatches(dateFilter, currentPage);
    } catch (err) {
      toast.error('Failed to cancel batch');
      console.error(err);
    }
  };

  // Retry a single failed file
  const handleRetryFile = async (fileId: string, batchId: string) => {
    try {
      await supabase
        .from('ocr_batch_files')
        .update({ status: 'pending', error_message: null, started_at: null, completed_at: null })
        .eq('id', fileId);

      // Recount batch
      const { data: files } = await supabase
        .from('ocr_batch_files')
        .select('status')
        .eq('batch_id', batchId);

      if (files) {
        const failed = files.filter(f => f.status === 'failed').length;
        await supabase
          .from('ocr_batches')
          .update({ status: 'pending', failed_files: failed })
          .eq('id', batchId);
      }

      setConfirmAction(null);
      toast.success('File queued for retry');
      fetchProcessingStatus();
      fetchBatches(dateFilter, currentPage);
    } catch (err) {
      toast.error('Failed to retry file');
      console.error(err);
    }
  };

  // Delete a single file permanently (storage + DB record)
  const handleDeleteFile = async (file: BatchFileStatus, batchId: string) => {
    try {
      // Step 1: Delete from ocr-uploads storage
      if (file.storage_path) {
        const { error: storageError } = await supabase.storage
          .from('ocr-uploads')
          .remove([file.storage_path]);

        if (storageError) {
          console.warn('Storage delete warning:', storageError.message);
        }
      }

      // Step 2: Hard delete the DB record
      const { error: dbError } = await supabase
        .from('ocr_batch_files')
        .delete()
        .eq('id', file.id);

      if (dbError) {
        toast.error('Failed to delete file record: ' + dbError.message);
        return;
      }

      // Step 3: Check remaining files in this batch
      const { data: remaining } = await supabase
        .from('ocr_batch_files')
        .select('id, status, page_count, word_count')
        .eq('batch_id', batchId);

      if (!remaining || remaining.length === 0) {
        // No files left — delete the batch record itself
        await supabase.from('ocr_batches').delete().eq('id', batchId);
      } else {
        // Recount and update batch counters
        const completed = remaining.filter(f => f.status === 'completed').length;
        const failed = remaining.filter(f => f.status === 'failed').length;
        const totalWords = remaining.reduce((s, f) => s + (f.word_count || 0), 0);
        const totalPages = remaining.reduce((s, f) => s + (f.page_count || 0), 0);
        const allDone = (completed + failed) === remaining.length;

        await supabase
          .from('ocr_batches')
          .update({
            total_files: remaining.length,
            completed_files: completed,
            failed_files: failed,
            total_words: totalWords,
            total_pages: totalPages,
            ...(allDone ? { status: 'completed', completed_at: new Date().toISOString() } : {}),
          })
          .eq('id', batchId);
      }

      setConfirmAction(null);
      toast.success('File deleted permanently');
      fetchProcessingStatus();
      fetchBatches(dateFilter, currentPage);
    } catch (err) {
      toast.error('Failed to delete file');
      console.error(err);
    }
  };

  // Delete an entire batch (all storage files + all DB records + batch record)
  const handleDeleteBatch = async (batch: ProcessingBatch) => {
    const batchId = batch.batch_id;
    try {
      // Step 1: Collect all storage paths from this batch's files
      const { data: files } = await supabase
        .from('ocr_batch_files')
        .select('id, storage_path')
        .eq('batch_id', batchId);

      // Step 2: Delete all storage files in one call
      if (files && files.length > 0) {
        const paths = files.map(f => f.storage_path).filter(Boolean) as string[];
        if (paths.length > 0) {
          const { error: storageError } = await supabase.storage
            .from('ocr-uploads')
            .remove(paths);

          if (storageError) {
            console.warn('Batch storage delete warning:', storageError.message);
          }
        }
      }

      // Step 3: Delete all file records for this batch
      await supabase
        .from('ocr_batch_files')
        .delete()
        .eq('batch_id', batchId);

      // Step 4: Delete the batch record itself
      const { error: batchError } = await supabase
        .from('ocr_batches')
        .delete()
        .eq('id', batchId);

      if (batchError) {
        toast.error('Failed to delete batch: ' + batchError.message);
        return;
      }

      // Optimistically remove from local state for instant UI update
      setProcessingBatches(prev => prev.filter(b => b.batch_id !== batchId));
      setBatches(prev => prev.filter(b => b.id !== batchId));

      setConfirmAction(null);
      toast.success('Batch deleted permanently');
      fetchProcessingStatus();
      fetchBatches(dateFilter, currentPage);
    } catch (err) {
      toast.error('Failed to delete batch');
      console.error(err);
    }
  };

  // Legacy batch-level reset stuck (kept for active batches)
  const handleResetStuck = async (batchId: string) => {
    if (!confirm('Reset files that have been processing for >90 seconds back to pending?')) return;
    try {
      const { error } = await supabase
        .from('ocr_batch_files')
        .update({ status: 'pending', started_at: null, error_message: 'Manually reset by staff' })
        .eq('batch_id', batchId)
        .eq('status', 'processing')
        .lt('started_at', new Date(Date.now() - 90000).toISOString());
      if (error) throw error;
      toast.success('Stuck files reset to pending');
      fetchProcessingStatus();
    } catch (err) {
      toast.error('Failed to reset stuck files');
      console.error(err);
    }
  };

  // Helper: time ago string
  const timeAgo = (dateStr: string) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  // File status dot
  const FileStatusDot = ({ status }: { status: string }) => {
    switch (status) {
      case 'processing':
        return <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" title="Processing" />;
      case 'pending':
        return <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-gray-400" title="Pending" />;
      case 'completed':
        return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-3.5 h-3.5 text-red-500" />;
      default:
        return <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-300" />;
    }
  };

  const handleFilterChange = (filter: DateFilter) => {
    setDateFilter(filter);
    setCurrentPage(1);
  };

  // Handle file drop/select
  const handleFiles = (files: FileList | File[]) => {
    const pdfFiles = Array.from(files).filter(f => ['application/pdf', 'image/jpeg', 'image/png'].includes(f.type));

    if (pdfFiles.length !== files.length) {
      toast.warning('Only PDF, JPG, and PNG files are accepted');
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
      setDateFilter('today');
      setCurrentPage(1);
      fetchBatches('today', 1);

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

        {/* Processing Status Section */}
        <div className="bg-white rounded-lg shadow-md mb-8">
          {/* Header */}
          <button
            onClick={() => setStatusCollapsed(!statusCollapsed)}
            className="w-full flex items-center justify-between p-6 pb-4 text-left"
          >
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">Processing Status</h2>
              <div className="flex items-center gap-2">
                {activeBatches.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Active ({activeBatches.length})
                  </span>
                )}
                {pendingBatches.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    Pending ({pendingBatches.length})
                  </span>
                )}
                {failedBatches.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    Failed ({failedBatches.length})
                  </span>
                )}
                {allClear && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    Queue clear
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                Updated {secondsAgo}s ago
              </span>
              {statusCollapsed ? (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              )}
            </div>
          </button>

          {!statusCollapsed && (
            <div className="px-6 pb-6 space-y-6">

              {/* Active (processing) */}
              {activeBatches.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-blue-700 mb-3 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Active ({activeBatches.length})
                  </h3>
                  <div className="space-y-3">
                    {activeBatches.map(batch => (
                      <div
                        key={batch.batch_id}
                        className="border-l-4 border-blue-500 bg-blue-50/50 rounded-r-lg p-4"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                            <span className="font-medium text-gray-900">Processing</span>
                            {batch.quote_number && (
                              <>
                                <span className="text-gray-400">-</span>
                                <span className="text-gray-700">{batch.quote_number}</span>
                              </>
                            )}
                            {batch.customer_name && (
                              <>
                                <span className="text-gray-400">&middot;</span>
                                <span className="text-gray-600">{batch.customer_name}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              {batch.completed_files}/{batch.total_files} files done
                            </span>
                            <button
                              onClick={() => setConfirmAction({ type: 'delete_batch', batchId: batch.batch_id })}
                              className="text-red-600 border border-red-300 rounded px-2 py-1 text-xs hover:bg-red-50"
                            >
                              <span className="flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete Batch</span>
                            </button>
                          </div>
                        </div>
                        {/* Inline confirm for Delete Batch */}
                        {confirmAction?.type === 'delete_batch' && confirmAction.batchId === batch.batch_id && (
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className="text-gray-600">Permanently delete this entire batch? All {batch.total_files} file records and their storage files will be removed. This cannot be undone.</span>
                            <button
                              onClick={() => handleDeleteBatch(batch)}
                              className="px-2 py-0.5 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                            >
                              Delete Batch
                            </button>
                            <button
                              onClick={() => setConfirmAction(null)}
                              className="px-2 py-0.5 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        <div className="space-y-1 ml-6">
                          {batch.files.map((f, i) => (
                            <div key={f.id || i}>
                              <div className="flex items-center gap-2 text-sm">
                                <FileStatusDot status={f.status} />
                                <span className={`font-mono text-xs ${f.status === 'failed' ? 'text-red-600' : 'text-gray-700'}`}>
                                  {f.filename}
                                </span>
                                {f.status === 'processing' && f.elapsed_seconds != null && (
                                  <span className="text-xs text-blue-600 font-medium">
                                    {f.elapsed_seconds}s
                                  </span>
                                )}
                                {f.status === 'completed' && (
                                  <span className="text-xs text-gray-400">
                                    {f.page_count != null && `${f.page_count} ${f.page_count === 1 ? 'page' : 'pages'}`}
                                    {f.page_count != null && f.word_count != null && ', '}
                                    {f.word_count != null && `${f.word_count.toLocaleString()} words`}
                                  </span>
                                )}
                                {f.status === 'failed' && f.error_message && (
                                  <span className="text-xs text-red-500">
                                    &mdash; &ldquo;{f.error_message}&rdquo;
                                  </span>
                                )}
                                {f.status === 'processing' && (
                                  <button
                                    onClick={() => setConfirmAction({ type: 'force_fail', fileId: f.id, batchId: batch.batch_id })}
                                    className="ml-2 px-2 py-0.5 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"
                                  >
                                    Force Fail
                                  </button>
                                )}
                              </div>
                              {/* Inline confirm for Force Fail */}
                              {confirmAction?.type === 'force_fail' && confirmAction.fileId === f.id && (
                                <div className="ml-6 mt-1 mb-1 flex items-center gap-2 text-xs">
                                  <span className="text-gray-600">Force fail this file? The queue will move on.</span>
                                  <button
                                    onClick={() => handleForceFailFile(f.id, batch.batch_id)}
                                    className="px-2 py-0.5 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setConfirmAction(null)}
                                    className="px-2 py-0.5 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 mt-3 ml-6">
                          {batch.quote_id && (
                            <button
                              onClick={() => navigate(`/admin/quotes/${batch.quote_id}`)}
                              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                            >
                              View Quote <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={() => handleResetStuck(batch.batch_id)}
                            className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Reset Stuck Files
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending (queued) */}
              {pendingBatches.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-yellow-700 mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Pending ({pendingBatches.length})
                  </h3>
                  <div className="space-y-2">
                    {pendingBatches.map(batch => (
                      <div
                        key={batch.batch_id}
                        className="border-l-4 border-yellow-400 bg-yellow-50/50 rounded-r-lg p-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div>
                              <span className="font-medium text-gray-900">
                                {batch.quote_number || 'No quote'}
                              </span>
                              {batch.customer_name && (
                                <span className="text-gray-500 ml-1">&middot; {batch.customer_name}</span>
                              )}
                            </div>
                            <span className="text-sm text-gray-500">{batch.total_files} files</span>
                            <span className="text-xs text-gray-400">queued {timeAgo(batch.created_at)}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {batch.quote_id && (
                              <button
                                onClick={() => navigate(`/admin/quotes/${batch.quote_id}`)}
                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                              >
                                View Quote <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={() => setConfirmAction({ type: 'cancel_batch', batchId: batch.batch_id })}
                              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800"
                            >
                              <Ban className="w-3 h-3" />
                              Cancel Batch
                            </button>
                            <button
                              onClick={() => setConfirmAction({ type: 'delete_batch', batchId: batch.batch_id })}
                              className="text-red-600 border border-red-300 rounded px-2 py-1 text-xs hover:bg-red-50"
                            >
                              <span className="flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete Batch</span>
                            </button>
                          </div>
                        </div>
                        {/* Inline confirm for Delete Batch */}
                        {confirmAction?.type === 'delete_batch' && confirmAction.batchId === batch.batch_id && (
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className="text-gray-600">Permanently delete this entire batch? All {batch.total_files} file records and their storage files will be removed. This cannot be undone.</span>
                            <button
                              onClick={() => handleDeleteBatch(batch)}
                              className="px-2 py-0.5 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                            >
                              Delete Batch
                            </button>
                            <button
                              onClick={() => setConfirmAction(null)}
                              className="px-2 py-0.5 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        {/* Inline confirm for Cancel Batch */}
                        {confirmAction?.type === 'cancel_batch' && confirmAction.batchId === batch.batch_id && (
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className="text-gray-600">Cancel this batch? All pending files will be marked as failed.</span>
                            <button
                              onClick={() => handleCancelBatch(batch.batch_id, batch.total_files)}
                              className="px-2 py-0.5 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmAction(null)}
                              className="px-2 py-0.5 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Failed (last 24h) */}
              {failedBatches.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Failed ({failedBatches.length})
                  </h3>
                  <div className="space-y-3">
                    {failedBatches.map(batch => (
                      <div
                        key={batch.batch_id}
                        className="border-l-4 border-red-500 bg-red-50/50 rounded-r-lg p-4"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">
                              {batch.quote_number || 'No quote'}
                            </span>
                            {batch.customer_name && (
                              <>
                                <span className="text-gray-400">&middot;</span>
                                <span className="text-gray-600">{batch.customer_name}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-600 font-medium">
                              {batch.failed_files}/{batch.total_files} files failed
                            </span>
                            <button
                              onClick={() => setConfirmAction({ type: 'delete_batch', batchId: batch.batch_id })}
                              className="text-red-600 border border-red-300 rounded px-2 py-1 text-xs hover:bg-red-50"
                            >
                              <span className="flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete Batch</span>
                            </button>
                          </div>
                        </div>
                        {/* Inline confirm for Delete Batch */}
                        {confirmAction?.type === 'delete_batch' && confirmAction.batchId === batch.batch_id && (
                          <div className="mt-2 mb-2 flex items-center gap-2 text-xs">
                            <span className="text-gray-600">Permanently delete this entire batch? All {batch.total_files} file records and their storage files will be removed. This cannot be undone.</span>
                            <button
                              onClick={() => handleDeleteBatch(batch)}
                              className="px-2 py-0.5 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                            >
                              Delete Batch
                            </button>
                            <button
                              onClick={() => setConfirmAction(null)}
                              className="px-2 py-0.5 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        <div className="space-y-2 ml-4">
                          {batch.files.map((f, i) => (
                            <div key={f.id || i}>
                              <div className="flex items-center gap-2 text-sm">
                                <FileStatusDot status={f.status} />
                                <span className={`font-mono text-xs ${f.status === 'failed' ? 'text-red-600' : 'text-gray-700'}`}>
                                  {f.filename}
                                </span>
                                {f.status === 'completed' && (
                                  <span className="text-xs text-gray-400">
                                    &mdash; {f.page_count != null && `${f.page_count} ${f.page_count === 1 ? 'page' : 'pages'}`}
                                    {f.page_count != null && f.word_count != null && ', '}
                                    {f.word_count != null && `${f.word_count.toLocaleString()} words`}
                                  </span>
                                )}
                              </div>
                              {f.status === 'failed' && (
                                <div className="ml-6">
                                  {f.error_message && (
                                    <p className="text-xs text-red-600 mt-0.5">
                                      &ldquo;{f.error_message}&rdquo;
                                    </p>
                                  )}
                                  <div className="flex items-center gap-2 mt-1">
                                    <button
                                      onClick={() => setConfirmAction({ type: 'retry_file', fileId: f.id, batchId: batch.batch_id })}
                                      className="px-2 py-0.5 text-xs border border-green-300 text-green-700 rounded hover:bg-green-50"
                                    >
                                      <span className="flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Retry</span>
                                    </button>
                                    <button
                                      onClick={() => setConfirmAction({ type: 'delete_file', fileId: f.id, batchId: batch.batch_id })}
                                      className="px-2 py-0.5 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"
                                    >
                                      <span className="flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete</span>
                                    </button>
                                  </div>
                                  {/* Inline confirm for Retry */}
                                  {confirmAction?.type === 'retry_file' && confirmAction.fileId === f.id && (
                                    <div className="mt-1 flex items-center gap-2 text-xs">
                                      <span className="text-gray-600">Retry this file?</span>
                                      <button
                                        onClick={() => handleRetryFile(f.id, batch.batch_id)}
                                        className="px-2 py-0.5 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                                      >
                                        Confirm
                                      </button>
                                      <button
                                        onClick={() => setConfirmAction(null)}
                                        className="px-2 py-0.5 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  )}
                                  {/* Inline confirm for Delete */}
                                  {confirmAction?.type === 'delete_file' && confirmAction.fileId === f.id && (
                                    <div className="mt-1 flex items-center gap-2 text-xs">
                                      <span className="text-gray-600">Permanently delete this file? The storage file and database record will both be removed.</span>
                                      <button
                                        onClick={() => handleDeleteFile(f, batch.batch_id)}
                                        className="px-2 py-0.5 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                                      >
                                        Delete
                                      </button>
                                      <button
                                        onClick={() => setConfirmAction(null)}
                                        className="px-2 py-0.5 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 mt-3 ml-4">
                          {batch.quote_id && (
                            <button
                              onClick={() => navigate(`/admin/quotes/${batch.quote_id}`)}
                              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                            >
                              View Quote <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {allClear && (
                <p className="text-center text-sm text-gray-500 py-2">
                  No active, pending, or recently failed batches.
                </p>
              )}
            </div>
          )}
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
              Drag & drop PDF or image files here, or click to select
            </p>
            <p className="text-sm text-gray-500">
              Maximum 100MB per file — PDF, JPG, PNG
            </p>
            <input
              id="file-input"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Batch History
            </h2>

            {/* Date Filter Buttons */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {DATE_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleFilterChange(option.value)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    dateFilter === option.value
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {loadingBatches ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
            </div>
          ) : batches.length === 0 ? (
            <p className="text-center py-8 text-gray-500">
              No batches found for {DATE_FILTER_OPTIONS.find(o => o.value === dateFilter)?.label?.toLowerCase() || 'this period'}
            </p>
          ) : (
            <>
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-500">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount} batches
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </button>
                    <span className="text-sm text-gray-600">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
