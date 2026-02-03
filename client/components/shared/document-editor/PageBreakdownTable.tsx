import React, { useState, useCallback } from "react";
import { FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  QuotePage,
  DocumentGroup,
  PageBreakdownTableProps,
} from "@/types/document-editor";
import {
  calculateBillablePages,
  DEFAULT_WORDS_PER_PAGE,
} from "@/types/document-editor";

export default function PageBreakdownTable({
  pages,
  groups,
  pageGroupAssignments,
  isMultiDoc,
  wordsPerPage = DEFAULT_WORDS_PER_PAGE,
  complexityMultiplier = 1.0,
  onWordCountChange,
  onPageGroupChange,
  readOnly = false,
}: PageBreakdownTableProps) {
  // Track editing state for word counts
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  // Start editing a word count
  const handleStartEdit = useCallback((page: QuotePage) => {
    if (readOnly) return;
    setEditingPageId(page.id);
    setEditValue(String(page.word_count));
  }, [readOnly]);

  // Commit word count edit
  const handleCommitEdit = useCallback((pageId: string) => {
    const newValue = parseInt(editValue, 10);
    if (!isNaN(newValue) && newValue >= 0) {
      onWordCountChange(pageId, newValue);
    }
    setEditingPageId(null);
    setEditValue("");
  }, [editValue, onWordCountChange]);

  // Cancel edit
  const handleCancelEdit = useCallback(() => {
    setEditingPageId(null);
    setEditValue("");
  }, []);

  // Handle key press in edit mode
  const handleKeyDown = useCallback((e: React.KeyboardEvent, pageId: string) => {
    if (e.key === "Enter") {
      handleCommitEdit(pageId);
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  }, [handleCommitEdit, handleCancelEdit]);

  // Calculate totals
  const totalWords = pages.reduce((sum, p) => sum + (p.word_count || 0), 0);
  const totalBillablePages = calculateBillablePages(totalWords, wordsPerPage);

  if (pages.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500 text-sm">
        No pages found for this file
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Table Header */}
      <div className={`grid ${isMultiDoc ? "grid-cols-4" : "grid-cols-3"} gap-2 p-3 bg-gray-50 border-b text-sm font-medium text-gray-600`}>
        <div>Page</div>
        <div>Word Count</div>
        <div>Billable Pages</div>
        {isMultiDoc && <div>Group</div>}
      </div>

      {/* Table Body */}
      <div className="divide-y">
        {pages.map((page) => {
          const billable = calculateBillablePages(page.word_count || 0, wordsPerPage);
          const isEditing = editingPageId === page.id;
          const assignedGroupId = pageGroupAssignments.get(page.id);
          const assignedGroup = groups.find((g) => g.id === assignedGroupId);

          return (
            <div
              key={page.id}
              className={`grid ${isMultiDoc ? "grid-cols-4" : "grid-cols-3"} gap-2 p-3 items-center text-sm hover:bg-gray-50`}
            >
              {/* Page Number */}
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" />
                <span>Page {page.page_number}</span>
              </div>

              {/* Word Count (editable) */}
              <div>
                {isEditing ? (
                  <Input
                    type="number"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => handleCommitEdit(page.id)}
                    onKeyDown={(e) => handleKeyDown(e, page.id)}
                    className="h-8 w-24 text-sm"
                    min={0}
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={() => handleStartEdit(page)}
                    disabled={readOnly}
                    className={`text-left px-2 py-1 rounded ${
                      readOnly
                        ? "cursor-default"
                        : "hover:bg-gray-100 cursor-text"
                    }`}
                    title={readOnly ? undefined : "Click to edit"}
                  >
                    {page.word_count || 0}
                  </button>
                )}
              </div>

              {/* Billable Pages (calculated) */}
              <div className="text-gray-600">
                {billable.toFixed(2)}
              </div>

              {/* Group Assignment (only in multi-doc mode) */}
              {isMultiDoc && (
                <div>
                  {readOnly ? (
                    <span className="text-sm text-gray-600">
                      {assignedGroup?.group_label || "Unassigned"}
                    </span>
                  ) : (
                    <Select
                      value={assignedGroupId || ""}
                      onValueChange={(value) => onPageGroupChange?.(page.id, value)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select group..." />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.group_label || `Group ${group.group_number}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Totals Row */}
      <div className={`grid ${isMultiDoc ? "grid-cols-4" : "grid-cols-3"} gap-2 p-3 bg-blue-50 border-t text-sm font-medium`}>
        <div className="text-blue-800">Totals</div>
        <div className="text-blue-800">{totalWords} words</div>
        <div className="text-blue-800">{totalBillablePages.toFixed(2)} pages</div>
        {isMultiDoc && <div></div>}
      </div>
    </div>
  );
}
