import React, { useState, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Image,
  Eye,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  XCircle,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
import PageBreakdownTable from "./PageBreakdownTable";
import { formatCurrency } from "@/utils/pricing";
import type {
  FileCardProps,
  FileProcessingStatus,
  FileCategoryCode,
  QuotePage,
} from "@/types/document-editor";
import {
  calculateBillablePages,
  formatFileSize,
  PROCESSING_STATUS_DISPLAY,
  FILE_CATEGORY_DISPLAY,
  DEFAULT_WORDS_PER_PAGE,
} from "@/types/document-editor";

// Status icon component
function StatusIcon({ status }: { status: FileProcessingStatus | null }) {
  switch (status) {
    case "completed":
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    case "processing":
      return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
    case "pending":
      return <Clock className="w-4 h-4 text-yellow-600" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-red-600" />;
    case "skipped":
      return <AlertCircle className="w-4 h-4 text-gray-400" />;
    default:
      return <Clock className="w-4 h-4 text-gray-400" />;
  }
}

// File icon component
function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) {
    return <Image className="w-5 h-5 text-blue-500" />;
  }
  return <FileText className="w-5 h-5 text-gray-500" />;
}

export default function FileCard({
  file,
  analysisResult,
  pages,
  groups,
  fileCategories,
  isExpanded,
  isSelected,
  onToggleExpand,
  onToggleSelect,
  onWordCountChange,
  onPageGroupChange,
  onMultiDocToggle,
  onFileTypeChange,
  onGroupChange,
  isMultiDoc,
  mode,
  readOnly = false,
}: FileCardProps) {
  // Get the current file category
  const currentCategory = fileCategories.find(
    (c) => c.id === file.file_category_id
  );
  const categoryCode = (currentCategory?.code || "to_translate") as FileCategoryCode;
  const isBillable = categoryCode === "to_translate";

  // Get status display info
  const status = file.ai_processing_status as FileProcessingStatus | null;
  const statusInfo = status ? PROCESSING_STATUS_DISPLAY[status] : null;

  // Calculate totals from pages or analysis
  const totalWords = useMemo(() => {
    if (pages.length > 0) {
      return pages.reduce((sum, p) => sum + (p.word_count || 0), 0);
    }
    return analysisResult?.word_count || 0;
  }, [pages, analysisResult]);

  const billablePages = useMemo(() => {
    return calculateBillablePages(totalWords, DEFAULT_WORDS_PER_PAGE);
  }, [totalWords]);

  // Page group assignments (map pageId -> groupId)
  const [pageGroupAssignments, setPageGroupAssignments] = useState<Map<string, string>>(
    new Map()
  );

  // Handle page group change
  const handlePageGroupChange = (pageId: string, groupId: string) => {
    setPageGroupAssignments((prev) => {
      const newMap = new Map(prev);
      newMap.set(pageId, groupId);
      return newMap;
    });
    onPageGroupChange(pageId, groupId);
  };

  // Find the assigned group for the file
  const assignedGroup = groups.find((g) => {
    // For now, we'll check if any pages are assigned to this group
    return pageGroupAssignments.size > 0
      ? Array.from(pageGroupAssignments.values()).includes(g.id)
      : false;
  });

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
      {/* File Row (Collapsed View) */}
      <div
        className={`flex items-center gap-3 p-3 ${
          isExpanded ? "bg-gray-50 border-b" : "hover:bg-gray-50"
        } transition-colors`}
      >
        {/* Selection Checkbox */}
        {isBillable && !readOnly && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect()}
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {/* Expand/Collapse Button */}
        <button
          onClick={onToggleExpand}
          className="p-1 hover:bg-gray-200 rounded transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
        </button>

        {/* File Icon */}
        <FileIcon mimeType={file.mime_type} />

        {/* File Name */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">
            {file.original_filename}
          </p>
          {analysisResult && (
            <p className="text-xs text-gray-500">
              {analysisResult.detected_document_type}
              {analysisResult.extracted_holder_name && (
                <span className="ml-1">• {analysisResult.extracted_holder_name}</span>
              )}
            </p>
          )}
        </div>

        {/* File Type Dropdown */}
        <div className="w-36">
          <Select
            value={file.file_category_id || ""}
            onValueChange={onFileTypeChange}
            disabled={readOnly}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select type..." />
            </SelectTrigger>
            <SelectContent>
              {fileCategories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Group Dropdown (only for billable files) */}
        {isBillable && (
          <div className="w-44">
            <Select
              value={assignedGroup?.id || "auto"}
              onValueChange={onGroupChange}
              disabled={readOnly}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Auto (AI decides)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (AI decides)</SelectItem>
                <SelectSeparator />
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.group_label || `Group ${group.group_number}`}
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value="new">+ Create New Group</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* File Size */}
        <span className="text-xs text-gray-500 w-16 text-right">
          {formatFileSize(file.file_size)}
        </span>

        {/* Status Badge */}
        <div className="flex items-center gap-1.5">
          <StatusIcon status={status} />
          {statusInfo && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Analysis Results Summary */}
          {analysisResult && (
            <div className="bg-blue-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-900 mb-3">
                Analysis Results
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Language:</span>
                  <p className="font-medium">
                    {analysisResult.language_name || analysisResult.detected_language} → English
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Document Type:</span>
                  <p className="font-medium">{analysisResult.detected_document_type}</p>
                </div>
                <div>
                  <span className="text-gray-600">Complexity:</span>
                  <p className="font-medium capitalize">
                    {analysisResult.assessed_complexity}
                    <span className="text-gray-500 ml-1">
                      ({analysisResult.complexity_multiplier}x)
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Confidence:</span>
                  <p className="font-medium">
                    {analysisResult.language_confidence
                      ? `${(analysisResult.language_confidence * 100).toFixed(0)}%`
                      : "N/A"}
                  </p>
                </div>
              </div>

              {/* Holder Information (if extracted) */}
              {(analysisResult.extracted_holder_name ||
                analysisResult.extracted_holder_dob ||
                analysisResult.extracted_document_number) && (
                <div className="mt-4 pt-4 border-t border-blue-200">
                  <h5 className="text-sm font-medium text-blue-900 mb-2">
                    Extracted Information
                  </h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    {analysisResult.extracted_holder_name && (
                      <div>
                        <span className="text-gray-600">Holder:</span>
                        <p className="font-medium">{analysisResult.extracted_holder_name}</p>
                      </div>
                    )}
                    {analysisResult.extracted_holder_dob && (
                      <div>
                        <span className="text-gray-600">DOB:</span>
                        <p className="font-medium">{analysisResult.extracted_holder_dob}</p>
                      </div>
                    )}
                    {analysisResult.extracted_document_number && (
                      <div>
                        <span className="text-gray-600">Doc #:</span>
                        <p className="font-medium">{analysisResult.extracted_document_number}</p>
                      </div>
                    )}
                    {analysisResult.extracted_issuing_country && (
                      <div>
                        <span className="text-gray-600">Country:</span>
                        <p className="font-medium">{analysisResult.extracted_issuing_country}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Page Breakdown Table */}
          {isBillable && pages.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Page Breakdown
              </h4>
              <PageBreakdownTable
                pages={pages}
                groups={groups}
                pageGroupAssignments={pageGroupAssignments}
                isMultiDoc={isMultiDoc}
                wordsPerPage={DEFAULT_WORDS_PER_PAGE}
                complexityMultiplier={analysisResult?.complexity_multiplier || 1.0}
                onWordCountChange={onWordCountChange}
                onPageGroupChange={handlePageGroupChange}
                readOnly={readOnly}
              />
            </div>
          )}

          {/* Totals Summary */}
          {isBillable && (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-600">
                <strong>{totalWords}</strong> words | <strong>{billablePages.toFixed(2)}</strong> billable pages
              </div>
              {analysisResult && (
                <div className="text-lg font-semibold text-teal-600">
                  {formatCurrency(analysisResult.line_total)}
                </div>
              )}
            </div>
          )}

          {/* Multi-Document Toggle */}
          {isBillable && pages.length > 1 && !readOnly && (
            <div className="flex items-center gap-3 pt-2 border-t">
              <Checkbox
                id={`multi-doc-${file.id}`}
                checked={isMultiDoc}
                onCheckedChange={(checked) => onMultiDocToggle(checked as boolean)}
              />
              <label
                htmlFor={`multi-doc-${file.id}`}
                className="text-sm text-gray-600 cursor-pointer"
              >
                This file contains multiple documents (enable per-page group assignment)
              </label>
            </div>
          )}

          {/* Preview Button */}
          <div className="flex justify-end pt-2">
            <button
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-teal-600 hover:bg-teal-50 rounded transition-colors"
              onClick={() => {
                // TODO: Implement preview modal
                console.log("Preview file:", file.id);
              }}
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
