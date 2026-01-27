import React, { useState } from "react";
import { MessageSquare, Save, X } from "lucide-react";

interface InternalNote {
  id: string;
  text: string;
  created_by: string;
  created_at: string;
  updated_at?: string;
}

interface InternalNotesPanelProps {
  initialNotes?: string;
  onSave?: (notes: string) => Promise<void>;
  noteHistory?: InternalNote[];
  loading?: boolean;
}

export default function InternalNotesPanel({
  initialNotes = "",
  onSave,
  noteHistory = [],
  loading = false,
}: InternalNotesPanelProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newNotes = e.target.value;
    setNotes(newNotes);
    setHasChanges(newNotes !== initialNotes);
  };

  const handleSave = async () => {
    if (!onSave || !hasChanges) return;

    setIsSaving(true);
    try {
      await onSave(notes);
      setHasChanges(false);
    } catch (error) {
      console.error("Failed to save internal notes:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setNotes(initialNotes);
    setHasChanges(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y flex flex-col h-[400px]">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2 flex-shrink-0">
        <MessageSquare className="w-4 h-4 text-gray-600" />
        <h3 className="text-sm font-semibold text-gray-900 truncate">Internal Notes</h3>
      </div>

      {/* Notes Textarea */}
      <div className="p-3 space-y-2 flex-1 flex flex-col overflow-y-auto">
        <textarea
          value={notes}
          onChange={handleNoteChange}
          placeholder="Add notes..."
          className="flex-1 px-2 py-2 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent resize-none"
          disabled={loading || isSaving}
        />

        {/* Character count */}
        <div className="flex justify-between items-center text-xs">
          <span className="text-gray-500">{notes.length} chars</span>

          {/* Save/Cancel buttons */}
          {hasChanges && (
            <div className="flex gap-1">
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="px-2 py-1 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
                title="Cancel"
              >
                <X className="w-3 h-3" />
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !hasChanges}
                className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                title="Save notes"
              >
                <Save className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Note History Toggle */}
      {noteHistory.length > 0 && (
        <>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 transition-colors flex justify-between items-center flex-shrink-0"
          >
            <span className="font-medium">History ({noteHistory.length})</span>
            <span className="text-gray-400">{showHistory ? "−" : "+"}</span>
          </button>

          {/* Note History */}
          {showHistory && (
            <div className="px-3 py-2 bg-gray-50 max-h-40 overflow-y-auto space-y-1 flex-shrink-0">
              {noteHistory.map((note) => (
                <div
                  key={note.id}
                  className="border border-gray-200 rounded p-1.5 bg-white text-xs"
                >
                  <div className="flex justify-between mb-0.5 gap-1">
                    <span className="font-medium text-gray-900 truncate">
                      {note.created_by}
                    </span>
                    <span className="text-gray-500 flex-shrink-0 text-xs">
                      {new Date(note.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-gray-700 whitespace-pre-wrap text-xs break-words">
                    {note.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Info Message */}
      <div className="px-3 py-2 bg-blue-50 border-t border-blue-100 flex-shrink-0">
        <p className="text-xs text-blue-800">
          💡 Staff only, not sent to customers
        </p>
      </div>
    </div>
  );
}
