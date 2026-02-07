import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  Eye
} from 'lucide-react';

interface PageResult {
  page_number: number;
  word_count: number;
  character_count: number;
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
}

export default function OCRBatchResultsPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();

  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [files, setFiles] = useState<FileResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (batchId) fetchResults();
  }, [batchId]);

  const fetchResults = async () => {
    setLoading(true);
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

      // Auto-expand: use first file ID per group as the key
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
    } catch (err) {
      console.error('Failed to fetch results:', err);
    } finally {
      setLoading(false);
    }
  };

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
      const allPages = chunks.flatMap(c => c.pages);

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
        allPages: file.pages,
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
          if (file.pages.length > 0) {
            file.pages.forEach(page => {
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
        if (file.pages.length > 0) {
          file.pages.forEach(page => {
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

          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
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
                              {file.status === 'completed' ? (
                                <CheckCircle className="w-4 h-4 text-green-400" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-400" />
                              )}
                            </div>
                          </div>

                          {/* Per-page table for this chunk */}
                          {file.status === 'failed' ? (
                            <div className="px-4 py-3 bg-red-50">
                              <p className="text-sm text-red-700">
                                Error: {file.error_message || 'Unknown error'}
                              </p>
                            </div>
                          ) : file.pages.length > 0 ? (
                            <table className="w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Page</th>
                                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Words</th>
                                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Billable</th>
                                  <th className="px-4 py-2 w-1/2"><span className="sr-only">Bar</span></th>
                                </tr>
                              </thead>
                              <tbody>
                                {file.pages.map((page) => {
                                  const maxWords = Math.max(...file.pages.map(p => p.word_count), 1);
                                  const barWidth = (page.word_count / maxWords) * 100;
                                  return (
                                    <tr key={page.page_number} className="border-t">
                                      <td className="px-4 py-2 text-sm text-gray-900">Page {page.page_number}</td>
                                      <td className="px-4 py-2 text-sm text-gray-900 text-right">{page.word_count.toLocaleString()}</td>
                                      <td className="px-4 py-2 text-sm text-gray-500 text-right">{(page.word_count / 225).toFixed(2)}</td>
                                      <td className="px-4 py-2">
                                        <div className="h-4 bg-gray-100 rounded overflow-hidden">
                                          <div className="h-full bg-blue-500 rounded" style={{ width: `${barWidth}%` }} />
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          ) : null}
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
                    // STANDALONE: Render exactly as before (single file, per-page table)
                    <div>
                      {group.files[0].status === 'failed' ? (
                        <div className="p-4 bg-red-50">
                          <p className="text-sm text-red-700">
                            Error: {group.files[0].error_message || 'Unknown error'}
                          </p>
                        </div>
                      ) : (
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Page</th>
                              <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Words</th>
                              <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Billable</th>
                              <th className="px-4 py-2 w-1/2"><span className="sr-only">Bar</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.files[0].pages.map((page) => {
                              const maxWords = Math.max(...group.files[0].pages.map(p => p.word_count), 1);
                              const barWidth = (page.word_count / maxWords) * 100;
                              return (
                                <tr key={page.page_number} className="border-t">
                                  <td className="px-4 py-2 text-sm text-gray-900">Page {page.page_number}</td>
                                  <td className="px-4 py-2 text-sm text-gray-900 text-right">{page.word_count.toLocaleString()}</td>
                                  <td className="px-4 py-2 text-sm text-gray-500 text-right">{(page.word_count / 225).toFixed(2)}</td>
                                  <td className="px-4 py-2">
                                    <div className="h-4 bg-gray-100 rounded overflow-hidden">
                                      <div className="h-full bg-blue-500 rounded" style={{ width: `${barWidth}%` }} />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {/* File Total Row */}
                            <tr className="border-t bg-gray-50 font-medium">
                              <td className="px-4 py-2 text-sm text-gray-900">Total</td>
                              <td className="px-4 py-2 text-sm text-gray-900 text-right">{group.files[0].word_count.toLocaleString()}</td>
                              <td className="px-4 py-2 text-sm text-gray-900 text-right">{(group.files[0].word_count / 225).toFixed(2)}</td>
                              <td></td>
                            </tr>
                          </tbody>
                        </table>
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
