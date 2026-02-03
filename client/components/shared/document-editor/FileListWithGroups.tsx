import React, { useState, useMemo, useCallback } from "react";
import { Loader2, Sparkles, FileText, FolderOpen } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import FileCard from "./FileCard";
import type {
  FileListWithGroupsProps,
  QuoteFileWithRelations,
  FileCategoryCode,
} from "@/types/document-editor";

export default function FileListWithGroups({
  quoteId,
  files,
  groups,
  fileCategories,
  selectedFileIds,
  onSelectionChange,
  onAnalyzeSelected,
  onFileTypeChange,
  onGroupChange,
  onCreateGroup,
  onFileExpand,
  expandedFileId,
  isLoading = false,
  isAnalyzing = false,
  mode,
}: FileListWithGroupsProps) {
  // Track which files have multi-doc mode enabled
  const [multiDocFiles, setMultiDocFiles] = useState<Set<string>>(new Set());

  // Get billable files (only "to_translate" category)
  const billableFiles = useMemo(() => {
    return files.filter((f) => {
      const category = fileCategories.find((c) => c.id === f.file_category_id);
      return !category || category.slug === "to_translate";
    });
  }, [files, fileCategories]);

  // Check if all billable files are selected
  const allSelected = useMemo(() => {
    return billableFiles.length > 0 &&
           billableFiles.every((f) => selectedFileIds.has(f.id));
  }, [billableFiles, selectedFileIds]);

  // Check if some but not all are selected
  const someSelected = useMemo(() => {
    return selectedFileIds.size > 0 && !allSelected;
  }, [selectedFileIds, allSelected]);

  // Handle select all toggle
  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      // Deselect all
      onSelectionChange(new Set());
    } else {
      // Select all billable files
      onSelectionChange(new Set(billableFiles.map((f) => f.id)));
    }
  }, [allSelected, billableFiles, onSelectionChange]);

  // Handle individual file selection
  const handleFileSelect = useCallback((fileId: string) => {
    const newSelection = new Set(selectedFileIds);
    if (newSelection.has(fileId)) {
      newSelection.delete(fileId);
    } else {
      newSelection.add(fileId);
    }
    onSelectionChange(newSelection);
  }, [selectedFileIds, onSelectionChange]);

  // Handle analyze selected files
  const handleAnalyze = useCallback(async () => {
    if (selectedFileIds.size === 0) return;
    await onAnalyzeSelected(Array.from(selectedFileIds));
  }, [selectedFileIds, onAnalyzeSelected]);

  // Handle multi-doc toggle for a file
  const handleMultiDocToggle = useCallback((fileId: string, enabled: boolean) => {
    setMultiDocFiles((prev) => {
      const newSet = new Set(prev);
      if (enabled) {
        newSet.add(fileId);
      } else {
        newSet.delete(fileId);
      }
      return newSet;
    });
  }, []);

  // Handle group change - check for "new" to trigger create modal
  const handleGroupChange = useCallback((fileId: string, groupId: string | "auto" | "new") => {
    if (groupId === "new") {
      onCreateGroup();
      return;
    }
    onGroupChange(fileId, groupId);
  }, [onGroupChange, onCreateGroup]);

  // Placeholder for word count change
  const handleWordCountChange = useCallback((pageId: string, wordCount: number) => {
    console.log("Word count changed:", pageId, wordCount);
    // TODO: Implement word count update via API
  }, []);

  // Placeholder for page group change
  const handlePageGroupChange = useCallback((pageId: string, groupId: string) => {
    console.log("Page group changed:", pageId, groupId);
    // TODO: Implement page group assignment via API
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
        <span className="ml-2 text-gray-600">Loading files...</span>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h4 className="text-lg font-medium text-gray-600">No Files</h4>
        <p className="text-sm text-gray-500 mt-1">
          Upload files to start processing
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Select All and Analyze Button */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            // Use data-state for indeterminate styling
            data-state={someSelected ? "indeterminate" : allSelected ? "checked" : "unchecked"}
            onCheckedChange={handleSelectAll}
            className={someSelected ? "data-[state=indeterminate]:bg-teal-300" : ""}
          />
          <span className="text-sm text-gray-700">
            {allSelected ? "Deselect All" : "Select All"} (To Translate)
          </span>
          {selectedFileIds.size > 0 && (
            <span className="text-xs text-gray-500">
              ({selectedFileIds.size} selected)
            </span>
          )}
        </div>

        <button
          onClick={handleAnalyze}
          disabled={selectedFileIds.size === 0 || isAnalyzing}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isAnalyzing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {isAnalyzing
            ? "Analyzing..."
            : `Analyze Selected (${selectedFileIds.size})`}
        </button>
      </div>

      {/* File List */}
      <div className="space-y-3">
        {files.map((file) => {
          const analysisResult = file.ai_analysis_results || null;
          const pages = file.quote_pages || [];
          const isMultiDoc = multiDocFiles.has(file.id);

          return (
            <FileCard
              key={file.id}
              file={file}
              analysisResult={analysisResult}
              pages={pages}
              groups={groups}
              fileCategories={fileCategories}
              isExpanded={expandedFileId === file.id}
              isSelected={selectedFileIds.has(file.id)}
              onToggleExpand={() => onFileExpand(file.id)}
              onToggleSelect={() => handleFileSelect(file.id)}
              onWordCountChange={handleWordCountChange}
              onPageGroupChange={handlePageGroupChange}
              onMultiDocToggle={(enabled) => handleMultiDocToggle(file.id, enabled)}
              onFileTypeChange={(categoryId) => onFileTypeChange(file.id, categoryId)}
              onGroupChange={(groupId) => handleGroupChange(file.id, groupId)}
              isMultiDoc={isMultiDoc}
              mode={mode}
            />
          );
        })}
      </div>

      {/* Summary Footer */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4" />
          <span>
            {files.length} file{files.length !== 1 ? "s" : ""} •{" "}
            {billableFiles.length} to translate
          </span>
        </div>
        <div>
          {files.filter((f) => f.ai_processing_status === "completed").length} analyzed
        </div>
      </div>
    </div>
  );
}
