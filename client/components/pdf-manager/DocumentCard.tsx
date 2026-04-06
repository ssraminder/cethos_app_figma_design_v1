// client/components/pdf-manager/DocumentCard.tsx
// Thumbnail card with action menu: rename, move, delete, share, download

import { useState } from 'react';
import {
  FileText,
  Download,
  Trash2,
  Share2,
  Pencil,
  MoreVertical,
  Clock,
  FileStack,
} from 'lucide-react';
import { toast } from 'sonner';
import { saveAs } from 'file-saver';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDeleteDocument, getSignedUrl, downloadPdfFromStorage } from '../../hooks/usePdfDocuments';
import type { PdfDocument } from '../../types/pdf-manager';

interface DocumentCardProps {
  document: PdfDocument;
  onOpenShare: (doc: PdfDocument) => void;
  onOpenVersions: (doc: PdfDocument) => void;
  onRename: (doc: PdfDocument) => void;
}

function formatBytes(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function DocumentCard({
  document: doc,
  onOpenShare,
  onOpenVersions,
  onRename,
}: DocumentCardProps) {
  const deleteDoc = useDeleteDocument();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDownload = async () => {
    try {
      const data = await downloadPdfFromStorage(doc.storage_path);
      const blob = new Blob([data], { type: 'application/pdf' });
      saveAs(blob, doc.name);
    } catch (err: any) {
      toast.error(`Download failed: ${err.message}`);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${doc.name}"?`)) return;
    setIsDeleting(true);
    try {
      await deleteDoc.mutateAsync(doc);
      toast.success('Document deleted');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={`group relative bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all ${isDeleting ? 'opacity-50' : ''}`}>
      {/* Thumbnail area */}
      <div className="h-32 bg-gray-50 rounded-t-lg flex items-center justify-center">
        <FileText className="h-12 w-12 text-red-400 opacity-60" />
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="text-sm font-medium text-gray-800 truncate" title={doc.name}>
          {doc.name}
        </p>
        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
          <span>{doc.page_count} pg</span>
          <span>&middot;</span>
          <span>{formatBytes(doc.file_size)}</span>
          <span>&middot;</span>
          <span>{formatDate(doc.created_at)}</span>
        </div>
        {doc.version > 1 && (
          <div className="flex items-center gap-1 mt-1 text-xs text-teal-600">
            <FileStack className="h-3 w-3" />
            v{doc.version}
          </div>
        )}
      </div>

      {/* Action menu */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded bg-white/80 hover:bg-white shadow-sm">
              <MoreVertical className="h-4 w-4 text-gray-600" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={handleDownload}>
              <Download className="h-3.5 w-3.5 mr-2" />
              Download
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRename(doc)}>
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpenShare(doc)}>
              <Share2 className="h-3.5 w-3.5 mr-2" />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpenVersions(doc)}>
              <Clock className="h-3.5 w-3.5 mr-2" />
              Versions
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDelete} className="text-red-600 focus:text-red-600">
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
