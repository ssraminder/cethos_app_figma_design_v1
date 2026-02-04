// client/components/admin/hitl-file-list/hooks/useFileList.ts

import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { FileWithPages, QuotePage, FileTotals, PageUpdateData, FileCategory } from '../types';
import { Complexity, COMPLEXITY_MULTIPLIERS } from '@/types/document-editor';

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

      const fileIds = (filesData || []).map(f => f.id);

      // Fetch pages for all files
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

      // Fetch AI analysis results for all files
      interface AIAnalysisResult {
        quote_file_id: string;
        word_count: number;
        billable_pages: number;
        assessed_complexity: string;
        complexity_multiplier: number;
        page_count: number;
      }
      let analysisData: AIAnalysisResult[] = [];
      if (fileIds.length > 0) {
        const { data: analysis, error: analysisError } = await supabase
          .from('ai_analysis_results')
          .select('quote_file_id, word_count, billable_pages, assessed_complexity, complexity_multiplier, page_count')
          .in('quote_file_id', fileIds);

        if (!analysisError && analysis) {
          analysisData = analysis;
        }
      }

      // Create a map of file ID to AI analysis
      const analysisMap = new Map<string, AIAnalysisResult>();
      analysisData.forEach(a => analysisMap.set(a.quote_file_id, a));

      // Combine data
      const combinedFiles: FileWithPages[] = (filesData || []).map(file => {
        const aiAnalysis = analysisMap.get(file.id);
        const hasAnalysis = !!aiAnalysis;

        // Get pages for this file
        let pages: QuotePage[] = pagesData
          .filter(p => p.quote_file_id === file.id)
          .map(p => {
            // If page has no data but AI analysis exists, use AI data
            // This handles the case where quote_pages was created with defaults
            let wordCount = p.word_count || 0;
            let billablePages = p.billable_pages || 0;
            let complexity: Complexity = (p.complexity as Complexity) || 'easy';
            let complexityMultiplier = p.complexity_multiplier || 1.0;

            // If this page has no data and AI analysis exists, use AI values as defaults
            if (aiAnalysis && wordCount === 0 && billablePages === 0) {
              // For multi-page files, distribute evenly
              // For single page, use full values
              const pageCount = aiAnalysis.page_count || 1;
              wordCount = Math.round((aiAnalysis.word_count || 0) / pageCount);
              billablePages = (aiAnalysis.billable_pages || 0) / pageCount;
              complexity = (aiAnalysis.assessed_complexity as Complexity) || 'easy';
              complexityMultiplier = aiAnalysis.complexity_multiplier || 1.0;
            }

            // Auto-calculate billable if still 0 but has words
            if (billablePages === 0 && wordCount > 0) {
              billablePages = Math.ceil((wordCount / 225) * 10) / 10;
            }

            return {
              ...p,
              word_count: wordCount,
              billable_pages: billablePages,
              complexity: complexity,
              complexity_multiplier: complexityMultiplier,
              is_included: p.is_included ?? true,
            };
          });

        // If no pages exist but AI analysis does, create virtual page entries
        if (pages.length === 0 && aiAnalysis) {
          const pageCount = aiAnalysis.page_count || 1;
          const wordsPerPage = Math.round((aiAnalysis.word_count || 0) / pageCount);
          const billablePerPage = (aiAnalysis.billable_pages || 0) / pageCount;

          pages = Array.from({ length: pageCount }, (_, i) => ({
            id: `virtual-${file.id}-${i + 1}`, // Virtual ID - will be created on first edit
            quote_file_id: file.id,
            page_number: i + 1,
            word_count: wordsPerPage,
            billable_pages: billablePerPage || Math.ceil((wordsPerPage / 225) * 10) / 10,
            complexity: (aiAnalysis.assessed_complexity as Complexity) || 'easy',
            complexity_multiplier: aiAnalysis.complexity_multiplier || 1.0,
            is_included: true,
          }));
        }

        const includedPages = pages.filter(p => p.is_included);
        const totalWords = includedPages.reduce((sum, p) => sum + (p.word_count || 0), 0);
        const totalBillable = includedPages.reduce((sum, p) => sum + (p.billable_pages || 0), 0);

        return {
          ...file,
          pages,
          hasAnalysis,
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

      // Check if this is a virtual page (created from AI analysis, not in DB yet)
      if (pageId.startsWith('virtual-')) {
        // Extract file ID and page number from virtual ID
        const parts = pageId.split('-');
        const fileId = parts[1];
        const pageNumber = parseInt(parts[2]);

        // Find the file to get current values
        const file = files.find(f => f.id === fileId);
        const virtualPage = file?.pages.find(p => p.id === pageId);

        if (!virtualPage) {
          throw new Error('Virtual page not found');
        }

        // Create the page record in the database
        const newPageData = {
          quote_file_id: fileId,
          page_number: pageNumber,
          word_count: virtualPage.word_count,
          billable_pages: virtualPage.billable_pages,
          complexity: virtualPage.complexity,
          complexity_multiplier: virtualPage.complexity_multiplier,
          is_included: virtualPage.is_included,
          ...updateData, // Apply the update
        };

        const { data: insertedPage, error: insertError } = await supabase
          .from('quote_pages')
          .insert(newPageData)
          .select()
          .single();

        if (insertError) throw insertError;

        // Update local state with the real page ID
        setFiles(prev => prev.map(f => {
          if (f.id !== fileId) return f;

          const updatedPages = f.pages.map(page => {
            if (page.id !== pageId) return page;
            return {
              ...page,
              ...updateData,
              id: insertedPage.id, // Replace virtual ID with real ID
            } as QuotePage;
          });

          const includedPages = updatedPages.filter(p => p.is_included);
          const totalWords = includedPages.reduce((sum, p) => sum + (p.word_count || 0), 0);
          const totalBillable = includedPages.reduce((sum, p) => sum + (p.billable_pages || 0), 0);

          return {
            ...f,
            pages: updatedPages,
            totalWords,
            totalBillable: Math.max(totalBillable, 1.0),
          };
        }));

        toast.success('Page saved');
        return;
      }

      // Regular update for existing pages
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
  }, [files]);

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
