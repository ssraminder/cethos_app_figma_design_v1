import React, { useCallback, useMemo } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useDocumentFlow } from './hooks/useDocumentFlow';
import { usePricingCalculations } from './hooks/usePricingCalculations';
import {
  DocumentFlowEditorProps,
  DocumentGroup,
  PageGrouping,
  QuoteFile,
} from './types';
import { buildGroupPages, recalculateGroup, calculatePageBillable } from './utils/calculations';
import UploadZone from './components/UploadZone';
import FileAccordion from './components/FileAccordion';
import DocumentGroupCard from './components/DocumentGroupCard';
import PricingSummary from './components/PricingSummary';

export const DocumentFlowEditor: React.FC<DocumentFlowEditorProps> = ({
  mode,
  quoteId,
  reviewId,
  orderId,
  staffId,
  languageMultiplier: propLanguageMultiplier,
  onPricingChange,
  onSave,
  onCancel,
  readOnly = false,
  showPricing = true,
  allowUpload = true,
}) => {
  const { state, actions } = useDocumentFlow(quoteId, mode);
  const {
    files,
    groups,
    categories,
    certificationTypes,
    documentTypes,
    pricingSettings,
    languageMultiplier: stateLanguageMultiplier,
    isLoading,
    error,
    expandedFileId,
    analyzingFileIds,
    submittedFileIds
  } = state;

  const languageMultiplier = propLanguageMultiplier ?? stateLanguageMultiplier;

  const { totals, recalculate, baseRate } = usePricingCalculations(
    groups,
    pricingSettings,
    languageMultiplier
  );

  // Notify parent of pricing changes
  React.useEffect(() => {
    if (onPricingChange && groups.length > 0) {
      onPricingChange(totals);
    }
  }, [totals, onPricingChange, groups.length]);

  // Filter translatable files
  const translatableFiles = useMemo(() => {
    const toTranslateCat = categories.find(c => c.slug === 'to_translate');
    return files.filter(f =>
      f.file_category?.slug === 'to_translate' ||
      f.file_category_id === toTranslateCat?.id ||
      !f.file_category_id // Include files with no category (legacy)
    );
  }, [files, categories]);

  // Handle file upload
  const handleFilesSelected = useCallback(async (selectedFiles: File[], categoryId: string) => {
    if (!staffId) {
      toast.error('Staff ID not available. Cannot upload files.');
      return;
    }

    for (const file of selectedFiles) {
      try {
        // Create form data
        const formData = new FormData();
        formData.append('file', file);
        formData.append('quoteId', quoteId);
        formData.append('staffId', staffId);
        formData.append('categoryId', categoryId);

        // Get session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('No session');

        // Upload via edge function
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-staff-quote-file`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            body: formData,
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Upload failed');
        }

        const result = await response.json();
        toast.success(`Uploaded: ${file.name}`);

        // Refresh data
        await actions.fetchData();
      } catch (error) {
        console.error('Upload error:', error);
        toast.error(`Failed to upload ${file.name}`);
      }
    }
  }, [quoteId, staffId, actions]);

  // Handle analyze
  const handleAnalyze = useCallback(async (fileId: string) => {
    actions.setAnalyzing(fileId, true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-document`,
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
        const error = await response.json();
        throw new Error(error.message || 'Analysis failed');
      }

      toast.success('Analysis complete');
      await actions.fetchData();
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Failed to analyze document');
    } finally {
      actions.setAnalyzing(fileId, false);
    }
  }, [actions]);

  // Handle manual entry
  const handleManualEntry = useCallback((fileId: string) => {
    // Open manual entry modal - to be implemented
    toast.info('Manual entry coming soon');
  }, []);

  // Handle submit groupings
  const handleSubmitGroupings = useCallback(async (
    fileId: string,
    groupings: PageGrouping[],
    isMultiDocument: boolean,
    metadata: { documentType: string; holderName: string; countryOfIssue: string }
  ) => {
    try {
      const file = files.find(f => f.id === fileId);
      if (!file) throw new Error('File not found');

      // Group pages by groupId
      const groupedPages: Record<string, PageGrouping[]> = {};
      groupings.forEach(g => {
        if (!groupedPages[g.groupId]) groupedPages[g.groupId] = [];
        groupedPages[g.groupId].push(g);
      });

      // Get default certification
      const defaultCert = certificationTypes.find(c => c.is_default) || certificationTypes[0];

      // Create document groups
      const newGroups: DocumentGroup[] = [];
      let groupIndex = groups.length + 1;

      for (const [groupId, pageGroupings] of Object.entries(groupedPages)) {
        const pageIds = pageGroupings.map(pg => pg.pageId);
        const pages = file.pages.filter(p => pageIds.includes(p.id));
        const groupPages = buildGroupPages(pages, pricingSettings);

        const group: DocumentGroup = {
          id: `temp-${groupIndex}`,
          name: pageGroupings[0].groupName || `Document ${groupIndex}`,
          document_type: metadata.documentType,
          holder_name: metadata.holderName,
          country_of_issue: metadata.countryOfIssue,
          source_file_id: fileId,
          source_filename: file.original_filename,
          page_ids: pageIds,
          pages: groupPages,
          certification_type_id: defaultCert?.id || '',
          certification_name: defaultCert?.name || '',
          certification_price: defaultCert?.price || 0,
          total_words: 0,
          total_billable_pages: 0,
          translation_cost: 0,
          group_total: 0,
        };

        // Recalculate pricing
        const calculatedGroup = recalculate(group, defaultCert?.price || 0);
        newGroups.push(calculatedGroup);
        groupIndex++;
      }

      // Save to database
      for (const group of newGroups) {
        // Insert ai_analysis_result for this group (or update existing)
        const { error: analysisError } = await supabase
          .from('ai_analysis_results')
          .upsert({
            quote_id: quoteId,
            quote_file_id: fileId,
            detected_document_type: group.document_type,
            holder_name: group.holder_name,
            country_of_issue: group.country_of_issue,
            word_count: group.total_words,
            page_count: group.pages.length,
            billable_pages: group.total_billable_pages,
            certification_type_id: group.certification_type_id,
            certification_price: group.certification_price,
            line_total: group.group_total,
            is_multi_document: isMultiDocument,
          }, {
            onConflict: 'quote_file_id',
          });

        if (analysisError) {
          console.error('Error saving analysis:', analysisError);
        }
      }

      // Recalculate quote totals
      const { error: recalcError } = await supabase.rpc('recalculate_quote_totals', {
        p_quote_id: quoteId,
      });

      if (recalcError) {
        console.error('Error recalculating totals:', recalcError);
      }

      // Update state
      actions.setSubmitted(fileId, true);
      actions.setGroups([...groups, ...newGroups]);

      toast.success(`Created ${newGroups.length} document group(s)`);
    } catch (error) {
      console.error('Submit error:', error);
      toast.error('Failed to submit groupings');
    }
  }, [files, groups, certificationTypes, pricingSettings, quoteId, actions, recalculate]);

  // Handle certification change
  const handleCertificationChange = useCallback(async (groupId: string, certTypeId: string) => {
    const certType = certificationTypes.find(c => c.id === certTypeId);
    if (!certType) return;

    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const updatedGroup = recalculate(group, certType.price);
    updatedGroup.certification_type_id = certTypeId;
    updatedGroup.certification_name = certType.name;
    updatedGroup.certification_price = certType.price;

    actions.updateGroup(groupId, updatedGroup);

    // Save to database
    // ... database update logic

    toast.success('Certification updated');
  }, [groups, certificationTypes, recalculate, actions]);

  // Handle re-analyze - re-runs AI analysis and updates group pricing
  const handleReanalyze = useCallback(async (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const fileId = group.source_file_id;
    actions.setAnalyzing(fileId, true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      // Run AI analysis
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-document`,
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
        const error = await response.json();
        throw new Error(error.message || 'Analysis failed');
      }

      // Fetch fresh file data with updated pages
      const { data: freshFile, error: fetchError } = await supabase
        .from('quote_files')
        .select(`
          *,
          file_category:file_categories!quote_files_file_category_id_fkey(*),
          analysis:ai_analysis_results(*),
          pages:quote_pages(*)
        `)
        .eq('id', fileId)
        .single();

      if (fetchError) throw fetchError;

      // Update all groups that use this file
      const affectedGroups = groups.filter(g => g.source_file_id === fileId);
      const updatedGroups = [...groups];

      for (const affectedGroup of affectedGroups) {
        const groupIndex = updatedGroups.findIndex(g => g.id === affectedGroup.id);
        if (groupIndex === -1) continue;

        // Rebuild pages from fresh data
        const pageIds = affectedGroup.page_ids;
        const freshPages = (freshFile.pages || []).filter((p: any) => pageIds.includes(p.id));
        const groupPages = buildGroupPages(freshPages, pricingSettings);

        // Recalculate pricing
        const updatedGroup = recalculateGroup(
          { ...affectedGroup, pages: groupPages },
          pricingSettings.base_rate,
          languageMultiplier,
          affectedGroup.certification_price,
          pricingSettings
        );

        updatedGroups[groupIndex] = updatedGroup;
      }

      // Update state
      actions.setGroups(updatedGroups);
      await actions.fetchData();

      toast.success('Re-analysis complete - pricing updated');
    } catch (error) {
      console.error('Re-analyze error:', error);
      toast.error('Failed to re-analyze document');
    } finally {
      actions.setAnalyzing(fileId, false);
    }
  }, [groups, pricingSettings, languageMultiplier, actions]);

  // Handle re-analyze all
  const handleReanalyzeAll = useCallback(async () => {
    // Get unique file IDs from all groups
    const fileIds = [...new Set(groups.map(g => g.source_file_id))];

    for (const fileId of fileIds) {
      // Find first group using this file to trigger re-analyze
      const group = groups.find(g => g.source_file_id === fileId);
      if (group) {
        await handleReanalyze(group.id);
      }
    }
  }, [groups, handleReanalyze]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">Loading documents...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <p className="font-medium">Error loading documents</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={() => actions.fetchData()}
          className="mt-2 text-sm text-red-600 hover:text-red-800 flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      {allowUpload && !readOnly && (
        <div className="bg-white border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">Upload Documents</h3>
          <UploadZone
            categories={categories}
            onFilesSelected={handleFilesSelected}
            disabled={readOnly}
          />
        </div>
      )}

      {/* Files Section */}
      {translatableFiles.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">
            Files to Process ({translatableFiles.length})
          </h3>
          <div className="space-y-4">
            {translatableFiles.map(file => (
              <FileAccordion
                key={file.id}
                file={file}
                documentTypes={documentTypes}
                isExpanded={expandedFileId === file.id}
                isAnalyzing={analyzingFileIds.has(file.id)}
                isSubmitted={submittedFileIds.has(file.id)}
                onToggleExpand={() => actions.setExpandedFile(
                  expandedFileId === file.id ? null : file.id
                )}
                onAnalyze={() => handleAnalyze(file.id)}
                onManualEntry={() => handleManualEntry(file.id)}
                onSubmit={(groupings, isMulti, metadata) =>
                  handleSubmitGroupings(file.id, groupings, isMulti, metadata)
                }
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {files.length === 0 && (
        <div className="bg-gray-50 border border-dashed rounded-lg p-8 text-center">
          <p className="text-gray-600">No files uploaded yet.</p>
          <p className="text-gray-500 text-sm mt-1">
            Upload files to begin document analysis.
          </p>
        </div>
      )}

      {/* No Translatable Files Message */}
      {files.length > 0 && translatableFiles.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800 font-medium">No "To Translate" files found.</p>
          <p className="text-yellow-700 text-sm mt-1">
            {files.length} file(s) uploaded, but none have the "To Translate" category.
          </p>
        </div>
      )}

      {/* Document Groups */}
      {groups.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              Document Groups ({groups.length})
            </h3>
            {!readOnly && (
              <button
                onClick={handleReanalyzeAll}
                className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
              >
                <RefreshCw className="w-4 h-4" />
                Re-analyze All
              </button>
            )}
          </div>
          <div className="space-y-4">
            {groups.map(group => (
              <DocumentGroupCard
                key={group.id}
                group={group}
                certificationTypes={certificationTypes}
                baseRate={baseRate}
                languageMultiplier={languageMultiplier}
                onReanalyze={() => handleReanalyze(group.id)}
                onCertificationChange={(certId) => handleCertificationChange(group.id, certId)}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pricing Summary */}
      {showPricing && groups.length > 0 && (
        <PricingSummary totals={totals} />
      )}
    </div>
  );
};

export default DocumentFlowEditor;
