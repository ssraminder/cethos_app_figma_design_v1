import React, { useState } from 'react';

interface CorrectionReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  fieldName: string;
  aiValue: string | number;
  correctedValue: string | number;
}

const REASON_OPTIONS: Record<string, string[]> = {
  word_count: [
    'AI miscounted (OCR quality issue)',
    'AI missed text in image/table',
    'AI included non-translatable text',
    'Manual recount required',
  ],
  page_word_count: [
    'AI miscounted (OCR quality issue)',
    'AI missed text in image/table',
    'AI included non-translatable text',
    'Manual recount required',
  ],
  detected_document_type: [
    'Wrong document classification',
    'Multiple document types in file',
    'Rare document type not recognized',
  ],
  detected_language: [
    'Wrong language detected',
    'Mixed languages in document',
    'Similar language confusion (e.g., Portuguese/Spanish)',
  ],
  assessed_complexity: [
    'Complexity overestimated',
    'Complexity underestimated',
    'Special formatting not detected',
    'Handwriting not factored correctly',
  ],
  billable_pages: [
    'Calculation error',
    'Pages should be combined',
    'Pages should be split',
    'Minimum page override',
  ],
  line_total: [
    'Price override - special arrangement',
    'Calculation error correction',
    'Customer discount applied',
  ],
  certification_type_id: [
    'Wrong certification for intended use',
    'Customer requested specific certification',
    'Document requires different certification level',
  ],
};

const DEFAULT_REASONS = [
  'AI prediction incorrect',
  'Customer provided clarification',
  'Staff judgment based on document review',
  'Other (see notes)',
];

export function CorrectionReasonModal({
  isOpen,
  onClose,
  onConfirm,
  fieldName,
  aiValue,
  correctedValue,
}: CorrectionReasonModalProps) {
  const [selectedReason, setSelectedReason] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  if (!isOpen) return null;

  const reasons = REASON_OPTIONS[fieldName] || DEFAULT_REASONS;
  
  const formatFieldName = (field: string) => {
    return field
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  const handleConfirm = () => {
    if (!selectedReason) return;
    
    const fullReason = additionalNotes 
      ? `${selectedReason}: ${additionalNotes}`
      : selectedReason;
    
    onConfirm(fullReason);
    setSelectedReason('');
    setAdditionalNotes('');
  };

  const handleCancel = () => {
    setSelectedReason('');
    setAdditionalNotes('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleCancel}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            Correction Reason
          </h3>
          <button 
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Field Info */}
          <div className="bg-gray-50 rounded p-3 space-y-1">
            <div className="text-sm">
              <span className="text-gray-500">Field:</span>{' '}
              <span className="font-medium">{formatFieldName(fieldName)}</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-500">AI Value:</span>{' '}
              <span className="font-medium text-red-600">{aiValue ?? 'N/A'}</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-500">Your Correction:</span>{' '}
              <span className="font-medium text-green-600">{correctedValue}</span>
            </div>
          </div>

          {/* Reason Dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Why are you making this correction? <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a reason...</option>
              {reasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </div>

          {/* Additional Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional notes (optional)
            </label>
            <textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              rows={3}
              placeholder="Any additional context that would help improve AI accuracy..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Help Text */}
          <p className="text-xs text-gray-500">
            This information helps train our AI to make better predictions in the future.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedReason}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Save Correction
          </button>
        </div>
      </div>
    </div>
  );
}
