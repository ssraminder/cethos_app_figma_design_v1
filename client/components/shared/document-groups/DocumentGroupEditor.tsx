import React, { useState, useMemo } from "react";
import { Plus, Loader2, FolderOpen, Calculator } from "lucide-react";
import { formatCurrency } from "@/utils/pricing";
import UnassignedItemsPool from "./UnassignedItemsPool";
import DocumentGroupCard from "./DocumentGroupCard";
import type {
  DocumentGroupEditorProps,
  DocumentGroup,
  UnassignedItem,
  CertificationType,
} from "./types";
import { DEFAULT_DOCUMENT_TYPES, COMPLEXITY_OPTIONS } from "./types";

// Create Group Modal
interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (label: string, documentType: string, complexity: string) => void;
  documentTypes?: string[];
}

function CreateGroupModal({
  isOpen,
  onClose,
  onCreate,
  documentTypes = DEFAULT_DOCUMENT_TYPES,
}: CreateGroupModalProps) {
  const [label, setLabel] = useState("");
  const [docType, setDocType] = useState(documentTypes[0] || "");
  const [complexity, setComplexity] = useState("easy");

  if (!isOpen) return null;

  const handleSubmit = () => {
    onCreate(label || docType, docType, complexity);
    setLabel("");
    setDocType(documentTypes[0] || "");
    setComplexity("easy");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Create Document Group</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Group Label (Optional)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., 'Main Passport' or leave empty"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Type
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              {documentTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Complexity
            </label>
            <div className="flex gap-2">
              {COMPLEXITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setComplexity(opt.value)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    complexity === opt.value
                      ? "bg-teal-600 text-white border-teal-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-teal-300"
                  }`}
                >
                  {opt.label}
                  <span className="block text-xs opacity-75">
                    {opt.multiplier}x
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            Create Group
          </button>
        </div>
      </div>
    </div>
  );
}

// Edit Group Modal
interface EditGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: DocumentGroup | null;
  onSave: (groupId: string, updates: Partial<DocumentGroup>) => void;
  documentTypes?: string[];
  certificationTypes?: CertificationType[];
}

function EditGroupModal({
  isOpen,
  onClose,
  group,
  onSave,
  documentTypes = DEFAULT_DOCUMENT_TYPES,
  certificationTypes = [],
}: EditGroupModalProps) {
  const [label, setLabel] = useState(group?.group_label || "");
  const [docType, setDocType] = useState(group?.document_type || "");
  const [complexity, setComplexity] = useState(group?.complexity || "easy");
  const [certTypeId, setCertTypeId] = useState(
    group?.certification_type_id || ""
  );

  // Reset form when group changes
  React.useEffect(() => {
    if (group) {
      setLabel(group.group_label || "");
      setDocType(group.document_type || "");
      setComplexity(group.complexity || "easy");
      setCertTypeId(group.certification_type_id || "");
    }
  }, [group]);

  if (!isOpen || !group) return null;

  const handleSubmit = () => {
    onSave(group.group_id, {
      group_label: label,
      document_type: docType,
      complexity,
      certification_type_id: certTypeId || null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">
          Edit Document {group.group_number}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Group Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Type
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              {documentTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Complexity
            </label>
            <div className="flex gap-2">
              {COMPLEXITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setComplexity(opt.value)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    complexity === opt.value
                      ? "bg-teal-600 text-white border-teal-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-teal-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Certification Type
            </label>
            <select
              value={certTypeId}
              onChange={(e) => setCertTypeId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="">Select certification...</option>
              {certificationTypes.map((cert) => (
                <option key={cert.id} value={cert.id}>
                  {cert.name} ({formatCurrency(cert.price)})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// Assign Items Modal
interface AssignItemsModalLocalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupLabel: string;
  unassignedItems: UnassignedItem[];
  onAssign: (groupId: string, items: UnassignedItem[]) => void;
}

function AssignItemsModal({
  isOpen,
  onClose,
  groupId,
  groupLabel,
  unassignedItems,
  onAssign,
}: AssignItemsModalLocalProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const toggleItem = (itemId: string) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    if (selectedItems.size === unassignedItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(unassignedItems.map((item) => item.item_id)));
    }
  };

  const handleAssign = () => {
    const itemsToAssign = unassignedItems.filter((item) =>
      selectedItems.has(item.item_id)
    );
    onAssign(groupId, itemsToAssign);
    setSelectedItems(new Set());
  };

  const handleClose = () => {
    setSelectedItems(new Set());
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Assign Items to Group</h3>
            <p className="text-sm text-gray-500">
              Adding to: {groupLabel || "Document Group"}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <span className="sr-only">Close</span>
            <svg
              className="w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {unassignedItems.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="font-medium">No unassigned items available</p>
            <p className="text-sm mt-1">
              All files and pages are already assigned to groups
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-600">
                {selectedItems.size} of {unassignedItems.length} selected
              </span>
              <button
                onClick={selectAll}
                className="text-sm text-teal-600 hover:text-teal-700 font-medium"
              >
                {selectedItems.size === unassignedItems.length
                  ? "Deselect All"
                  : "Select All"}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto border rounded-lg divide-y max-h-[400px]">
              {unassignedItems.map((item) => (
                <label
                  key={item.item_id}
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      selectedItems.has(item.item_id)
                        ? "bg-teal-600 border-teal-600"
                        : "border-gray-300"
                    }`}
                  >
                    {selectedItems.has(item.item_id) && (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.item_id)}
                    onChange={() => toggleItem(item.item_id)}
                    className="sr-only"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.file_name}
                      {item.page_number != null && ` - Page ${item.page_number}`}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.word_count || 0} words •{" "}
                      {item.item_type === "page" ? "Page" : "File"}
                      {item.has_analysis && (
                        <span className="text-green-600 ml-1">Analyzed</span>
                      )}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end gap-3 mt-4 pt-4 border-t">
          <button
            onClick={handleClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={selectedItems.size === 0}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Assign {selectedItems.size > 0 ? `(${selectedItems.size})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// Main Document Group Editor Component
export default function DocumentGroupEditor({
  mode,
  quoteId,
  files,
  groups,
  unassignedItems,
  certificationTypes,
  baseRate = 65, // Fallback to system default; effective rate comes from ai_analysis_results.base_rate
  wordsPerPage = 250,
  isEditable = true,
  isLoading = false,
  onRefresh,
  onGroupCreate,
  onGroupUpdate,
  onGroupDelete,
  onAssignItem,
  onUnassignItem,
  onAnalyzeGroup,
  staffId,
}: DocumentGroupEditorProps) {
  // State for expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(groups.map((g) => g.group_id))
  );

  // State for modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<DocumentGroup | null>(null);
  const [assignModalGroup, setAssignModalGroup] = useState<DocumentGroup | null>(
    null
  );
  const [pendingAssignItem, setPendingAssignItem] =
    useState<UnassignedItem | null>(null);

  // State for analyzing groups
  const [analyzingGroupIds, setAnalyzingGroupIds] = useState<Set<string>>(
    new Set()
  );

  // State for unassigned pool
  const [unassignedPoolExpanded, setUnassignedPoolExpanded] = useState(true);

  // Calculate totals
  const totals = useMemo(() => {
    const subtotal = groups.reduce(
      (sum, g) => sum + (g.line_total || 0),
      0
    );
    const itemCount = groups.reduce(
      (sum, g) => sum + (g.assigned_items?.length || 0),
      0
    );
    return { subtotal, itemCount };
  }, [groups]);

  // Toggle group expansion
  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  // Handle create group
  const handleCreateGroup = async (
    label: string,
    documentType: string,
    complexity: string
  ) => {
    if (onGroupCreate) {
      const newGroupId = await onGroupCreate(label, documentType, complexity);

      // If there's a pending item to assign, do it now
      if (pendingAssignItem && newGroupId && onAssignItem) {
        await onAssignItem(newGroupId as string, [pendingAssignItem]);
        setPendingAssignItem(null);
      }

      await onRefresh();

      // Expand the new group
      if (newGroupId) {
        setExpandedGroups((prev) => new Set([...prev, newGroupId as string]));
      }
    }
    setShowCreateModal(false);
  };

  // Handle assign to existing group
  const handleAssignToGroup = async (
    item: UnassignedItem,
    groupId: string
  ) => {
    if (onAssignItem) {
      await onAssignItem(groupId, [item]);
      await onRefresh();
    }
  };

  // Handle create group with item
  const handleCreateGroupWithItem = (item: UnassignedItem) => {
    setPendingAssignItem(item);
    setShowCreateModal(true);
  };

  // Handle modal assign
  const handleModalAssign = async (
    groupId: string,
    items: UnassignedItem[]
  ) => {
    if (onAssignItem) {
      await onAssignItem(groupId, items);
      await onRefresh();
    }
    setAssignModalGroup(null);
  };

  // Handle group update
  const handleGroupUpdate = async (
    groupId: string,
    updates: Partial<DocumentGroup>
  ) => {
    if (onGroupUpdate) {
      await onGroupUpdate(groupId, updates);
      await onRefresh();
    }
    setEditingGroup(null);
  };

  // Handle group delete
  const handleGroupDelete = async (groupId: string) => {
    if (onGroupDelete) {
      await onGroupDelete(groupId);
      await onRefresh();
    }
  };

  // Handle analyze group
  const handleAnalyzeGroup = async (groupId: string) => {
    if (onAnalyzeGroup) {
      setAnalyzingGroupIds((prev) => new Set([...prev, groupId]));
      try {
        await onAnalyzeGroup(groupId);
        await onRefresh();
      } finally {
        setAnalyzingGroupIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(groupId);
          return newSet;
        });
      }
    }
  };

  // Handle unassign item
  const handleUnassignItem = async (assignmentId: string) => {
    if (onUnassignItem) {
      await onUnassignItem(assignmentId);
      await onRefresh();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
        <span className="ml-2 text-gray-600">Loading document groups...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Document Groups
          </h3>
          <p className="text-sm text-gray-500">
            {groups.length} group{groups.length !== 1 ? "s" : ""} •{" "}
            {totals.itemCount} item{totals.itemCount !== 1 ? "s" : ""} assigned
          </p>
        </div>
        {isEditable && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1 px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Group
          </button>
        )}
      </div>

      {/* Unassigned Items Pool */}
      {unassignedItems.length > 0 && (
        <UnassignedItemsPool
          items={unassignedItems}
          onAssignToGroup={handleAssignToGroup}
          onCreateGroupWithItem={handleCreateGroupWithItem}
          availableGroups={groups}
          isEditable={isEditable}
          isExpanded={unassignedPoolExpanded}
          onToggleExpand={() => setUnassignedPoolExpanded((prev) => !prev)}
        />
      )}

      {/* Document Groups */}
      <div className="space-y-3">
        {groups.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h4 className="text-lg font-medium text-gray-600">
              No Document Groups
            </h4>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              Create groups to organize and price your documents
            </p>
            {isEditable && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create First Group
              </button>
            )}
          </div>
        ) : (
          groups.map((group) => (
            <DocumentGroupCard
              key={group.group_id}
              group={group}
              isExpanded={expandedGroups.has(group.group_id)}
              onToggleExpand={() => toggleGroupExpand(group.group_id)}
              onEdit={() => setEditingGroup(group)}
              onDelete={() => handleGroupDelete(group.group_id)}
              onAnalyze={() => handleAnalyzeGroup(group.group_id)}
              onAssignItems={() => setAssignModalGroup(group)}
              onRemoveItem={handleUnassignItem}
              isAnalyzing={analyzingGroupIds.has(group.group_id)}
              isEditable={isEditable}
              perPageRate={baseRate}
              certificationTypes={certificationTypes}
            />
          ))
        )}
      </div>

      {/* Quote Totals Summary */}
      {groups.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-teal-50 rounded-lg p-4 border border-blue-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-gray-900">
                Document Groups Subtotal
              </span>
            </div>
            <span className="text-xl font-bold text-blue-800">
              {formatCurrency(totals.subtotal)}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {totals.itemCount} item{totals.itemCount !== 1 ? "s" : ""} across{" "}
            {groups.length} group{groups.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* Modals */}
      <CreateGroupModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setPendingAssignItem(null);
        }}
        onCreate={handleCreateGroup}
      />

      <EditGroupModal
        isOpen={!!editingGroup}
        onClose={() => setEditingGroup(null)}
        group={editingGroup}
        onSave={handleGroupUpdate}
        certificationTypes={certificationTypes}
      />

      {assignModalGroup && (
        <AssignItemsModal
          isOpen={!!assignModalGroup}
          onClose={() => setAssignModalGroup(null)}
          groupId={assignModalGroup.group_id}
          groupLabel={assignModalGroup.group_label}
          unassignedItems={unassignedItems}
          onAssign={handleModalAssign}
        />
      )}
    </div>
  );
}
