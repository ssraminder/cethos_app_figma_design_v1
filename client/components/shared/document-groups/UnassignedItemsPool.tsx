import React, { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Image,
  Plus,
  FolderPlus,
} from "lucide-react";
import type {
  UnassignedItem,
  DocumentGroup,
  UnassignedItemsPoolProps,
} from "./types";

export default function UnassignedItemsPool({
  items,
  onAssignToGroup,
  onCreateGroupWithItem,
  availableGroups,
  isEditable = true,
  isExpanded: controlledExpanded,
  onToggleExpand,
}: UnassignedItemsPoolProps) {
  const [internalExpanded, setInternalExpanded] = useState(true);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Use controlled or internal state
  const isExpanded = controlledExpanded ?? internalExpanded;
  const handleToggle = onToggleExpand ?? (() => setInternalExpanded((prev) => !prev));

  if (items.length === 0) {
    return null;
  }

  const getFileIcon = (item: UnassignedItem) => {
    if (item.item_type === "page") {
      return <FileText className="w-4 h-4 text-gray-400" />;
    }
    const ext = item.file_name?.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "")) {
      return <Image className="w-4 h-4 text-blue-400" />;
    }
    return <FileText className="w-4 h-4 text-gray-400" />;
  };

  const handleAssignClick = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    setActiveDropdown(activeDropdown === itemId ? null : itemId);
  };

  const handleGroupSelect = (item: UnassignedItem, groupId: string) => {
    setActiveDropdown(null);
    onAssignToGroup(item, groupId);
  };

  const handleCreateNewGroup = (item: UnassignedItem) => {
    setActiveDropdown(null);
    onCreateGroupWithItem(item);
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-amber-50 border-amber-200">
      {/* Header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between p-3 bg-amber-100 hover:bg-amber-200 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-amber-600" />
          ) : (
            <ChevronRight className="w-4 h-4 text-amber-600" />
          )}
          <span className="font-medium text-amber-800">
            Unassigned Items ({items.length})
          </span>
        </div>
        <span className="text-xs text-amber-600">
          Assign to groups or create new
        </span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-3">
          <div className="text-xs text-amber-700 mb-3">
            These files/pages are not yet assigned to any document group. Assign
            them to calculate pricing.
          </div>

          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.item_id}
                className="flex items-center justify-between p-2 bg-white rounded border border-amber-200 hover:border-amber-300 transition-colors"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {getFileIcon(item)}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {item.file_name}
                      {item.page_number != null && (
                        <span className="text-gray-500">
                          {" "}
                          - Page {item.page_number}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span>
                        {item.item_type === "file" ? "File" : "Page"} •{" "}
                        {item.word_count || 0} words
                      </span>
                      {item.has_analysis && (
                        <span className="text-green-600">Analyzed</span>
                      )}
                      {!item.has_analysis && item.item_type === "file" && (
                        <span className="text-amber-600">Pending analysis</span>
                      )}
                    </div>
                  </div>
                </div>

                {isEditable && (
                  <div className="relative">
                    <button
                      onClick={(e) => handleAssignClick(e, item.item_id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Assign
                    </button>

                    {/* Dropdown Menu */}
                    {activeDropdown === item.item_id && (
                      <>
                        {/* Backdrop to close dropdown */}
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setActiveDropdown(null)}
                        />

                        <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border z-20 py-1 max-h-64 overflow-y-auto">
                          {/* Create New Group Option */}
                          <button
                            onClick={() => handleCreateNewGroup(item)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-teal-700 hover:bg-teal-50 border-b"
                          >
                            <FolderPlus className="w-4 h-4" />
                            Create New Group
                          </button>

                          {/* Existing Groups */}
                          {availableGroups.length > 0 ? (
                            <>
                              <div className="px-3 py-1 text-xs text-gray-500 uppercase tracking-wide">
                                Assign to existing group
                              </div>
                              {availableGroups.map((group) => (
                                <button
                                  key={group.group_id}
                                  onClick={() =>
                                    handleGroupSelect(item, group.group_id)
                                  }
                                  className="w-full flex items-start gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 text-left">
                                    <div className="font-medium">
                                      {group.group_label || `Document ${group.group_number}`}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {group.document_type} •{" "}
                                      {group.assigned_items?.length || 0} items
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </>
                          ) : (
                            <div className="px-3 py-2 text-sm text-gray-500">
                              No groups created yet
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
