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
    <div className="bg-white border border-gray-200 rounded-lg divide-y">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-gray-600" />
        <h3 className="text-sm font-semibold text-gray-900">Internal Notes</h3>
      </div>

      {/* Notes Textarea */}
      <div className="p-4 space-y-3">
        <textarea
          value={notes}
          onChange={handleNoteChange}
          placeholder="Add internal notes here... These notes are only visible to staff members."
          className="w-full h-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          disabled={loading || isSaving}
        />

        {/* Character count */}
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">
            {notes.length} characters
          </span>

          {/* Save/Cancel buttons */}
          {hasChanges && (
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !hasChanges}
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1"
              >
                <Save className="w-3 h-3" />
                {isSaving ? "Saving..." : "Save"}
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
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex justify-between items-center"
          >
            <span className="font-medium">Edit History ({noteHistory.length})</span>
            <span className="text-gray-400">{showHistory ? "−" : "+"}</span>
          </button>

          {/* Note History */}
          {showHistory && (
            <div className="px-4 py-3 bg-gray-50 max-h-48 overflow-y-auto space-y-2">
              {noteHistory.map((note) => (
                <div
                  key={note.id}
                  className="border border-gray-200 rounded p-2 bg-white text-xs"
                >
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-gray-900">
                      {note.created_by}
                    </span>
                    <span className="text-gray-500">
                      {new Date(note.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-gray-700 whitespace-pre-wrap text-xs">
                    {note.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Info Message */}
      <div className="px-4 py-2 bg-blue-50 border-t border-blue-100">
        <p className="text-xs text-blue-800">
          💡 Internal notes are only visible to staff members and are not sent to customers.
        </p>
      </div>
    </div>
  );
}
