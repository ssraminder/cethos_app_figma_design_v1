import React, { useState } from "react";
import { X, FileText, Check } from "lucide-react";

interface UnassignedItem {
  quote_id: string;
  item_type: "page" | "file";
  item_id: string;
  file_id: string | null;
  page_id: string | null;
  page_number: number | null;
  word_count: number;
  file_name: string;
  storage_path: string;
}

interface AssignItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupLabel: string;
  unassignedItems: UnassignedItem[];
  onAssign: (groupId: string, items: UnassignedItem[]) => void;
}

export default function AssignItemsModal({
  isOpen,
  onClose,
  groupId,
  groupLabel,
  unassignedItems,
  onAssign,
}: AssignItemsModalProps) {
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
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {unassignedItems.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No unassigned items available</p>
            <p className="text-sm mt-1">
              All pages and files are already assigned to groups
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
                      <Check className="w-3 h-3 text-white" />
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.item_id)}
                    onChange={() => toggleItem(item.item_id)}
                    className="sr-only"
                  />
                  <FileText className="w-4 h-4 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.file_name}
                      {item.page_number && ` - Page ${item.page_number}`}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.word_count || 0} words •{" "}
                      {item.item_type === "page" ? "Page" : "File"}
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

export type { AssignItemsModalProps, UnassignedItem };
