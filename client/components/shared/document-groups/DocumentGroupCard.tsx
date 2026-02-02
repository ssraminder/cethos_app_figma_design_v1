import React, { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Image,
  X,
  Edit2,
  Trash2,
  Sparkles,
  Loader2,
  Plus,
  AlertCircle,
} from "lucide-react";
import { formatCurrency } from "@/utils/pricing";
import type { GroupCardProps, AssignedItem, COMPLEXITY_OPTIONS } from "./types";

const complexityColors: Record<string, string> = {
  easy: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  hard: "bg-red-100 text-red-800",
};

export default function DocumentGroupCard({
  group,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAnalyze,
  onAssignItems,
  onRemoveItem,
  isAnalyzing,
  isEditable,
  perPageRate = 65,
  certificationTypes,
  onCertificationChange,
  onComplexityChange,
}: GroupCardProps) {
  const [showInlineEdit, setShowInlineEdit] = useState(false);

  const hasItems = (group.assigned_items?.length || 0) > 0;
  const itemCount = group.assigned_items?.length || 0;

  // Calculate if stats should be shown
  const showStats = hasItems || group.total_word_count > 0;

  const getFileIcon = (item: AssignedItem) => {
    if (item.item_type === "page") {
      return <FileText className="w-4 h-4 text-gray-400" />;
    }
    const ext = item.file_name?.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "")) {
      return <Image className="w-4 h-4 text-blue-400" />;
    }
    return <FileText className="w-4 h-4 text-gray-400" />;
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400" />
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900">
                Document {group.group_number}:{" "}
                {group.group_label || "Untitled"}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  complexityColors[group.complexity] || complexityColors.easy
                }`}
              >
                {group.complexity}
              </span>
              {group.is_ai_suggested && group.ai_confidence && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  AI: {(group.ai_confidence * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500 flex items-center gap-1">
              {group.document_type || "Unknown type"} •{" "}
              {hasItems ? (
                <>
                  {group.total_word_count} words • {itemCount} item
                  {itemCount !== 1 ? "s" : ""}
                </>
              ) : (
                <span className="text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  No items assigned
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span
            className={`font-semibold ${
              hasItems ? "text-gray-900" : "text-gray-400"
            }`}
          >
            {hasItems ? formatCurrency(group.line_total || 0) : "--"}
          </span>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 border-t">
          {/* Assigned Items */}
          <div className="mb-4">
            <h5 className="text-sm font-medium text-gray-700 mb-2 flex items-center justify-between">
              <span>Assigned Items</span>
              {isEditable && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAssignItems();
                  }}
                  className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Items
                </button>
              )}
            </h5>

            {hasItems ? (
              <div className="space-y-2">
                {group.assigned_items.map((item, idx) => (
                  <div
                    key={item.assignment_id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-6 text-right">
                        {idx + 1}.
                      </span>
                      {getFileIcon(item)}
                      <span className="text-sm text-gray-900">
                        {item.file_name}
                        {item.page_number != null && (
                          <span className="text-gray-500">
                            {" "}
                            - Page {item.page_number}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-gray-500">
                        ({item.word_count || 0} words)
                      </span>
                    </div>
                    {isEditable && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveItem(item.assignment_id);
                        }}
                        className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition-colors"
                        title="Remove from group"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 bg-amber-50 rounded-lg border border-amber-200">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                <p className="text-sm text-amber-700 font-medium">
                  No items assigned yet
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Assign files or pages to calculate pricing for this group
                </p>
                {isEditable && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAssignItems();
                    }}
                    className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Items
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Pricing Breakdown */}
          {showStats ? (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-blue-600">Per Page Rate:</div>
                <div className="text-right font-medium text-teal-600">
                  {formatCurrency(perPageRate)}
                </div>

                <div className="text-gray-600">Words:</div>
                <div className="text-right">{group.total_word_count}</div>

                <div className="text-gray-600">Billable Pages:</div>
                <div className="text-right">{group.billable_pages}</div>

                <div className="text-gray-600">Complexity:</div>
                <div className="text-right">
                  {group.complexity} ({group.complexity_multiplier}x)
                </div>

                <div className="text-gray-600">Translation:</div>
                <div className="text-right">
                  {formatCurrency(
                    group.billable_pages * perPageRate
                  )}
                </div>

                <div className="text-gray-600">Certification:</div>
                <div className="text-right">
                  {formatCurrency(group.certification_price || 0)}
                  {group.certification_type_name && (
                    <span className="text-xs text-gray-500 ml-1">
                      ({group.certification_type_name})
                    </span>
                  )}
                </div>

                <div className="text-blue-800 font-medium border-t border-blue-200 pt-2">
                  Group Total:
                </div>
                <div className="text-right font-bold text-blue-800 border-t border-blue-200 pt-2">
                  {formatCurrency(group.line_total || 0)}
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <div className="text-center text-gray-500 text-sm">
                Pricing will be calculated when items are assigned
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {isEditable && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAssignItems();
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Items
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAnalyze();
                }}
                disabled={isAnalyzing || !hasItems}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={
                  !hasItems ? "Assign items first to enable analysis" : undefined
                }
              >
                {isAnalyzing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {isAnalyzing ? "Analyzing..." : "Re-Analyze with AI"}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded hover:bg-gray-50 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Delete this document group?")) {
                    onDelete();
                  }
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          )}

          {/* Analysis Status */}
          {group.last_analyzed_at && (
            <div className="mt-3 text-xs text-gray-400">
              Last analyzed: {new Date(group.last_analyzed_at).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
