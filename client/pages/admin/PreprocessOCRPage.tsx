// client/pages/admin/PreprocessOCRPage.tsx

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Info,
  Search,
  Plus,
  X,
  RefreshCw,
  Download
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

interface QuoteSearchResult {
  id: string;
  quote_number: string;
  status: string;
  total: number | null;
  subtotal: number | null;
  created_at: string;
  source_language_name: string | null;
  target_language_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  file_count: number;
  is_rush: boolean;
}

interface QuoteFileRecord {
  id: string;
  displayName: string;
  storagePath: string;
  bucket: string;
  bucketPath: string;
  fileSize: number;
  mimeType: string;
  source: 'quote' | 'ocr';
}

// ============================================================================
// QUOTE STATUS & FILTER CONFIG
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-700", dot: "bg-gray-400" },
  details_pending: { label: "Lead", color: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-400" },
  processing: { label: "Processing", color: "bg-blue-100 text-blue-700", dot: "bg-blue-400" },
  hitl_pending: { label: "HITL Pending", color: "bg-amber-100 text-amber-700", dot: "bg-amber-400" },
  hitl_in_review: { label: "In Review", color: "bg-amber-100 text-amber-700", dot: "bg-amber-400" },
  quote_ready: { label: "Quote Ready", color: "bg-green-100 text-green-700", dot: "bg-green-400" },
  awaiting_payment: { label: "Awaiting Payment", color: "bg-teal-100 text-teal-700", dot: "bg-teal-400" },
  converted: { label: "Converted", color: "bg-purple-100 text-purple-700", dot: "bg-purple-400" },
  expired: { label: "Expired", color: "bg-red-100 text-red-700", dot: "bg-red-400" },
};

const FILTER_GROUPS = [
  { key: "all", label: "All Quotes", statuses: null },
  { key: "needs_review", label: "Needs Review", statuses: ["hitl_pending", "hitl_in_review", "processing"] },
  { key: "leads", label: "Leads", statuses: ["draft", "details_pending"] },
  { key: "ready", label: "Ready / Awaiting", statuses: ["quote_ready", "awaiting_payment"] },
  { key: "closed", label: "Closed", statuses: ["converted", "expired"] },
];

// Normalize the Supabase nested join response into flat QuoteSearchResult
const normalizeQuoteResult = (row: any): QuoteSearchResult => ({
  id: row.id,
  quote_number: row.quote_number,
  status: row.status,
  total: row.total,
  subtotal: row.subtotal,
  created_at: row.created_at,
  is_rush: row.is_rush || false,
  source_language_name: row.source_language?.name || null,
  target_language_name: row.target_language?.name || null,
  customer_name: row.customer?.full_name || null,
  customer_email: row.customer?.email || null,
  customer_phone: row.customer?.phone || null,
  file_count: row.quote_files?.[0]?.count || 0,
});

// Extract clean filename from OCR storage_path by stripping timestamp prefix
const extractFilename = (storagePath: string): string => {
  if (!storagePath) return 'Unknown file';
  const match = storagePath.match(/^\d+-[a-z0-9]+-(.+)$/);
  return match ? match[1].replace(/_/g, ' ') : storagePath;
};

// ============================================================================
// SELECTED QUOTE CARD COMPONENT
// ============================================================================

