// client/components/pdf-manager/FolderTree.tsx
// Recursive folder navigation with create/rename/delete

import { useState, useCallback } from 'react';
import { Folder, FolderOpen, FolderPlus, ChevronRight, ChevronDown, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { usePdfFolders, useCreateFolder, useDeleteFolder } from '../../hooks/usePdfDocuments';
import type { PdfFolder } from '../../types/pdf-manager';

interface FolderTreeProps {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
}

export default function FolderTree({ selectedFolderId, onSelectFolder }: FolderTreeProps) {
  const { data: folders = [], isLoading } = usePdfFolders();
  const createFolder = useCreateFolder();
  const deleteFolder = useDeleteFolder();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Build tree structure
  const buildTree = useCallback((parentId: string | null): PdfFolder[] => {
    return folders
      .filter((f) => f.parent_folder_id === parentId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [folders]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder.mutateAsync({
        name: newFolderName.trim(),
        parent_folder_id: selectedFolderId,
      });
      setNewFolderName('');
      setIsCreating(false);
      toast.success('Folder created');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete folder "${name}" and all its contents?`)) return;
    try {
      await deleteFolder.mutateAsync(id);
      if (selectedFolderId === id) onSelectFolder(null);
      toast.success('Folder deleted');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const renderFolder = (folder: PdfFolder, depth: number = 0) => {
    const children = buildTree(folder.id);
    const isExpanded = expandedIds.has(folder.id);
    const isSelected = selectedFolderId === folder.id;

    return (
      <div key={folder.id}>
        <div
          className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer group transition-colors ${
            isSelected ? 'bg-teal-50 text-teal-700' : 'hover:bg-gray-100 text-gray-700'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => onSelectFolder(folder.id)}
        >
          {children.length > 0 ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(folder.id); }}
              className="p-0.5"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 text-gray-400" />
              ) : (
                <ChevronRight className="h-3 w-3 text-gray-400" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}

          {isExpanded ? (
            <FolderOpen className="h-4 w-4 text-teal-500 shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-gray-400 shrink-0" />
          )}

          <span className="text-xs font-medium truncate flex-1">{folder.name}</span>

          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(folder.id, folder.name); }}
            className="p-0.5 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="h-3 w-3 text-red-400" />
          </button>
        </div>

        {isExpanded && children.map((child) => renderFolder(child, depth + 1))}
      </div>
    );
  };

  const rootFolders = buildTree(null);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2 mb-1">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Folders</h3>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="p-0.5 rounded hover:bg-gray-200"
          title="New folder"
        >
          <FolderPlus className="h-3.5 w-3.5 text-gray-500" />
        </button>
      </div>

      {/* Root (all files) */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer ${
          selectedFolderId === null ? 'bg-teal-50 text-teal-700' : 'hover:bg-gray-100 text-gray-700'
        }`}
        onClick={() => onSelectFolder(null)}
      >
        <Folder className="h-4 w-4 text-gray-400 shrink-0" />
        <span className="text-xs font-medium">All Documents</span>
      </div>

      {/* Folder tree */}
      {isLoading ? (
        <p className="text-xs text-gray-400 px-2">Loading...</p>
      ) : (
        rootFolders.map((folder) => renderFolder(folder))
      )}

      {/* New folder input */}
      {isCreating && (
        <div className="flex items-center gap-1 px-2 mt-1">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setIsCreating(false); }}
            placeholder="Folder name"
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-teal-400"
            autoFocus
          />
          <button onClick={handleCreate} className="p-1 rounded bg-teal-600 text-white hover:bg-teal-700">
            <Plus className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
