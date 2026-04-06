// client/hooks/usePdfAnnotations.ts
// React Query CRUD + Supabase Realtime for pdf_annotations

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { PdfAnnotation, AnnotationType } from '../types/pdf-manager';

const QUERY_KEY = (documentId: string) => ['pdf-annotations', documentId] as const;

export function usePdfAnnotations(documentId: string | null) {
  const qc = useQueryClient();

  // Fetch annotations
  const query = useQuery({
    queryKey: QUERY_KEY(documentId ?? ''),
    queryFn: async (): Promise<PdfAnnotation[]> => {
      const { data, error } = await supabase
        .from('pdf_annotations')
        .select('*')
        .eq('document_id', documentId!)
        .order('page_number')
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!documentId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!documentId) return;

    const channel = supabase
      .channel(`annotations-${documentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pdf_annotations',
          filter: `document_id=eq.${documentId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: QUERY_KEY(documentId) });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [documentId, qc]);

  return query;
}

export function useCreateAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      document_id: string;
      page_number: number;
      type: AnnotationType;
      content?: string;
      position_x: number;
      position_y: number;
      width?: number;
      height?: number;
      color?: string;
      svg_path?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase
        .from('pdf_annotations')
        .insert(params)
        .select()
        .single();
      if (error) throw error;
      return data as PdfAnnotation;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: QUERY_KEY(data.document_id) });
    },
  });
}

export function useUpdateAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; document_id: string; updates: Partial<PdfAnnotation> }) => {
      const { data, error } = await supabase
        .from('pdf_annotations')
        .update({ ...params.updates, updated_at: new Date().toISOString() })
        .eq('id', params.id)
        .select()
        .single();
      if (error) throw error;
      return data as PdfAnnotation;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: QUERY_KEY(data.document_id) });
    },
  });
}

export function useDeleteAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; document_id: string }) => {
      const { error } = await supabase
        .from('pdf_annotations')
        .delete()
        .eq('id', params.id);
      if (error) throw error;
      return params;
    },
    onSuccess: (params) => {
      qc.invalidateQueries({ queryKey: QUERY_KEY(params.document_id) });
    },
  });
}
