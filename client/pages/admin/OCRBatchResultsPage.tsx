import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { OcrResultsModal } from '../../components/shared/analysis';
import {
  ArrowLeft,
  Download,
  FileText,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Eye,
  RefreshCw,
  DollarSign,
  Cpu
} from 'lucide-react';

interface PageResult {
  page_number: number;
  word_count: number;
  character_count: number;
  ocr_provider?: string | null;
}

interface FileResult {
  id: string;
  filename: string;
  status: string;
  page_count: number;
  word_count: number;
  error_message: string | null;
  pages: PageResult[];
  // Group fields
  file_group_id: string | null;
  original_filename: string | null;
  chunk_index: number | null;
  // Provider tracking (per-file)
  ocr_provider?: string | null;
  active_ocr_provider?: string | null;
  fallback_attempted?: boolean | null;
  primary_provider_error?: string | null;
}

// Filter a file's pages down to the rows produced by its active OCR provider.
// When both Google and Mistral ran, the API returns both sets — we only want
// to count/render the active one in aggregates, charts, and CSV.
function activePages(file: FileResult): PageResult[] {
  const active = file.active_ocr_provider || 'google_document_ai';
  // If no rows have ocr_provider set (legacy data before the migration),
  // return them all so we don't accidentally hide everything.
  const hasProviderTagging = (file.pages || []).some((p) => p.ocr_provider);
  if (!hasProviderTagging) return file.pages || [];
  return (file.pages || []).filter((p) => (p.ocr_provider || 'google_document_ai') === active);
}

// Group a file's pages by OCR provider. Returns [] when only one provider
// has rows (caller renders the single-provider view), otherwise [google, mistral]
// in a stable order for side-by-side display.
function providerGroups(file: FileResult): Array<{ provider: string; pages: PageResult[] }> {
  const pages = file.pages || [];
  const hasProviderTagging = pages.some((p) => p.ocr_provider);
  if (!hasProviderTagging) return [];
  const byProvider = new Map<string, PageResult[]>();
  for (const p of pages) {
    const key = p.ocr_provider || 'google_document_ai';
    if (!byProvider.has(key)) byProvider.set(key, []);
    byProvider.get(key)!.push(p);
  }
  if (byProvider.size < 2) return [];
  const order = ['google_document_ai', 'mistral'];
  const known = order
    .filter((p) => byProvider.has(p))
    .map((p) => ({ provider: p, pages: byProvider.get(p)! }));
  const extras = Array.from(byProvider.entries())
    .filter(([p]) => !order.includes(p))
    .map(([provider, pages]) => ({ provider, pages }));
  return [...known, ...extras];
}

function providerLabel(provider: string): string {
  if (provider === 'google_document_ai') return 'Google';
  if (provider === 'mistral') return 'Mistral';
  return provider;
}

function providerBadgeClasses(provider: string): string {
  if (provider === 'mistral') return 'bg-purple-50 text-purple-700 border-purple-200';
  return 'bg-blue-50 text-blue-700 border-blue-200';
}

