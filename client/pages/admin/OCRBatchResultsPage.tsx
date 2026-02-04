import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  ArrowLeft,
  Download,
  FileText,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2
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

      // Auto-expand all files
      setExpandedFiles(new Set(data.files.map((f: FileResult) => f.id)));
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

  const exportCSV = () => {
    if (!batch || files.length === 0) return;

    const rows: string[] = ['File,Page,Words'];

    files.forEach(file => {
      if (file.pages.length > 0) {
        file.pages.forEach(page => {
          rows.push(`"${file.filename}",${page.page_number},${page.word_count}`);
        });
        rows.push(`"${file.filename}",Total,${file.word_count}`);
      } else {
        rows.push(`"${file.filename}",Error,"${file.error_message || 'Unknown error'}"`);
      }
      rows.push(''); // Empty row between files
    });

    rows.push('');
    rows.push(`Grand Total,,${batch.totalWords}`);

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
          {files.map((file) => (
            <div key={file.id} className="bg-white rounded-lg shadow-md overflow-hidden">
              {/* File Header */}
              <button
                onClick={() => toggleFile(file.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  {expandedFiles.has(file.id) ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                  <FileText className="w-5 h-5 text-red-500" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900">{file.filename}</p>
                    <p className="text-sm text-gray-500">
                      {file.page_count} pages - {file.word_count.toLocaleString()} words
                    </p>
                  </div>
                </div>
                {file.status === 'completed' ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
              </button>

              {/* Page Details */}
              {expandedFiles.has(file.id) && (
                <div className="border-t">
                  {file.status === 'failed' ? (
                    <div className="p-4 bg-red-50">
                      <p className="text-sm text-red-700">
                        Error: {file.error_message || 'Unknown error'}
                      </p>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Page</th>
                          <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Words</th>
                          <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Billable</th>
                          <th className="px-4 py-2 w-1/2">
                            <span className="sr-only">Bar</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {file.pages.map((page) => {
                          const maxWords = Math.max(...file.pages.map(p => p.word_count), 1);
                          const barWidth = (page.word_count / maxWords) * 100;

                          return (
                            <tr key={page.page_number} className="border-t">
                              <td className="px-4 py-2 text-sm text-gray-900">
                                Page {page.page_number}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-900 text-right">
                                {page.word_count.toLocaleString()}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-500 text-right">
                                {(page.word_count / 225).toFixed(2)}
                              </td>
                              <td className="px-4 py-2">
                                <div className="h-4 bg-gray-100 rounded overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded"
                                    style={{ width: `${barWidth}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {/* File Total Row */}
                        <tr className="border-t bg-gray-50 font-medium">
                          <td className="px-4 py-2 text-sm text-gray-900">Total</td>
                          <td className="px-4 py-2 text-sm text-gray-900 text-right">
                            {file.word_count.toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900 text-right">
                            {(file.word_count / 225).toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
