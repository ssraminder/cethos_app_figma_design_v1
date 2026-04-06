// client/components/pdf-manager/VersionHistoryPanel.tsx
// Version timeline with restore option, displayed in a Sheet

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Clock, Download, RotateCcw, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { saveAs } from 'file-saver';
import { usePdfVersions, useUpdateDocument, downloadPdfFromStorage } from '../../hooks/usePdfDocuments';
import type { PdfDocument } from '../../types/pdf-manager';

interface VersionHistoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: PdfDocument | null;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBytes(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function VersionHistoryPanel({ open, onOpenChange, document: doc }: VersionHistoryPanelProps) {
  const { data: versions = [], isLoading } = usePdfVersions(doc?.id ?? '');
  const updateDoc = useUpdateDocument();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const handleDownloadVersion = async (version: PdfDocument) => {
    try {
      const data = await downloadPdfFromStorage(version.storage_path);
      const blob = new Blob([data], { type: 'application/pdf' });
      saveAs(blob, `${version.name}_v${version.version}.pdf`);
    } catch (err: any) {
      toast.error(`Download failed: ${err.message}`);
    }
  };

  const handleRestore = async (version: PdfDocument) => {
    if (!doc) return;
    if (!confirm(`Restore version ${version.version}? The current version will remain in history.`)) return;

    setRestoringId(version.id);
    try {
      // Mark all versions as not latest
      for (const v of versions) {
        if (v.is_latest_version) {
          await updateDoc.mutateAsync({
            id: v.id,
            updates: { is_latest_version: false },
          });
        }
      }
      // Mark restored version as latest
      await updateDoc.mutateAsync({
        id: version.id,
        updates: { is_latest_version: true },
      });
      toast.success(`Restored version ${version.version}`);
    } catch (err: any) {
      toast.error(`Restore failed: ${err.message}`);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[450px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-teal-600" />
            Version History
          </SheetTitle>
        </SheetHeader>

        {doc && (
          <p className="text-sm text-gray-600 mt-2 mb-4">
            {doc.name}
          </p>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 text-teal-600 animate-spin" />
          </div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No version history</p>
        ) : (
          <div className="space-y-3">
            {versions.map((version) => (
              <div
                key={version.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  version.is_latest_version
                    ? 'border-teal-300 bg-teal-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                {/* Timeline dot */}
                <div className="mt-1">
                  <div className={`w-3 h-3 rounded-full ${
                    version.is_latest_version ? 'bg-teal-500' : 'bg-gray-300'
                  }`} />
                </div>

                {/* Version info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">
                      Version {version.version}
                    </span>
                    {version.is_latest_version && (
                      <span className="text-[10px] font-semibold bg-teal-600 text-white px-1.5 py-0.5 rounded">
                        CURRENT
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDate(version.created_at)} &middot; {formatBytes(version.file_size)} &middot; {version.page_count} pages
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleDownloadVersion(version)}
                    className="p-1 rounded hover:bg-gray-200"
                    title="Download this version"
                  >
                    <Download className="h-3.5 w-3.5 text-gray-500" />
                  </button>
                  {!version.is_latest_version && (
                    <button
                      onClick={() => handleRestore(version)}
                      disabled={restoringId === version.id}
                      className="p-1 rounded hover:bg-teal-100"
                      title="Restore this version"
                    >
                      {restoringId === version.id ? (
                        <Loader2 className="h-3.5 w-3.5 text-teal-600 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5 text-teal-600" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