function SelectedQuoteCard({
  quote,
  onDeselect,
  onLoadFiles,
  loadingFiles,
  loadProgress,
  filesLoaded,
}: {
  quote: QuoteSearchResult;
  onDeselect: () => void;
  onLoadFiles: () => void;
  loadingFiles: boolean;
  loadProgress: { loaded: number; total: number };
  filesLoaded: boolean;
}) {
  const statusCfg = STATUS_CONFIG[quote.status] || STATUS_CONFIG.draft;

  return (
    <div className="border-2 border-teal-200 bg-teal-50 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-teal-600" />
            <span className="font-semibold text-teal-900 text-lg">
              {quote.quote_number}
            </span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
            {quote.is_rush && (
              <span className="text-xs text-amber-600 font-medium">⚡ Rush</span>
            )}
          </div>

          {/* Customer Info */}
          <div className="text-sm text-gray-700 space-y-0.5 ml-7">
            {quote.customer_name && (
              <p className="font-medium">{quote.customer_name}</p>
            )}
            <div className="flex items-center gap-3 text-gray-500 text-xs">
              {quote.customer_email && <span>{quote.customer_email}</span>}
              {quote.customer_phone && <span>{quote.customer_phone}</span>}
            </div>
          </div>

          {/* Quote Details */}
          <div className="flex items-center gap-4 mt-2 ml-7 text-xs text-gray-600">
            {quote.source_language_name && quote.target_language_name && (
              <span>{quote.source_language_name} → {quote.target_language_name}</span>
            )}
            <span>{quote.file_count} file{quote.file_count !== 1 ? 's' : ''}</span>
            {quote.total != null && quote.total > 0 && (
              <span className="font-medium">Current total: ${quote.total.toFixed(2)}</span>
            )}
            <span>Created: {new Date(quote.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Deselect button */}
        <button
          onClick={onDeselect}
          className="text-gray-400 hover:text-gray-600 p-1"
          title="Deselect quote"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Load Files Button */}
      <div className="mt-3 ml-7">
        {filesLoaded ? (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle className="w-4 h-4" />
            <span>Files loaded into queue below</span>
          </div>
        ) : loadingFiles ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>
                Downloading files... {loadProgress.loaded}/{loadProgress.total}
              </span>
            </div>
            {/* Progress bar */}
            {loadProgress.total > 0 && (
              <div className="flex-1 max-w-xs bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${(loadProgress.loaded / loadProgress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={onLoadFiles}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Load & Process Files
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function PreprocessOCRPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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

  // Mode & selection
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const [selectedQuote, setSelectedQuote] = useState<QuoteSearchResult | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<QuoteSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [filterCounts, setFilterCounts] = useState<Record<string, number>>({});

  // Quote file loading
  const [loadingQuoteFiles, setLoadingQuoteFiles] = useState(false);
  const [quoteFileLoadProgress, setQuoteFileLoadProgress] = useState({ loaded: 0, total: 0 });
  const [quoteFilesLoaded, setQuoteFilesLoaded] = useState(false);

  // Keyboard navigation
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isProcessing = progress.phase !== 'idle' && progress.phase !== 'done' && progress.phase !== 'error';

  // ============================================================================
  // QUOTE SEARCH
  // ============================================================================

  const searchQuotes = useCallback(async (query: string, statusFilter: string | null) => {
    setSearchLoading(true);
    try {
      let dbQuery = supabase
        .from('quotes')
        .select(`
          id,
          quote_number,
          status,
          total,
          subtotal,
          created_at,
          is_rush,
          source_language:languages!quotes_source_language_id_fkey(name),
          target_language:languages!quotes_target_language_id_fkey(name),
          customer:customers!quotes_customer_id_fkey(full_name, email, phone),
          quote_files(count)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20);

      // Apply status filter
      if (statusFilter && statusFilter !== 'all') {
        const group = FILTER_GROUPS.find(g => g.key === statusFilter);
        if (group?.statuses) {
          dbQuery = dbQuery.in('status', group.statuses);
        }
      }

      // Apply text search
      if (query.trim()) {
        dbQuery = dbQuery.or(
          `quote_number.ilike.%${query}%,` +
          `customer.full_name.ilike.%${query}%,` +
          `customer.email.ilike.%${query}%,` +
          `customer.phone.ilike.%${query}%`
        );
      }

      const { data, error } = await dbQuery;

      if (error) {
        console.error('Quote search error:', error);

        // FALLBACK: If the joined or() filter fails, do a simpler approach
        const results: QuoteSearchResult[] = [];

        let quoteQuery = supabase
          .from('quotes')
          .select(`
            id, quote_number, status, total, subtotal, created_at, is_rush,
            source_language:languages!quotes_source_language_id_fkey(name),
            target_language:languages!quotes_target_language_id_fkey(name),
            customer:customers!quotes_customer_id_fkey(full_name, email, phone),
            quote_files(count)
          `)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(20);

        if (statusFilter && statusFilter !== 'all') {
          const group = FILTER_GROUPS.find(g => g.key === statusFilter);
          if (group?.statuses) {
            quoteQuery = quoteQuery.in('status', group.statuses);
          }
        }

        if (query.trim()) {
          quoteQuery = quoteQuery.ilike('quote_number', `%${query}%`);
        }

        const { data: quoteResults } = await quoteQuery;
        if (quoteResults) {
          results.push(...quoteResults.map(normalizeQuoteResult));
        }

        // If searching by text (not just quote number), also search customers
        if (query.trim() && !query.startsWith('QT-')) {
          const { data: customers } = await supabase
            .from('customers')
            .select('id')
            .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
            .limit(10);

          if (customers && customers.length > 0) {
            const customerIds = customers.map(c => c.id);
            let custQuoteQuery = supabase
              .from('quotes')
              .select(`
                id, quote_number, status, total, subtotal, created_at, is_rush,
                source_language:languages!quotes_source_language_id_fkey(name),
                target_language:languages!quotes_target_language_id_fkey(name),
                customer:customers!quotes_customer_id_fkey(full_name, email, phone),
                quote_files(count)
              `)
              .is('deleted_at', null)
              .in('customer_id', customerIds)
              .order('created_at', { ascending: false })
              .limit(20);

            if (statusFilter && statusFilter !== 'all') {
              const group = FILTER_GROUPS.find(g => g.key === statusFilter);
              if (group?.statuses) {
                custQuoteQuery = custQuoteQuery.in('status', group.statuses);
              }
            }

            const { data: custQuotes } = await custQuoteQuery;
            if (custQuotes) {
              const existingIds = new Set(results.map(r => r.id));
              const newResults = custQuotes
                .filter(q => !existingIds.has(q.id))
                .map(normalizeQuoteResult);
              results.push(...newResults);
            }
          }
        }

        setSearchResults(results);
        setSearchLoading(false);
        return;
      }

      const normalized = (data || []).map(normalizeQuoteResult);
      setSearchResults(normalized);
    } catch (err) {
      console.error('Search error:', err);
      setSearchResults([]);
    }
    setSearchLoading(false);
  }, []);

  const loadQuoteById = useCallback(async (quoteId: string) => {
    const { data } = await supabase
      .from('quotes')
      .select(`
        id, quote_number, status, total, subtotal, created_at, is_rush,
        source_language:languages!quotes_source_language_id_fkey(name),
        target_language:languages!quotes_target_language_id_fkey(name),
        customer:customers!quotes_customer_id_fkey(full_name, email, phone),
        quote_files(count)
      `)
      .eq('id', quoteId)
      .single();

    if (data) {
      setSelectedQuote(normalizeQuoteResult(data));
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mode === 'existing') {
        searchQuotes(searchQuery, activeFilter);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, activeFilter, mode, searchQuotes]);

  // Load filter counts when entering existing mode
  useEffect(() => {
    if (mode !== 'existing') return;

    const loadCounts = async () => {
      const counts: Record<string, number> = {};

      for (const group of FILTER_GROUPS) {
        let query = supabase
          .from('quotes')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null);

        if (group.statuses) {
          query = query.in('status', group.statuses);
        }

        const { count } = await query;
        counts[group.key] = count || 0;
      }

      setFilterCounts(counts);
    };

    loadCounts();
  }, [mode]);

  // Auto-select from URL parameter
  useEffect(() => {
    const quoteId = searchParams.get('quoteId');
    if (quoteId) {
      setMode('existing');
      loadQuoteById(quoteId);
    }
  }, [searchParams, loadQuoteById]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      handleSelectQuote(searchResults[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  };

  const handleSelectQuote = (quote: QuoteSearchResult) => {
    setSelectedQuote(quote);
    setShowDropdown(false);
    setSearchQuery('');
    setHighlightedIndex(-1);
    // Clear previous quote's files
    setFiles([]);
    setQuoteFilesLoaded(false);
    setQuoteFileLoadProgress({ loaded: 0, total: 0 });
  };

  // ============================================================================
  // QUOTE FILE LOADING
  // ============================================================================

  const fetchQuoteFileRecords = async (quoteId: string): Promise<QuoteFileRecord[]> => {
    const allFiles: QuoteFileRecord[] = [];

    // 1. Query quote_files (customer upload route)
    const { data: quoteFiles, error: qfError } = await supabase
      .from('quote_files')
      .select('id, original_filename, storage_path, file_size, mime_type')
      .eq('quote_id', quoteId)
.in('upload_status', ['completed', 'uploaded']);
    if (!qfError && quoteFiles && quoteFiles.length > 0) {
      allFiles.push(...quoteFiles.map(f => ({
        id: f.id,
        displayName: f.original_filename || f.storage_path || 'Unknown file',
        storagePath: f.storage_path,
        bucket: 'quote-files' as const,
        bucketPath: `uploads/${f.original_filename}`,
        fileSize: f.file_size || 0,
        mimeType: f.mime_type || 'application/pdf',
        source: 'quote' as const,
      })));
    }

    // 2. Also query ocr_batch_files via ocr_batches
    const { data: ocrFiles, error: ocrError } = await supabase
      .from('ocr_batch_files')
      .select(`
        id, filename, original_filename, storage_path, file_size, mime_type,
        ocr_batches!inner(quote_id)
      `)
      .eq('ocr_batches.quote_id', quoteId)
      .in('status', ['completed', 'pending', 'processing']);

    if (!ocrError && ocrFiles && ocrFiles.length > 0) {
      allFiles.push(...ocrFiles.map(f => ({
        id: f.id,
        displayName: f.filename || f.original_filename || extractFilename(f.storage_path),
        storagePath: f.storage_path,
        bucket: 'ocr-uploads' as const,
        bucketPath: f.storage_path,
        fileSize: f.file_size || 0,
        mimeType: f.mime_type || 'application/pdf',
        source: 'ocr' as const,
      })));
    }

    // 3. Deduplicate by display name (same file may exist in both tables)
    const seen = new Map<string, QuoteFileRecord>();
    for (const file of allFiles) {
      const key = file.displayName.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, file);
      }
      // If duplicate, keep the first one (quote_files takes priority since queried first)
    }

    return Array.from(seen.values());
  };

  const loadQuoteFiles = async () => {
    if (!selectedQuote) return;

    setLoadingQuoteFiles(true);
    setQuoteFilesLoaded(false);
    setQuoteFileLoadProgress({ loaded: 0, total: 0 });

    try {
      // 1. Get file records from DB
      const fileRecords = await fetchQuoteFileRecords(selectedQuote.id);

      if (fileRecords.length === 0) {
        toast.warning('No files found for this quote. You can upload files manually.');
        setLoadingQuoteFiles(false);
        return;
      }

      // Filter to PDFs only (the processing pipeline only handles PDFs)
      const pdfRecords = fileRecords.filter(f =>
        f.mimeType === 'application/pdf' || f.displayName.toLowerCase().endsWith('.pdf')
      );

      if (pdfRecords.length === 0) {
        toast.warning('No PDF files found for this quote. Only PDFs can be OCR-processed.');
        setLoadingQuoteFiles(false);
        return;
      }

      setQuoteFileLoadProgress({ loaded: 0, total: pdfRecords.length });

      // 2. Download each file and create File objects
      const downloadedFiles: File[] = [];

      for (let i = 0; i < pdfRecords.length; i++) {
        const record = pdfRecords[i];

        try {
          // Get signed URL
          const { data: signedData, error: signError } = await supabase.storage
            .from(record.bucket)
            .createSignedUrl(record.bucketPath, 600); // 10 min expiry

          if (signError || !signedData?.signedUrl) {
            console.error(`Failed to get signed URL for ${record.displayName}:`, signError);
            toast.error(`Failed to access ${record.displayName}`);
            continue;
          }

          // Download the file
          const response = await fetch(signedData.signedUrl);
          if (!response.ok) {
            console.error(`Download failed for ${record.displayName}: ${response.status}`);
            toast.error(`Failed to download ${record.displayName}`);
            continue;
          }

          const blob = await response.blob();

          // Create a File object from the blob
          const file = new File(
            [blob],
            record.displayName,
            { type: 'application/pdf' }
          );

          downloadedFiles.push(file);
          setQuoteFileLoadProgress(prev => ({ ...prev, loaded: i + 1 }));

        } catch (err) {
          console.error(`Error downloading ${record.displayName}:`, err);
          toast.error(`Error loading ${record.displayName}`);
        }
      }

      if (downloadedFiles.length === 0) {
        toast.error('Failed to load any files. Check storage permissions.');
        setLoadingQuoteFiles(false);
        return;
      }

      // 3. Clear any existing files in queue
      setFiles([]);

      // 4. Analyze inline before setting state (avoids React state timing issues)
      const analyzedFiles: UploadedFile[] = [];

      for (const file of downloadedFiles) {
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
          const pageCount = pdfDoc.getPageCount();

          // Plan chunks (same logic as existing analyzeFile)
          const chunks: ChunkInfo[] = [];

          if (pageCount <= MAX_PAGES_PER_CHUNK) {
            chunks.push({
              id: `${id}-chunk-1`,
              name: file.name,
              pageStart: 1,
              pageEnd: pageCount,
              pageCount: pageCount,
              blob: null,
              size: file.size,
              status: 'ready' as const,
            });
          } else {
            const numChunks = Math.ceil(pageCount / MAX_PAGES_PER_CHUNK);
            for (let c = 0; c < numChunks; c++) {
              const start = c * MAX_PAGES_PER_CHUNK + 1;
              const end = Math.min((c + 1) * MAX_PAGES_PER_CHUNK, pageCount);
              const baseName = file.name.replace(/\.pdf$/i, '');
              chunks.push({
                id: `${id}-chunk-${c + 1}`,
                name: `${baseName}_p${start}-${end}.pdf`,
                pageStart: start,
                pageEnd: end,
                pageCount: end - start + 1,
                blob: null,
                size: 0,
                status: 'pending' as const,
              });
            }
          }

          analyzedFiles.push({
            id,
            file,
            name: file.name,
            size: file.size,
            pageCount,
            status: 'ready' as const,
            chunks,
          });

        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to read PDF';
          console.error(`Error analyzing ${file.name}:`, err);
          analyzedFiles.push({
            id,
            file,
            name: file.name,
            size: file.size,
            pageCount: null,
            status: 'error' as const,
            error: errorMessage,
            chunks: [],
          });
        }
      }

      setFiles(analyzedFiles);
      setQuoteFilesLoaded(true);
      toast.success(`Loaded ${downloadedFiles.length} file(s) from ${selectedQuote.quote_number}`);

    } catch (err: unknown) {
      console.error('Load quote files error:', err);
      toast.error('Failed to load quote files');
    }

    setLoadingQuoteFiles(false);
  };

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
            quoteId: mode === 'existing' && selectedQuote ? selectedQuote.id : null,
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
    setSelectedQuote(null);
    setQuoteFilesLoaded(false);
    setQuoteFileLoadProgress({ loaded: 0, total: 0 });
    setMode('new');
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
            {mode === 'existing' && selectedQuote ? (
              <span className="ml-1 px-3 py-1 bg-teal-100 text-teal-800 text-sm font-semibold rounded-full border border-teal-300">
                {selectedQuote.quote_number}
              </span>
            ) : mode === 'existing' ? (
              <span className="ml-1 px-3 py-1 bg-amber-100 text-amber-800 text-sm font-semibold rounded-full border border-amber-300">
                Select a Quote
              </span>
            ) : (
              <span className="ml-1 px-3 py-1 bg-gray-100 text-gray-600 text-sm font-medium rounded-full border border-gray-300">
                New Quote
              </span>
            )}
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

        {/* Mode Toggle */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => setMode('existing')}
            className={`p-4 rounded-lg border-2 text-left transition-all ${
              mode === 'existing'
                ? 'border-teal-500 bg-teal-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                mode === 'existing' ? 'bg-teal-100' : 'bg-gray-100'
              }`}>
                <Search className={`w-5 h-5 ${mode === 'existing' ? 'text-teal-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`font-semibold ${mode === 'existing' ? 'text-teal-900' : 'text-gray-900'}`}>
                  Use Existing Quote
                </p>
                <p className="text-sm text-gray-500">Search for a quote to process its files</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => {
              setMode('new');
              setSelectedQuote(null);
              setFiles([]);
              setQuoteFilesLoaded(false);
              setQuoteFileLoadProgress({ loaded: 0, total: 0 });
            }}
            className={`p-4 rounded-lg border-2 text-left transition-all ${
              mode === 'new'
                ? 'border-teal-500 bg-teal-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                mode === 'new' ? 'bg-teal-100' : 'bg-gray-100'
              }`}>
                <Plus className={`w-5 h-5 ${mode === 'new' ? 'text-teal-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`font-semibold ${mode === 'new' ? 'text-teal-900' : 'text-gray-900'}`}>
                  Create New Quote
                </p>
                <p className="text-sm text-gray-500">Upload files and create a new quote</p>
              </div>
            </div>
          </button>
        </div>

        {/* Quote Selector (Mode A only) */}
        {mode === 'existing' && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Select a Quote</h2>

            {/* Search Input */}
            <div className="relative mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowDropdown(true);
                    setHighlightedIndex(-1);
                  }}
                  onFocus={() => {
                    setShowDropdown(true);
                    if (!searchQuery && searchResults.length === 0) {
                      searchQuotes('', activeFilter);
                    }
                  }}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search by quote #, customer name, email, or phone..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
                {searchLoading && (
                  <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                )}
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-2 mt-3 flex-wrap">
                {FILTER_GROUPS.map((group) => (
                  <button
                    key={group.key}
                    onClick={() => {
                      setActiveFilter(group.key);
                      setShowDropdown(true);
                      setHighlightedIndex(-1);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                      activeFilter === group.key
                        ? 'bg-teal-100 text-teal-700 border border-teal-300'
                        : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    {group.label}
                    {filterCounts[group.key] !== undefined && (
                      <span className="ml-1 opacity-70">({filterCounts[group.key]})</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Search Results Dropdown */}
              {showDropdown && (
                <div
                  ref={dropdownRef}
                  className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto"
                >
                  {searchLoading && searchResults.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />
                      Searching...
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      {searchQuery ? 'No quotes found' : 'Type to search or click a filter'}
                    </div>
                  ) : (
                    searchResults.map((quote, index) => {
                      const statusCfg = STATUS_CONFIG[quote.status] || STATUS_CONFIG.draft;
                      return (
                        <button
                          key={quote.id}
                          onClick={() => handleSelectQuote(quote)}
                          className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-b-0 transition-colors ${
                            highlightedIndex === index
                              ? 'bg-teal-50'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-900 text-sm">
                                    {quote.quote_number}
                                  </span>
                                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusCfg.color}`}>
                                    {statusCfg.label}
                                  </span>
                                  {quote.is_rush && (
                                    <span className="text-xs text-amber-600">⚡ Rush</span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {quote.customer_name || 'No customer'}
                                  {quote.customer_email && (
                                    <span className="ml-2">{quote.customer_email}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {quote.total ? `$${quote.total.toFixed(2)}` : '\u2014'}
                              </div>
                              <div className="text-xs text-gray-500">
                                {quote.file_count} file{quote.file_count !== 1 ? 's' : ''}
                                {quote.source_language_name && quote.target_language_name && (
                                  <span className="ml-1">
                                    · {quote.source_language_name} → {quote.target_language_name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Selected Quote Card */}
            {selectedQuote && (
              <SelectedQuoteCard
                quote={selectedQuote}
                onDeselect={() => {
                  setSelectedQuote(null);
                  setFiles([]);
                  setQuoteFilesLoaded(false);
                }}
                onLoadFiles={loadQuoteFiles}
                loadingFiles={loadingQuoteFiles}
                loadProgress={quoteFileLoadProgress}
                filesLoaded={quoteFilesLoaded}
              />
            )}
          </div>
        )}

        {/* Upload Section */}
        {progress.phase === 'idle' && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5" />
              {mode === 'existing' && quoteFilesLoaded
                ? 'Upload Additional Files (Optional)'
                : mode === 'existing'
                ? 'Or Upload Files Directly'
                : 'Upload Files'}
            </h2>

            {/* Drop Zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                loadingQuoteFiles
                  ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                  : 'border-gray-300 hover:border-blue-500 cursor-pointer'
              }`}
              onDragOver={loadingQuoteFiles ? undefined : (e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={loadingQuoteFiles ? undefined : handleFileDrop}
              onClick={loadingQuoteFiles ? undefined : () => fileInputRef.current?.click()}
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
                disabled={loadingQuoteFiles}
              />
            </div>
          </div>
        )}

        {/* File List */}
        {files.length > 0 && progress.phase === 'idle' && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            {mode === 'existing' && selectedQuote && (
              <div className="flex items-center gap-2 mb-4 text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                <FileText className="w-4 h-4" />
                Processing files for <strong>{selectedQuote.quote_number}</strong>
                {selectedQuote.customer_name && (
                  <span className="text-teal-600">&mdash; {selectedQuote.customer_name}</span>
                )}
              </div>
            )}
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
                    disabled={loadingQuoteFiles}
                    className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium ${
                      loadingQuoteFiles
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
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
