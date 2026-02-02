import React from "react";
import {
  ChevronRight,
  FileText,
  X,
  Edit2,
  Trash2,
  Sparkles,
  Loader2,
  Plus,
} from "lucide-react";

interface AssignedItem {
  assignment_id: string;
  page_id: string | null;
  file_id: string | null;
  sequence_order: number;
  page_number: number | null;
  word_count: number;
  file_name: string;
  storage_path: string;
  item_type: "page" | "file";
}

interface DocumentGroup {
  group_id: string;
  quote_id: string;
  group_number: number;
  group_label: string;
  document_type: string;
  complexity: string;
  complexity_multiplier: number;
  total_pages: number;
  total_word_count: number;
  billable_pages: number;
  line_total: number;
  certification_type_id: string | null;
  certification_type_name: string | null;
  certification_price: number;
  is_ai_suggested: boolean;
  ai_confidence: number | null;
  last_analyzed_at: string | null;
  analysis_status: string;
  assigned_items: AssignedItem[];
}

interface DocumentGroupCardProps {
  group: DocumentGroup;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAnalyze: () => void;
  onAssignItems: () => void;
  onRemoveItem: (assignmentId: string) => void;
  isAnalyzing: boolean;
  isEditable: boolean;
}

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
}: DocumentGroupCardProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          <ChevronRight
            className={`w-5 h-5 text-gray-400 transition-transform ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">
                Document {group.group_number}: {group.group_label || "Untitled"}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  complexityColors[group.complexity] || complexityColors.easy
                }`}
              >
                {group.complexity}
              </span>
              {group.is_ai_suggested && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  AI: {((group.ai_confidence || 0) * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500">
              {group.document_type || "Unknown type"} •{" "}
              {group.total_word_count} words •{" "}
              {group.assigned_items?.length || 0} item(s)
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-semibold text-gray-900">
            ${(group.line_total || 0).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 border-t">
          {/* Assigned Items */}
          <div className="mb-4">
            <h5 className="text-sm font-medium text-gray-700 mb-2">
              Assigned Items
            </h5>
            {group.assigned_items?.length > 0 ? (
              <div className="space-y-2">
                {group.assigned_items.map((item, idx) => (
                  <div
                    key={item.assignment_id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-6">
                        {idx + 1}.
                      </span>
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span className="text-sm">
                        {item.file_name}
                        {item.page_number && ` - Page ${item.page_number}`}
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
                        className="text-red-500 hover:text-red-700 p-1"
                        title="Remove from group"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">
                No items assigned yet
              </p>
            )}
          </div>

          {/* Pricing Breakdown */}
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-600">Words:</div>
              <div className="text-right">{group.total_word_count}</div>
              <div className="text-gray-600">Billable Pages:</div>
              <div className="text-right">{group.billable_pages}</div>
              <div className="text-gray-600">Complexity:</div>
              <div className="text-right">
                {group.complexity} ({group.complexity_multiplier}x)
              </div>
              <div className="text-gray-600">Certification:</div>
              <div className="text-right">
                ${(group.certification_price || 0).toFixed(2)}
              </div>
              <div className="text-gray-600 font-medium">Line Total:</div>
              <div className="text-right font-medium">
                ${(group.line_total || 0).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {isEditable && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAssignItems();
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
              >
                <Plus className="w-4 h-4" />
                Add Items
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAnalyze();
                }}
                disabled={isAnalyzing || (group.assigned_items?.length || 0) === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
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
                className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
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
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50"
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

export type { DocumentGroup, AssignedItem, DocumentGroupCardProps };
