// client/pages/admin/PublicSubmissionsPage.tsx
//
// Admin review queue for submissions from the public /secure-upload form on
// the marketing site. Rows land via Next.js API route + scan-public-submission
// edge function. This page lets staff triage them and optionally convert to
// a real quote.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  FileText,
  Download,
  CheckCircle,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Loader2,
  Clock,
  Mail,
  Phone as PhoneIcon,
  Hash,
  RefreshCw,
  Eye,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

const BUCKET = 'public-submissions';

interface FileMeta {
  path: string;
  originalName: string;
  size: number;
  mimeType: string;
  scanStatus: 'scan_pending' | 'scan_clean' | 'scan_infected' | 'scan_error';
}

interface Submission {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  order_or_quote_id: string | null;
  message: string | null;
  file_paths: FileMeta[];
  submitted_from: string | null;
  scan_status: 'scan_pending' | 'scan_clean' | 'scan_infected' | 'scan_error';
  scan_completed_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  converted_to_quote_id: string | null;
  customer_id: string | null;
  created_at: string;
}

type StatusFilter = 'all' | 'unreviewed' | 'pending' | 'clean' | 'infected';

export default function PublicSubmissionsPage() {
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('unreviewed');
  const [detail, setDetail] = useState<Submission | null>(null);
  const navigate = useNavigate();

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('public_submissions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      toast.error(`Failed to load submissions: ${error.message}`);
      setRows([]);
    } else {
      setRows((data || []) as Submission[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'unreviewed') return rows.filter((r) => !r.reviewed_at);
    if (filter === 'pending') return rows.filter((r) => r.scan_status === 'scan_pending');
    if (filter === 'clean') return rows.filter((r) => r.scan_status === 'scan_clean');
    if (filter === 'infected') return rows.filter((r) => r.scan_status === 'scan_infected');
    return rows;
  }, [rows, filter]);

  const markReviewed = async (submissionId: string) => {
    const { data: userResp } = await supabase.auth.getUser();
    const staffId = userResp?.user?.id || null;
    const { error } = await supabase
      .from('public_submissions')
      .update({ reviewed_at: new Date().toISOString(), reviewed_by: staffId })
      .eq('id', submissionId);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    toast.success('Marked as reviewed');
    await fetchRows();
    setDetail(null);
  };

  const downloadFile = async (path: string, filename: string) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast.error(`Couldn't sign download: ${error?.message || 'no URL'}`);
      return;
    }
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const counts = useMemo(() => {
    return {
      total: rows.length,
      unreviewed: rows.filter((r) => !r.reviewed_at).length,
      pending: rows.filter((r) => r.scan_status === 'scan_pending').length,
      infected: rows.filter((r) => r.scan_status === 'scan_infected').length,
    };
  }, [rows]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6" />
            Public Submissions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Files uploaded through the public{' '}
            <code className="font-mono text-xs">/secure-upload</code> form on cethos.com. Scanned
            by VirusTotal. Retained 180 days then auto-purged.
          </p>
        </div>
        <button
          onClick={fetchRows}
          className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted flex items-center gap-1.5"
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <FilterChip
          label={`Unreviewed (${counts.unreviewed})`}
          active={filter === 'unreviewed'}
          onClick={() => setFilter('unreviewed')}
        />
        <FilterChip
          label={`Scanning (${counts.pending})`}
          active={filter === 'pending'}
          onClick={() => setFilter('pending')}
        />
        <FilterChip
          label={`Clean`}
          active={filter === 'clean'}
          onClick={() => setFilter('clean')}
        />
        <FilterChip
          label={`Infected (${counts.infected})`}
          active={filter === 'infected'}
          onClick={() => setFilter('infected')}
          danger
        />
        <FilterChip
          label={`All (${counts.total})`}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground">
          <Loader2 className="w-6 h-6 mx-auto animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground border rounded-lg">
          No submissions match this filter.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Received</th>
                <th className="px-4 py-2.5 font-medium">Contact</th>
                <th className="px-4 py-2.5 font-medium">Order / Quote ID</th>
                <th className="px-4 py-2.5 font-medium">Files</th>
                <th className="px-4 py-2.5 font-medium">Scan</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(r.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium flex items-center gap-1.5">
                      {r.full_name}
                      {r.customer_id && (
                        <Link
                          to={`/admin/customers/${r.customer_id}`}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] uppercase tracking-wide hover:bg-blue-100"
                          title="Linked to existing customer record"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Customer
                        </Link>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Mail className="w-3 h-3" />
                      {r.email}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <PhoneIcon className="w-3 h-3" />
                      {r.phone}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {r.order_or_quote_id ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded text-xs font-mono">
                        <Hash className="w-3 h-3" />
                        {r.order_or_quote_id}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs">
                      <FileText className="w-3 h-3" />
                      {r.file_paths?.length || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ScanBadge status={r.scan_status} />
                  </td>
                  <td className="px-4 py-3">
                    {r.reviewed_at ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle className="w-3 h-3" /> Reviewed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                        <Clock className="w-3 h-3" /> Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setDetail(r)}
                      className="px-2.5 py-1 text-xs border rounded-md hover:bg-muted flex items-center gap-1 ml-auto"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <DetailModal
          submission={detail}
          onClose={() => setDetail(null)}
          onDownload={downloadFile}
          onMarkReviewed={markReviewed}
          onCreateQuote={() => {
            navigate(`/admin/orders/new?prefillFromSubmission=${detail.id}`);
          }}
        />
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  danger,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
        active
          ? danger
            ? 'bg-red-50 border-red-500 text-red-700'
            : 'bg-primary text-primary-foreground border-primary'
          : danger
            ? 'border-red-200 text-red-600 hover:bg-red-50'
            : 'hover:bg-muted'
      }`}
    >
      {label}
    </button>
  );
}

function ScanBadge({ status }: { status: FileMeta['scanStatus'] }) {
  switch (status) {
    case 'scan_pending':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs">
          <Loader2 className="w-3 h-3 animate-spin" />
          Scanning
        </span>
      );
    case 'scan_clean':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs">
          <ShieldCheck className="w-3 h-3" />
          Clean
        </span>
      );
    case 'scan_infected':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs font-semibold">
          <ShieldAlert className="w-3 h-3" />
          INFECTED
        </span>
      );
    case 'scan_error':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
          <ShieldQuestion className="w-3 h-3" />
          Scan error
        </span>
      );
  }
}

function DetailModal({
  submission,
  onClose,
  onDownload,
  onMarkReviewed,
  onCreateQuote,
}: {
  submission: Submission;
  onClose: () => void;
  onDownload: (path: string, filename: string) => void;
  onMarkReviewed: (id: string) => void;
  onCreateQuote: () => void;
}) {
  const infected = submission.scan_status === 'scan_infected';
  const scanning = submission.scan_status === 'scan_pending';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg border shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{submission.full_name}</h2>
            <p className="text-sm text-muted-foreground">
              Received {formatDate(submission.created_at)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Contact */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-0.5">Email</div>
              <a
                href={`mailto:${submission.email}`}
                className="text-primary hover:underline"
              >
                {submission.email}
              </a>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-0.5">Phone</div>
              <a
                href={`tel:${submission.phone}`}
                className="text-primary hover:underline"
              >
                {submission.phone}
              </a>
            </div>
            {submission.order_or_quote_id && (
              <div className="col-span-2">
                <div className="text-xs uppercase text-muted-foreground mb-0.5">
                  Order / Quote ID provided
                </div>
                <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                  {submission.order_or_quote_id}
                </code>
                <span className="text-xs text-muted-foreground ml-2">
                  (verify manually)
                </span>
              </div>
            )}
          </div>

          {submission.message && (
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Message</div>
              <div className="text-sm whitespace-pre-wrap bg-muted rounded p-3">
                {submission.message}
              </div>
            </div>
          )}

          {/* Scan status banner */}
          {infected && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
              <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700">
                <strong>Malware detected in one or more files.</strong> Files have been moved
                to quarantine. Do not attempt to download or open any attachment from this
                submission.
              </div>
            </div>
          )}
          {scanning && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2">
              <Loader2 className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5 animate-spin" />
              <div className="text-sm text-amber-700">
                Files are still being scanned. Refresh in a minute — downloads are disabled
                until the scan finishes.
              </div>
            </div>
          )}

          {/* Files */}
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-2">
              Files ({submission.file_paths?.length || 0})
            </div>
            <ul className="space-y-1.5">
              {(submission.file_paths || []).map((f) => {
                const fileInfected = f.scanStatus === 'scan_infected';
                const filePending = f.scanStatus === 'scan_pending';
                const canDownload =
                  f.scanStatus === 'scan_clean' || f.scanStatus === 'scan_error';
                return (
                  <li
                    key={f.path}
                    className="flex items-center gap-3 p-2.5 bg-muted/50 rounded"
                  >
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{f.originalName}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(f.size)} · {f.mimeType}
                      </div>
                    </div>
                    <ScanBadge status={f.scanStatus} />
                    <button
                      disabled={!canDownload}
                      onClick={() => onDownload(f.path, f.originalName)}
                      className={`px-2.5 py-1 text-xs border rounded-md flex items-center gap-1 ${
                        canDownload
                          ? 'hover:bg-muted'
                          : 'opacity-40 cursor-not-allowed'
                      }`}
                      title={
                        fileInfected
                          ? 'File is infected and quarantined'
                          : filePending
                            ? 'Scan in progress'
                            : 'Download'
                      }
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs text-muted-foreground">
            ID: <code className="font-mono">{submission.id}</code>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCreateQuote}
              disabled={infected || scanning}
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create quote
            </button>
            {!submission.reviewed_at && (
              <button
                onClick={() => onMarkReviewed(submission.id)}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-1"
              >
                <CheckCircle className="w-4 h-4" />
                Mark reviewed
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
