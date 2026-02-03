import React, { useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Edit2,
  Sparkles,
  X,
  FileText,
  AlertTriangle,
  Calculator,
  FolderOpen,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/utils/pricing";
import type {
  DocumentGroupsSummaryProps,
  DocumentGroupWithItems,
  CertificationType,
  AssignedItem,
} from "@/types/document-editor";

// Complexity color mapping
const complexityColors: Record<string, string> = {
  easy: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  hard: "bg-red-100 text-red-800",
};

// Single Group Card Component
interface GroupCardProps {
  group: DocumentGroupWithItems;
  certificationTypes: CertificationType[];
  onEdit: () => void;
  onReAnalyze: () => void;
  onUnassign: () => void;
  onCertificationChange: (certTypeId: string) => void;
  readOnly?: boolean;
}

function GroupCard({
  group,
  certificationTypes,
  onEdit,
  onReAnalyze,
  onUnassign,
  onCertificationChange,
  readOnly = false,
}: GroupCardProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);

  const hasItems = (group.assigned_items?.length || 0) > 0;
  const itemCount = group.assigned_items?.length || 0;

  // Format items display
  const itemsDisplay = useMemo(() => {
    if (!hasItems) return null;

    const items = group.assigned_items || [];
    const fileItems = items.filter((i) => i.item_type === "file");
    const pageItems = items.filter((i) => i.item_type === "page");

    const parts: string[] = [];
    if (fileItems.length > 0) {
      parts.push(`${fileItems.length} file${fileItems.length !== 1 ? "s" : ""}`);
    }
    if (pageItems.length > 0) {
      parts.push(`${pageItems.length} page${pageItems.length !== 1 ? "s" : ""}`);
    }
    return parts.join(", ");
  }, [group.assigned_items, hasItems]);

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
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
                Group {group.group_number}: {group.group_label || "Untitled"}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  complexityColors[group.complexity] || complexityColors.easy
                }`}
              >
                {group.complexity}
              </span>
            </div>
            <div className="text-sm text-gray-500 flex items-center gap-1">
              {group.document_type || "Unknown type"}
              {group.holder_name && (
                <span className="ml-1">• {group.holder_name}</span>
              )}
              {" • "}
              {hasItems ? (
                <span>{itemsDisplay}</span>
              ) : (
                <span className="text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  No items assigned
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span
            className={`text-lg font-semibold ${
              hasItems ? "text-teal-600" : "text-gray-400"
            }`}
          >
            {hasItems ? formatCurrency(group.line_total || 0) : "--"}
          </span>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 border-t space-y-4">
          {/* Assigned Items */}
          {hasItems ? (
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">
                Items ({itemCount})
              </h5>
              <div className="space-y-1">
                {group.assigned_items.map((item, idx) => (
                  <div
                    key={item.assignment_id}
                    className="flex items-center gap-2 p-2 bg-gray-50 rounded text-sm"
                  >
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="flex-1 truncate">
                      {item.file_name}
                      {item.page_number != null && ` - Page ${item.page_number}`}
                    </span>
                    <span className="text-xs text-gray-500">
                      {item.word_count || 0} words
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-4 bg-amber-50 rounded-lg border border-amber-200">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              <p className="text-sm text-amber-700">No items assigned to this group</p>
            </div>
          )}

          {/* Pricing Breakdown */}
          {hasItems && (
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-600">Total Words:</div>
                <div className="text-right font-medium">{group.total_word_count}</div>

                <div className="text-gray-600">Billable Pages:</div>
                <div className="text-right font-medium">{group.billable_pages}</div>

                <div className="text-gray-600">Complexity:</div>
                <div className="text-right font-medium">
                  {group.complexity} ({group.complexity_multiplier}x)
                </div>

                <div className="text-gray-600">Translation:</div>
                <div className="text-right font-medium">
                  {formatCurrency(group.line_total - (group.certification_price || 0))}
                </div>

                <div className="text-gray-600">Certification:</div>
                <div className="text-right">
                  {readOnly ? (
                    <span className="font-medium">
                      {formatCurrency(group.certification_price || 0)}
                      {group.certification_type_id && (
                        <span className="text-xs text-gray-500 ml-1">
                          ({certificationTypes.find(c => c.id === group.certification_type_id)?.name || "Unknown"})
                        </span>
                      )}
                    </span>
                  ) : (
                    <Select
                      value={group.certification_type_id || ""}
                      onValueChange={onCertificationChange}
                    >
                      <SelectTrigger className="h-8 w-48 text-xs">
                        <SelectValue placeholder="Select certification..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {certificationTypes.map((cert) => (
                          <SelectItem key={cert.id} value={cert.id}>
                            {cert.name} ({formatCurrency(cert.price)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="text-blue-800 font-medium border-t border-blue-200 pt-2 col-span-2 flex justify-between">
                  <span>Group Total:</span>
                  <span className="font-bold">
                    {formatCurrency(group.line_total || 0)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {!readOnly && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded hover:bg-gray-50 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Edit Group
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReAnalyze();
                }}
                disabled={!hasItems}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                Re-Analyze
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUnassign();
                }}
                disabled={!hasItems}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <X className="w-4 h-4" />
                Unassign Items
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Main Component
export default function DocumentGroupsSummary({
  quoteId,
  groups,
  certificationTypes,
  onEditGroup,
  onReAnalyze,
  onUnassignItems,
  onCertificationChange,
  onAddGroup,
  readOnly = false,
}: DocumentGroupsSummaryProps) {
  // Calculate totals
  const totals = useMemo(() => {
    const subtotal = groups.reduce((sum, g) => sum + (g.line_total || 0), 0);
    const certTotal = groups.reduce((sum, g) => sum + (g.certification_price || 0), 0);
    const totalWords = groups.reduce((sum, g) => sum + (g.total_word_count || 0), 0);
    const totalPages = groups.reduce((sum, g) => sum + (g.billable_pages || 0), 0);
    return { subtotal, certTotal, totalWords, totalPages };
  }, [groups]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-teal-600" />
            Document Groups
          </h3>
          <p className="text-sm text-gray-500">
            {groups.length} group{groups.length !== 1 ? "s" : ""} •{" "}
            {totals.totalWords} total words
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={onAddGroup}
            className="flex items-center gap-1 px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Group
          </button>
        )}
      </div>

      {/* Groups List */}
      {groups.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h4 className="text-lg font-medium text-gray-600">No Document Groups</h4>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            Create groups to organize and price your documents
          </p>
          {!readOnly && (
            <button
              onClick={onAddGroup}
              className="inline-flex items-center gap-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create First Group
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              certificationTypes={certificationTypes}
              onEdit={() => onEditGroup(group.id)}
              onReAnalyze={() => onReAnalyze(group.id)}
              onUnassign={() => onUnassignItems(group.id)}
              onCertificationChange={(certTypeId) =>
                onCertificationChange(group.id, certTypeId)
              }
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      {/* Quote Totals Summary */}
      {groups.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-teal-50 rounded-lg p-4 border border-blue-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-gray-900">
                Document Groups Summary
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Groups:</span>
              <p className="font-medium text-lg">{groups.length}</p>
            </div>
            <div>
              <span className="text-gray-600">Total Words:</span>
              <p className="font-medium text-lg">{totals.totalWords.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-gray-600">Billable Pages:</span>
              <p className="font-medium text-lg">{totals.totalPages.toFixed(2)}</p>
            </div>
            <div>
              <span className="text-gray-600">Subtotal:</span>
              <p className="font-bold text-xl text-teal-600">
                {formatCurrency(totals.subtotal)}
              </p>
            </div>
          </div>
          {totals.certTotal > 0 && (
            <div className="mt-3 pt-3 border-t border-blue-200 text-sm">
              <span className="text-gray-600">
                Includes {formatCurrency(totals.certTotal)} in certification fees
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
