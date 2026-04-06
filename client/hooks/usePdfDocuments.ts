// client/hooks/usePdfDocuments.ts
// React Query CRUD hooks for pdf_documents and pdf_folders

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { PdfDocument, PdfFolder } from '../types/pdf-manager';

const QUERY_KEYS = {
  documents: (folderId?: string | null) => ['pdf-documents', folderId ?? 'root'] as const,
  document: (id: string) => ['pdf-document', id] as const,
  folders: ['pdf-folders'] as const,
  versions: (parentId: string) => ['pdf-versions', parentId] as const,
};

// --- Folders ---

export function usePdfFolders() {
  return useQuery({
    queryKey: QUERY_KEYS.folders,
    queryFn: async (): Promise<PdfFolder[]> => {
      const { data, error } = await supabase
        .from('pdf_folders')
        .select('*')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { name: string; parent_folder_id?: string | null }) => {
      const { data, error } = await supabase
        .from('pdf_folders')
        .insert(params)
        .select()
        .single();
      if (error) throw error;
      return data as PdfFolder;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.folders }),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pdf_folders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.folders }),
  });
}

// --- Documents ---

export function usePdfDocuments(folderId?: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.documents(folderId),
    queryFn: async (): Promise<PdfDocument[]> => {
      let query = supabase
        .from('pdf_documents')
        .select('*')
        .eq('is_latest_version', true)
        .order('created_at', { ascending: false });

      if (folderId) {
        query = query.eq('folder_id', folderId);
      } else {
        query = query.is('folder_id', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePdfDocument(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.document(id),
    queryFn: async (): Promise<PdfDocument> => {
      const { data, error } = await supabase
        .from('pdf_documents')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      name: string;
      storage_path: string;
      file_size: number;
      page_count: number;
      folder_id?: string | null;
      thumbnail_path?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('pdf_documents')
        .insert(params)
        .select()
        .single();
      if (error) throw error;
      return data as PdfDocument;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pdf-documents'] }),
  });
}

export function useUpdateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; updates: Partial<PdfDocument> }) => {
      const { data, error } = await supabase
        .from('pdf_documents')
        .update({ ...params.updates, updated_at: new Date().toISOString() })
        .eq('id', params.id)
        .select()
        .single();
      if (error) throw error;
      return data as PdfDocument;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['pdf-documents'] });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.document(data.id) });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: PdfDocument) => {
      // Delete from storage first
      await supabase.storage.from('pdf-documents').remove([doc.storage_path]);
      if (doc.thumbnail_path) {
        await supabase.storage.from('pdf-documents').remove([doc.thumbnail_path]);
      }
      // Delete DB record (cascade deletes annotations/shares)
      const { error } = await supabase.from('pdf_documents').delete().eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pdf-documents'] }),
  });
}

// --- Versioning ---

export function usePdfVersions(documentId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.versions(documentId),
    queryFn: async (): Promise<PdfDocument[]> => {
      // Get the root document (traverse up parent_version_id)
      const { data: doc } = await supabase
        .from('pdf_documents')
        .select('id, parent_version_id')
        .eq('id', documentId)
        .single();

      if (!doc) return [];

      // Get all versions that share the same lineage
      // Simple approach: get all docs with same name in same folder
      const { data: current } = await supabase
        .from('pdf_documents')
        .select('name, folder_id')
        .eq('id', documentId)
        .single();

      if (!current) return [];

      let query = supabase
        .from('pdf_documents')
        .select('*')
        .eq('name', current.name)
        .order('version', { ascending: false });

      if (current.folder_id) {
        query = query.eq('folder_id', current.folder_id);
      } else {
        query = query.is('folder_id', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!documentId,
  });
}

// --- Storage helpers ---

export async function uploadPdfToStorage(
  file: File | Blob,
  fileName: string,
  folderId?: string | null
): Promise<{ path: string; size: number }> {
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = folderId
    ? `${folderId}/${timestamp}_${safeName}`
    : `root/${timestamp}_${safeName}`;

  const { error } = await supabase.storage
    .from('pdf-documents')
    .upload(path, file, { contentType: 'application/pdf', upsert: false });

  if (error) throw error;

  return { path, size: file instanceof File ? file.size : (file as Blob).size };
}

export async function getSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('pdf-documents')
    .createSignedUrl(storagePath, 3600); // 1 hour

  if (error) throw error;
  return data.signedUrl;
}

export async function downloadPdfFromStorage(storagePath: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage
    .from('pdf-documents')
    .download(storagePath);

  if (error) throw error;
  return data.arrayBuffer();
}
