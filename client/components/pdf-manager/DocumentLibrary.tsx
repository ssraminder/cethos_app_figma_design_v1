// client/components/pdf-manager/DocumentLibrary.tsx
// Main library view: folder tree + document grid + share/version dialogs

import { useState } from 'react';
import { Search, FolderOpen } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { usePdfDocuments } from '../../hooks/usePdfDocuments';
import type { PdfDocument } from '../../types/pdf-manager';
import FolderTree from './FolderTree';
import DocumentCard from './DocumentCard';
import ShareDialog from './ShareDialog';
import VersionHistoryPanel from './VersionHistoryPanel';

export default function DocumentLibrary() {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { data: documents = [], isLoading } = usePdfDocuments(selectedFolderId);

  // Dialog state
  const [shareDoc, setShareDoc] = useState<PdfDocument | null>(null);
  const [versionDoc, setVersionDoc] = useState<PdfDocument | null>(null);

  // Filter documents by search
  const filteredDocs = searchQuery
    ? documents.filter((d) => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : documents;

  const handleRename = async (doc: PdfDocument) => {
    const newName = prompt('New name:', doc.name);
    if (!newName || newName === doc.name) return;
    // Use inline update since we already have the mutation in usePdfDocuments
    const { supabase } = await import('../../lib/supabase');
    await supabase
      .from('pdf_documents')
      .update({ name: newName, updated_at: new Date().toISOString() })
      .eq('id', doc.id);
    // Refetch happens via React Query invalidation
    window.location.reload(); // Simple approach — could use queryClient.invalidateQueries instead
  };

  return (
    <div className="flex h-full">
      {/* Left: Folder tree */}
      <div className="w-56 shrink-0 border-r border-gray-200 p-3 overflow-y-auto">
        <FolderTree
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
        />
      </div>

      {/* Right: Document grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search bar */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        {/* Document grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Loading documents...</div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">
                {searchQuery ? 'No documents match your search' : 'No documents in this folder'}
              </p>
              <p className="text-xs mt-1">Upload and save PDFs using the workspace tab</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredDocs.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  onOpenShare={setShareDoc}
                  onOpenVersions={setVersionDoc}
                  onRename={handleRename}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <ShareDialog
        open={!!shareDoc}
        onOpenChange={(open) => { if (!open) setShareDoc(null); }}
        document={shareDoc}
      />
      <VersionHistoryPanel
        open={!!versionDoc}
        onOpenChange={(open) => { if (!open) setVersionDoc(null); }}
        document={versionDoc}
      />
    </div>
  );
}
