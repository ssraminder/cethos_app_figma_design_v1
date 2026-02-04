// client/components/admin/hitl-file-list/hooks/useFileList.ts

import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { FileWithPages, QuotePage, FileTotals, PageUpdateData, FileCategory } from '../types';
import { COMPLEXITY_MULTIPLIERS } from '@/types/document-editor';

export function useFileList(quoteId: string) {
  const [files, setFiles] = useState<FileWithPages[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFileId, setExpandedFile] = useState<string | null>(null);
  const [analyzingFileIds, setAnalyzingFileIds] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<FileCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

  // Fetch file categories
  useEffect(() => {
    const fetchCategories = async () => {
      const { data, error } = await supabase
        .from('file_categories')
        .select('id, name, slug, is_billable')
        .eq('is_active', true)
        .order('display_order');

      if (data) {
        setCategories(data);
        const defaultCat = data.find(c => c.slug === 'to_translate');
        if (defaultCat) setSelectedCategoryId(defaultCat.id);
      }
    };
    fetchCategories();
  }, []);

  // Fetch files and pages
  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch files
      const { data: filesData, error: filesError } = await supabase
        .from('quote_files')
        .select(`
          *,
          category:file_categories!category_id(slug, name)
        `)
        .eq('quote_id', quoteId)
        .order('created_at', { ascending: true });

      if (filesError) throw filesError;

      // Fetch pages for all files
      const fileIds = (filesData || []).map(f => f.id);

      let pagesData: QuotePage[] = [];
      if (fileIds.length > 0) {
        const { data: pages, error: pagesError } = await supabase
          .from('quote_pages')
          .select('*')
          .in('quote_file_id', fileIds)
          .order('page_number', { ascending: true });

        if (pagesError) throw pagesError;
        pagesData = pages || [];
      }

      // Check which files have analysis
      let analyzedFileIds = new Set<string>();
      if (fileIds.length > 0) {
        const { data: analysisData } = await supabase
          .from('ai_analysis_results')
          .select('quote_file_id')
          .in('quote_file_id', fileIds);

        analyzedFileIds = new Set((analysisData || []).map(a => a.quote_file_id));
      }

      // Combine data
      const combinedFiles: FileWithPages[] = (filesData || []).map(file => {
        const pages: QuotePage[] = pagesData
          .filter(p => p.quote_file_id === file.id)
          .map(p => ({
            ...p,
            is_included: p.is_included ?? true,
            complexity: p.complexity || 'easy',
            complexity_multiplier: p.complexity_multiplier || 1.0,
            word_count: p.word_count || 0,
            billable_pages: p.billable_pages || 0,
          }));

        const includedPages = pages.filter(p => p.is_included);
        const totalWords = includedPages.reduce((sum, p) => sum + (p.word_count || 0), 0);
        const totalBillable = includedPages.reduce((sum, p) => sum + (p.billable_pages || 0), 0);

        return {
          ...file,
          pages,
          hasAnalysis: analyzedFileIds.has(file.id),
          totalWords,
          totalBillable: Math.max(totalBillable, pages.length > 0 ? 1.0 : 0),
        };
      });

      setFiles(combinedFiles);
    } catch (err) {
      console.error('Error fetching files:', err);
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setIsLoading(false);
    }
  }, [quoteId]);

  // Initial fetch
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Upload file
  const uploadFile = useCallback(async (file: File, pageCount: number) => {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('quoteId', quoteId);
      formData.append('categoryId', selectedCategoryId);

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/upload-staff-quote-file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();

      // Create page records with defaults
      if (pageCount > 0) {
        const pageRecords = Array.from({ length: pageCount }, (_, i) => ({
          quote_file_id: result.fileId,
          page_number: i + 1,
          word_count: 0,
          billable_pages: 0,
          complexity: 'easy',
          complexity_multiplier: 1.0,
          is_included: true,
        }));

        const { error: pagesError } = await supabase.from('quote_pages').insert(pageRecords);
        if (pagesError) console.error('Error creating pages:', pagesError);
      }

      toast.success(`Uploaded: ${file.name}`);
      await fetchFiles();
    } catch (err) {
      console.error('Upload error:', err);
      toast.error(err instanceof Error ? err.message : 'Upload failed');
      throw err;
    }
  }, [quoteId, selectedCategoryId, fetchFiles]);

  // Delete file
  const deleteFile = useCallback(async (fileId: string) => {
    try {
      // Delete pages first
      await supabase.from('quote_pages').delete().eq('quote_file_id', fileId);

      // Delete analysis
      await supabase.from('ai_analysis_results').delete().eq('quote_file_id', fileId);

      // Delete file record
      const { error } = await supabase.from('quote_files').delete().eq('id', fileId);

      if (error) throw error;

      toast.success('File deleted');
      await fetchFiles();
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Failed to delete file');
    }
  }, [fetchFiles]);

  // Update page
  const updatePage = useCallback(async (update: PageUpdateData) => {
    const { pageId, field, value } = update;

    try {
      const updateData: Record<string, unknown> = { [field]: value };

      // Auto-calculate complexity_multiplier if complexity changes
      if (field === 'complexity') {
        updateData.complexity_multiplier = COMPLEXITY_MULTIPLIERS[value as keyof typeof COMPLEXITY_MULTIPLIERS] || 1.0;
      }

      const { error } = await supabase
        .from('quote_pages')
        .update(updateData)
        .eq('id', pageId);

      if (error) throw error;

      // Update local state immediately for responsiveness
      setFiles(prev => prev.map(file => {
        const updatedPages = file.pages.map(page =>
          page.id === pageId ? { ...page, ...updateData } as QuotePage : page
        );
        const includedPages = updatedPages.filter(p => p.is_included);
        const totalWords = includedPages.reduce((sum, p) => sum + (p.word_count || 0), 0);
        const totalBillable = includedPages.reduce((sum, p) => sum + (p.billable_pages || 0), 0);

        return {
          ...file,
          pages: updatedPages,
          totalWords,
          totalBillable: Math.max(totalBillable, 1.0),
        };
      }));
    } catch (err) {
      console.error('Update page error:', err);
      toast.error('Failed to update page');
    }
  }, []);

  // Remove unchecked pages
  const removeUncheckedPages = useCallback(async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;

    const uncheckedPageIds = file.pages.filter(p => !p.is_included).map(p => p.id);
    if (uncheckedPageIds.length === 0) {
      toast.info('No pages to remove');
      return;
    }

    // Check if all pages would be removed
    if (uncheckedPageIds.length === file.pages.length) {
      if (!confirm('This will remove all pages. Delete the entire file?')) {
        return;
      }
      await deleteFile(fileId);
      return;
    }

    try {
      const { error } = await supabase
        .from('quote_pages')
        .delete()
        .in('id', uncheckedPageIds);

      if (error) throw error;

      toast.success(`Removed ${uncheckedPageIds.length} page(s)`);
      await fetchFiles();
    } catch (err) {
      console.error('Remove pages error:', err);
      toast.error('Failed to remove pages');
    }
  }, [files, deleteFile, fetchFiles]);

  // Analyze file
  const analyzeFile = useCallback(async (fileId: string) => {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

    setAnalyzingFileIds(prev => new Set(prev).add(fileId));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/process-document`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ fileId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      toast.success('Analysis complete');
      await fetchFiles();
    } catch (err) {
      console.error('Analysis error:', err);
      toast.error(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzingFileIds(prev => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  }, [fetchFiles]);

  // Update filename
  const updateFilename = useCallback(async (fileId: string, newFilename: string) => {
    try {
      const { error } = await supabase
        .from('quote_files')
        .update({ original_filename: newFilename.trim() })
        .eq('id', fileId);

      if (error) throw error;

      toast.success('Filename updated');
      await fetchFiles();
    } catch (err) {
      console.error('Error updating filename:', err);
      toast.error('Failed to update filename');
      throw err;
    }
  }, [fetchFiles]);

  // Calculate totals
  const totals = useMemo<FileTotals>(() => {
    let totalPages = 0;
    let totalWords = 0;
    let totalBillable = 0;

    files.forEach(file => {
      const includedPages = file.pages.filter(p => p.is_included);
      totalPages += includedPages.length;
      totalWords += includedPages.reduce((sum, p) => sum + (p.word_count || 0), 0);
      totalBillable += includedPages.reduce((sum, p) => sum + (p.billable_pages || 0), 0);
    });

    return {
      totalFiles: files.length,
      totalPages,
      totalWords,
      totalBillable: Math.max(totalBillable, totalPages > 0 ? 1.0 : 0),
    };
  }, [files]);

  return {
    files,
    isLoading,
    error,
    expandedFileId,
    analyzingFileIds,
    categories,
    selectedCategoryId,
    setSelectedCategoryId,
    fetchFiles,
    uploadFile,
    deleteFile,
    updatePage,
    removeUncheckedPages,
    analyzeFile,
    updateFilename,
    setExpandedFile,
    totals,
  };
}
