import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import FileListWithGroups from "./FileListWithGroups";
import DocumentGroupsSummary from "./DocumentGroupsSummary";
import CreateGroupModal from "./CreateGroupModal";
import type {
  UnifiedDocumentEditorProps,
  QuoteFileWithRelations,
  DocumentGroup,
  DocumentGroupWithItems,
  FileCategory,
  CertificationType,
  QuoteTotals,
  Complexity,
  AssignedItem,
} from "@/types/document-editor";
import {
  generateGroupLabel,
  normalizeHolderName,
  DEFAULT_BASE_RATE,
} from "@/types/document-editor";

export default function UnifiedDocumentEditor({
  quoteId,
  mode,
  reviewId,
  orderId,
  onPricingUpdate,
  readOnly = false,
}: UnifiedDocumentEditorProps) {
  // ============================================
  // STATE
  // ============================================

  // Data state
  const [files, setFiles] = useState<QuoteFileWithRelations[]>([]);
  const [groups, setGroups] = useState<DocumentGroupWithItems[]>([]);
  const [fileCategories, setFileCategories] = useState<FileCategory[]>([]);
  const [certificationTypes, setCertificationTypes] = useState<CertificationType[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);

  // ============================================
  // DATA FETCHING
  // ============================================

  // Fetch all data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch files with analysis results and pages
      const { data: filesData, error: filesError } = await supabase
        .from("quote_files")
        .select(`
          *,
          ai_analysis_results (*),
          quote_pages (*),
          file_categories (*)
        `)
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: true });

      if (filesError) throw filesError;

      // Fetch document groups with assigned items
      const { data: groupsData, error: groupsError } = await supabase
        .from("quote_document_groups")
        .select("*")
        .eq("quote_id", quoteId)
        .order("group_number", { ascending: true });

      if (groupsError) throw groupsError;

      // Fetch group assignments
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from("quote_page_group_assignments")
        .select(`
          *,
          quote_files (original_filename, storage_path),
          quote_pages (page_number, word_count)
        `)
        .eq("quote_id", quoteId);

      if (assignmentsError) throw assignmentsError;

      // Fetch file categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from("file_categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (categoriesError) throw categoriesError;

      // Fetch certification types
      const { data: certTypesData, error: certTypesError } = await supabase
        .from("certification_types")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (certTypesError) throw certTypesError;

      // Transform files data
      const transformedFiles: QuoteFileWithRelations[] = (filesData || []).map((f: any) => ({
        ...f,
        ai_analysis_results: f.ai_analysis_results?.[0] || null,
        quote_pages: f.quote_pages || [],
        file_category: f.file_categories || null,
      }));

      // Transform groups with assigned items
      const transformedGroups: DocumentGroupWithItems[] = (groupsData || []).map((g: any) => {
        const groupAssignments = (assignmentsData || []).filter(
          (a: any) => a.group_id === g.id
        );
        const assignedItems: AssignedItem[] = groupAssignments.map((a: any) => ({
          assignment_id: a.id,
          file_id: a.file_id,
          page_id: a.page_id,
          sequence_order: a.sequence_order,
          item_type: a.page_id ? "page" : "file",
          page_number: a.quote_pages?.page_number || null,
          word_count: a.quote_pages?.word_count || 0,
          file_name: a.quote_files?.original_filename || "Unknown",
          storage_path: a.quote_files?.storage_path || "",
        }));

        return {
          ...g,
          assigned_items: assignedItems,
        };
      });

      setFiles(transformedFiles);
      setGroups(transformedGroups);
      setFileCategories(categoriesData || []);
      setCertificationTypes(certTypesData || []);

      // Update pricing totals
      if (onPricingUpdate) {
        const totals = calculateTotals(transformedGroups, transformedFiles);
        onPricingUpdate(totals);
      }
    } catch (error) {
      console.error("Error fetching document editor data:", error);
      toast.error("Failed to load document data");
    } finally {
      setIsLoading(false);
    }
  }, [quoteId, onPricingUpdate]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  // Calculate totals
  const calculateTotals = useCallback(
    (groups: DocumentGroupWithItems[], files: QuoteFileWithRelations[]): QuoteTotals => {
      const subtotal = groups.reduce((sum, g) => sum + (g.line_total || 0), 0);
      const certificationTotal = groups.reduce(
        (sum, g) => sum + (g.certification_price || 0),
        0
      );
      const totalWords = groups.reduce((sum, g) => sum + (g.total_word_count || 0), 0);
      const totalPages = groups.reduce((sum, g) => sum + (g.billable_pages || 0), 0);

      return {
        subtotal,
        certificationTotal,
        groupCount: groups.length,
        fileCount: files.length,
        totalPages,
        totalWords,
      };
    },
    []
  );

  // ============================================
  // EVENT HANDLERS
  // ============================================

  // Analyze selected files
  const handleAnalyzeSelected = useCallback(
    async (fileIds: string[]) => {
      if (fileIds.length === 0) return;

      setIsAnalyzing(true);
      try {
        const response = await supabase.functions.invoke("process-document", {
          body: { quoteId, fileIds },
        });

        if (response.error) {
          throw new Error(response.error.message || "Analysis failed");
        }

        toast.success(`Successfully analyzed ${fileIds.length} file(s)`);
        await fetchData();
      } catch (error: any) {
        console.error("Analysis error:", error);
        toast.error(error.message || "Failed to analyze files");
      } finally {
        setIsAnalyzing(false);
      }
    },
    [quoteId, fetchData]
  );

  // Update file category
  const handleFileTypeChange = useCallback(
    async (fileId: string, categoryId: string) => {
      try {
        const { error } = await supabase
          .from("quote_files")
          .update({ file_category_id: categoryId })
          .eq("id", fileId);

        if (error) throw error;

        // Update local state
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, file_category_id: categoryId } : f
          )
        );
      } catch (error) {
        console.error("Error updating file category:", error);
        toast.error("Failed to update file type");
      }
    },
    []
  );

  // Assign file to group
  const handleGroupChange = useCallback(
    async (fileId: string, groupId: string | "auto" | "new") => {
      if (groupId === "new") {
        setShowCreateGroupModal(true);
        return;
      }

      if (groupId === "auto") {
        // Let AI decide - this would typically be handled by the analyze function
        return;
      }

      // TODO: Implement file-to-group assignment
      console.log("Assign file to group:", fileId, groupId);
    },
    []
  );

  // Create new group
  const handleCreateGroup = useCallback(
    async (
      label: string,
      documentType: string,
      complexity: Complexity,
      holderName: string | null,
      certificationTypeId: string | null
    ) => {
      try {
        // Get max group number
        const maxGroupNumber = groups.reduce(
          (max, g) => Math.max(max, g.group_number || 0),
          0
        );

        const { data, error } = await supabase
          .from("quote_document_groups")
          .insert({
            quote_id: quoteId,
            group_number: maxGroupNumber + 1,
            group_label: label,
            document_type: documentType,
            complexity,
            complexity_multiplier:
              complexity === "hard" ? 1.25 : complexity === "medium" ? 1.15 : 1.0,
            holder_name: holderName,
            holder_name_normalized: holderName
              ? normalizeHolderName(holderName)
              : null,
            certification_type_id: certificationTypeId,
            base_rate: DEFAULT_BASE_RATE,
          })
          .select()
          .single();

        if (error) throw error;

        toast.success("Document group created");
        await fetchData();
      } catch (error) {
        console.error("Error creating group:", error);
        toast.error("Failed to create document group");
      }
    },
    [quoteId, groups, fetchData]
  );

  // Edit group
  const handleEditGroup = useCallback((groupId: string) => {
    // TODO: Implement edit group modal
    console.log("Edit group:", groupId);
  }, []);

  // Re-analyze group
  const handleReAnalyzeGroup = useCallback(
    async (groupId: string) => {
      // TODO: Implement group re-analysis
      console.log("Re-analyze group:", groupId);
      toast.info("Re-analysis not yet implemented");
    },
    []
  );

  // Unassign items from group
  const handleUnassignItems = useCallback(
    async (groupId: string) => {
      try {
        const { error } = await supabase
          .from("quote_page_group_assignments")
          .delete()
          .eq("group_id", groupId);

        if (error) throw error;

        toast.success("Items unassigned from group");
        await fetchData();
      } catch (error) {
        console.error("Error unassigning items:", error);
        toast.error("Failed to unassign items");
      }
    },
    [fetchData]
  );

  // Update certification for group
  const handleCertificationChange = useCallback(
    async (groupId: string, certTypeId: string) => {
      try {
        const certType = certificationTypes.find((c) => c.id === certTypeId);
        const certPrice = certType?.price || 0;

        const { error } = await supabase
          .from("quote_document_groups")
          .update({
            certification_type_id: certTypeId || null,
            certification_price: certPrice,
          })
          .eq("id", groupId);

        if (error) throw error;

        // Update local state
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  certification_type_id: certTypeId || null,
                  certification_price: certPrice,
                }
              : g
          )
        );

        // Recalculate totals
        if (onPricingUpdate) {
          const updatedGroups = groups.map((g) =>
            g.id === groupId
              ? { ...g, certification_type_id: certTypeId, certification_price: certPrice }
              : g
          );
          const totals = calculateTotals(updatedGroups, files);
          onPricingUpdate(totals);
        }
      } catch (error) {
        console.error("Error updating certification:", error);
        toast.error("Failed to update certification");
      }
    },
    [certificationTypes, groups, files, onPricingUpdate, calculateTotals]
  );

  // Handle file expand/collapse
  const handleFileExpand = useCallback((fileId: string) => {
    setExpandedFileId((prev) => (prev === fileId ? null : fileId));
  }, []);

  // ============================================
  // RENDER
  // ============================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
        <span className="ml-2 text-gray-600">Loading document editor...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Refresh Button */}
      <div className="flex justify-end">
        <button
          onClick={fetchData}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* File List Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Files</h3>
        <FileListWithGroups
          quoteId={quoteId}
          files={files}
          groups={groups}
          fileCategories={fileCategories}
          selectedFileIds={selectedFileIds}
          onSelectionChange={setSelectedFileIds}
          onAnalyzeSelected={handleAnalyzeSelected}
          onFileTypeChange={handleFileTypeChange}
          onGroupChange={handleGroupChange}
          onCreateGroup={() => setShowCreateGroupModal(true)}
          onFileExpand={handleFileExpand}
          expandedFileId={expandedFileId}
          isLoading={false}
          isAnalyzing={isAnalyzing}
          mode={mode}
        />
      </div>

      {/* Document Groups Section */}
      <div>
        <DocumentGroupsSummary
          quoteId={quoteId}
          groups={groups}
          certificationTypes={certificationTypes}
          onEditGroup={handleEditGroup}
          onReAnalyze={handleReAnalyzeGroup}
          onUnassignItems={handleUnassignItems}
          onCertificationChange={handleCertificationChange}
          onAddGroup={() => setShowCreateGroupModal(true)}
          readOnly={readOnly}
        />
      </div>

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={showCreateGroupModal}
        onClose={() => setShowCreateGroupModal(false)}
        onCreate={handleCreateGroup}
        certificationTypes={certificationTypes}
      />
    </div>
  );
}
