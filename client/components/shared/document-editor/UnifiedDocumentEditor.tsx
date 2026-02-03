import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, RefreshCw, Plus, FileText, FolderOpen } from "lucide-react";
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
  // COMPUTED VALUES
  // ============================================

  // Files by category
  const filesByCategory = useMemo(() => {
    const categorized: Record<string, QuoteFileWithRelations[]> = {
      unassigned: [],
    };

    // Initialize category buckets
    fileCategories.forEach((cat) => {
      categorized[cat.id] = [];
    });

    // Sort files into categories
    files.forEach((file) => {
      if (file.file_category_id && categorized[file.file_category_id]) {
        categorized[file.file_category_id].push(file);
      } else {
        categorized.unassigned.push(file);
      }
    });

    return categorized;
  }, [files, fileCategories]);

  // Unassigned files (not in any group)
  const unassignedFiles = useMemo(() => {
    const assignedFileIds = new Set<string>();
    groups.forEach((g) => {
      g.assigned_items?.forEach((item) => {
        if (item.file_id) assignedFileIds.add(item.file_id);
      });
    });
    return files.filter((f) => !assignedFileIds.has(f.id));
  }, [files, groups]);

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
          file_category:file_categories (*)
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

      // Fetch file categories - FIXED: correct table and column names
      const { data: categoriesData, error: categoriesError } = await supabase
        .from("file_categories")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

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
        file_category: f.file_category || null,
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

  // Update file category (file-type)
  const handleFileTypeChange = useCallback(
    async (fileId: string, categoryId: string) => {
      try {
        const { error } = await supabase
          .from("quote_files")
          .update({ file_category_id: categoryId || null })
          .eq("id", fileId);

        if (error) throw error;

        // Update local state
        const category = fileCategories.find((c) => c.id === categoryId);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? { ...f, file_category_id: categoryId || null, file_category: category || null }
              : f
          )
        );

        toast.success("File type updated");
      } catch (error) {
        console.error("Error updating file category:", error);
        toast.error("Failed to update file type");
      }
    },
    [fileCategories]
  );

  // Assign file/pages to a document group
  const handleAssignToGroup = useCallback(
    async (fileId: string, groupId: string) => {
      try {
        const file = files.find((f) => f.id === fileId);
        if (!file) return;

        // Get current max sequence order in group
        const group = groups.find((g) => g.id === groupId);
        const maxSeq = group?.assigned_items?.reduce(
          (max, item) => Math.max(max, item.sequence_order || 0),
          0
        ) || 0;

        // If file has pages, assign each page
        if (file.quote_pages && file.quote_pages.length > 0) {
          const assignments = file.quote_pages.map((page: any, idx: number) => ({
            quote_id: quoteId,
            group_id: groupId,
            file_id: fileId,
            page_id: page.id,
            sequence_order: maxSeq + idx + 1,
          }));

          const { error } = await supabase
            .from("quote_page_group_assignments")
            .insert(assignments);

          if (error) throw error;
        } else {
          // Assign file directly (no pages)
          const { error } = await supabase
            .from("quote_page_group_assignments")
            .insert({
              quote_id: quoteId,
              group_id: groupId,
              file_id: fileId,
              page_id: null,
              sequence_order: maxSeq + 1,
            });

          if (error) throw error;
        }

        toast.success("File assigned to document group");
        await fetchData();
      } catch (error) {
        console.error("Error assigning to group:", error);
        toast.error("Failed to assign file to group");
      }
    },
    [quoteId, files, groups, fetchData]
  );

  // Handle group assignment change from dropdown
  const handleGroupChange = useCallback(
    async (fileId: string, groupId: string | "auto" | "new" | "") => {
      if (groupId === "new") {
        setShowCreateGroupModal(true);
        return;
      }

      if (groupId === "auto") {
        // Trigger AI analysis which will auto-assign
        await handleAnalyzeSelected([fileId]);
        return;
      }

      if (groupId === "") {
        // Unassign from current group
        try {
          const { error } = await supabase
            .from("quote_page_group_assignments")
            .delete()
            .eq("file_id", fileId);

          if (error) throw error;
          toast.success("File removed from group");
          await fetchData();
        } catch (error) {
          console.error("Error unassigning file:", error);
          toast.error("Failed to remove file from group");
        }
        return;
      }

      // Assign to selected group
      await handleAssignToGroup(fileId, groupId);
    },
    [handleAnalyzeSelected, handleAssignToGroup, fetchData]
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

        // Get certification price
        const certType = certificationTypes.find((c) => c.id === certificationTypeId);
        const certPrice = certType?.price || 0;

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
            certification_type_id: certificationTypeId || null,
            certification_price: certPrice,
            base_rate: DEFAULT_BASE_RATE,
          })
          .select()
          .single();

        if (error) throw error;

        toast.success("Document group created");
        setShowCreateGroupModal(false);
        await fetchData();
      } catch (error) {
        console.error("Error creating group:", error);
        toast.error("Failed to create document group");
      }
    },
    [quoteId, groups, certificationTypes, fetchData]
  );

  // Edit group
  const handleEditGroup = useCallback((groupId: string) => {
    // TODO: Implement edit group modal
    console.log("Edit group:", groupId);
    toast.info("Edit group functionality coming soon");
  }, []);

  // Re-analyze group
  const handleReAnalyzeGroup = useCallback(
    async (groupId: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group?.assigned_items?.length) {
        toast.error("No files in this group to analyze");
        return;
      }

      const fileIds = [...new Set(group.assigned_items.map((item) => item.file_id))];
      await handleAnalyzeSelected(fileIds);
    },
    [groups, handleAnalyzeSelected]
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

  // Delete group
  const handleDeleteGroup = useCallback(
    async (groupId: string) => {
      try {
        // First unassign all items
        await supabase
          .from("quote_page_group_assignments")
          .delete()
          .eq("group_id", groupId);

        // Then delete the group
        const { error } = await supabase
          .from("quote_document_groups")
          .delete()
          .eq("id", groupId);

        if (error) throw error;

        toast.success("Document group deleted");
        await fetchData();
      } catch (error) {
        console.error("Error deleting group:", error);
        toast.error("Failed to delete group");
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

        toast.success("Certification updated");
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
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-teal-600" />
          Document Management
        </h3>
        <button
          onClick={fetchData}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* File List Section - Organized by File Type */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <h4 className="font-medium text-gray-900 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Files ({files.length})
          </h4>
          <p className="text-xs text-gray-500 mt-1">
            Set file type, then assign to document groups for pricing
          </p>
        </div>

        <div className="divide-y divide-gray-100">
          {files.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No files uploaded yet</p>
            </div>
          ) : (
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
          )}
        </div>

        {/* Analyze Selected Button */}
        {selectedFileIds.size > 0 && !readOnly && (
          <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
            <button
              onClick={() => handleAnalyzeSelected([...selectedFileIds])}
              disabled={isAnalyzing}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isAnalyzing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Analyze {selectedFileIds.size} Selected File{selectedFileIds.size > 1 ? "s" : ""}
            </button>
          </div>
        )}
      </div>

      {/* Document Groups Section */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <FolderOpen className="w-4 h-4" />
              Document Groups ({groups.length})
            </h4>
            <p className="text-xs text-gray-500 mt-1">
              Each group = one certified translation with pricing
            </p>
          </div>
          {!readOnly && (
            <button
              onClick={() => setShowCreateGroupModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Group
            </button>
          )}
        </div>

        <DocumentGroupsSummary
          quoteId={quoteId}
          groups={groups}
          certificationTypes={certificationTypes}
          onEditGroup={handleEditGroup}
          onReAnalyze={handleReAnalyzeGroup}
          onUnassignItems={handleUnassignItems}
          onDeleteGroup={handleDeleteGroup}
          onCertificationChange={handleCertificationChange}
          onAddGroup={() => setShowCreateGroupModal(true)}
          readOnly={readOnly}
        />
      </div>

      {/* Pricing Summary */}
      {groups.length > 0 && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
          <h4 className="font-medium text-teal-900 mb-2">Pricing Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-teal-700">Groups:</span>
              <span className="ml-2 font-semibold text-teal-900">{groups.length}</span>
            </div>
            <div>
              <span className="text-teal-700">Total Pages:</span>
              <span className="ml-2 font-semibold text-teal-900">
                {groups.reduce((sum, g) => sum + (g.billable_pages || 0), 0).toFixed(1)}
              </span>
            </div>
            <div>
              <span className="text-teal-700">Translation:</span>
              <span className="ml-2 font-semibold text-teal-900">
                ${groups.reduce((sum, g) => sum + (g.line_total || 0) - (g.certification_price || 0), 0).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-teal-700">Certifications:</span>
              <span className="ml-2 font-semibold text-teal-900">
                ${groups.reduce((sum, g) => sum + (g.certification_price || 0), 0).toFixed(2)}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-teal-200 flex justify-between items-center">
            <span className="font-medium text-teal-900">Subtotal:</span>
            <span className="text-xl font-bold text-teal-900">
              ${groups.reduce((sum, g) => sum + (g.line_total || 0), 0).toFixed(2)}
            </span>
          </div>
        </div>
      )}

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