function ProviderBarsTable({
  pages,
  provider,
  isActive,
  onSetActive,
  compact,
}: {
  pages: PageResult[];
  provider?: string;
  isActive?: boolean;
  onSetActive?: () => void;
  compact?: boolean;
}) {
  if (pages.length === 0) return null;
  const maxWords = Math.max(...pages.map((p) => p.word_count), 1);
  const totalWords = pages.reduce((s, p) => s + (p.word_count || 0), 0);
  const totalBillable = totalWords / 225;

  return (
    <div className="min-w-0">
      {provider && (
        <div
          className={`px-4 py-2.5 border-b ${
            isActive ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span
                className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold border rounded uppercase tracking-wide ${providerBadgeClasses(provider)}`}
              >
                {providerLabel(provider)}
              </span>
              {isActive ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-white border border-emerald-200 px-2 py-0.5 rounded uppercase tracking-wide">
                  <CheckCircle className="w-3 h-3" />
                  Active for analysis
                </span>
              ) : onSetActive ? (
                <button
                  type="button"
                  onClick={onSetActive}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-blue-700 bg-white border border-blue-200 rounded uppercase tracking-wide hover:bg-blue-50 transition-colors"
                >
                  Use for analysis
                </button>
              ) : null}
            </div>
            <div className="text-xs text-gray-600 whitespace-nowrap tabular-nums">
              <span className="font-medium text-gray-900">{pages.length}</span> pages ·{' '}
              <span className="font-medium text-gray-900">{totalWords.toLocaleString()}</span> words ·{' '}
              <span className="font-medium text-gray-900">{totalBillable.toFixed(1)}</span> billable
            </div>
          </div>
        </div>
      )}
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Page</th>
            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Words</th>
            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Billable</th>
            {!compact && (
              <th className="px-4 py-2 w-1/2">
                <span className="sr-only">Bar</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => {
            const barWidth = (page.word_count / maxWords) * 100;
            return (
              <tr key={`${provider || 'active'}-${page.page_number}`} className="border-t">
                <td className="px-4 py-2 text-sm text-gray-900">Page {page.page_number}</td>
                <td className="px-4 py-2 text-sm text-gray-900 text-right tabular-nums">
                  {page.word_count.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-sm text-gray-500 text-right tabular-nums">
                  {(page.word_count / 225).toFixed(2)}
                </td>
                {!compact && (
                  <td className="px-4 py-2">
                    <div className="h-4 bg-gray-100 rounded overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-gray-50 border-t-2 border-gray-200">
          <tr>
            <td className="px-4 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Total
            </td>
            <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right tabular-nums">
              {totalWords.toLocaleString()}
            </td>
            <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right tabular-nums">
              {totalBillable.toFixed(2)}
            </td>
            {!compact && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

interface FileGroup {
  type: 'group' | 'standalone';
  displayName: string;          // original_filename for groups, filename for standalone
  totalPages: number;           // sum across chunks
  totalWords: number;           // sum across chunks
  status: string;               // 'completed' if all chunks completed, 'failed' if all failed, 'partial' otherwise
  chunkCount: number;           // number of chunks (1 for standalone)
  files: FileResult[];          // the actual file(s) — 1 for standalone, N for group
  allPages: PageResult[];       // all pages across all files
}

interface ApiUsageEntry {
  provider: string;
  model: string | null;
  operation: string;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  pagesProcessed: number;
  totalCostUsd: number;
  avgProcessingTimeMs: number;
}

interface BatchResult {
  id: string;
  status: string;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  totalPages: number;
  totalWords: number;
  createdAt: string;
  completedAt: string | null;
  staffName: string;
  // API usage totals
  totalApiCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalPagesOcrd: number;
  apiCallsCount: number;
}

export default function OCRBatchResultsPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();

  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [files, setFiles] = useState<FileResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [apiUsageBreakdown, setApiUsageBreakdown] = useState<ApiUsageEntry[]>([]);
  const [reocrInProgress, setReocrInProgress] = useState<Set<string>>(new Set());
  const isInitialLoad = useRef(true);

  const fetchResults = useCallback(async () => {
    // Only show full loading spinner on initial load
    if (isInitialLoad.current) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-batch-results?batchId=${batchId}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch results');

      const data = await response.json();
      setBatch(data.batch);
      setFiles(data.files);
      setApiUsageBreakdown(data.apiUsageBreakdown || []);
      setLastRefreshedAt(new Date());

      // Auto-expand only on initial load
      if (isInitialLoad.current) {
        const expandKeys = new Set<string>();
        const groupSeen = new Set<string>();
        data.files.forEach((f: FileResult) => {
          if (f.file_group_id) {
            if (!groupSeen.has(f.file_group_id)) {
              groupSeen.add(f.file_group_id);
              expandKeys.add(f.id);
            }
          } else {
            expandKeys.add(f.id);
          }
        });
        setExpandedFiles(expandKeys);
      }
    } catch (err) {
      console.error('Failed to fetch results:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
      isInitialLoad.current = false;
    }
  }, [batchId]);

  const handleReocrWithMistral = useCallback(
    async (fileId: string, filename: string) => {
      if (reocrInProgress.has(fileId)) return;

      const confirmed = window.confirm(
        `Re-OCR "${filename}" with Mistral? Existing Google results are kept — only the Mistral column will be refreshed.`
      );
      if (!confirmed) return;

      setReocrInProgress((prev) => new Set(prev).add(fileId));

      try {
        const { data, error: invokeError } = await supabase.functions.invoke(
          'ocr-process-mistral',
          { body: { mode: 'single', fileId } }
        );

        if (invokeError || !data?.success) {
          const msg =
            (data as { error?: string } | null)?.error ||
            invokeError?.message ||
            'Mistral OCR failed';
          throw new Error(msg);
        }

        toast.success(
          `Mistral OCR complete: ${data.pages ?? 0} pages, ${(
            data.words ?? 0
          ).toLocaleString()} words`
        );
        await fetchResults();
      } catch (err: any) {
        console.error('Re-OCR with Mistral failed:', err);
        toast.error(err?.message || 'Mistral re-OCR failed');
      } finally {
        setReocrInProgress((prev) => {
          const next = new Set(prev);
          next.delete(fileId);
          return next;
        });
      }
    },
    [reocrInProgress, fetchResults]
  );

  const handleSetActiveProvider = useCallback(
    async (fileId: string, provider: string) => {
      try {
        const { error } = await supabase
          .from('ocr_batch_files')
          .update({ active_ocr_provider: provider })
          .eq('id', fileId);
        if (error) throw error;
        toast.success(`Active OCR set to ${providerLabel(provider)}`);
        await fetchResults();
      } catch (err: any) {
        console.error('Failed to set active provider:', err);
        toast.error(err?.message || 'Failed to update active provider');
      }
    },
    [fetchResults]
  );

  useEffect(() => {
    if (batchId) fetchResults();
  }, [batchId, fetchResults]);

  // Auto-poll every 10 seconds while batch is processing/pending
  useEffect(() => {
    if (!batch || ['completed', 'failed'].includes(batch.status)) return;

    const interval = setInterval(() => {
      fetchResults();
    }, 10000);

    return () => clearInterval(interval);
  }, [batch?.status, fetchResults]);

  const toggleFile = (fileId: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const fileGroups: FileGroup[] = useMemo(() => {
    const groupMap = new Map<string, FileResult[]>();
    const standalone: FileResult[] = [];

    files.forEach(file => {
      if (file.file_group_id) {
        if (!groupMap.has(file.file_group_id)) {
          groupMap.set(file.file_group_id, []);
        }
        groupMap.get(file.file_group_id)!.push(file);
      } else {
        standalone.push(file);
      }
    });

    const groups: FileGroup[] = [];

    // Process grouped files
    groupMap.forEach((chunks) => {
      // Sort by chunk_index
      chunks.sort((a, b) => (a.chunk_index || 0) - (b.chunk_index || 0));

      const totalPages = chunks.reduce((sum, c) => sum + (c.page_count || 0), 0);
      const totalWords = chunks.reduce((sum, c) => sum + (c.word_count || 0), 0);
      const allCompleted = chunks.every(c => c.status === 'completed');
      const allFailed = chunks.every(c => c.status === 'failed');
      const allPages = chunks.flatMap(c => activePages(c));

      groups.push({
        type: 'group',
        displayName: chunks[0].original_filename || chunks[0].filename,
        totalPages,
        totalWords,
        status: allCompleted ? 'completed' : allFailed ? 'failed' : 'partial',
        chunkCount: chunks.length,
        files: chunks,
        allPages,
      });
    });

    // Process standalone files
    standalone.forEach(file => {
      groups.push({
        type: 'standalone',
        displayName: file.filename,
        totalPages: file.page_count || 0,
        totalWords: file.word_count || 0,
        status: file.status,
        chunkCount: 1,
        files: [file],
        allPages: activePages(file),
      });
    });

    return groups;
  }, [files]);

  const exportCSV = () => {
    if (!batch || fileGroups.length === 0) return;

    const rows: string[] = ['Original File,Chunk,Page,Words,Billable'];

    fileGroups.forEach(group => {
      const origName = group.displayName;

      if (group.type === 'group') {
        // Grouped: show each chunk's pages under original name
        group.files.forEach(file => {
          const chunkLabel = `Chunk ${file.chunk_index || '?'} (${file.filename})`;
          const pages = activePages(file);
          if (pages.length > 0) {
            pages.forEach(page => {
              rows.push(`"${origName}","${chunkLabel}",${page.page_number},${page.word_count},${(page.word_count / 225).toFixed(2)}`);
            });
            rows.push(`"${origName}","${chunkLabel}",Subtotal,${file.word_count},${(file.word_count / 225).toFixed(1)}`);
          } else {
            rows.push(`"${origName}","${chunkLabel}",Error,"${file.error_message || 'Unknown'}",`);
          }
        });
        // Group total
        rows.push(`"${origName}",TOTAL,,${group.totalWords},${(group.totalWords / 225).toFixed(1)}`);
        rows.push(''); // blank separator
      } else {
        // Standalone: same as before
        const file = group.files[0];
        const pages = activePages(file);
        if (pages.length > 0) {
          pages.forEach(page => {
            rows.push(`"${origName}",,${page.page_number},${page.word_count},${(page.word_count / 225).toFixed(2)}`);
          });
          rows.push(`"${origName}",,Total,${file.word_count},${(file.word_count / 225).toFixed(1)}`);
        } else {
          rows.push(`"${origName}",,Error,"${file.error_message || 'Unknown'}",`);
        }
        rows.push('');
      }
    });

    rows.push('');
    rows.push(`Grand Total,,,${batch.totalWords},${(batch.totalWords / 225).toFixed(1)}`);

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-results-${batchId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Batch not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate('/admin/ocr-word-count')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to OCR Tool
          </button>

          <div className="flex items-center gap-3">
            {lastRefreshedAt && (
              <span className="text-xs text-gray-400">
                Updated {formatDistanceToNow(lastRefreshedAt)} ago
              </span>
            )}
            <button
              onClick={() => fetchResults()}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Summary Card */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">OCR Results</h1>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-blue-600">Total Files</p>
              <p className="text-2xl font-bold text-blue-900">{batch.totalFiles}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm text-green-600">Total Pages</p>
              <p className="text-2xl font-bold text-green-900">{batch.totalPages}</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="text-sm text-purple-600">Total Words</p>
              <p className="text-2xl font-bold text-purple-900">{batch.totalWords.toLocaleString()}</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-4">
              <p className="text-sm text-amber-600">Billable Pages</p>
              <p className="text-2xl font-bold text-amber-900">
                {(batch.totalWords / 225).toFixed(1)}
              </p>
              <p className="text-xs text-amber-600">at 225 words/page</p>
            </div>
          </div>

          {batch.failedFiles > 0 && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">
                {batch.failedFiles} file(s) failed to process
              </p>
            </div>
          )}
        </div>

        {/* API Usage & Cost Card */}
        {(batch.totalApiCostUsd > 0 || batch.totalTokens > 0 || apiUsageBreakdown.length > 0) && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-gray-700" />
              <h2 className="text-lg font-bold text-gray-900">API Usage & Costs</h2>
            </div>

            {/* Cost summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-emerald-50 rounded-lg p-4">
                <p className="text-sm text-emerald-600">Total API Cost</p>
                <p className="text-2xl font-bold text-emerald-900">
                  ${batch.totalApiCostUsd.toFixed(4)}
                </p>
              </div>
              <div className="bg-sky-50 rounded-lg p-4">
                <p className="text-sm text-sky-600">Total Tokens</p>
                <p className="text-2xl font-bold text-sky-900">
                  {batch.totalTokens.toLocaleString()}
                </p>
                <p className="text-xs text-sky-600">
                  {batch.totalInputTokens.toLocaleString()} in / {batch.totalOutputTokens.toLocaleString()} out
                </p>
              </div>
              <div className="bg-violet-50 rounded-lg p-4">
                <p className="text-sm text-violet-600">Pages OCR'd</p>
                <p className="text-2xl font-bold text-violet-900">{batch.totalPagesOcrd}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-orange-600">API Calls</p>
                <p className="text-2xl font-bold text-orange-900">{batch.apiCallsCount}</p>
              </div>
            </div>

            {/* Per-provider breakdown table */}
            {apiUsageBreakdown.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Provider</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Operation</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500">Calls</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500">Input Tokens</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500">Output Tokens</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500">Pages</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500">Cost</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500">Avg Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiUsageBreakdown.map((entry, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-4 py-2 text-gray-900">
                          <div className="flex items-center gap-1.5">
                            <Cpu className="w-3.5 h-3.5 text-gray-400" />
                            {entry.provider}
                            {entry.model && (
                              <span className="text-xs text-gray-400">({entry.model})</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-gray-700">{entry.operation}</td>
                        <td className="px-4 py-2 text-right text-gray-900">{entry.callCount}</td>
                        <td className="px-4 py-2 text-right text-gray-900">{entry.inputTokens.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-gray-900">{entry.outputTokens.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-gray-900">{entry.pagesProcessed || '—'}</td>
                        <td className="px-4 py-2 text-right font-medium text-emerald-700">${entry.totalCostUsd.toFixed(4)}</td>
                        <td className="px-4 py-2 text-right text-gray-500">{(entry.avgProcessingTimeMs / 1000).toFixed(1)}s</td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="border-t bg-gray-50 font-medium">
                      <td className="px-4 py-2 text-gray-900" colSpan={2}>Total</td>
                      <td className="px-4 py-2 text-right text-gray-900">
                        {apiUsageBreakdown.reduce((s, e) => s + e.callCount, 0)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-900">
                        {apiUsageBreakdown.reduce((s, e) => s + e.inputTokens, 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-900">
                        {apiUsageBreakdown.reduce((s, e) => s + e.outputTokens, 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-900">
                        {apiUsageBreakdown.reduce((s, e) => s + e.pagesProcessed, 0) || '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-emerald-700">
                        ${apiUsageBreakdown.reduce((s, e) => s + e.totalCostUsd, 0).toFixed(4)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-500">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* File Results */}
        <div className="space-y-4">
          {fileGroups.map((group) => (
            <div key={group.type === 'group' ? group.files[0].file_group_id : group.files[0].id}
                 className="bg-white rounded-lg shadow-md overflow-hidden">

              {/* Group/File Header */}
              <button
                onClick={() => toggleFile(group.files[0].id)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  {expandedFiles.has(group.files[0].id) ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                  <FileText className="w-5 h-5 text-red-500" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900">
                      {group.displayName}
                      {group.type === 'group' && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          {group.chunkCount} chunks
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500">
                      {group.totalPages} pages • {group.totalWords.toLocaleString()} words
                      • {(group.totalWords / 225).toFixed(1)} billable
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {group.status === 'completed' && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowModal(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          setShowModal(true);
                        }
                      }}
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      <Eye className="w-4 h-4" />
                      View Details
                    </span>
                  )}
                  {group.type === 'standalone' && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReocrWithMistral(group.files[0].id, group.displayName);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          handleReocrWithMistral(group.files[0].id, group.displayName);
                        }
                      }}
                      aria-disabled={reocrInProgress.has(group.files[0].id)}
                      className={`flex items-center gap-1 text-sm font-medium ${
                        reocrInProgress.has(group.files[0].id)
                          ? 'text-purple-400 cursor-not-allowed'
                          : 'text-purple-700 hover:text-purple-900'
                      }`}
                      title="Re-OCR this file with Mistral (layout-aware output)"
                    >
                      {reocrInProgress.has(group.files[0].id) ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Reprocessing…
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          Re-OCR (Mistral)
                        </>
                      )}
                    </span>
                  )}
                  {group.status === 'completed' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : group.status === 'failed' ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  )}
                </div>
              </button>

              {/* Expanded Content */}
              {expandedFiles.has(group.files[0].id) && (
                <div className="border-t">
                  {group.type === 'group' ? (
                    // GROUPED: Show each chunk as a sub-section
                    <div>
                      {group.files.map((file, chunkIdx) => (
                        <div key={file.id} className="border-b last:border-0">
                          {/* Chunk sub-header */}
                          <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-500">
                                Chunk {file.chunk_index || chunkIdx + 1}:
                              </span>
                              <span className="text-sm text-gray-700">{file.filename}</span>
                              <span className="text-xs text-gray-500">
                                ({file.page_count} pages, {(file.word_count || 0).toLocaleString()} words)
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {file.status === 'completed' && (
                                <button
                                  onClick={() => {
                                    setShowModal(true);
                                  }}
                                  className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  View Details
                                </button>
                              )}
                              <button
                                onClick={() => handleReocrWithMistral(file.id, file.filename)}
                                disabled={reocrInProgress.has(file.id)}
                                className="flex items-center gap-1 text-purple-700 hover:text-purple-900 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                                title="Re-OCR this file with Mistral (layout-aware output)"
                              >
                                {reocrInProgress.has(file.id) ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Reprocessing…
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Re-OCR (Mistral)
                                  </>
                                )}
                              </button>
                              {file.status === 'completed' ? (
                                <CheckCircle className="w-4 h-4 text-green-400" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-400" />
                              )}
                            </div>
                          </div>

                          {/* Per-page table(s) for this chunk — side-by-side when both
                              providers have rows, single-provider view otherwise. */}
                          {(() => {
                            if (file.status === 'failed') {
                              return (
                                <div className="px-4 py-3 bg-red-50">
                                  <p className="text-sm text-red-700">
                                    Error: {file.error_message || 'Unknown error'}
                                  </p>
                                </div>
                              );
                            }
                            const groups = providerGroups(file);
                            if (groups.length >= 2) {
                              const active = file.active_ocr_provider || 'google_document_ai';
                              return (
                                <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
                                  {groups.map((g) => (
                                    <ProviderBarsTable
                                      key={g.provider}
                                      pages={g.pages}
                                      provider={g.provider}
                                      isActive={g.provider === active}
                                      onSetActive={() => handleSetActiveProvider(file.id, g.provider)}
                                      compact
                                    />
                                  ))}
                                </div>
                              );
                            }
                            const activePgs = activePages(file);
                            return <ProviderBarsTable pages={activePgs} />;
                          })()}
                        </div>
                      ))}

                      {/* Group total row */}
                      <div className="px-4 py-3 bg-blue-50 flex justify-between items-center">
                        <span className="text-sm font-medium text-blue-900">
                          Total ({group.displayName})
                        </span>
                        <span className="text-sm font-medium text-blue-900">
                          {group.totalPages} pages • {group.totalWords.toLocaleString()} words
                          • {(group.totalWords / 225).toFixed(1)} billable pages
                        </span>
                      </div>
                    </div>
                  ) : (
                    // STANDALONE: single file, side-by-side when both providers ran
                    <div>
                      {group.files[0].status === 'failed' ? (
                        <div className="p-4 bg-red-50">
                          <p className="text-sm text-red-700">
                            Error: {group.files[0].error_message || 'Unknown error'}
                          </p>
                        </div>
                      ) : (
                        (() => {
                          const file = group.files[0];
                          const groups = providerGroups(file);
                          if (groups.length >= 2) {
                            const active = file.active_ocr_provider || 'google_document_ai';
                            return (
                              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
                                {groups.map((g) => (
                                  <ProviderBarsTable
                                    key={g.provider}
                                    pages={g.pages}
                                    provider={g.provider}
                                    isActive={g.provider === active}
                                    onSetActive={() => handleSetActiveProvider(file.id, g.provider)}
                                    compact
                                  />
                                ))}
                              </div>
                            );
                          }
                          return <ProviderBarsTable pages={activePages(file)} />;
                        })()
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {batchId && (
        <OcrResultsModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          batchId={batchId}
          showActions
        />
      )}
    </div>
  );
}
